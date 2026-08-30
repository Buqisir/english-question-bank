#!/usr/bin/env python3

"""Generate frozen EQBank vocabulary MP3 assets with a local Qwen3-TTS Base model."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Any

import mlx.core as mx
import numpy as np
from mlx_audio.audio_io import read as audio_read
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


FORMAT = "audio-24khz-48kbitrate-mono-mp3"
GENERATOR_VERSION = "eqb-qwen-audio-generator-v2"
REPO_ROOT = Path(__file__).resolve().parents[2]
EDGE_SILENCE_THRESHOLD = 0.003
BOUNDARY_SILENCE_THRESHOLDS = (0.0005, 0.001, 0.002, 0.003)
BOUNDARY_FRAME_SECONDS = 0.01
MIN_BOUNDARY_SILENCE_SECONDS = 0.06
LEADING_SAFETY_SECONDS = 0.20
TRAILING_SAFETY_SECONDS = 0.30
REPETITION_SEPARATORS = (".\n\n", ".\n\n", ".\n\n\n\n")
FALLBACK_TAILS = ("Next", "Finished", "Again")
CONTEXT_PAIRS = (("Start", "End"), ("Listen", "Finished"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--profile", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--selection", type=Path)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--max-tokens", type=int, default=300)
    parser.add_argument("--shard-count", type=int)
    parser.add_argument("--shard-index", type=int)
    parser.add_argument("--replace-manifest", action="store_true")
    parser.add_argument("--public-base-path")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_repo_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else REPO_ROOT / path


def audio_text(entry: dict[str, Any]) -> str:
    value = entry.get("audio", {}).get("text") or entry.get("headword")
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Entry {entry.get('id', '<unknown>')} has no audio text")
    return value.strip()


def safe_filename(entry_id: str) -> str:
    if not entry_id or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for character in entry_id):
        raise ValueError(f"Entry id is not asset-safe: {entry_id!r}")
    return f"{entry_id}.mp3"


def probe_audio(path: Path) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe is required")
    result = subprocess.run(
        [
            ffprobe,
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate:format=duration",
            "-of", "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    if not payload.get("streams"):
        raise ValueError(f"No audio stream in {path}")
    stream = payload["streams"][0]
    duration = float(payload.get("format", {}).get("duration", 0))
    if stream.get("codec_name") != "mp3" or int(stream.get("sample_rate", 0)) != 24000 or int(stream.get("channels", 0)) != 1:
        raise ValueError(f"Audio contract mismatch in {path}: {stream}")
    if not 0.15 <= duration <= 15:
        raise ValueError(f"Unexpected vocabulary audio duration in {path}: {duration}")
    samples, _ = audio_read(path, dtype="float32", sample_rate=24000, nchannels=1)
    samples = np.asarray(samples).reshape(-1)
    peak = float(np.max(np.abs(samples))) if samples.size else 0
    rms = float(np.sqrt(np.mean(samples ** 2))) if samples.size else 0
    if peak < 0.02 or rms < 0.002:
        raise ValueError(f"Silent or near-silent vocabulary audio in {path}: peak={peak}, rms={rms}")
    window = max(1, int(24000 * 0.02))
    padding = (-samples.size) % window
    frames = np.pad(samples, (0, padding)).reshape(-1, window)
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=1))
    active = np.flatnonzero(frame_rms >= EDGE_SILENCE_THRESHOLD)
    leading_silence = float(active[0] * window / 24000)
    active_end = min(samples.size / 24000, float((active[-1] + 1) * window / 24000))
    trailing_silence = max(0, duration - active_end)
    if not 0.14 <= leading_silence <= 0.65 or not 0.22 <= trailing_silence <= 0.75:
        raise ValueError(
            f"Vocabulary audio does not have safe, bounded edge silence in {path}: "
            f"leading={leading_silence}, trailing={trailing_silence}"
        )
    return {
        "codec": stream["codec_name"],
        "sampleRate": int(stream["sample_rate"]),
        "channels": int(stream["channels"]),
        "bitrate": int(stream.get("bit_rate") or 0),
        "durationSeconds": round(duration, 6),
        "peak": round(peak, 6),
        "rms": round(rms, 6),
        "leadingSilenceSeconds": round(leading_silence, 6),
        "trailingSilenceSeconds": round(trailing_silence, 6),
    }


def repeated_prompt(value: str, separator: str) -> str:
    utterance = value.strip().rstrip(".!?")
    return f"{utterance}{separator}{utterance}{separator}{utterance}."


def first_occurrence_prompt(value: str, tail: str) -> str:
    utterance = value.strip().rstrip(".!?")
    return f"{utterance}.\n\n{tail}."


def context_middle_prompt(value: str, before: str, after: str) -> str:
    utterance = value.strip().rstrip(".!?")
    return f"{before}.\n\n{utterance}.\n\n{after}."


def silence_runs(samples: np.ndarray, sample_rate: int, threshold: float) -> list[tuple[int, int]]:
    window = max(1, int(sample_rate * BOUNDARY_FRAME_SECONDS))
    padding = (-samples.size) % window
    frames = np.pad(samples, (0, padding)).reshape(-1, window)
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=1))
    quiet = frame_rms < threshold
    minimum_frames = max(1, round(MIN_BOUNDARY_SILENCE_SECONDS / BOUNDARY_FRAME_SECONDS))
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, is_quiet in enumerate([*quiet.tolist(), False]):
        if is_quiet and start is None:
            start = index
        elif not is_quiet and start is not None:
            if index - start >= minimum_frames:
                runs.append((start * window, min(samples.size, index * window)))
            start = None
    return runs


def extract_middle_occurrence(audio: Any, sample_rate: int) -> np.ndarray:
    samples = np.asarray(audio).reshape(-1)
    if samples.size < sample_rate * 0.4:
        raise ValueError("Repeated pronunciation is too short to contain three complete readings")

    total = samples.size
    candidates: list[tuple[float, tuple[int, int], tuple[int, int]]] = []
    for threshold in BOUNDARY_SILENCE_THRESHOLDS:
        internal_runs = [
            run for run in silence_runs(samples, sample_rate, threshold)
            if run[0] > sample_rate * 0.05 and run[1] < total - sample_rate * 0.05
        ]
        for first_index, first in enumerate(internal_runs):
            for second in internal_runs[first_index + 1:]:
                first_center = (first[0] + first[1]) / 2
                second_center = (second[0] + second[1]) / 2
                first_ratio = first_center / total
                second_ratio = second_center / total
                middle_duration = (second[0] - first[1]) / sample_rate
                if not 0.16 <= first_ratio <= 0.58 or not 0.46 <= second_ratio <= 0.90:
                    continue
                if middle_duration < 0.12:
                    continue
                gap_weight = ((first[1] - first[0]) + (second[1] - second[0])) / total
                score = abs(first_ratio - 0.38) + abs(second_ratio - 0.72) - 0.30 * gap_weight
                candidates.append((score, first, second))
        if candidates:
            break
    if not candidates:
        raise ValueError("Could not find two safe inter-word silence boundaries")

    _, first_gap, second_gap = min(candidates, key=lambda candidate: candidate[0])
    first_gap_duration = first_gap[1] - first_gap[0]
    second_gap_duration = second_gap[1] - second_gap[0]
    retained_leading = min(first_gap_duration // 2, round(LEADING_SAFETY_SECONDS * sample_rate))
    retained_trailing = min(second_gap_duration // 2, round(TRAILING_SAFETY_SECONDS * sample_rate))
    start = first_gap[1] - retained_leading
    end = second_gap[0] + retained_trailing
    middle = samples[start:end]

    leading_padding = max(0, round(LEADING_SAFETY_SECONDS * sample_rate) - retained_leading)
    trailing_padding = max(0, round(TRAILING_SAFETY_SECONDS * sample_rate) - retained_trailing)
    return np.pad(middle, (leading_padding, trailing_padding))


def extract_first_occurrence(audio: Any, sample_rate: int) -> np.ndarray:
    samples = np.asarray(audio).reshape(-1)
    total = samples.size
    if total < sample_rate * 0.3:
        raise ValueError("Fallback pronunciation is too short")

    candidates: list[tuple[float, tuple[int, int], tuple[int, int]]] = []
    for threshold in BOUNDARY_SILENCE_THRESHOLDS:
        runs = silence_runs(samples, sample_rate, threshold)
        leading_runs = [run for run in runs if run[0] <= sample_rate * 0.02 and run[1] < total * 0.45]
        internal_runs = [
            run for run in runs
            if run[0] > sample_rate * 0.05 and run[1] < total - sample_rate * 0.05
        ]
        for leading in leading_runs:
            for following in internal_runs:
                spoken_duration = (following[0] - leading[1]) / sample_rate
                following_ratio = ((following[0] + following[1]) / 2) / total
                if following[0] <= leading[1] or spoken_duration < 0.08:
                    continue
                if not 0.20 <= following_ratio <= 0.80:
                    continue
                gap_weight = (following[1] - following[0]) / total
                score = abs(following_ratio - 0.52) - 0.30 * gap_weight
                candidates.append((score, leading, following))
        if candidates:
            break
    if not candidates:
        raise ValueError("Could not find protected boundaries around the fallback reading")

    _, leading_gap, following_gap = min(candidates, key=lambda candidate: candidate[0])
    leading_gap_duration = leading_gap[1] - leading_gap[0]
    following_gap_duration = following_gap[1] - following_gap[0]
    retained_leading = min(leading_gap_duration // 2, round(LEADING_SAFETY_SECONDS * sample_rate))
    retained_trailing = min(following_gap_duration // 2, round(TRAILING_SAFETY_SECONDS * sample_rate))
    start = leading_gap[1] - retained_leading
    end = following_gap[0] + retained_trailing
    protected = samples[start:end]
    leading_padding = max(0, round(LEADING_SAFETY_SECONDS * sample_rate) - retained_leading)
    trailing_padding = max(0, round(TRAILING_SAFETY_SECONDS * sample_rate) - retained_trailing)
    return np.pad(protected, (leading_padding, trailing_padding))


def encode_mp3(wav_path: Path, destination: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")
    partial = destination.with_suffix(".mp3.partial")
    partial.unlink(missing_ok=True)
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(wav_path),
            "-map_metadata", "-1",
            "-ar", "24000",
            "-ac", "1",
            "-b:a", "48k",
            "-write_xing", "0",
            "-id3v2_version", "0",
            "-f", "mp3",
            str(partial),
        ],
        check=True,
    )
    os.replace(partial, destination)


def validate_contract(args: argparse.Namespace, profile: dict[str, Any]) -> tuple[Path, str, str]:
    if args.batch_size < 1 or args.batch_size > 8:
        raise ValueError("--batch-size must be between 1 and 8")
    if args.max_tokens < 75 or args.max_tokens > 600:
        raise ValueError("--max-tokens must be between 75 and 600")
    if (args.shard_count is None) != (args.shard_index is None):
        raise ValueError("--shard-count and --shard-index must be used together")
    if args.shard_count is not None and (
        args.shard_count < 1 or args.shard_index < 0 or args.shard_index >= args.shard_count
    ):
        raise ValueError("Shard index must be between zero and shard count minus one")
    voice = str(profile.get("voiceId") or "").strip()
    if not voice or profile.get("ownerApproval", {}).get("status") != "approved":
        raise ValueError("The approved EQBank voice profile is required")

    model_path = args.model / "model.safetensors"
    tokenizer_path = args.model / "speech_tokenizer" / "model.safetensors"
    expected_model_sha = profile["base"]["modelSha256"]
    expected_tokenizer_sha = profile["base"]["speechTokenizerSha256"]
    if sha256_file(model_path) != expected_model_sha:
        raise ValueError("Base model SHA-256 does not match the approved voice profile")
    if sha256_file(tokenizer_path) != expected_tokenizer_sha:
        raise ValueError("Speech tokenizer SHA-256 does not match the approved voice profile")

    reference_path = resolve_repo_path(profile["reference"]["path"])
    if sha256_file(reference_path) != profile["reference"]["sha256"]:
        raise ValueError("Reference WAV SHA-256 does not match the approved voice profile")
    return reference_path, expected_model_sha, voice


def select_entries(input_payload: dict[str, Any], selection_path: Path | None, voice: str) -> list[dict[str, Any]]:
    entries = input_payload.get("entries")
    if input_payload.get("voice") != voice or not isinstance(entries, list) or not entries:
        raise ValueError("Input must be the non-empty EQBank audio script")
    if selection_path is None:
        return entries
    selection = read_json(selection_path)
    selected_ids = [entry.get("entryId") for entry in selection.get("entries", [])]
    if not selected_ids or any(not isinstance(entry_id, str) for entry_id in selected_ids):
        raise ValueError("Selection must contain entries with entryId")
    by_id = {entry["id"]: entry for entry in entries}
    missing = [entry_id for entry_id in selected_ids if entry_id not in by_id]
    if missing:
        raise ValueError(f"Selection contains unknown entry ids: {missing[:5]}")
    return [by_id[entry_id] for entry_id in selected_ids]


def write_manifest(path: Path, payload: dict[str, Any], replace: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not replace:
        raise FileExistsError(f"Manifest already exists: {path}; pass --replace-manifest to replace it")
    partial = path.with_suffix(path.suffix + ".partial")
    partial.unlink(missing_ok=True)
    with partial.open("x", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(partial, path)


def main() -> None:
    args = parse_args()
    profile = read_json(args.profile)
    input_payload = read_json(args.input)
    reference_path, model_sha, voice = validate_contract(args, profile)
    entries = select_entries(input_payload, args.selection, voice)
    if args.shard_count is not None:
        entries = [
            entry for index, entry in enumerate(entries)
            if index % args.shard_count == args.shard_index
        ]
        if not entries:
            raise ValueError("Selected shard is empty")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    missing = []
    for entry in entries:
        destination = args.output_dir / safe_filename(entry["id"])
        if destination.exists():
            try:
                probe_audio(destination)
            except ValueError as error:
                print(f"Rejecting invalid existing asset {destination.name}: {error}", flush=True)
                destination.unlink()
                missing.append(entry)
        else:
            missing.append(entry)

    if missing:
        print(f"Loading Qwen Base model for {len(missing)} missing assets", flush=True)
        model = load_model(model_path=str(args.model))
        reference_audio = load_audio(str(reference_path), sample_rate=model.sample_rate)
        reference_text = (
            profile["reference"].get("referenceText")
            or profile["reference"].get("sourceExcerpt", {}).get("referenceText")
        )
        if not reference_text:
            raise ValueError("Approved voice profile is missing reference text")
        with tempfile.TemporaryDirectory(prefix="eqb-qwen-audio-") as temporary_dir:
            temporary_root = Path(temporary_dir)
            for offset in range(0, len(missing), args.batch_size):
                batch = missing[offset:offset + args.batch_size]
                pending = batch
                boundary_errors: dict[str, str] = {}
                for attempt_index, separator in enumerate(REPETITION_SEPARATORS):
                    if not pending:
                        break
                    retry: list[dict[str, Any]] = []
                    generation_groups = [pending] if attempt_index == 0 else [[entry] for entry in pending]
                    for generation_group in generation_groups:
                        texts = [repeated_prompt(audio_text(entry), separator) for entry in generation_group]
                        results = list(model.batch_generate(
                            texts,
                            ref_audio=reference_audio,
                            ref_text=reference_text,
                            temperature=0.0,
                            lang_code="English",
                            max_tokens=args.max_tokens,
                            top_k=1,
                            top_p=1.0,
                            repetition_penalty=1.5,
                            stream=False,
                            verbose=False,
                        ))
                        by_index = {result.sequence_idx: result for result in results}
                        if set(by_index) != set(range(len(generation_group))):
                            raise RuntimeError(f"Qwen batch returned incomplete sequence indexes at offset {offset}")
                        for index, entry in enumerate(generation_group):
                            result = by_index[index]
                            try:
                                middle_audio = extract_middle_occurrence(result.audio, result.sample_rate)
                            except ValueError as error:
                                boundary_errors[entry["id"]] = str(error)
                                retry.append(entry)
                                continue
                            wav_path = temporary_root / f"{entry['id']}.wav"
                            destination = args.output_dir / safe_filename(entry["id"])
                            audio_write(wav_path, middle_audio, result.sample_rate, format="wav")
                            encode_mp3(wav_path, destination)
                            try:
                                probe_audio(destination)
                            except ValueError as error:
                                destination.unlink(missing_ok=True)
                                boundary_errors[entry["id"]] = str(error)
                                retry.append(entry)
                            wav_path.unlink()
                    pending = retry
                if pending:
                    for tail in FALLBACK_TAILS:
                        retry = []
                        for entry in pending:
                            results = list(model.batch_generate(
                                [first_occurrence_prompt(audio_text(entry), tail)],
                                ref_audio=reference_audio,
                                ref_text=reference_text,
                                temperature=0.0,
                                lang_code="English",
                                max_tokens=args.max_tokens,
                                top_k=1,
                                top_p=1.0,
                                repetition_penalty=1.5,
                                stream=False,
                                verbose=False,
                            ))
                            if len(results) != 1 or results[0].sequence_idx != 0:
                                raise RuntimeError(f"Qwen fallback returned an invalid result for {entry['id']}")
                            result = results[0]
                            try:
                                protected_audio = extract_first_occurrence(result.audio, result.sample_rate)
                            except ValueError as error:
                                boundary_errors[entry["id"]] = str(error)
                                retry.append(entry)
                                continue
                            wav_path = temporary_root / f"{entry['id']}.wav"
                            destination = args.output_dir / safe_filename(entry["id"])
                            audio_write(wav_path, protected_audio, result.sample_rate, format="wav")
                            encode_mp3(wav_path, destination)
                            try:
                                probe_audio(destination)
                            except ValueError as error:
                                destination.unlink(missing_ok=True)
                                boundary_errors[entry["id"]] = str(error)
                                retry.append(entry)
                            wav_path.unlink()
                        pending = retry
                        if not pending:
                            break
                if pending:
                    for before, after in CONTEXT_PAIRS:
                        retry = []
                        for entry in pending:
                            results = list(model.batch_generate(
                                [context_middle_prompt(audio_text(entry), before, after)],
                                ref_audio=reference_audio,
                                ref_text=reference_text,
                                temperature=0.0,
                                lang_code="English",
                                max_tokens=args.max_tokens,
                                top_k=1,
                                top_p=1.0,
                                repetition_penalty=1.5,
                                stream=False,
                                verbose=False,
                            ))
                            if len(results) != 1 or results[0].sequence_idx != 0:
                                raise RuntimeError(f"Qwen context fallback returned an invalid result for {entry['id']}")
                            result = results[0]
                            try:
                                protected_audio = extract_middle_occurrence(result.audio, result.sample_rate)
                            except ValueError as error:
                                boundary_errors[entry["id"]] = str(error)
                                retry.append(entry)
                                continue
                            wav_path = temporary_root / f"{entry['id']}.wav"
                            destination = args.output_dir / safe_filename(entry["id"])
                            audio_write(wav_path, protected_audio, result.sample_rate, format="wav")
                            encode_mp3(wav_path, destination)
                            try:
                                probe_audio(destination)
                            except ValueError as error:
                                destination.unlink(missing_ok=True)
                                boundary_errors[entry["id"]] = str(error)
                                retry.append(entry)
                            wav_path.unlink()
                        pending = retry
                        if not pending:
                            break
                if pending:
                    failures = "; ".join(
                        f"{entry['id']}: {boundary_errors.get(entry['id'], 'unknown boundary failure')}"
                        for entry in pending
                    )
                    raise RuntimeError(f"Could not produce edge-safe audio after retries: {failures}")
                print(f"{min(offset + len(batch), len(missing))}/{len(missing)} generated", flush=True)
                mx.clear_cache()

    manifest_entries = []
    for entry in entries:
        filename = safe_filename(entry["id"])
        destination = args.output_dir / filename
        probe = probe_audio(destination)
        manifest_entries.append({
            "entryId": entry["id"],
            "text": audio_text(entry),
            "path": filename,
            "bytes": destination.stat().st_size,
            "sha256": sha256_file(destination),
            "voice": voice,
            "format": FORMAT,
            "version": voice,
            **probe,
        })

    manifest_payload = {
        "schemaVersion": "wanwei-vocabulary-audio-manifest-v1" if voice == "eqb-british-teacher-v1" and input_payload.get("programId") in (None, "wanwei-round-one-v1") and args.selection is None and args.shard_count is None else "vocabulary-audio-manifest-v1",
        "programId": input_payload.get("programId"),
        "voice": voice,
        "format": FORMAT,
        "version": voice,
        "generator": {
            "version": GENERATOR_VERSION,
            "runtime": profile["runtime"],
            "model": profile["base"]["model"],
            "modelRevision": profile["base"]["revision"],
            "modelSha256": model_sha,
            "referenceSha256": profile["reference"]["sha256"],
            "temperature": 0,
            "topK": 1,
            "topP": 1,
            "repetitionPenalty": 1.5,
            "maxTokens": args.max_tokens,
            "batchSize": args.batch_size,
            "productionMethod": {
                "readingsPerEntry": 3,
                "selectedReading": "middle",
                "fallbacks": ["protected-first-reading", "protected-context-middle"],
                "failureMode": "fail-closed",
            },
            "edgeSilence": {
                "threshold": EDGE_SILENCE_THRESHOLD,
                "boundaryThresholds": BOUNDARY_SILENCE_THRESHOLDS,
                "leadingSafetySeconds": LEADING_SAFETY_SECONDS,
                "trailingSafetySeconds": TRAILING_SAFETY_SECONDS,
            },
        },
        "entries": manifest_entries,
    }
    if args.public_base_path:
        if not args.public_base_path.startswith("/vocabulary-assets/"):
            raise ValueError("--public-base-path must be inside /vocabulary-assets/")
        manifest_payload["publicBasePath"] = args.public_base_path.rstrip("/")
    write_manifest(args.manifest, manifest_payload, args.replace_manifest)
    print(json.dumps({"manifest": str(args.manifest), "entries": len(manifest_entries), "voice": voice}, ensure_ascii=False))


if __name__ == "__main__":
    main()
