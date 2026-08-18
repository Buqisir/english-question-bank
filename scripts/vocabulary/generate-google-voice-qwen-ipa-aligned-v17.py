#!/usr/bin/env python3

"""Generate two private IPA-audited Qwen candidates for the final 14 accent failures."""

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
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-ipa-aligned-v17"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-ipa-aligned-v17"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
AUDIT_PATH = OUTPUT_ROOT / "pronunciation-audit-v17.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-ipa-aligned-v17"
CANDIDATE_CONFIGS = {
    "C17": {"seed": 17000, "temperature": 0.35, "targetField": "canonicalText", "strategy": "canonical-after-spoken-guide"},
    "P17": {"seed": 27000, "temperature": 0.45, "targetField": "stressSpelling", "strategy": "ipa-aligned-respelled-target"},
}


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V16 = load_module("eqb_google_voice_qwen_v16", "scripts/vocabulary/generate-google-voice-qwen-recovery-v16.py")
V12 = V16.V12
REPAIR = V16.REPAIR


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
    audit = read_json(AUDIT_PATH)
    v16_qa = read_json(ROOT / ".scratch/gaokao-google-voice-qwen-recovery-v16/owner-qa-summary-v16.json")
    v16_manifest = read_json(ROOT / ".scratch/gaokao-google-voice-qwen-recovery-v16/manifest.json")
    failed_keys = {(entry["entryId"], entry["accent"]): entry for entry in v16_qa["failed"]}
    prior_by_key: dict[tuple[str, str], dict[str, dict[str, Any]]] = {}
    for entry in v16_manifest["entries"]:
        key = (entry["entryId"], entry["accent"])
        prior_by_key.setdefault(key, {})[entry["candidateLabel"]] = entry
    cases: list[dict[str, Any]] = []
    for case_index, audited in enumerate(audit["entries"]):
        key = (audited["entryId"], audited["accent"])
        qa_entry = failed_keys.get(key)
        prior = prior_by_key.get(key)
        if not qa_entry or not prior or set(prior) != {"A16", "B16"}:
            raise ValueError(f"Missing V16 failed case or A16/B16 pair: {key}")
        base = prior["A16"]
        cases.append({
            **base,
            **audited,
            "caseIndex": case_index,
            "ownerIssue": qa_entry["note"],
            "priorA16PublicPath": prior["A16"]["publicPath"],
            "priorB16PublicPath": prior["B16"]["publicPath"],
        })
    keys = [(case["entryId"], case["accent"]) for case in cases]
    if len(cases) != 14 or len(set(keys)) != 14 or set(keys) != set(failed_keys):
        raise ValueError("Expected the exact 14-case V16 Owner-failure set")
    return tuple(cases)


def prompt_for(case: dict[str, Any], candidate: dict[str, Any], variant: int) -> str:
    target = case[candidate["targetField"]].strip().rstrip(".!?")
    preface = f"Pronunciation guide: {case['guideText']}. {case['exampleText']}"
    tails = ("Done.", "That was the complete word.", "Finished.")
    return f"{preface}\n\n{target}.\n\n{tails[variant]}"


def main() -> None:
    args = parse_args()
    cases = build_cases()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    model_receipt = V12.validate_model(args.model)
    references = V12.build_references(OUTPUT_ROOT)
    expected: dict[tuple[str, str, str], dict[str, Any]] = {}
    for case in cases:
        for label, config in CANDIDATE_CONFIGS.items():
            expected[(case["entryId"], case["accent"], label)] = {
                **case,
                "candidateLabel": label,
                "seed": config["seed"] + case["caseIndex"] * 17,
                "temperature": config["temperature"],
                "targetField": config["targetField"],
                "generationStrategy": config["strategy"],
            }

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    if MANIFEST_PATH.exists() and not args.replace:
        existing = read_json(MANIFEST_PATH)
        if existing.get("schemaVersion") != SCHEMA:
            raise ValueError(f"Cannot resume a different V17 schema: {MANIFEST_PATH}")
        for collection_name, destination in (("entries", entries), ("failures", failures)):
            for record in existing.get(collection_name, []):
                key = (record["entryId"], record["accent"], record["candidateLabel"])
                expected_record = expected.get(key)
                if not expected_record or record.get("seed") != expected_record["seed"] or record.get("generationStrategy") != expected_record["generationStrategy"]:
                    continue
                destination.append({**expected_record, **record})
        if args.retry_failures:
            failures = []
        for entry in entries:
            scratch_path = OUTPUT_ROOT / entry["path"]
            public_path = ROOT / "app/public" / entry["publicPath"].lstrip("/")
            if not scratch_path.exists() or not public_path.exists():
                raise FileNotFoundError(f"Checkpointed V17 candidate is missing: {entry['entryId']} {entry['accent']} {entry['candidateLabel']}")
            if V12.sha256_file(scratch_path) != entry["sha256"] or V12.sha256_file(public_path) != entry["sha256"]:
                raise ValueError(f"Checkpointed V17 candidate hash mismatch: {entry['entryId']} {entry['accent']} {entry['candidateLabel']}")

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 14,
            "plannedCandidates": 28,
            "strategy": "Cambridge-audited IPA is translated into a spoken pronunciation guide; C17 isolates canonical spelling after the guide, while P17 isolates an IPA-aligned stress respelling; both retain V16 cue-protected edges",
            "pronunciationAudit": str(AUDIT_PATH.relative_to(ROOT)),
            "auditCounts": read_json(AUDIT_PATH)["counts"],
            "candidateConfigs": CANDIDATE_CONFIGS,
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
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
    print(f"Loading Qwen Base for {len(expected) - len(attempted)} remaining of 28 V17 candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_references = {
        accent: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for accent, receipt in references.items()
    }
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v17-") as temporary_directory:
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
                    prompt_for(case, case, prompt_variant),
                    ref_audio=loaded_references[accent],
                    ref_text=references[accent]["referenceText"],
                    temperature=case["temperature"],
                    lang_code="English",
                    max_tokens=420,
                    top_k=30,
                    top_p=0.9,
                    repetition_penalty=1.4,
                    stream=False,
                    verbose=False,
                ))
                if len(results) != 1:
                    last_error = RuntimeError(f"Unexpected Qwen V17 result count: {len(results)}")
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
                        "generatedTargetText": case[case["targetField"]],
                        "voiceReference": references[accent]["voice"],
                        "referenceSha256": references[accent]["sha256"],
                        "path": filename,
                        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-ipa-aligned-v17/{filename}",
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
                f"{len(attempted)}/28 {result_label}: {case['headword']} {accent} {label} "
                f"(ok={len(entries)}, failed={len(failures)})",
                flush=True,
            )
            mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
