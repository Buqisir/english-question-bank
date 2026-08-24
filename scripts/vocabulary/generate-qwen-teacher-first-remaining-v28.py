#!/usr/bin/env python3

"""Apply the Owner-approved V27 teacher-first route to ballet and violin."""

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
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-teacher-first-remaining-v28"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-teacher-first-remaining-v28"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
V21_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json"
V24_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-natural-cadence-v24/manifest.json"
V26_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-openvoice-v26/manifest.json"
V27_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-teacher-first-hello-v27/owner-qa-summary-v27.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-teacher-first-remaining-v28"

CASES = {
    "gaokao-frequency-2396-ballet": {"headword": "ballet", "target": "读作 /bælˈeɪ/，重读 LAY"},
    "gaokao-frequency-2081-violin": {"headword": "violin", "target": "重音在 LIN，末元音是 /ɪ/"},
}
CANDIDATES = {
    "A28": {
        "seed": 28000,
        "temperature": 0.20,
        "topK": 20,
        "topP": 0.86,
        "anchorLabel": "A21",
        "teacherLabel": "A26",
    },
    "B28": {
        "seed": 38000,
        "temperature": 0.24,
        "topK": 24,
        "topP": 0.88,
        "anchorLabel": "A21",
        "teacherLabel": "B26",
    },
}
TEACHER_REPEAT_COUNTS = {
    ("gaokao-frequency-2081-violin", "A28"): 1,
    ("gaokao-frequency-2081-violin", "B28"): 2,
    ("gaokao-frequency-2396-ballet", "A28"): 2,
    ("gaokao-frequency-2396-ballet", "B28"): 3,
}
MIN_ACTIVE_RATIO = 0.84
MAX_ACTIVE_RATIO = 1.16
GOOGLE_ANCHOR_SECONDS = 5.8


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V24 = load_module("eqb_google_voice_qwen_v24_for_v28", "scripts/vocabulary/generate-google-voice-qwen-natural-cadence-v24.py")
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
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)


def build_references(v21: dict[str, Any], v26: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    reference_root = OUTPUT_ROOT / "references"
    reference_root.mkdir(parents=True, exist_ok=True)
    v21_entries = {(entry["entryId"], entry["candidateLabel"]): entry for entry in v21["entries"]}
    v26_sources = {
        (entry["entryId"], entry["candidateLabel"]): entry
        for entry in v26["entries"]
        if entry["entryId"] in CASES
    }
    receipts: dict[tuple[str, str], dict[str, Any]] = {}
    for entry_id in CASES:
        for label, config in CANDIDATES.items():
            teacher_entry = v26_sources.get((entry_id, config["teacherLabel"]))
            if not teacher_entry:
                raise ValueError(f"V28 teacher is missing: {entry_id} {config['teacherLabel']}")
            teacher_path = ROOT / teacher_entry["sourcePath"]
            if V12.sha256_file(teacher_path) != teacher_entry["sourceSha256"]:
                raise ValueError(f"V28 teacher hash mismatch: {teacher_path}")
            teacher_samples, teacher_rate = audio_read(teacher_path, dtype="float32", sample_rate=24000, nchannels=1)
            if teacher_rate != 24000:
                raise ValueError("V28 teacher sample-rate mismatch")
            teacher_chunk = np.asarray(teacher_samples, dtype=np.float32).reshape(-1)

            anchor_entry = v21_entries[(entry_id, config["anchorLabel"])]
            anchor_receipt = v21["references"][anchor_entry["referenceId"]]
            google_chunks = []
            google_words = []
            google_seconds = 0.0
            for anchor in anchor_receipt["entries"]:
                source_path = ROOT / anchor["path"]
                if V12.sha256_file(source_path) != anchor["sha256"]:
                    raise ValueError(f"V28 Google anchor hash mismatch: {source_path}")
                samples, sample_rate = audio_read(source_path, dtype="float32", sample_rate=24000, nchannels=1)
                if sample_rate != 24000:
                    raise ValueError("V28 Google anchor sample-rate mismatch")
                chunk = np.asarray(samples, dtype=np.float32).reshape(-1)
                google_chunks.append(chunk)
                google_words.append(anchor["headword"])
                google_seconds += chunk.size / sample_rate
                if google_seconds >= GOOGLE_ANCHOR_SECONDS:
                    break
            if google_seconds < GOOGLE_ANCHOR_SECONDS:
                raise ValueError("V28 did not collect enough Google voice anchors")

            teacher_repeat_count = TEACHER_REPEAT_COUNTS[(entry_id, label)]
            joined = np.concatenate([*[teacher_chunk] * teacher_repeat_count, *google_chunks])
            reference_words = [*[CASES[entry_id]["headword"]] * teacher_repeat_count, *google_words]
            output_path = reference_root / f"{entry_id}--{label.lower()}.wav"
            audio_write(output_path, joined, 24000, format="wav")
            receipts[(entry_id, label)] = {
                "path": str(output_path.relative_to(ROOT)),
                "sha256": V12.sha256_file(output_path),
                "sampleRate": 24000,
                "channels": 1,
                "durationSeconds": round(joined.size / 24000, 6),
                "referenceText": ". ".join(reference_words) + ".",
                "arrangement": "teacher_then_google",
                "teacherPath": teacher_entry["sourcePath"],
                "teacherSha256": teacher_entry["sourceSha256"],
                "teacherInstruction": teacher_entry["voiceDesignInstruction"],
                "teacherRepeatCount": teacher_repeat_count,
                "googleWords": google_words,
                "googleSeconds": round(google_seconds, 6),
                "voice": anchor_receipt["voice"],
            }
    return receipts


def main() -> None:
    args = parse_args()
    v21 = read_json(V21_MANIFEST_PATH)
    v24 = read_json(V24_MANIFEST_PATH)
    v26 = read_json(V26_MANIFEST_PATH)
    v27_qa = read_json(V27_QA_PATH)
    if v27_qa.get("counts") != {"total": 1, "a27Usable": 1, "failed": 0}:
        raise ValueError("V28 requires the Owner approval of hello A27")
    if v21.get("schemaVersion") != V21.SCHEMA:
        raise ValueError("V28 requires the V21 same-voice Google anchors")
    base_by_id: dict[str, dict[str, Any]] = {}
    for entry in v24["entries"]:
        if entry["entryId"] in CASES:
            base_by_id.setdefault(entry["entryId"], entry)
    if set(base_by_id) != set(CASES):
        raise ValueError("V28 is missing base metadata")

    google_metrics = V21.build_google_metrics()
    model_receipt = V12.validate_model(args.model)
    references = build_references(v21, v26)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 2,
            "plannedCandidates": 4,
            "strategy": "apply the Owner-approved hello A27 pattern unchanged: natural unconverted pronunciation teacher first, followed by several seconds of the original A21 Google female voice anchors, with Qwen Base as the only final generator and no voice conversion, time stretching, or stress gain processing",
            "v27OwnerQa": str(V27_QA_PATH.relative_to(ROOT)),
            "preservedUsable": [
                {"entryId": "gaokao-frequency-2956-equator", "accent": "american", "candidateLabel": "A21"},
                {"entryId": "gaokao-frequency-2952-domain", "accent": "american", "candidateLabel": "C22"},
                {"entryId": "gaokao-frequency-2823-dolphin", "accent": "american", "candidateLabel": "A24"},
                {"entryId": "gaokao-frequency-1887-hello", "accent": "american", "candidateLabel": "A27"},
            ],
            "candidateConfigs": CANDIDATES,
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
            "references": {f"{entry_id}:{label}": receipt for (entry_id, label), receipt in references.items()},
            "entries": entries,
            "failures": failures,
        }

    write_manifest(payload("generation_in_progress"))
    print("Loading Qwen Base for four V28 candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_references = {
        key: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for key, receipt in references.items()
    }
    seed_offsets = (0, 1, 2, 100, 101, 102, 200, 201)
    with tempfile.TemporaryDirectory(prefix="eqb-qwen-teacher-first-v28-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for case_index, entry_id in enumerate(("gaokao-frequency-2081-violin", "gaokao-frequency-2396-ballet")):
            case = CASES[entry_id]
            base = base_by_id[entry_id]
            google = google_metrics[(entry_id, "american")]
            google_active = google["durationSeconds"] - google["leadingSilenceSeconds"] - google["trailingSilenceSeconds"]
            for label, config in CANDIDATES.items():
                reference = references[(entry_id, label)]
                last_error: Exception | None = None
                for generation_attempt, seed_offset in enumerate(seed_offsets):
                    generation_seed = config["seed"] + case_index * 47 + seed_offset
                    mx.random.seed(generation_seed)
                    results = list(model.generate(
                        text=f"{case['headword']}.",
                        ref_audio=loaded_references[(entry_id, label)],
                        ref_text=reference["referenceText"],
                        temperature=config["temperature"],
                        lang_code="English",
                        max_tokens=180,
                        top_k=config["topK"],
                        top_p=config["topP"],
                        repetition_penalty=1.5,
                        stream=False,
                        verbose=False,
                    ))
                    if len(results) != 1:
                        last_error = RuntimeError(f"Unexpected Qwen V28 result count: {len(results)}")
                        continue
                    try:
                        protected, extraction = V24.protect_with_google_envelope(results[0].audio, results[0].sample_rate, google)
                        active_ratio = extraction["directActiveSeconds"] / google_active
                        if not MIN_ACTIVE_RATIO <= active_ratio <= MAX_ACTIVE_RATIO:
                            raise ValueError(f"V28 active duration ratio out of range: {active_ratio:.3f}")
                        signal = V12.validate_candidate_signal(protected, results[0].sample_rate)
                        filename = f"{entry_id}--american--{label.lower()}.mp3"
                        wav_path = temporary_root / filename.replace(".mp3", ".wav")
                        scratch_path = OUTPUT_ROOT / filename
                        public_path = PUBLIC_ROOT / filename
                        audio_write(wav_path, protected, results[0].sample_rate, format="wav")
                        REPAIR.encode_mp3(wav_path, scratch_path)
                        metrics = V24.measure_google_envelope(scratch_path)
                        if abs(metrics["durationSeconds"] - google["durationSeconds"]) > 0.15:
                            raise ValueError("V28 total duration drift")
                        if abs(metrics["leadingSilenceSeconds"] - google["leadingSilenceSeconds"]) > 0.05:
                            raise ValueError("V28 leading envelope drift")
                        if abs(metrics["trailingSilenceSeconds"] - google["trailingSilenceSeconds"]) > 0.05:
                            raise ValueError("V28 trailing envelope drift")
                        public_path.write_bytes(scratch_path.read_bytes())
                        entries.append({
                            **base,
                            "candidateLabel": label,
                            "generationSeed": generation_seed,
                            "generationAttempt": generation_attempt,
                            "generationPrompt": f"{case['headword']}.",
                            "generationStrategy": "owner-approved-teacher-first-google-voice-final-qwen-base-generation",
                            "referencePath": reference["path"],
                            "referenceSha256": reference["sha256"],
                            "referenceText": reference["referenceText"],
                            "referenceArrangement": reference["arrangement"],
                            "teacherPath": reference["teacherPath"],
                            "teacherSha256": reference["teacherSha256"],
                            "googleReferenceWords": reference["googleWords"],
                            "googleReferenceSeconds": reference["googleSeconds"],
                            "activeToGoogleRatio": round(active_ratio, 6),
                            "path": filename,
                            "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-teacher-first-remaining-v28/{filename}",
                            "bytes": scratch_path.stat().st_size,
                            "sha256": V12.sha256_file(scratch_path),
                            **extraction,
                            **signal,
                            **metrics,
                        })
                        last_error = None
                        break
                    except ValueError as error:
                        last_error = error
                if last_error is not None:
                    failures.append({"entryId": entry_id, "headword": case["headword"], "candidateLabel": label, "error": str(last_error)})
                    result = "failed"
                else:
                    result = "generated"
                write_manifest(payload("generation_in_progress"))
                print(f"{len(entries) + len(failures)}/4 {result}: {case['headword']} {label}", flush=True)
                mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
