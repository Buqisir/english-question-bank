#!/usr/bin/env python3

"""Generate isolated A-D repair candidates without touching formal vocabulary MP3 assets."""

from __future__ import annotations

import argparse
import hashlib
import json
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


VOICE = "eqb-british-teacher-v1"
SCHEMA = "wanwei-vocabulary-audio-repair-candidates-v1"
FORMAT = "audio-24khz-48kbitrate-mono-mp3"
CANDIDATES = (("A", 1103), ("B", 2207), ("C", 3301), ("D", 4409))
SILENCE_THRESHOLDS = (0.0005, 0.001, 0.002, 0.003)
FRAME_SECONDS = 0.01
MIN_CUE_GAP_SECONDS = 0.04
TARGET_EDGE_FRAME_SECONDS = 0.005
TARGET_EDGE_THRESHOLD = 0.003
TARGET_ACTIVE_SAFETY_SECONDS = 0.10
LEADING_ZERO_SECONDS = 0.30
TRAILING_ZERO_SECONDS = 0.50
EDGE_THRESHOLD = 0.003


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", required=True, type=Path)
    parser.add_argument("--profile", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--batch-size", type=int, default=5)
    parser.add_argument("--max-tokens", type=int, default=320)
    parser.add_argument("--replace-manifest", action="store_true")
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


def quiet_runs(samples: np.ndarray, sample_rate: int, threshold: float) -> list[tuple[int, int]]:
    window = max(1, round(sample_rate * FRAME_SECONDS))
    padding = (-samples.size) % window
    frames = np.pad(samples, (0, padding)).reshape(-1, window)
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=1))
    quiet = frame_rms < threshold
    minimum = max(1, round(MIN_CUE_GAP_SECONDS / FRAME_SECONDS))
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, is_quiet in enumerate([*quiet.tolist(), False]):
        if is_quiet and start is None:
            start = index
        elif not is_quiet and start is not None:
            if index - start >= minimum:
                runs.append((start * window, min(samples.size, index * window)))
            start = None
    return runs


def extract_cue_protected_target(audio: Any, sample_rate: int) -> tuple[np.ndarray, dict[str, float]]:
    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    total = samples.size
    candidates: list[tuple[float, tuple[int, int], tuple[int, int], float]] = []
    for threshold in SILENCE_THRESHOLDS:
        runs = [
            run for run in quiet_runs(samples, sample_rate, threshold)
            if run[0] > sample_rate * 0.05 and run[1] < total - sample_rate * 0.05
        ]
        for first_index, first in enumerate(runs):
            for second in runs[first_index + 1:]:
                first_center = (first[0] + first[1]) / 2
                second_center = (second[0] + second[1]) / 2
                first_ratio = first_center / total
                second_ratio = second_center / total
                target_seconds = (second_center - first_center) / sample_rate
                context_seconds = first_center / sample_rate
                tail_seconds = (total - second_center) / sample_rate
                if not 0.32 <= first_ratio <= 0.80 or not 0.55 <= second_ratio <= 0.96:
                    continue
                if not 0.18 <= target_seconds <= 2.20 or context_seconds < 0.45 or tail_seconds < 0.15:
                    continue
                first_gap_seconds = (first[1] - first[0]) / sample_rate
                second_gap_seconds = (second[1] - second[0]) / sample_rate
                if max(first_gap_seconds, second_gap_seconds) < 0.12:
                    continue
                protected_region = samples[first[0]:second[1]]
                if protected_region.size == 0 or float(np.max(np.abs(protected_region))) < 0.01:
                    continue
                gap_reward = ((first[1] - first[0]) + (second[1] - second[0])) / total
                score = (
                    abs(first_ratio - 0.60)
                    + abs(second_ratio - 0.83)
                    + 0.08 * abs(target_seconds - 0.75)
                    - 0.25 * gap_reward
                )
                candidates.append((score, first, second, threshold))
        if candidates:
            break
    if not candidates:
        raise ValueError("could not locate two long cue gaps around the target word")

    _, first_gap, second_gap, threshold = min(candidates, key=lambda item: item[0])
    start = first_gap[0]
    end = second_gap[1]
    if end <= start:
        raise ValueError("invalid target boundaries")
    target = samples[start:end]

    edge_window = max(1, round(sample_rate * TARGET_EDGE_FRAME_SECONDS))
    edge_padding = (-target.size) % edge_window
    edge_frames = np.pad(target, (0, edge_padding)).reshape(-1, edge_window)
    edge_rms = np.sqrt(np.mean(edge_frames ** 2, axis=1))
    active_frames = np.flatnonzero(edge_rms >= TARGET_EDGE_THRESHOLD)
    if active_frames.size == 0:
        raise ValueError("cue-protected target is silent")
    active_start = active_frames[0] * edge_window
    active_end = min(target.size, (active_frames[-1] + 1) * edge_window)
    active_safety = round(TARGET_ACTIVE_SAFETY_SECONDS * sample_rate)
    safe_start = max(0, active_start - active_safety)
    safe_end = min(target.size, active_end + active_safety)
    target = target[safe_start:safe_end]
    protected = np.pad(
        target,
        (round(LEADING_ZERO_SECONDS * sample_rate), round(TRAILING_ZERO_SECONDS * sample_rate)),
    )
    return protected, {
        "threshold": threshold,
        "firstGapSeconds": round((first_gap[1] - first_gap[0]) / sample_rate, 6),
        "secondGapSeconds": round((second_gap[1] - second_gap[0]) / sample_rate, 6),
        "targetStartSeconds": round(start / sample_rate, 6),
        "targetEndSeconds": round(end / sample_rate, 6),
        "activeSafetySeconds": TARGET_ACTIVE_SAFETY_SECONDS,
    }


def encode_mp3(source: Path, destination: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")
    partial = destination.with_suffix(".mp3.partial")
    partial.unlink(missing_ok=True)
    subprocess.run(
        [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-map_metadata", "-1", "-ar", "24000", "-ac", "1",
            "-b:a", "48k", "-write_xing", "0", "-id3v2_version", "0", "-f", "mp3", str(partial),
        ],
        check=True,
    )
    partial.replace(destination)


def audio_metrics(path: Path) -> dict[str, float]:
    samples, sample_rate = audio_read(path, dtype="float32", sample_rate=24000, nchannels=1)
    samples = np.asarray(samples).reshape(-1)
    window = max(1, round(sample_rate * 0.02))
    padding = (-samples.size) % window
    frames = np.pad(samples, (0, padding)).reshape(-1, window)
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    active = np.flatnonzero(rms >= EDGE_THRESHOLD)
    if active.size == 0:
        raise ValueError(f"candidate is silent: {path}")
    duration = samples.size / sample_rate
    active_start = active[0] * window / sample_rate
    active_end = min(duration, (active[-1] + 1) * window / sample_rate)
    metrics = {
        "durationSeconds": round(duration, 6),
        "activeDurationSeconds": round(max(0, active_end - active_start), 6),
        "leadingSilenceSeconds": round(active_start, 6),
        "trailingSilenceSeconds": round(max(0, duration - active_end), 6),
        "peak": round(float(np.max(np.abs(samples))), 6),
        "rms": round(float(np.sqrt(np.mean(samples ** 2))), 6),
    }
    if not 0.75 <= metrics["durationSeconds"] <= 3.60 or metrics["peak"] < 0.02 or metrics["rms"] < 0.002:
        raise ValueError(f"candidate has invalid duration or signal level: {path} {metrics}")
    if metrics["activeDurationSeconds"] < 0.24:
        raise ValueError(f"candidate target is too short to trust: {path} {metrics}")
    if metrics["leadingSilenceSeconds"] < 0.24 or metrics["trailingSilenceSeconds"] < 0.40:
        raise ValueError(f"candidate lacks protected head/tail silence: {path} {metrics}")
    return metrics


def prompt_for(entry: dict[str, Any], variant: int = 0) -> str:
    context = entry["exampleEnglish"].strip().rstrip()
    target = entry["audioText"].strip().rstrip(".!?")
    if variant == 0:
        return f"{context}\n\n{target}.\n\nDone."
    if variant == 1:
        return f"{context}\n\nReady.\n\n{target}.\n\nFinished."
    return f"{context}\n\nListen.\n\n{target}.\n\nThat was the complete word."


def candidate_filename(entry_id: str, label: str) -> str:
    return f"{entry_id}--{label}.mp3"


def validate_contract(args: argparse.Namespace, profile: dict[str, Any], batch: dict[str, Any]) -> Path:
    if not 1 <= args.batch_size <= 8:
        raise ValueError("--batch-size must be between 1 and 8")
    if batch.get("schemaVersion") != "wanwei-vocabulary-audio-repair-batch-v1" or len(batch.get("entries", [])) != 70:
        raise ValueError("Expected the frozen 70-entry repair batch")
    if profile.get("voiceId") != VOICE or profile.get("ownerApproval", {}).get("status") != "approved":
        raise ValueError("Expected the approved EQBank voice profile")
    model_path = args.model / "model.safetensors"
    tokenizer_path = args.model / "speech_tokenizer" / "model.safetensors"
    if sha256_file(model_path) != profile["base"]["modelSha256"]:
        raise ValueError("Base model SHA-256 does not match the approved voice profile")
    if sha256_file(tokenizer_path) != profile["base"]["speechTokenizerSha256"]:
        raise ValueError("Speech tokenizer SHA-256 does not match the approved voice profile")
    reference_path = Path(profile["reference"]["path"])
    if not reference_path.is_absolute():
        reference_path = args.profile.resolve().parents[2] / reference_path
    if sha256_file(reference_path) != profile["reference"]["sha256"]:
        raise ValueError("Reference WAV SHA-256 does not match the approved voice profile")
    return reference_path


def main() -> None:
    args = parse_args()
    profile = read_json(args.profile)
    batch = read_json(args.batch)
    reference_path = validate_contract(args, profile, batch)
    entries = batch["entries"]
    args.output_dir.mkdir(parents=True, exist_ok=True)

    missing: dict[str, list[dict[str, Any]]] = {}
    for label, _ in CANDIDATES:
        missing[label] = []
        for entry in entries:
            destination = args.output_dir / candidate_filename(entry["entryId"], label)
            if destination.exists():
                try:
                    audio_metrics(destination)
                    continue
                except ValueError:
                    destination.unlink()
            missing[label].append(entry)

    total_missing = sum(len(values) for values in missing.values())
    if total_missing:
        print(f"Loading Qwen Base model for {total_missing} repair candidates", flush=True)
        model = load_model(model_path=str(args.model))
        reference_audio = load_audio(str(reference_path), sample_rate=model.sample_rate)
        reference_text = profile["reference"]["sourceExcerpt"]["referenceText"]
        with tempfile.TemporaryDirectory(prefix="eqb-qwen-repair-") as temporary_directory:
            temporary_root = Path(temporary_directory)
            completed = 0
            for label, seed in CANDIDATES:
                label_entries = missing[label]
                for offset in range(0, len(label_entries), args.batch_size):
                    group = label_entries[offset:offset + args.batch_size]
                    mx.random.seed(seed)
                    results = list(model.batch_generate(
                        [prompt_for(entry) for entry in group],
                        ref_audio=reference_audio,
                        ref_text=reference_text,
                        temperature=0.65,
                        lang_code="English",
                        max_tokens=args.max_tokens,
                        top_k=30,
                        top_p=0.9,
                        repetition_penalty=1.4,
                        stream=False,
                        verbose=False,
                    ))
                    by_index = {result.sequence_idx: result for result in results}
                    if set(by_index) != set(range(len(group))):
                        raise RuntimeError(f"Incomplete Qwen repair batch for candidate {label} at offset {offset}")
                    for index, entry in enumerate(group):
                        result = by_index[index]
                        wav_path = temporary_root / f"{entry['entryId']}--{label}.wav"
                        destination = args.output_dir / candidate_filename(entry["entryId"], label)
                        last_error: ValueError | None = None
                        for prompt_variant in (0, 1, 2):
                            if prompt_variant:
                                mx.random.seed(seed + entry["sourceOrder"] * 17 + prompt_variant)
                                retry_results = list(model.batch_generate(
                                    [prompt_for(entry, prompt_variant)],
                                    ref_audio=reference_audio,
                                    ref_text=reference_text,
                                    temperature=0.65,
                                    lang_code="English",
                                    max_tokens=args.max_tokens,
                                    top_k=30,
                                    top_p=0.9,
                                    repetition_penalty=1.4,
                                    stream=False,
                                    verbose=False,
                                ))
                                if len(retry_results) != 1:
                                    continue
                                result = retry_results[0]
                            try:
                                protected, _ = extract_cue_protected_target(result.audio, result.sample_rate)
                                audio_write(wav_path, protected, result.sample_rate, format="wav")
                                encode_mp3(wav_path, destination)
                                audio_metrics(destination)
                                break
                            except ValueError as error:
                                last_error = error
                                destination.unlink(missing_ok=True)
                        else:
                            raise ValueError(
                                f"could not safely isolate {entry['headword']} candidate {label}"
                            ) from last_error
                        completed += 1
                    print(f"{completed}/{total_missing} generated", flush=True)
                    mx.clear_cache()

    manifest_entries = []
    for entry in entries:
        candidates = []
        for label, seed in CANDIDATES:
            destination = args.output_dir / candidate_filename(entry["entryId"], label)
            candidates.append({
                "label": label,
                "seed": seed,
                "path": destination.name,
                "bytes": destination.stat().st_size,
                "sha256": sha256_file(destination),
                **audio_metrics(destination),
            })
        manifest_entries.append({
            "entryId": entry["entryId"],
            "sourceOrder": entry["sourceOrder"],
            "headword": entry["headword"],
            "original": entry["original"],
            "candidates": candidates,
        })

    payload = {
        "schemaVersion": SCHEMA,
        "batchId": batch["batchId"],
        "voice": VOICE,
        "format": FORMAT,
        "formalAssetsChanged": False,
        "method": {
            "promptShape": "approved example context + isolated target + protective cue",
            "candidateLabels": [label for label, _ in CANDIDATES],
            "seeds": {label: seed for label, seed in CANDIDATES},
            "temperature": 0.65,
            "topK": 30,
            "topP": 0.9,
            "repetitionPenalty": 1.4,
            "leadingZeroSeconds": LEADING_ZERO_SECONDS,
            "trailingZeroSeconds": TRAILING_ZERO_SECONDS,
        },
        "entries": manifest_entries,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    if args.manifest.exists() and not args.replace_manifest:
        raise FileExistsError(f"Manifest already exists: {args.manifest}; pass --replace-manifest to replace it")
    partial = args.manifest.with_suffix(args.manifest.suffix + ".partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(args.manifest)
    print(json.dumps({"manifest": str(args.manifest), "entries": len(manifest_entries), "candidates": 280}))


if __name__ == "__main__":
    main()
