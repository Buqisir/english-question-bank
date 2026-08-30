#!/usr/bin/env python3

"""Export the exact Owner-selected V20 AD crop as a private local candidate."""

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
SOURCE_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-exact-crop-v20"
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-owner-crop-v20"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-owner-crop-v20"
SOURCE_MANIFEST_PATH = SOURCE_ROOT / "manifest.json"
OWNER_QA_PATH = SOURCE_ROOT / "owner-qa-summary-v20.json"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-owner-crop-v20"


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V18 = load_module("eqb_google_voice_qwen_v18_owner_crop", "scripts/vocabulary/generate-google-voice-qwen-bare-word-v18.py")
V12 = V18.V12
REPAIR = V18.REPAIR


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    source_manifest = read_json(SOURCE_MANIFEST_PATH)
    owner_qa = read_json(OWNER_QA_PATH)
    ready = [entry for entry in owner_qa["entries"] if entry["verdict"] == "ready"]
    missing = [entry for entry in owner_qa["entries"] if entry["verdict"] == "missing"]
    if len(ready) != 1 or len(missing) != 1:
        raise ValueError("V20 must contain exactly one Owner-selected crop and one missing-source verdict")
    selection = ready[0]
    source = next(
        entry for entry in source_manifest["entries"]
        if entry["entryId"] == selection["entryId"] and entry["accent"] == selection["accent"]
    )
    source_path = SOURCE_ROOT / source["rawPath"]
    if V12.sha256_file(source_path) != source["rawSha256"]:
        raise ValueError("V20 full-source hash mismatch before Owner crop export")

    raw, sample_rate = audio_read(source_path, dtype="float32", sample_rate=24000, nchannels=1)
    samples = np.asarray(raw, dtype=np.float32).reshape(-1)
    start = round(selection["startSeconds"] * sample_rate)
    end = round(selection["endSeconds"] * sample_rate)
    if start < 0 or end <= start or end > samples.size:
        raise ValueError("Owner-selected crop coordinates are outside the exact full source")
    selected = samples[start:end]
    selected_signal = V12.validate_candidate_signal(selected, sample_rate)
    protected = np.pad(
        selected,
        (
            round(REPAIR.LEADING_ZERO_SECONDS * sample_rate),
            round(REPAIR.TRAILING_ZERO_SECONDS * sample_rate),
        ),
    )

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    filename = f"{selection['entryId']}--{selection['accent']}--o20.mp3"
    scratch_path = OUTPUT_ROOT / filename
    public_path = PUBLIC_ROOT / filename
    with tempfile.TemporaryDirectory(prefix="eqb-google-voice-qwen-owner-crop-v20-") as temporary_directory:
        wav_path = Path(temporary_directory) / filename.replace(".mp3", ".wav")
        audio_write(wav_path, protected, sample_rate, format="wav")
        REPAIR.encode_mp3(wav_path, scratch_path)
    public_path.write_bytes(scratch_path.read_bytes())

    entry = {
        "entryId": source["entryId"],
        "headword": source["headword"],
        "audioText": source["audioText"],
        "accent": source["accent"],
        "verifiedIpa": source["verifiedIpa"],
        "candidateLabel": "O20",
        "sourceLabel": source["candidateLabel"],
        "sourceFullPublicPath": source["rawPublicPath"],
        "sourceFullSha256": source["rawSha256"],
        "ownerStartSeconds": selection["startSeconds"],
        "ownerEndSeconds": selection["endSeconds"],
        "ownerSelectedDurationSeconds": selection["durationSeconds"],
        "edgeProtection": {
            "leadingZeroSeconds": REPAIR.LEADING_ZERO_SECONDS,
            "trailingZeroSeconds": REPAIR.TRAILING_ZERO_SECONDS,
        },
        "path": filename,
        "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-owner-crop-v20/{filename}",
        "bytes": scratch_path.stat().st_size,
        "sha256": V12.sha256_file(scratch_path),
        **selected_signal,
        **REPAIR.audio_metrics(scratch_path),
        **V12.QWEN_AUDIO.probe_audio(scratch_path),
    }
    payload = {
        "schemaVersion": SCHEMA,
        "status": "private_local_owner_selected_candidate_ready",
        "formalAssetsChanged": False,
        "distribution": "local_private_evaluation_only",
        "strategy": "export the exact Owner-selected AD boundary from the deterministically reproduced V17 full source; preserve standard edge silence",
        "sourceManifest": str(SOURCE_MANIFEST_PATH.relative_to(ROOT)),
        "ownerQa": str(OWNER_QA_PATH.relative_to(ROOT)),
        "entries": [entry],
        "failures": [],
    }
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidate": entry["publicPath"], "sha256": entry["sha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
