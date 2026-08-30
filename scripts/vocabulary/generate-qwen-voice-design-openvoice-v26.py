#!/usr/bin/env python3

"""Generate three private pronunciation-first repairs, then restore the Google voice color."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from typing import Any

import librosa
import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model


ROOT = Path(__file__).resolve().parents[2]
VOICE_DESIGN_MODEL_DEFAULT = Path("/Users/huangxuewei/.cache/eqbank/models/qwen3-tts-voice-design-6bit")
OPENVOICE_MODEL_DEFAULT = Path("/Users/huangxuewei/.cache/eqbank/models/openvoice-v2/converter")
OPENVOICE_RUNTIME_DEFAULT = ROOT / ".scratch/openvoice-runtime"
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-openvoice-v26"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-openvoice-v26"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
V21_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json"
V24_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-natural-cadence-v24/manifest.json"
V25_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-stress-center-v25/owner-qa-summary-v25.json"
SCHEMA = "gaokao-frequency-qwen-voice-design-openvoice-v26"
SAMPLE_RATE = 24000

CASES = {
    "gaokao-frequency-2396-ballet": {
        "headword": "ballet",
        "verifiedIpa": "/bælˈeɪ/",
        "stressCue": "the final syllable LAY",
        "contrastCue": "Keep BAL weaker; LAY must be the clear stressed syllable.",
    },
    "gaokao-frequency-1887-hello": {
        "headword": "hello",
        "verifiedIpa": "/heˈloʊ/",
        "stressCue": "the final syllable LOW",
        "contrastCue": "Keep HEL weaker; LOW must be the clear stressed syllable.",
    },
    "gaokao-frequency-2081-violin": {
        "headword": "violin",
        "verifiedIpa": "/ˌvaɪ.əˈlɪn/",
        "stressCue": "the final syllable LIN",
        "contrastCue": "Keep VIE and the middle schwa weaker; LIN must carry the strongest stress and end with /ɪn/.",
    },
}

CANDIDATES = {
    "A26": {
        "seed": 26000,
        "temperature": 0.25,
        "topK": 24,
        "topP": 0.88,
        "anchorLabel": "A21",
        "instructionStyle": "phonetic",
    },
    "B26": {
        "seed": 36000,
        "temperature": 0.32,
        "topK": 32,
        "topP": 0.92,
        "anchorLabel": "B21",
        "instructionStyle": "contrastive",
    },
}

MIN_RAW_ACTIVE_RATIO = 0.72
MAX_RAW_ACTIVE_RATIO = 1.45
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


V24 = load_module("eqb_google_voice_qwen_v24_for_v26", "scripts/vocabulary/generate-google-voice-qwen-natural-cadence-v24.py")
V21 = V24.V21
V12 = V24.V12
REPAIR = V24.REPAIR


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice-design-model", type=Path, default=VOICE_DESIGN_MODEL_DEFAULT)
    parser.add_argument("--openvoice-model", type=Path, default=OPENVOICE_MODEL_DEFAULT)
    parser.add_argument("--openvoice-runtime", type=Path, default=OPENVOICE_RUNTIME_DEFAULT)
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_manifest(payload: dict[str, Any]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    partial = MANIFEST_PATH.with_suffix(".json.partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(MANIFEST_PATH)


def active_bounds(samples: np.ndarray, sample_rate: int) -> tuple[int, int]:
    values = np.asarray(samples, dtype=np.float32).reshape(-1)
    window = max(1, round(sample_rate * REPAIR.TARGET_EDGE_FRAME_SECONDS))
    padding = (-values.size) % window
    frames = np.pad(values, (0, padding)).reshape(-1, window)
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=1))
    active = np.flatnonzero(frame_rms >= REPAIR.TARGET_EDGE_THRESHOLD)
    if active.size == 0:
        raise ValueError("V26 candidate is silent")
    return active[0] * window, min(values.size, (active[-1] + 1) * window)


def align_google_envelope(samples: np.ndarray, sample_rate: int, google: dict[str, Any]) -> tuple[np.ndarray, dict[str, Any]]:
    values = np.asarray(samples, dtype=np.float32).reshape(-1)
    start, end = active_bounds(values, sample_rate)
    active = values[start:end]
    source_seconds = active.size / sample_rate
    target_seconds = google["durationSeconds"] - google["leadingSilenceSeconds"] - google["trailingSilenceSeconds"]
    ratio = source_seconds / target_seconds
    if not MIN_RAW_ACTIVE_RATIO <= ratio <= MAX_RAW_ACTIVE_RATIO:
        raise ValueError(f"V26 raw active duration ratio out of range: {ratio:.3f}")
    if active.size != round(target_seconds * sample_rate):
        active = librosa.effects.time_stretch(active, rate=ratio)
    target_size = round(target_seconds * sample_rate)
    if active.size < target_size:
        active = np.pad(active, (0, target_size - active.size))
    elif active.size > target_size:
        active = active[:target_size]
    leading = round(max(0.0, google["leadingSilenceSeconds"] - MP3_HEAD_DELAY_SECONDS) * sample_rate)
    trailing = round(max(0.0, google["trailingSilenceSeconds"] - MP3_TAIL_DELAY_SECONDS) * sample_rate)
    aligned = np.pad(active, (leading, trailing))
    if not np.all(np.isfinite(aligned)):
        raise ValueError("V26 aligned candidate contains non-finite samples")
    peak = float(np.max(np.abs(aligned))) if aligned.size else 0.0
    peak_scale = 1.0
    if peak > 0.96:
        peak_scale = 0.96 / peak
        aligned *= peak_scale
    return aligned.astype(np.float32), {
        "rawConvertedActiveSeconds": round(source_seconds, 6),
        "googleTargetActiveSeconds": round(target_seconds, 6),
        "timeStretchRate": round(ratio, 6),
        "peakScale": round(peak_scale, 6),
        "alignmentStrategy": "active-only-duration-match-plus-google-silence-envelope",
    }


def instruction_for(case: dict[str, str], style: str) -> str:
    voice = "A clear young adult American female dictionary voice, calm, natural, medium pitch, and moderate pace."
    if style == "phonetic":
        return (
            f"{voice} Say exactly one isolated English word and nothing else. "
            f"Pronounce it as {case['verifiedIpa']}. Put unmistakable primary stress on {case['stressCue']}. "
            "Use clean dictionary-word intonation and stop immediately after the word."
        )
    return (
        f"{voice} Read one isolated dictionary headword. {case['contrastCue']} "
        "Make the stressed syllable naturally longer and stronger, without sounding theatrical. Add no other words."
    )


def validate_voice_design_model(model_path: Path) -> dict[str, str]:
    config_path = model_path / "config.json"
    model_file = model_path / "model.safetensors"
    tokenizer_file = model_path / "speech_tokenizer/model.safetensors"
    for required in (config_path, model_file, tokenizer_file):
        if not required.exists():
            raise FileNotFoundError(required)
    config = read_json(config_path)
    if config.get("model_type") != "qwen3_tts" or config.get("tts_model_type") != "voice_design":
        raise ValueError("V26 requires the Qwen3-TTS VoiceDesign family")
    quantization = config.get("quantization") or config.get("quantization_config") or {}
    if quantization.get("bits") != 6:
        raise ValueError("V26 requires the reviewed 6-bit VoiceDesign profile")
    return {
        "modelSha256": V12.sha256_file(model_file),
        "speechTokenizerSha256": V12.sha256_file(tokenizer_file),
    }


def main() -> None:
    args = parse_args()
    v21 = read_json(V21_MANIFEST_PATH)
    v24 = read_json(V24_MANIFEST_PATH)
    v25_qa = read_json(V25_QA_PATH)
    if v25_qa.get("counts") != {"total": 3, "usable": 0, "failed": 3}:
        raise ValueError("V26 requires the complete three-word V25 Owner rejection")
    if {entry["entryId"] for entry in v25_qa["entries"]} != set(CASES):
        raise ValueError("V26 must cover the exact three V25 failures")
    if v21.get("schemaVersion") != V21.SCHEMA:
        raise ValueError("V26 requires the V21 same-voice Google anchor manifest")

    args.openvoice_runtime = args.openvoice_runtime.resolve()
    if not (args.openvoice_runtime / "openvoice/api.py").exists():
        raise FileNotFoundError(f"OpenVoice runtime is missing: {args.openvoice_runtime}")
    sys.path.insert(0, str(args.openvoice_runtime))
    from openvoice.api import ToneColorConverter

    model_receipt = validate_voice_design_model(args.voice_design_model)
    for required in (args.openvoice_model / "config.json", args.openvoice_model / "checkpoint.pth"):
        if not required.exists():
            raise FileNotFoundError(required)

    base_by_id: dict[str, dict[str, Any]] = {}
    for entry in v24["entries"]:
        if entry["entryId"] in CASES:
            base_by_id.setdefault(entry["entryId"], entry)
    if set(base_by_id) != set(CASES):
        raise ValueError("V26 is missing V24 base metadata")
    v21_entry_by_key = {(entry["entryId"], entry["candidateLabel"]): entry for entry in v21["entries"]}
    google_metrics = V21.build_google_metrics()

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    source_root = OUTPUT_ROOT / "voice-design-sources"
    source_root.mkdir(parents=True, exist_ok=True)
    converted_root = OUTPUT_ROOT / "openvoice-wav"
    converted_root.mkdir(parents=True, exist_ok=True)

    print("Loading Qwen VoiceDesign for six V26 pronunciation-first sources", flush=True)
    qwen = load_model(model_path=str(args.voice_design_model))
    print("Loading OpenVoice V2 tone-color converter on CPU", flush=True)
    converter = ToneColorConverter(str(args.openvoice_model / "config.json"), device="cpu", enable_watermark=False)
    converter.load_ckpt(str(args.openvoice_model / "checkpoint.pth"))

    target_embeddings: dict[tuple[str, str], Any] = {}
    target_receipts: dict[str, Any] = {}
    for entry_id in CASES:
        for label, candidate in CANDIDATES.items():
            anchor_entry = v21_entry_by_key[(entry_id, candidate["anchorLabel"])]
            receipt = v21["references"][anchor_entry["referenceId"]]
            reference_path = ROOT / receipt["path"]
            if V12.sha256_file(reference_path) != receipt["sha256"]:
                raise ValueError(f"V26 Google anchor hash mismatch: {reference_path}")
            target_embeddings[(entry_id, label)] = converter.extract_se([str(reference_path)])
            target_receipts[f"{entry_id}:{label}"] = {
                "path": receipt["path"],
                "sha256": receipt["sha256"],
                "referenceText": receipt["referenceText"],
                "voice": receipt["voice"],
            }

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 3,
            "plannedCandidates": 6,
            "strategy": "Qwen VoiceDesign controls the exact pronunciation and lexical stress; OpenVoice V2 transfers only the tone color from same-voice, unflagged Google anchors; active duration and silence then match the original 3000-word clip",
            "v25OwnerQa": str(V25_QA_PATH.relative_to(ROOT)),
            "preservedUsable": [
                {"entryId": "gaokao-frequency-2956-equator", "accent": "american", "candidateLabel": "A21"},
                {"entryId": "gaokao-frequency-2952-domain", "accent": "american", "candidateLabel": "C22"},
                {"entryId": "gaokao-frequency-2823-dolphin", "accent": "american", "candidateLabel": "A24"},
            ],
            "candidateConfigs": CANDIDATES,
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-6bit", **model_receipt},
            "openVoice": {
                "modelPath": str(args.openvoice_model),
                "checkpointSha256": V12.sha256_file(args.openvoice_model / "checkpoint.pth"),
                "device": "cpu",
                "watermark": False,
            },
            "googleToneColorReferences": target_receipts,
            "entries": entries,
            "failures": failures,
        }

    write_manifest(payload("generation_in_progress"))
    seed_offsets = (0, 1, 2, 100, 101, 102)
    with tempfile.TemporaryDirectory(prefix="eqb-qwen-openvoice-v26-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for case_index, entry_id in enumerate((
            "gaokao-frequency-2081-violin",
            "gaokao-frequency-1887-hello",
            "gaokao-frequency-2396-ballet",
        )):
            case = CASES[entry_id]
            base = base_by_id[entry_id]
            google = google_metrics[(entry_id, "american")]
            for label, candidate in CANDIDATES.items():
                instruction = instruction_for(case, candidate["instructionStyle"])
                last_error: Exception | None = None
                for generation_attempt, seed_offset in enumerate(seed_offsets):
                    generation_seed = candidate["seed"] + case_index * 47 + seed_offset
                    mx.random.seed(generation_seed)
                    results = list(qwen.generate(
                        text=f"{case['headword']}.",
                        instruct=instruction,
                        temperature=candidate["temperature"],
                        lang_code="English",
                        max_tokens=180,
                        top_k=candidate["topK"],
                        top_p=candidate["topP"],
                        repetition_penalty=1.4,
                        stream=False,
                        verbose=False,
                    ))
                    if len(results) != 1:
                        last_error = RuntimeError(f"Unexpected Qwen V26 result count: {len(results)}")
                        continue
                    try:
                        source_filename = f"{entry_id}--{label.lower()}--source.wav"
                        source_path = source_root / source_filename
                        audio_write(source_path, results[0].audio, results[0].sample_rate, format="wav")
                        source_embedding = converter.extract_se([str(source_path)])
                        converted_path = converted_root / f"{entry_id}--{label.lower()}--converted.wav"
                        converter.convert(
                            audio_src_path=str(source_path),
                            src_se=source_embedding,
                            tgt_se=target_embeddings[(entry_id, label)],
                            output_path=str(converted_path),
                            message="",
                        )
                        converted, _ = librosa.load(converted_path, sr=SAMPLE_RATE, mono=True)
                        aligned, alignment = align_google_envelope(converted, SAMPLE_RATE, google)
                        signal = V12.validate_candidate_signal(aligned, SAMPLE_RATE)
                        filename = f"{entry_id}--american--{label.lower()}.mp3"
                        wav_path = temporary_root / filename.replace(".mp3", ".wav")
                        scratch_path = OUTPUT_ROOT / filename
                        public_path = PUBLIC_ROOT / filename
                        sf.write(wav_path, aligned, SAMPLE_RATE, subtype="PCM_16")
                        REPAIR.encode_mp3(wav_path, scratch_path)
                        metrics = V24.measure_google_envelope(scratch_path)
                        if abs(metrics["durationSeconds"] - google["durationSeconds"]) > 0.15:
                            raise ValueError("V26 total duration drift")
                        public_path.write_bytes(scratch_path.read_bytes())
                        entries.append({
                            **base,
                            **case,
                            "candidateLabel": label,
                            "generationSeed": generation_seed,
                            "generationAttempt": generation_attempt,
                            "generationPrompt": case["headword"],
                            "voiceDesignInstruction": instruction,
                            "generationStrategy": "pronunciation-first-qwen-voice-design-then-google-tone-color-transfer",
                            "sourcePath": str(source_path.relative_to(ROOT)),
                            "sourceSha256": V12.sha256_file(source_path),
                            "convertedWavPath": str(converted_path.relative_to(ROOT)),
                            "path": filename,
                            "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-openvoice-v26/{filename}",
                            "bytes": scratch_path.stat().st_size,
                            "sha256": V12.sha256_file(scratch_path),
                            **alignment,
                            **signal,
                            **metrics,
                            "codec": "mp3",
                            "sampleRate": SAMPLE_RATE,
                            "channels": 1,
                        })
                        last_error = None
                        break
                    except (RuntimeError, ValueError) as error:
                        last_error = error
                if last_error is not None:
                    failures.append({
                        "entryId": entry_id,
                        "headword": case["headword"],
                        "candidateLabel": label,
                        "error": str(last_error),
                    })
                    result = "failed"
                else:
                    result = "generated"
                write_manifest(payload("generation_in_progress"))
                print(f"{len(entries) + len(failures)}/6 {result}: {case['headword']} {label}", flush=True)
                mx.clear_cache()

    status = "private_local_candidates_pending_owner_qa" if not failures else "private_local_candidates_with_generation_failures"
    write_manifest(payload(status))
    print(json.dumps({"manifest": str(MANIFEST_PATH), "candidates": len(entries), "failures": len(failures)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
    # MLX and PyTorch can collide during mixed-runtime interpreter teardown on
    # Apple Silicon after all outputs have been durably written. Skip only that
    # native-extension teardown; exceptions still exit normally before here.
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
