#!/usr/bin/env python3

"""Recover two Owner-approved words by sub-cropping their contaminated V17 candidates."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
from typing import Any

import numpy as np
from mlx_audio.audio_io import read as audio_read
from mlx_audio.audio_io import write as audio_write


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-source-crop-v19"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-source-crop-v19"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
V17_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-ipa-aligned-v17/manifest.json"
V18_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-bare-word-v18/owner-qa-summary-v18.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-source-crop-v19"
CROP_SPECS = (
    {
        "entryId": "gaokao-frequency-2739-ad-a-d",
        "headword": "AD,A.D.",
        "accent": "british",
        "sourceLabel": "C17",
        "candidateLabel": "A19",
        "startSeconds": 0.52,
        "endSeconds": 1.70,
        "cropIntent": "tight-first-active-cluster",
    },
    {
        "entryId": "gaokao-frequency-2739-ad-a-d",
        "headword": "AD,A.D.",
        "accent": "british",
        "sourceLabel": "C17",
        "candidateLabel": "B19",
        "startSeconds": 0.52,
        "endSeconds": 1.90,
        "cropIntent": "first-cluster-with-conservative-tail",
    },
    {
        "entryId": "gaokao-frequency-2956-equator",
        "headword": "equator",
        "accent": "american",
        "sourceLabel": "P17",
        "candidateLabel": "A19",
        "startSeconds": 0.35,
        "endSeconds": 1.70,
        "cropIntent": "three-syllable-tight-window",
    },
    {
        "entryId": "gaokao-frequency-2956-equator",
        "headword": "equator",
        "accent": "american",
        "sourceLabel": "P17",
        "candidateLabel": "B19",
        "startSeconds": 0.35,
        "endSeconds": 1.75,
        "cropIntent": "three-syllable-window-with-conservative-tail",
    },
)


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V18 = load_module("eqb_google_voice_qwen_v18_crop", "scripts/vocabulary/generate-google-voice-qwen-bare-word-v18.py")
V12 = V18.V12
REPAIR = V18.REPAIR


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    v17_manifest = read_json(V17_MANIFEST_PATH)
    v18_qa = read_json(V18_QA_PATH)
    source_by_key = {
        (entry["entryId"], entry["accent"], entry["candidateLabel"]): entry
        for entry in v17_manifest["entries"]
    }
    qa_by_key = {
        (entry["entryId"], entry["accent"]): entry
        for entry in v18_qa["entries"]
    }
    expected_source_notes = {
        ("gaokao-frequency-2739-ad-a-d", "british"): "C17的AD是对的，可以截一下他的。",
        ("gaokao-frequency-2956-equator", "american"): "P17的重读跟单词读音都没问题，截一下它的吧。",
    }
    google_metrics = V18.build_google_reference_metrics()
    entries: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-v19-crop-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for spec in CROP_SPECS:
            source_key = (spec["entryId"], spec["accent"], spec["sourceLabel"])
            source = source_by_key.get(source_key)
            if not source:
                raise ValueError(f"Missing V17 source candidate: {source_key}")
            qa_key = (spec["entryId"], spec["accent"])
            qa_entry = qa_by_key.get(qa_key)
            if not qa_entry or qa_entry["note"] != expected_source_notes[qa_key]:
                raise ValueError(f"V19 crop is not bound to the current Owner source judgment: {qa_key}")
            source_path = ROOT / "app/public" / source["publicPath"].lstrip("/")
            source_audio, sample_rate = audio_read(
                source_path,
                dtype="float32",
                sample_rate=24000,
                nchannels=1,
            )
            samples = np.asarray(source_audio, dtype=np.float32).reshape(-1)
            start = round(spec["startSeconds"] * sample_rate)
            end = round(spec["endSeconds"] * sample_rate)
            if start < 0 or end <= start or end > samples.size:
                raise ValueError(f"Invalid crop window: {spec}")
            protected, extraction = V18.protect_whole_utterance(samples[start:end], sample_rate)
            google = google_metrics[qa_key]
            google_active = (
                google["durationSeconds"]
                - google["leadingSilenceSeconds"]
                - google["trailingSilenceSeconds"]
            )
            active_ratio = extraction["directActiveSeconds"] / google_active
            if not 0.45 <= active_ratio <= 1.80:
                raise ValueError(f"source crop active duration ratio out of range: {qa_key} {spec['candidateLabel']} {active_ratio:.3f}")
            filename = f"{spec['entryId']}--{spec['accent']}--{spec['candidateLabel'].lower()}.mp3"
            wav_path = temporary_root / filename.replace(".mp3", ".wav")
            scratch_path = OUTPUT_ROOT / filename
            public_path = PUBLIC_ROOT / filename
            audio_write(wav_path, protected, sample_rate, format="wav")
            REPAIR.encode_mp3(wav_path, scratch_path)
            public_path.write_bytes(scratch_path.read_bytes())
            signal = V12.validate_candidate_signal(protected, sample_rate)
            edge_metrics = REPAIR.audio_metrics(scratch_path)
            probe_metrics = V12.QWEN_AUDIO.probe_audio(scratch_path)
            entries.append({
                **source,
                **spec,
                "sourceMode": "owner-approved-v17-subcrop",
                "sourcePublicPath": source["publicPath"],
                "sourceSha256": source["sha256"],
                "sourceActiveDurationSeconds": source["activeDurationSeconds"],
                "ownerSourceJudgment": qa_entry["note"],
                "activeToGoogleRatio": round(active_ratio, 6),
                "path": filename,
                "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-source-crop-v19/{filename}",
                "bytes": scratch_path.stat().st_size,
                "sha256": V12.sha256_file(scratch_path),
                **extraction,
                **signal,
                **edge_metrics,
                **probe_metrics,
            })
    payload = {
        "schemaVersion": SCHEMA,
        "status": "private_local_candidates_pending_owner_qa",
        "formalAssetsChanged": False,
        "distribution": "local_private_evaluation_only",
        "plannedCases": 2,
        "plannedCandidates": 4,
        "strategy": "recover only the Owner-approved word occurrence from the contaminated V17 candidate; no new TTS generation",
        "v18OwnerQa": str(V18_QA_PATH.relative_to(ROOT)),
        "edgeProtection": {
            "activeSafetySeconds": REPAIR.TARGET_ACTIVE_SAFETY_SECONDS,
            "leadingZeroSeconds": REPAIR.LEADING_ZERO_SECONDS,
            "trailingZeroSeconds": REPAIR.TRAILING_ZERO_SECONDS,
        },
        "entries": entries,
        "failures": [],
    }
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
