#!/usr/bin/env python3

"""Reproduce the two V17 full Qwen utterances for precise Owner crop calibration."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
from typing import Any

import mlx.core as mx
import numpy as np
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


ROOT = Path(__file__).resolve().parents[2]
MODEL_DEFAULT = Path("/Users/huangxuewei/.cache/eqbank/models/qwen3-tts-base-6bit")
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-exact-crop-v20"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-exact-crop-v20"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
V17_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-ipa-aligned-v17/manifest.json"
V19_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-source-crop-v19/owner-qa-summary-v19.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-exact-crop-v20"
SOURCE_KEYS = (
    ("gaokao-frequency-2739-ad-a-d", "british", "C17"),
    ("gaokao-frequency-2956-equator", "american", "P17"),
)


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V17 = load_module("eqb_google_voice_qwen_v17_full_source", "scripts/vocabulary/generate-google-voice-qwen-ipa-aligned-v17.py")
V12 = V17.V12
REPAIR = V17.REPAIR


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def successful_seed(entry: dict[str, Any]) -> int:
    attempt = entry["generationAttempt"]
    variant = attempt % 3
    offset = variant if attempt < 3 else 100 + variant
    if entry["promptVariant"] != variant:
        raise ValueError(f"V17 prompt variant does not match generation attempt: {entry['entryId']}")
    return entry["seed"] + offset


def write_manifest(payload: dict[str, Any]) -> None:
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    v17_manifest = read_json(V17_MANIFEST_PATH)
    v19_qa = read_json(V19_QA_PATH)
    rejected = [entry for entry in v19_qa["entries"] if entry["verdict"] == "both_fail"]
    failed_keys = {(entry["entryId"], entry["accent"]) for entry in rejected}
    if failed_keys != {(entry_id, accent) for entry_id, accent, _ in SOURCE_KEYS}:
        raise ValueError("V20 must remain bound to the exact two Owner-rejected V19 cases")

    source_by_key = {
        (entry["entryId"], entry["accent"], entry["candidateLabel"]): entry
        for entry in v17_manifest["entries"]
    }
    sources = []
    for key in SOURCE_KEYS:
        source = source_by_key.get(key)
        if source is None:
            raise ValueError(f"Missing V17 source candidate: {key}")
        sources.append(source)

    model_receipt = V12.validate_model(MODEL_DEFAULT)
    references = v17_manifest["references"]
    for accent, receipt in references.items():
        reference_path = ROOT / receipt["path"]
        if V12.sha256_file(reference_path) != receipt["sha256"]:
            raise ValueError(f"V17 {accent} reference hash mismatch")

    print("Loading Qwen Base to reproduce two complete V17 source utterances", flush=True)
    model = load_model(model_path=str(MODEL_DEFAULT))
    loaded_references = {
        accent: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for accent, receipt in references.items()
    }
    entries: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v20-source-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for source in sources:
            accent = source["accent"]
            prompt = V17.prompt_for(source, source, source["promptVariant"])
            replay_seed = successful_seed(source)
            mx.random.seed(replay_seed)
            results = list(model.generate(
                prompt,
                ref_audio=loaded_references[accent],
                ref_text=references[accent]["referenceText"],
                temperature=source["temperature"],
                lang_code="English",
                max_tokens=420,
                top_k=30,
                top_p=0.9,
                repetition_penalty=1.4,
                stream=False,
                verbose=False,
            ))
            if len(results) != 1:
                raise RuntimeError(f"Unexpected Qwen V20 result count: {len(results)}")

            raw = np.asarray(results[0].audio, dtype=np.float32).reshape(-1)
            sample_rate = int(results[0].sample_rate)
            filename = f"{source['entryId']}--{accent}--{source['candidateLabel'].lower()}--full-source.wav"
            scratch_path = OUTPUT_ROOT / filename
            public_path = PUBLIC_ROOT / filename
            audio_write(scratch_path, raw, sample_rate, format="wav")
            public_path.write_bytes(scratch_path.read_bytes())

            protected, replay_isolation = REPAIR.extract_cue_protected_target(raw, sample_rate)
            replay_wav = temporary_root / filename.replace("--full-source.wav", "--replayed-candidate.wav")
            replay_mp3 = temporary_root / filename.replace("--full-source.wav", "--replayed-candidate.mp3")
            audio_write(replay_wav, protected, sample_rate, format="wav")
            REPAIR.encode_mp3(replay_wav, replay_mp3)
            replay_hash = V12.sha256_file(replay_mp3)
            exact_match = replay_hash == source["sha256"]
            if not exact_match:
                raise ValueError(
                    f"Full-source replay did not reproduce the exact V17 candidate: "
                    f"{source['entryId']} {accent} {source['candidateLabel']}"
                )

            entries.append({
                "entryId": source["entryId"],
                "headword": source["headword"],
                "audioText": source["audioText"],
                "accent": accent,
                "candidateLabel": source["candidateLabel"],
                "verifiedIpa": source["verifiedIpa"],
                "ownerIssue": source["ownerIssue"],
                "ownerSourceJudgment": next(
                    entry["note"] for entry in rejected
                    if entry["entryId"] == source["entryId"] and entry["accent"] == accent
                ),
                "voiceReference": source["voiceReference"],
                "referenceSha256": source["referenceSha256"],
                "generationSeed": replay_seed,
                "generationAttempt": source["generationAttempt"],
                "promptVariant": source["promptVariant"],
                "temperature": source["temperature"],
                "prompt": prompt,
                "sourceCandidatePublicPath": source["publicPath"],
                "sourceCandidateSha256": source["sha256"],
                "replayedCandidateSha256": replay_hash,
                "exactCandidateHashMatch": exact_match,
                "rawPath": filename,
                "rawPublicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-exact-crop-v20/{filename}",
                "rawSha256": V12.sha256_file(scratch_path),
                "rawBytes": scratch_path.stat().st_size,
                "sampleRate": sample_rate,
                "channels": 1,
                "rawDurationSeconds": round(raw.size / sample_rate, 6),
                "rawPeak": round(float(np.max(np.abs(raw))), 6),
                "rawRms": round(float(np.sqrt(np.mean(np.square(raw)))), 6),
                "initialStartSeconds": replay_isolation["targetStartSeconds"],
                "initialEndSeconds": replay_isolation["targetEndSeconds"],
                "replayIsolation": replay_isolation,
                "googlePublicPath": (
                    f"/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/"
                    f"{accent}/{source['entryId']}.mp3"
                ),
            })
            print(
                f"exact V17 replay: {source['headword']} {accent} {source['candidateLabel']} "
                f"({raw.size / sample_rate:.2f}s)",
                flush=True,
            )
            mx.clear_cache()

    payload = {
        "schemaVersion": SCHEMA,
        "status": "private_local_full_sources_ready_for_owner_crop_calibration",
        "formalAssetsChanged": False,
        "distribution": "local_private_evaluation_only",
        "plannedCases": 2,
        "strategy": "deterministically replay the exact successful V17 generation and expose the complete raw waveform for Owner-selected crop boundaries",
        "v17Manifest": str(V17_MANIFEST_PATH.relative_to(ROOT)),
        "v19OwnerQa": str(V19_QA_PATH.relative_to(ROOT)),
        "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
        "entries": entries,
        "failures": [],
    }
    write_manifest(payload)
    print(json.dumps({"manifest": str(MANIFEST_PATH), "fullSources": len(entries), "exactMatches": 2}, ensure_ascii=False))


if __name__ == "__main__":
    main()
