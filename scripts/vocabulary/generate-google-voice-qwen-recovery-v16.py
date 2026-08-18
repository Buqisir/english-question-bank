#!/usr/bin/env python3

"""Generate two private cue-protected Qwen recovery candidates for the 31 remaining accent failures."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
from typing import Any

import mlx.core as mx
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


ROOT = Path(__file__).resolve().parents[2]
MODEL_DEFAULT = Path("/Users/huangxuewei/.cache/eqbank/models/qwen3-tts-base-6bit")
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-recovery-v16"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-recovery-v16"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-recovery-v16"
CANDIDATE_CONFIGS = {
    "A16": {"seed": 16000, "temperature": 0.35},
    "B16": {"seed": 26000, "temperature": 0.65},
}
BOUNDARY_FAILURE_KEYS = {
    ("gaokao-frequency-0001-the", "american"),
    ("gaokao-frequency-0878-unique", "american"),
    ("gaokao-frequency-1402-electricity", "british"),
    ("gaokao-frequency-1488-characteristic", "american"),
    ("gaokao-frequency-1488-characteristic", "british"),
    ("gaokao-frequency-2213-energetic", "american"),
    ("gaokao-frequency-2656-erupt", "british"),
    ("gaokao-frequency-2684-era", "american"),
    ("gaokao-frequency-2823-dolphin", "american"),
    ("gaokao-frequency-2952-domain", "american"),
}
EXAMPLE_TEXTS = {
    "gaokao-frequency-0001-the": "Open the book.",
    "gaokao-frequency-0582-communication": "Clear communication matters.",
    "gaokao-frequency-0625-percent": "Fifty percent of the work is finished.",
    "gaokao-frequency-0877-conduct": "They will conduct the study.",
    "gaokao-frequency-0878-unique": "We found a truly unique opportunity for everyone.",
    "gaokao-frequency-1402-electricity": "We need electricity today.",
    "gaokao-frequency-1488-characteristic": "A key characteristic of success is patience.",
    "gaokao-frequency-1689-diverse": "The city has a diverse community.",
    "gaokao-frequency-1887-hello": "She said hello to everyone.",
    "gaokao-frequency-1902-maintain": "We need to maintain the system carefully.",
    "gaokao-frequency-2081-violin": "She plays the violin beautifully.",
    "gaokao-frequency-2213-energetic": "She is an energetic student in class.",
    "gaokao-frequency-2214-alongside": "Walk alongside the river.",
    "gaokao-frequency-2396-ballet": "She studies ballet every day.",
    "gaokao-frequency-2656-erupt": "Some volcanoes can erupt without warning.",
    "gaokao-frequency-2662-occupation": "Her current occupation is teaching English.",
    "gaokao-frequency-2684-era": "A completely new era began at that time.",
    "gaokao-frequency-2739-ad-a-d": "The abbreviation A D means Anno Domini.",
    "gaokao-frequency-2741-canteen": "The school canteen is open.",
    "gaokao-frequency-2754-eighteen": "She is now eighteen years old.",
    "gaokao-frequency-2766-download": "You should download the file below.",
    "gaokao-frequency-2814-premier": "The national premier attended the meeting.",
    "gaokao-frequency-2823-dolphin": "A young dolphin swam close beside us.",
    "gaokao-frequency-2866-downstairs": "Go downstairs now.",
    "gaokao-frequency-2921-kangaroo": "A wild kangaroo jumped away.",
    "gaokao-frequency-2952-domain": "This domain is public.",
    "gaokao-frequency-2955-entitle": "They plan to entitle the book tomorrow.",
    "gaokao-frequency-2956-equator": "The equator crosses the ocean.",
}


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V12 = load_module("eqb_google_voice_qwen_v12", "scripts/vocabulary/generate-google-voice-qwen-pilot-v12.py")
REPAIR = load_module("eqb_qwen_audio_repair", "scripts/vocabulary/generate-qwen-audio-repair.py")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_DEFAULT)
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--retry-failures", action="store_true")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_manifest(payload: dict[str, Any]) -> None:
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)


def build_cases() -> tuple[dict[str, Any], ...]:
    v14_manifest = read_json(ROOT / ".scratch/gaokao-google-voice-qwen-context-pilot-v14/manifest.json")
    v14_qa = read_json(ROOT / ".scratch/gaokao-google-voice-qwen-context-pilot-v14/owner-qa-summary-v14.json")
    v15_manifest = read_json(ROOT / ".scratch/gaokao-google-voice-qwen-context-full-v15/manifest.json")
    v15_qa = read_json(ROOT / ".scratch/gaokao-google-voice-qwen-context-full-v15/owner-qa-summary-v15.json")
    v14_by_key = {(entry["entryId"], entry["accent"]): entry for entry in v14_manifest["entries"]}
    v15_by_key = {(entry["entryId"], entry["accent"]): entry for entry in v15_manifest["entries"]}
    cases: list[dict[str, Any]] = []
    for source_version, qa_entries, by_key in (
        ("V14", v14_qa["entries"], v14_by_key),
        ("V15", v15_qa["failed"], v15_by_key),
    ):
        failed_entries = (
            [entry for entry in qa_entries if entry.get("verdict") == "failed"]
            if source_version == "V14" else qa_entries
        )
        for qa_entry in failed_entries:
            key = (qa_entry["entryId"], qa_entry["accent"])
            prior = by_key.get(key)
            if not prior:
                raise ValueError(f"Missing {source_version} prior candidate: {key}")
            example_text = EXAMPLE_TEXTS.get(qa_entry["entryId"])
            if not example_text:
                raise ValueError(f"Missing V16 example text: {qa_entry['entryId']}")
            cases.append({
                **prior,
                "sourceVersion": source_version,
                "priorPublicPath": prior["publicPath"],
                "ownerIssue": qa_entry.get("note", ""),
                "issueClass": "boundary" if key in BOUNDARY_FAILURE_KEYS else "pronunciation_or_stress",
                "exampleText": example_text,
            })
    keys = [(case["entryId"], case["accent"]) for case in cases]
    if len(cases) != 31 or len(set(keys)) != 31:
        raise ValueError(f"Expected 31 unique combined V14/V15 failures, received {len(cases)}")
    if len(BOUNDARY_FAILURE_KEYS) != 10 or not BOUNDARY_FAILURE_KEYS.issubset(set(keys)):
        raise ValueError("Boundary-failure classification is not bound to the 31-case recovery set")
    return tuple(cases)


def prompt_for(case: dict[str, Any], variant: int) -> str:
    target = case.get("generationText", case.get("audioText", case["headword"])).strip().rstrip(".!?")
    example = case["exampleText"].strip()
    tails = ("Done.", "That was the complete word.", "Finished.")
    return f"{example}\n\n{target}.\n\n{tails[variant]}"


def main() -> None:
    args = parse_args()
    cases = build_cases()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    model_receipt = V12.validate_model(args.model)
    references = V12.build_references(OUTPUT_ROOT)
    expected: dict[tuple[str, str, str], dict[str, Any]] = {}
    for case_index, case in enumerate(cases):
        for label, config in CANDIDATE_CONFIGS.items():
            expected[(case["entryId"], case["accent"], label)] = {
                **case,
                "caseIndex": case_index,
                "candidateLabel": label,
                "seed": config["seed"] + case_index * 17,
                "temperature": config["temperature"],
            }

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    if MANIFEST_PATH.exists() and not args.replace:
        existing = read_json(MANIFEST_PATH)
        if existing.get("schemaVersion") != SCHEMA:
            raise ValueError(f"Cannot resume a different V16 schema: {MANIFEST_PATH}")
        for collection_name, destination in (("entries", entries), ("failures", failures)):
            for record in existing.get(collection_name, []):
                key = (record["entryId"], record["accent"], record["candidateLabel"])
                expected_record = expected.get(key)
                if not expected_record or record.get("seed") != expected_record["seed"] or record.get("temperature") != expected_record["temperature"]:
                    continue
                destination.append({**expected_record, **record})
        if args.retry_failures:
            failures = []
        for entry in entries:
            scratch_path = OUTPUT_ROOT / entry["path"]
            public_path = ROOT / "app/public" / entry["publicPath"].lstrip("/")
            if not scratch_path.exists() or not public_path.exists():
                raise FileNotFoundError(f"Checkpointed V16 candidate is missing: {entry['entryId']} {entry['accent']} {entry['candidateLabel']}")
            if V12.sha256_file(scratch_path) != entry["sha256"] or V12.sha256_file(public_path) != entry["sha256"]:
                raise ValueError(f"Checkpointed V16 candidate hash mismatch: {entry['entryId']} {entry['accent']} {entry['candidateLabel']}")

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 31,
            "plannedCandidates": 62,
            "strategy": "full natural example primes lexical role and stress; isolated target is recovered only between cue-protected gaps with active-edge safety and explicit head/tail silence",
            "issueClasses": {"boundary": 10, "pronunciation_or_stress": 21},
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
            "candidateConfigs": CANDIDATE_CONFIGS,
            "edgeProtection": {
                "activeSafetySeconds": REPAIR.TARGET_ACTIVE_SAFETY_SECONDS,
                "leadingZeroSeconds": REPAIR.LEADING_ZERO_SECONDS,
                "trailingZeroSeconds": REPAIR.TRAILING_ZERO_SECONDS,
            },
            "references": references,
            "entries": entries,
            "failures": failures,
        }

    attempted = {
        (entry["entryId"], entry["accent"], entry["candidateLabel"]) for entry in entries
    } | {
        (entry["entryId"], entry["accent"], entry["candidateLabel"]) for entry in failures
    }
    if len(attempted) == len(expected):
        status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
        write_manifest(payload(status))
        print(json.dumps({"manifest": str(MANIFEST_PATH), "resumed": True, "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))
        return

    write_manifest(payload("generation_in_progress"))
    print(f"Loading Qwen Base for {len(expected) - len(attempted)} remaining of 62 V16 candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_references = {
        accent: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for accent, receipt in references.items()
    }
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v16-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for key, case in expected.items():
            if key in attempted:
                continue
            label = case["candidateLabel"]
            accent = case["accent"]
            last_error: Exception | None = None
            for generation_attempt in range(6):
                prompt_variant = generation_attempt % 3
                seed_offset = prompt_variant if generation_attempt < 3 else 100 + prompt_variant
                mx.random.seed(case["seed"] + seed_offset)
                results = list(model.generate(
                    prompt_for(case, prompt_variant),
                    ref_audio=loaded_references[accent],
                    ref_text=references[accent]["referenceText"],
                    temperature=case["temperature"],
                    lang_code="English",
                    max_tokens=360,
                    top_k=30,
                    top_p=0.9,
                    repetition_penalty=1.4,
                    stream=False,
                    verbose=False,
                ))
                if len(results) != 1:
                    last_error = RuntimeError(f"Unexpected Qwen V16 result count: {len(results)}")
                    continue
                try:
                    protected, isolation_receipt = REPAIR.extract_cue_protected_target(results[0].audio, results[0].sample_rate)
                    signal_receipt = V12.validate_candidate_signal(protected, results[0].sample_rate)
                    filename = f"{case['entryId']}--{accent}--{label.lower()}.mp3"
                    wav_path = temporary_root / filename.replace(".mp3", ".wav")
                    scratch_path = OUTPUT_ROOT / filename
                    public_path = PUBLIC_ROOT / filename
                    audio_write(wav_path, protected, results[0].sample_rate, format="wav")
                    REPAIR.encode_mp3(wav_path, scratch_path)
                    public_path.write_bytes(scratch_path.read_bytes())
                    edge_metrics = REPAIR.audio_metrics(scratch_path)
                    probe_metrics = V12.QWEN_AUDIO.probe_audio(scratch_path)
                    entries.append({
                        **case,
                        "promptVariant": prompt_variant,
                        "generationAttempt": generation_attempt,
                        "voiceReference": references[accent]["voice"],
                        "referenceSha256": references[accent]["sha256"],
                        "path": filename,
                        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-recovery-v16/{filename}",
                        "bytes": scratch_path.stat().st_size,
                        "sha256": V12.sha256_file(scratch_path),
                        **isolation_receipt,
                        **signal_receipt,
                        **edge_metrics,
                        **probe_metrics,
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
            attempted.add(key)
            write_manifest(payload("generation_in_progress"))
            print(
                f"{len(attempted)}/62 {result_label}: {case['headword']} {accent} {label} "
                f"(ok={len(entries)}, failed={len(failures)})",
                flush=True,
            )
            mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
