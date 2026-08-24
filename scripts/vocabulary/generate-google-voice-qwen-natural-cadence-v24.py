#!/usr/bin/env python3

"""Generate private Qwen repairs with natural-rate teachers and Google-matched envelopes."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
from typing import Any

import mlx.core as mx
import numpy as np
from mlx_audio.audio_io import read as audio_read
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


ROOT = Path(__file__).resolve().parents[2]
MODEL_DEFAULT = Path("/Users/huangxuewei/.cache/eqbank/models/qwen3-tts-base-6bit")
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-natural-cadence-v24"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-natural-cadence-v24"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
TEACHER_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-natural-rate-teacher-v24/manifest.json"
V21_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json"
V23_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-matched-teacher-v23/manifest.json"
V23_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-matched-teacher-v23/owner-qa-summary-v23.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-natural-cadence-v24"

CANDIDATE_CONFIGS = {
    "A24": {"seed": 24000, "temperature": 0.26, "topK": 24, "topP": 0.88, "anchorLabel": "A21"},
    "B24": {"seed": 34000, "temperature": 0.32, "topK": 32, "topP": 0.91, "anchorLabel": "B21"},
}
MIN_ACTIVE_RATIO = 0.88
MAX_ACTIVE_RATIO = 1.12
ACTIVE_SAFETY_SECONDS = 0.0
MP3_HEAD_DELAY_SECONDS = 0.05
MP3_TAIL_DELAY_SECONDS = 0.03


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V23 = load_module("eqb_google_voice_qwen_v23_natural_cadence", "scripts/vocabulary/generate-google-voice-qwen-matched-teacher-v23.py")
V21 = V23.V21
V12 = V23.V12
REPAIR = V23.REPAIR


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_DEFAULT)
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_manifest(payload: dict[str, Any]) -> None:
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)


def protect_with_google_envelope(audio: Any, sample_rate: int, google: dict[str, Any]) -> tuple[np.ndarray, dict[str, Any]]:
    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    window = max(1, round(sample_rate * REPAIR.TARGET_EDGE_FRAME_SECONDS))
    padding = (-samples.size) % window
    frames = np.pad(samples, (0, padding)).reshape(-1, window)
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=1))
    active = np.flatnonzero(frame_rms >= REPAIR.TARGET_EDGE_THRESHOLD)
    if active.size == 0:
        raise ValueError("natural-cadence utterance is silent")
    active_start = active[0] * window
    active_end = min(samples.size, (active[-1] + 1) * window)
    safety = round(ACTIVE_SAFETY_SECONDS * sample_rate)
    safe_start = max(0, active_start - safety)
    safe_end = min(samples.size, active_end + safety)
    trimmed = samples[safe_start:safe_end]
    leading = round(max(0.0, google["leadingSilenceSeconds"] - MP3_HEAD_DELAY_SECONDS) * sample_rate)
    trailing = round(max(0.0, google["trailingSilenceSeconds"] - MP3_TAIL_DELAY_SECONDS) * sample_rate)
    protected = np.pad(trimmed, (leading, trailing))
    return protected, {
        "extractionStrategy": "whole-utterance-google-envelope",
        "rawUtteranceDurationSeconds": round(samples.size / sample_rate, 6),
        "rawActiveStartSeconds": round(active_start / sample_rate, 6),
        "rawActiveEndSeconds": round(active_end / sample_rate, 6),
        "directActiveSeconds": round((active_end - active_start) / sample_rate, 6),
        "activeSafetySeconds": ACTIVE_SAFETY_SECONDS,
        "targetLeadingSilenceSeconds": google["leadingSilenceSeconds"],
        "targetTrailingSilenceSeconds": google["trailingSilenceSeconds"],
        "targetTotalDurationSeconds": google["durationSeconds"],
    }


def measure_google_envelope(path: Path) -> dict[str, float]:
    samples, sample_rate = audio_read(path, dtype="float32", sample_rate=24000, nchannels=1)
    values = np.asarray(samples, dtype=np.float32).reshape(-1)
    window = max(1, round(sample_rate * 0.02))
    padding = (-values.size) % window
    frames = np.pad(values, (0, padding)).reshape(-1, window)
    rms_frames = np.sqrt(np.mean(frames ** 2, axis=1))
    active = np.flatnonzero(rms_frames >= REPAIR.EDGE_THRESHOLD)
    if active.size == 0:
        raise ValueError(f"V24 candidate is silent: {path}")
    duration = values.size / sample_rate
    active_start = active[0] * window / sample_rate
    active_end = min(duration, (active[-1] + 1) * window / sample_rate)
    metrics = {
        "durationSeconds": round(duration, 6),
        "activeDurationSeconds": round(active_end - active_start, 6),
        "leadingSilenceSeconds": round(active_start, 6),
        "trailingSilenceSeconds": round(duration - active_end, 6),
        "peak": round(float(np.max(np.abs(values))), 6),
        "rms": round(float(np.sqrt(np.mean(values ** 2))), 6),
    }
    if metrics["peak"] < 0.02 or metrics["rms"] < 0.002 or metrics["activeDurationSeconds"] < 0.24:
        raise ValueError(f"V24 candidate has invalid signal: {path} {metrics}")
    return metrics


def build_hybrid_references(teachers: list[dict[str, Any]], v21: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    reference_root = OUTPUT_ROOT / "references"
    reference_root.mkdir(parents=True, exist_ok=True)
    v21_entry_by_key = {(entry["entryId"], entry["candidateLabel"]): entry for entry in v21["entries"]}
    teacher_by_key = {(entry["entryId"], entry["candidateLabel"]): entry for entry in teachers}
    receipts: dict[tuple[str, str], dict[str, Any]] = {}
    for (entry_id, label), config in [
        ((entry_id, label), config)
        for entry_id in sorted({entry["entryId"] for entry in teachers})
        for label, config in CANDIDATE_CONFIGS.items()
    ]:
        teacher = teacher_by_key[(entry_id, label)]
        anchor_entry = v21_entry_by_key[(entry_id, config["anchorLabel"])]
        anchor_receipt = v21["references"][anchor_entry["referenceId"]]
        chunks = []
        natural_words = []
        natural_duration = 0.0
        for anchor in anchor_receipt["entries"]:
            source_path = ROOT / anchor["path"]
            if V12.sha256_file(source_path) != anchor["sha256"]:
                raise ValueError(f"V24 anchor hash mismatch: {source_path}")
            samples, sample_rate = audio_read(source_path, dtype="float32", sample_rate=24000, nchannels=1)
            if sample_rate != 24000:
                raise ValueError(f"V24 anchor sample-rate mismatch: {source_path}")
            chunk = np.asarray(samples, dtype=np.float32).reshape(-1)
            chunks.append(chunk)
            natural_words.append(anchor["headword"])
            natural_duration += chunk.size / sample_rate
            if natural_duration >= 5.2:
                break
        teacher_path = ROOT / ".scratch/gaokao-google-natural-rate-teacher-v24" / teacher["path"]
        if V12.sha256_file(teacher_path) != teacher["sha256"]:
            raise ValueError(f"V24 teacher hash mismatch: {teacher_path}")
        teacher_samples, teacher_rate = audio_read(teacher_path, dtype="float32", sample_rate=24000, nchannels=1)
        if teacher_rate != 24000:
            raise ValueError(f"V24 teacher sample-rate mismatch: {teacher_path}")
        teacher_chunk = np.asarray(teacher_samples, dtype=np.float32).reshape(-1)
        chunks.extend((teacher_chunk, teacher_chunk))
        reference_words = natural_words + [teacher["headword"], teacher["headword"]]
        joined = np.concatenate(chunks)
        output_path = reference_root / f"{entry_id}--{label.lower()}.wav"
        audio_write(output_path, joined, 24000, format="wav")
        receipts[(entry_id, label)] = {
            "path": str(output_path.relative_to(ROOT)),
            "sha256": V12.sha256_file(output_path),
            "sampleRate": 24000,
            "channels": 1,
            "durationSeconds": round(joined.size / 24000, 6),
            "referenceText": ". ".join(reference_words) + ".",
            "naturalWords": natural_words,
            "teacherRepeatCount": 2,
            "teacherPath": teacher["path"],
            "teacherSha256": teacher["sha256"],
            "teacherSsml": teacher["ssml"],
            "voice": teacher["voice"],
        }
    if len(receipts) != 8:
        raise ValueError("V24 requires eight hybrid references")
    return receipts


def main() -> None:
    args = parse_args()
    teacher_manifest = read_json(TEACHER_MANIFEST_PATH)
    v21 = read_json(V21_MANIFEST_PATH)
    v23 = read_json(V23_MANIFEST_PATH)
    v23_qa = read_json(V23_QA_PATH)
    if teacher_manifest.get("schemaVersion") != "gaokao-frequency-google-natural-rate-teacher-v24" or len(teacher_manifest.get("entries", [])) != 8:
        raise ValueError("V24 requires eight natural-rate Google teachers")
    if v23_qa.get("counts", {}).get("failed") != 4 or v23_qa.get("counts", {}).get("usable") != 0:
        raise ValueError("V24 requires the complete Owner rejection of V23")
    if v21.get("schemaVersion") != V21.SCHEMA or len(v21.get("entries", [])) != 12:
        raise ValueError("V24 requires the complete V21 same-voice anchor set")

    base_by_id = {}
    for entry in v23["entries"]:
        base_by_id.setdefault(entry["entryId"], entry)
    if len(base_by_id) != 4:
        raise ValueError("V24 requires exactly four unresolved base entries")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    model_receipt = V12.validate_model(args.model)
    google_metrics = V21.build_google_metrics()
    references = build_hybrid_references(teacher_manifest["entries"], v21)
    expected = []
    for case_index, entry_id in enumerate([
        "gaokao-frequency-2081-violin",
        "gaokao-frequency-1887-hello",
        "gaokao-frequency-2396-ballet",
        "gaokao-frequency-2823-dolphin",
    ]):
        base = base_by_id[entry_id]
        google = google_metrics[(entry_id, "american")]
        google_active = google["durationSeconds"] - google["leadingSilenceSeconds"] - google["trailingSilenceSeconds"]
        for label, config in CANDIDATE_CONFIGS.items():
            reference = references[(entry_id, label)]
            expected.append({
                **base,
                "candidateLabel": label,
                "seed": config["seed"] + case_index * 43,
                "temperature": config["temperature"],
                "topK": config["topK"],
                "topP": config["topP"],
                "generationStrategy": "same-voice-natural-cadence-hybrid-teacher-google-envelope",
                "generationPrompt": f"{base['audioText'].strip().rstrip('.!?')}.",
                "referencePath": reference["path"],
                "referenceSha256": reference["sha256"],
                "referenceText": reference["referenceText"],
                "googleReferenceActiveSeconds": round(google_active, 6),
            })
    if len(expected) != 8:
        raise ValueError("V24 must plan exactly eight candidates")

    def payload(status: str, entries: list[dict[str, Any]], failures: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 4,
            "plannedCandidates": 8,
            "strategy": "natural Google anchors dominate each reference; the exact target teacher appears twice at uniform rate; final active duration and silence envelope must match the original 3000-word Google clip",
            "v23OwnerQa": str(V23_QA_PATH.relative_to(ROOT)),
            "teacherManifest": str(TEACHER_MANIFEST_PATH.relative_to(ROOT)),
            "preservedUsable": [
                {"entryId": "gaokao-frequency-2956-equator", "accent": "american", "candidateLabel": "A21"},
                {"entryId": "gaokao-frequency-2952-domain", "accent": "american", "candidateLabel": "C22"},
            ],
            "durationGate": {"minimumActiveToGoogleRatio": MIN_ACTIVE_RATIO, "maximumActiveToGoogleRatio": MAX_ACTIVE_RATIO},
            "edgeProtection": {
                "activeSafetySeconds": ACTIVE_SAFETY_SECONDS,
                "mp3HeadDelayCompensationSeconds": MP3_HEAD_DELAY_SECONDS,
                "mp3TailDelayCompensationSeconds": MP3_TAIL_DELAY_SECONDS,
                "envelopeSource": "original 3000-word Google clip per entry",
            },
            "candidateConfigs": CANDIDATE_CONFIGS,
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
            "references": {f"{entry_id}:{label}": receipt for (entry_id, label), receipt in references.items()},
            "entries": entries,
            "failures": failures,
        }

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    write_manifest(payload("generation_in_progress", entries, failures))
    print("Loading Qwen Base for 8 V24 natural-cadence candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_references = {
        key: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for key, receipt in references.items()
    }
    seed_offsets = (0, 1, 2, 100, 101, 102, 200, 201)
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v24-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for case in expected:
            key = (case["entryId"], case["candidateLabel"])
            reference = references[key]
            google = google_metrics[(case["entryId"], "american")]
            last_error: Exception | None = None
            for generation_attempt, seed_offset in enumerate(seed_offsets):
                generation_seed = case["seed"] + seed_offset
                mx.random.seed(generation_seed)
                results = list(model.generate(
                    case["generationPrompt"],
                    ref_audio=loaded_references[key],
                    ref_text=reference["referenceText"],
                    temperature=case["temperature"],
                    lang_code="English",
                    max_tokens=180,
                    top_k=case["topK"],
                    top_p=case["topP"],
                    repetition_penalty=1.4,
                    stream=False,
                    verbose=False,
                ))
                if len(results) != 1:
                    last_error = RuntimeError(f"Unexpected Qwen V24 result count: {len(results)}")
                    continue
                try:
                    protected, extraction = protect_with_google_envelope(results[0].audio, results[0].sample_rate, google)
                    active_ratio = extraction["directActiveSeconds"] / case["googleReferenceActiveSeconds"]
                    if not MIN_ACTIVE_RATIO <= active_ratio <= MAX_ACTIVE_RATIO:
                        raise ValueError(f"V24 active duration ratio out of range: {active_ratio:.3f}")
                    signal = V12.validate_candidate_signal(protected, results[0].sample_rate)
                    filename = f"{case['entryId']}--american--{case['candidateLabel'].lower()}.mp3"
                    wav_path = temporary_root / filename.replace(".mp3", ".wav")
                    scratch_path = OUTPUT_ROOT / filename
                    public_path = PUBLIC_ROOT / filename
                    audio_write(wav_path, protected, results[0].sample_rate, format="wav")
                    REPAIR.encode_mp3(wav_path, scratch_path)
                    output_metrics = measure_google_envelope(scratch_path)
                    if abs(output_metrics["durationSeconds"] - google["durationSeconds"]) > 0.15:
                        raise ValueError(f"V24 total duration drift: {output_metrics['durationSeconds']:.3f} vs {google['durationSeconds']:.3f}")
                    if abs(output_metrics["leadingSilenceSeconds"] - google["leadingSilenceSeconds"]) > 0.05:
                        raise ValueError("V24 leading envelope drift")
                    if abs(output_metrics["trailingSilenceSeconds"] - google["trailingSilenceSeconds"]) > 0.05:
                        raise ValueError("V24 trailing envelope drift")
                    public_path.write_bytes(scratch_path.read_bytes())
                    entries.append({
                        **case,
                        "generationAttempt": generation_attempt,
                        "generationSeed": generation_seed,
                        "activeToGoogleRatio": round(active_ratio, 6),
                        "voiceReference": reference["voice"],
                        "teacherPath": reference["teacherPath"],
                        "teacherSha256": reference["teacherSha256"],
                        "teacherSsml": reference["teacherSsml"],
                        "naturalReferenceWords": reference["naturalWords"],
                        "path": filename,
                        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-natural-cadence-v24/{filename}",
                        "bytes": scratch_path.stat().st_size,
                        "sha256": V12.sha256_file(scratch_path),
                        **extraction,
                        **signal,
                        **output_metrics,
                    })
                    last_error = None
                    break
                except ValueError as error:
                    last_error = error
            if last_error is not None:
                failures.append({**case, "error": str(last_error)})
                result_label = "failed"
            else:
                result_label = "generated"
            write_manifest(payload("generation_in_progress", entries, failures))
            print(f"{len(entries) + len(failures)}/8 {result_label}: {case['headword']} {case['candidateLabel']} (ok={len(entries)}, failed={len(failures)})", flush=True)
            mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status, entries, failures))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
