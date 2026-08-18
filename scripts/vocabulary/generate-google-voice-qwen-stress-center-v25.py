#!/usr/bin/env python3

"""Generate three final stress-focused repairs without changing natural cadence."""

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
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-stress-center-v25"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-stress-center-v25"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
TEACHER_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-natural-rate-teacher-v24/manifest.json"
V21_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json"
V24_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-natural-cadence-v24/manifest.json"
V24_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-natural-cadence-v24/owner-qa-summary-v24.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-stress-center-v25"

CANDIDATE_CONFIGS = {
    "A25": {"seed": 25000, "temperature": 0.26, "topK": 24, "topP": 0.88, "anchorLabel": "A21", "teacherLabel": "A24", "gainProfile": "mild"},
    "B25": {"seed": 35000, "temperature": 0.32, "topK": 32, "topP": 0.91, "anchorLabel": "B21", "teacherLabel": "B24", "gainProfile": "strong"},
}
STRESS_PROFILES = {
    "gaokao-frequency-2396-ballet": {
        "mild": [(0.00, 0.45, -1.5), (0.45, 1.00, 2.5)],
        "strong": [(0.00, 0.45, -2.5), (0.45, 1.00, 4.0)],
    },
    "gaokao-frequency-1887-hello": {
        "mild": [(0.00, 0.42, -1.5), (0.42, 1.00, 2.5)],
        "strong": [(0.00, 0.42, -2.5), (0.42, 1.00, 4.0)],
    },
    "gaokao-frequency-2081-violin": {
        "mild": [(0.00, 0.45, 0.0), (0.45, 0.67, -2.0), (0.67, 1.00, 3.0)],
        "strong": [(0.00, 0.45, 0.5), (0.45, 0.67, -3.0), (0.67, 1.00, 4.5)],
    },
}
MIN_ACTIVE_RATIO = 0.88
MAX_ACTIVE_RATIO = 1.12
TEACHER_REPEAT_COUNT = 4
NATURAL_REFERENCE_SECONDS = 3.0
GAIN_SMOOTH_SECONDS = 0.03


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V24 = load_module("eqb_google_voice_qwen_v24_stress_center", "scripts/vocabulary/generate-google-voice-qwen-natural-cadence-v24.py")
V21 = V24.V21
V12 = V24.V12
REPAIR = V24.REPAIR


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


def apply_stress_center(samples: np.ndarray, sample_rate: int, segments: list[tuple[float, float, float]]) -> tuple[np.ndarray, dict[str, Any]]:
    values = np.asarray(samples, dtype=np.float32).reshape(-1)
    window = max(1, round(sample_rate * REPAIR.TARGET_EDGE_FRAME_SECONDS))
    padding = (-values.size) % window
    frames = np.pad(values, (0, padding)).reshape(-1, window)
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=1))
    active = np.flatnonzero(frame_rms >= REPAIR.TARGET_EDGE_THRESHOLD)
    if active.size == 0:
        raise ValueError("V25 stress source is silent")
    active_start = active[0] * window
    active_end = min(values.size, (active[-1] + 1) * window)
    active_size = active_end - active_start
    target_db = np.zeros(values.size, dtype=np.float32)
    for start_fraction, end_fraction, gain_db in segments:
        start = active_start + round(active_size * start_fraction)
        end = active_start + round(active_size * end_fraction)
        target_db[start:end] = gain_db
    gain = np.power(10.0, target_db / 20.0).astype(np.float32)
    smooth = max(1, round(sample_rate * GAIN_SMOOTH_SECONDS))
    if smooth > 1:
        kernel = np.ones(smooth, dtype=np.float32) / smooth
        gain = np.convolve(np.pad(gain, (smooth // 2, smooth - 1 - smooth // 2), mode="edge"), kernel, mode="valid")
    processed = values * gain
    peak = float(np.max(np.abs(processed))) if processed.size else 0.0
    peak_scale = 1.0
    if peak > 0.96:
        peak_scale = 0.96 / peak
        processed *= peak_scale
    return processed.astype(np.float32), {
        "stressSegments": [
            {"startFraction": start, "endFraction": end, "gainDb": gain_db}
            for start, end, gain_db in segments
        ],
        "gainSmoothSeconds": GAIN_SMOOTH_SECONDS,
        "peakScale": round(peak_scale, 6),
    }


def build_references(teachers: list[dict[str, Any]], v21: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    reference_root = OUTPUT_ROOT / "references"
    reference_root.mkdir(parents=True, exist_ok=True)
    teacher_by_key = {(entry["entryId"], entry["candidateLabel"]): entry for entry in teachers}
    v21_entry_by_key = {(entry["entryId"], entry["candidateLabel"]): entry for entry in v21["entries"]}
    receipts = {}
    for entry_id in STRESS_PROFILES:
        for label, config in CANDIDATE_CONFIGS.items():
            teacher = teacher_by_key[(entry_id, config["teacherLabel"])]
            anchor_entry = v21_entry_by_key[(entry_id, config["anchorLabel"])]
            anchor_receipt = v21["references"][anchor_entry["referenceId"]]
            chunks = []
            natural_words = []
            natural_duration = 0.0
            for anchor in anchor_receipt["entries"]:
                source_path = ROOT / anchor["path"]
                if V12.sha256_file(source_path) != anchor["sha256"]:
                    raise ValueError(f"V25 anchor hash mismatch: {source_path}")
                samples, sample_rate = audio_read(source_path, dtype="float32", sample_rate=24000, nchannels=1)
                if sample_rate != 24000:
                    raise ValueError(f"V25 anchor sample-rate mismatch: {source_path}")
                chunk = np.asarray(samples, dtype=np.float32).reshape(-1)
                chunks.append(chunk)
                natural_words.append(anchor["headword"])
                natural_duration += chunk.size / sample_rate
                if natural_duration >= NATURAL_REFERENCE_SECONDS:
                    break
            teacher_path = ROOT / ".scratch/gaokao-google-natural-rate-teacher-v24" / teacher["path"]
            if V12.sha256_file(teacher_path) != teacher["sha256"]:
                raise ValueError(f"V25 teacher hash mismatch: {teacher_path}")
            teacher_samples, teacher_rate = audio_read(teacher_path, dtype="float32", sample_rate=24000, nchannels=1)
            if teacher_rate != 24000:
                raise ValueError(f"V25 teacher sample-rate mismatch: {teacher_path}")
            teacher_chunk = np.asarray(teacher_samples, dtype=np.float32).reshape(-1)
            chunks.extend([teacher_chunk] * TEACHER_REPEAT_COUNT)
            reference_words = natural_words + [teacher["headword"]] * TEACHER_REPEAT_COUNT
            joined = np.concatenate(chunks)
            output_path = reference_root / f"{entry_id}--{label.lower()}.wav"
            audio_write(output_path, joined, 24000, format="wav")
            receipts[(entry_id, label)] = {
                "path": str(output_path.relative_to(ROOT)),
                "sha256": V12.sha256_file(output_path),
                "durationSeconds": round(joined.size / 24000, 6),
                "referenceText": ". ".join(reference_words) + ".",
                "naturalWords": natural_words,
                "teacherRepeatCount": TEACHER_REPEAT_COUNT,
                "teacherPath": teacher["path"],
                "teacherSha256": teacher["sha256"],
                "teacherSsml": teacher["ssml"],
                "voice": teacher["voice"],
            }
    if len(receipts) != 6:
        raise ValueError("V25 requires six teacher-dominant references")
    return receipts


def main() -> None:
    args = parse_args()
    teacher_manifest = read_json(TEACHER_MANIFEST_PATH)
    v21 = read_json(V21_MANIFEST_PATH)
    v24 = read_json(V24_MANIFEST_PATH)
    v24_qa = read_json(V24_QA_PATH)
    if teacher_manifest.get("schemaVersion") != "gaokao-frequency-google-natural-rate-teacher-v24" or len(teacher_manifest.get("entries", [])) != 8:
        raise ValueError("V25 requires eight V24 natural-rate teachers")
    if v24_qa.get("counts", {}).get("a24Usable") != 1 or v24_qa.get("counts", {}).get("failed") != 3:
        raise ValueError("V25 requires the completed V24 Owner QA")
    failed_ids = {entry["entryId"] for entry in v24_qa["entries"] if entry["verdict"] == "both_fail"}
    if failed_ids != set(STRESS_PROFILES):
        raise ValueError("V25 must cover the exact three unresolved V24 words")

    base_by_id = {}
    for entry in v24["entries"]:
        if entry["entryId"] in failed_ids:
            base_by_id.setdefault(entry["entryId"], entry)
    if set(base_by_id) != failed_ids:
        raise ValueError("V25 base metadata does not match the unresolved set")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    model_receipt = V12.validate_model(args.model)
    google_metrics = V21.build_google_metrics()
    references = build_references(teacher_manifest["entries"], v21)
    expected = []
    for case_index, entry_id in enumerate([
        "gaokao-frequency-2081-violin",
        "gaokao-frequency-1887-hello",
        "gaokao-frequency-2396-ballet",
    ]):
        base = base_by_id[entry_id]
        google = google_metrics[(entry_id, "american")]
        google_active = google["durationSeconds"] - google["leadingSilenceSeconds"] - google["trailingSilenceSeconds"]
        for label, config in CANDIDATE_CONFIGS.items():
            reference_label = "A25" if entry_id == "gaokao-frequency-2081-violin" and label == "B25" else label
            reference = references[(entry_id, reference_label)]
            expected.append({
                **base,
                "candidateLabel": label,
                "seed": config["seed"] + case_index * 47,
                "temperature": config["temperature"],
                "topK": config["topK"],
                "topP": config["topP"],
                "gainProfile": config["gainProfile"],
                "referenceLabel": reference_label,
                "generationStrategy": "teacher-dominant-natural-cadence-smooth-stress-center",
                "generationPrompt": f"{base['audioText'].strip().rstrip('.!?')}.",
                "referencePath": reference["path"],
                "referenceSha256": reference["sha256"],
                "referenceText": reference["referenceText"],
                "googleReferenceActiveSeconds": round(google_active, 6),
            })
    if len(expected) != 6:
        raise ValueError("V25 must plan exactly six candidates")

    entries = []
    failures = []
    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 3,
            "plannedCandidates": 6,
            "strategy": "preserve V24 natural cadence and Google envelope; raise matched-target teacher share; apply only a smooth energy-center shift to the target stressed syllable without time stretching or splicing",
            "v24OwnerQa": str(V24_QA_PATH.relative_to(ROOT)),
            "preservedUsable": [
                {"entryId": "gaokao-frequency-2956-equator", "accent": "american", "candidateLabel": "A21"},
                {"entryId": "gaokao-frequency-2952-domain", "accent": "american", "candidateLabel": "C22"},
                {"entryId": "gaokao-frequency-2823-dolphin", "accent": "american", "candidateLabel": "A24"},
            ],
            "durationGate": {"minimumActiveToGoogleRatio": MIN_ACTIVE_RATIO, "maximumActiveToGoogleRatio": MAX_ACTIVE_RATIO},
            "stressProfiles": STRESS_PROFILES,
            "candidateConfigs": CANDIDATE_CONFIGS,
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
            "references": {f"{entry_id}:{label}": receipt for (entry_id, label), receipt in references.items()},
            "entries": entries,
            "failures": failures,
        }

    write_manifest(payload("generation_in_progress"))
    print("Loading Qwen Base for 6 V25 stress-center candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_references = {key: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate) for key, receipt in references.items()}
    seed_offsets = (0, 1, 2, 100, 101, 102, 200, 201)
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v25-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for case in expected:
            key = (case["entryId"], case["candidateLabel"])
            reference_key = (case["entryId"], case["referenceLabel"])
            reference = references[reference_key]
            google = google_metrics[(case["entryId"], "american")]
            last_error: Exception | None = None
            for generation_attempt, seed_offset in enumerate(seed_offsets):
                generation_seed = case["seed"] + seed_offset
                mx.random.seed(generation_seed)
                results = list(model.generate(
                    case["generationPrompt"],
                    ref_audio=loaded_references[reference_key],
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
                    last_error = RuntimeError(f"Unexpected Qwen V25 result count: {len(results)}")
                    continue
                try:
                    protected, extraction = V24.protect_with_google_envelope(results[0].audio, results[0].sample_rate, google)
                    active_ratio = extraction["directActiveSeconds"] / case["googleReferenceActiveSeconds"]
                    if not MIN_ACTIVE_RATIO <= active_ratio <= MAX_ACTIVE_RATIO:
                        raise ValueError(f"V25 active duration ratio out of range: {active_ratio:.3f}")
                    processed, stress = apply_stress_center(protected, results[0].sample_rate, STRESS_PROFILES[case["entryId"]][case["gainProfile"]])
                    signal = V12.validate_candidate_signal(processed, results[0].sample_rate)
                    filename = f"{case['entryId']}--american--{case['candidateLabel'].lower()}.mp3"
                    wav_path = temporary_root / filename.replace(".mp3", ".wav")
                    scratch_path = OUTPUT_ROOT / filename
                    public_path = PUBLIC_ROOT / filename
                    audio_write(wav_path, processed, results[0].sample_rate, format="wav")
                    REPAIR.encode_mp3(wav_path, scratch_path)
                    output_metrics = V24.measure_google_envelope(scratch_path)
                    if abs(output_metrics["durationSeconds"] - google["durationSeconds"]) > 0.15:
                        raise ValueError("V25 total duration drift")
                    if abs(output_metrics["leadingSilenceSeconds"] - google["leadingSilenceSeconds"]) > 0.05:
                        raise ValueError("V25 leading envelope drift")
                    if abs(output_metrics["trailingSilenceSeconds"] - google["trailingSilenceSeconds"]) > 0.05:
                        raise ValueError("V25 trailing envelope drift")
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
                        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-stress-center-v25/{filename}",
                        "bytes": scratch_path.stat().st_size,
                        "sha256": V12.sha256_file(scratch_path),
                        **extraction,
                        **stress,
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
            write_manifest(payload("generation_in_progress"))
            print(f"{len(entries) + len(failures)}/6 {result_label}: {case['headword']} {case['candidateLabel']} (ok={len(entries)}, failed={len(failures)})", flush=True)
            mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
