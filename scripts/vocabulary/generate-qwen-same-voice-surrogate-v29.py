#!/usr/bin/env python3

"""Generate same-voice surrogate teachers, then distill them into ballet and violin."""

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
OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-same-voice-surrogate-v29"
PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-same-voice-surrogate-v29"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
V21_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json"
V24_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-natural-cadence-v24/manifest.json"
V27_MANIFEST_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-teacher-first-hello-v27/manifest.json"
V27_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-teacher-first-hello-v27/owner-qa-summary-v27.json"
V28_QA_PATH = ROOT / ".scratch/gaokao-google-voice-qwen-teacher-first-remaining-v28/owner-qa-summary-v28.json"
SCHEMA = "gaokao-frequency-google-voice-qwen-same-voice-surrogate-v29"

CASES = {
    "gaokao-frequency-2396-ballet": {
        "headword": "ballet",
        "target": "读作 /bælˈeɪ/，重读 LAY；音色接近 hello A27",
        "A29": {"surrogateText": "balain.", "surrogateKind": "owner-proposed-similar-word"},
        "B29": {"surrogateText": "balay.", "surrogateKind": "open-final-similar-word"},
    },
    "gaokao-frequency-2081-violin": {
        "headword": "violin",
        "target": "重音在 LIN，末元音是 /ɪ/；音色接近 hello A27",
        "A29": {"surrogateText": "She plays the violin beautifully.", "surrogateKind": "natural-carrier-sentence"},
        "B29": {"surrogateText": "The young violinist performed.", "surrogateKind": "stressed-derived-word"},
    },
}
CANDIDATES = {
    "A29": {"seed": 29000, "temperature": 0.18, "topK": 18, "topP": 0.84},
    "B29": {"seed": 39000, "temperature": 0.24, "topK": 24, "topP": 0.88},
}
MIN_ACTIVE_RATIO = 0.82
MAX_ACTIVE_RATIO = 1.18
BALLET_MIN_ACTIVE_RATIO = 0.74
BALLET_MAX_TOTAL_DURATION_DRIFT = 0.25
GOOGLE_ANCHOR_SECONDS = 5.8


def load_module(name: str, relative_path: str) -> Any:
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load helper module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V24 = load_module("eqb_google_voice_qwen_v24_for_v29", "scripts/vocabulary/generate-google-voice-qwen-natural-cadence-v24.py")
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


def google_anchor_chunks(v21: dict[str, Any], entry_id: str) -> tuple[list[np.ndarray], list[str], float, dict[str, Any]]:
    v21_entry = next(
        entry for entry in v21["entries"]
        if entry["entryId"] == entry_id and entry["candidateLabel"] == "A21"
    )
    receipt = v21["references"][v21_entry["referenceId"]]
    chunks = []
    words = []
    seconds = 0.0
    for anchor in receipt["entries"]:
        source_path = ROOT / anchor["path"]
        if V12.sha256_file(source_path) != anchor["sha256"]:
            raise ValueError(f"V29 Google anchor hash mismatch: {source_path}")
        samples, sample_rate = audio_read(source_path, dtype="float32", sample_rate=24000, nchannels=1)
        if sample_rate != 24000:
            raise ValueError("V29 Google anchor sample-rate mismatch")
        chunk = np.asarray(samples, dtype=np.float32).reshape(-1)
        chunks.append(chunk)
        words.append(anchor["headword"])
        seconds += chunk.size / sample_rate
        if seconds >= GOOGLE_ANCHOR_SECONDS:
            break
    if seconds < GOOGLE_ANCHOR_SECONDS:
        raise ValueError("V29 did not collect enough Google anchors")
    return chunks, words, seconds, receipt


def main() -> None:
    args = parse_args()
    v21 = read_json(V21_MANIFEST_PATH)
    v24 = read_json(V24_MANIFEST_PATH)
    v27 = read_json(V27_MANIFEST_PATH)
    v27_qa = read_json(V27_QA_PATH)
    v28_qa = read_json(V28_QA_PATH)
    if v27_qa.get("counts") != {"total": 1, "a27Usable": 1, "failed": 0}:
        raise ValueError("V29 requires hello A27 approval")
    if v28_qa.get("counts") != {"total": 2, "usable": 0, "failed": 2}:
        raise ValueError("V29 requires the complete V28 rejection")
    if v21.get("schemaVersion") != V21.SCHEMA:
        raise ValueError("V29 requires V21 Google anchors")
    hello_a27 = next(
        entry for entry in v27["entries"]
        if entry["entryId"] == "gaokao-frequency-1887-hello" and entry["candidateLabel"] == "A27"
    )
    hello_path = ROOT / "app/public" / hello_a27["publicPath"].lstrip("/")
    if V12.sha256_file(hello_path) != hello_a27["sha256"]:
        raise ValueError("V29 hello A27 hash mismatch")
    hello_samples, hello_rate = audio_read(hello_path, dtype="float32", sample_rate=24000, nchannels=1)
    if hello_rate != 24000:
        raise ValueError("V29 hello A27 sample-rate mismatch")
    hello_chunk = np.asarray(hello_samples, dtype=np.float32).reshape(-1)

    base_by_id: dict[str, dict[str, Any]] = {}
    for entry in v24["entries"]:
        if entry["entryId"] in CASES:
            base_by_id.setdefault(entry["entryId"], entry)
    if set(base_by_id) != set(CASES):
        raise ValueError("V29 is missing base metadata")
    google_metrics = V21.build_google_metrics()
    model_receipt = V12.validate_model(args.model)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    pure_reference_root = OUTPUT_ROOT / "pure-voice-references"
    surrogate_root = OUTPUT_ROOT / "same-voice-surrogates"
    final_reference_root = OUTPUT_ROOT / "surrogate-teacher-references"
    for directory in (pure_reference_root, surrogate_root, final_reference_root):
        directory.mkdir(parents=True, exist_ok=True)

    pure_references: dict[str, dict[str, Any]] = {}
    anchor_data: dict[str, tuple[list[np.ndarray], list[str], float, dict[str, Any]]] = {}
    for entry_id in CASES:
        chunks, words, seconds, receipt = google_anchor_chunks(v21, entry_id)
        anchor_data[entry_id] = (chunks, words, seconds, receipt)
        joined = np.concatenate([hello_chunk, *chunks])
        output_path = pure_reference_root / f"{entry_id}--google-pure.wav"
        audio_write(output_path, joined, 24000, format="wav")
        pure_references[entry_id] = {
            "path": str(output_path.relative_to(ROOT)),
            "sha256": V12.sha256_file(output_path),
            "referenceText": ". ".join(["hello", *words]) + ".",
            "helloA27Path": hello_a27["publicPath"],
            "helloA27Sha256": hello_a27["sha256"],
            "googleWords": words,
            "googleSeconds": round(seconds, 6),
            "voice": receipt["voice"],
        }

    entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    surrogate_receipts: dict[str, dict[str, Any]] = {}
    final_references: dict[str, dict[str, Any]] = {}

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedCases": 2,
            "plannedCandidates": 4,
            "strategy": "Qwen Base first creates an easier surrogate or natural carrier with only the approved hello A27 plus original Google anchors as its voice reference; that same-voice result becomes a pronunciation teacher for a second Qwen Base pass that emits the canonical isolated word; no VoiceDesign, voice conversion, time stretching, or stress gain processing",
            "v27OwnerQa": str(V27_QA_PATH.relative_to(ROOT)),
            "v28OwnerQa": str(V28_QA_PATH.relative_to(ROOT)),
            "preservedUsable": [
                {"entryId": "gaokao-frequency-2956-equator", "accent": "american", "candidateLabel": "A21"},
                {"entryId": "gaokao-frequency-2952-domain", "accent": "american", "candidateLabel": "C22"},
                {"entryId": "gaokao-frequency-2823-dolphin", "accent": "american", "candidateLabel": "A24"},
                {"entryId": "gaokao-frequency-1887-hello", "accent": "american", "candidateLabel": "A27"},
            ],
            "candidateConfigs": CANDIDATES,
            "model": {"name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit", **model_receipt},
            "pureVoiceReferences": pure_references,
            "surrogates": surrogate_receipts,
            "finalReferences": final_references,
            "entries": entries,
            "failures": failures,
        }

    write_manifest(payload("generation_in_progress"))
    print("Loading Qwen Base for four surrogate teachers and four final V29 candidates", flush=True)
    model = load_model(model_path=str(args.model))
    loaded_pure_references = {
        entry_id: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for entry_id, receipt in pure_references.items()
    }
    seed_offsets = (0, 1, 2, 100, 101, 102, 200, 201)
    with tempfile.TemporaryDirectory(prefix="eqb-qwen-surrogate-v29-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for case_index, entry_id in enumerate(("gaokao-frequency-2081-violin", "gaokao-frequency-2396-ballet")):
            case = CASES[entry_id]
            base = base_by_id[entry_id]
            google = google_metrics[(entry_id, "american")]
            google_active = google["durationSeconds"] - google["leadingSilenceSeconds"] - google["trailingSilenceSeconds"]
            google_chunks, google_words, google_seconds, anchor_receipt = anchor_data[entry_id]
            for label, config in CANDIDATES.items():
                variant = case[label]
                surrogate_key = f"{entry_id}:{label}"
                surrogate_seed = config["seed"] + case_index * 47
                mx.random.seed(surrogate_seed)
                surrogate_results = list(model.generate(
                    text=variant["surrogateText"],
                    ref_audio=loaded_pure_references[entry_id],
                    ref_text=pure_references[entry_id]["referenceText"],
                    temperature=config["temperature"],
                    lang_code="English",
                    max_tokens=260,
                    top_k=config["topK"],
                    top_p=config["topP"],
                    repetition_penalty=1.5,
                    stream=False,
                    verbose=False,
                ))
                if len(surrogate_results) != 1:
                    failures.append({"entryId": entry_id, "headword": case["headword"], "candidateLabel": label, "error": "unexpected surrogate result count"})
                    write_manifest(payload("generation_in_progress"))
                    continue
                surrogate_path = surrogate_root / f"{entry_id}--{label.lower()}--surrogate.wav"
                audio_write(surrogate_path, surrogate_results[0].audio, surrogate_results[0].sample_rate, format="wav")
                surrogate_signal = V12.validate_candidate_signal(surrogate_results[0].audio, surrogate_results[0].sample_rate)
                surrogate_receipts[surrogate_key] = {
                    "path": str(surrogate_path.relative_to(ROOT)),
                    "sha256": V12.sha256_file(surrogate_path),
                    "text": variant["surrogateText"],
                    "kind": variant["surrogateKind"],
                    "seed": surrogate_seed,
                    **surrogate_signal,
                }

                surrogate_samples, surrogate_rate = audio_read(surrogate_path, dtype="float32", sample_rate=24000, nchannels=1)
                if surrogate_rate != 24000:
                    raise ValueError("V29 surrogate sample-rate mismatch")
                surrogate_chunk = np.asarray(surrogate_samples, dtype=np.float32).reshape(-1)
                joined = np.concatenate([surrogate_chunk, *google_chunks])
                reference_path = final_reference_root / f"{entry_id}--{label.lower()}--reference.wav"
                audio_write(reference_path, joined, 24000, format="wav")
                surrogate_text = variant["surrogateText"].strip().rstrip(".!?")
                reference_text = ". ".join([surrogate_text, *google_words]) + "."
                final_references[surrogate_key] = {
                    "path": str(reference_path.relative_to(ROOT)),
                    "sha256": V12.sha256_file(reference_path),
                    "referenceText": reference_text,
                    "surrogatePath": str(surrogate_path.relative_to(ROOT)),
                    "surrogateSha256": surrogate_receipts[surrogate_key]["sha256"],
                    "googleWords": google_words,
                    "googleSeconds": round(google_seconds, 6),
                    "voice": anchor_receipt["voice"],
                }
                loaded_reference = load_audio(str(reference_path), sample_rate=model.sample_rate)

                last_error: Exception | None = None
                for generation_attempt, seed_offset in enumerate(seed_offsets):
                    generation_seed = config["seed"] + 500 + case_index * 47 + seed_offset
                    mx.random.seed(generation_seed)
                    results = list(model.generate(
                        text=f"{case['headword']}.",
                        ref_audio=loaded_reference,
                        ref_text=reference_text,
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
                        last_error = RuntimeError(f"Unexpected Qwen V29 result count: {len(results)}")
                        continue
                    try:
                        protected, extraction = V24.protect_with_google_envelope(results[0].audio, results[0].sample_rate, google)
                        active_ratio = extraction["directActiveSeconds"] / google_active
                        min_active_ratio = BALLET_MIN_ACTIVE_RATIO if entry_id == "gaokao-frequency-2396-ballet" else MIN_ACTIVE_RATIO
                        if not min_active_ratio <= active_ratio <= MAX_ACTIVE_RATIO:
                            raise ValueError(f"V29 active duration ratio out of range: {active_ratio:.3f}")
                        signal = V12.validate_candidate_signal(protected, results[0].sample_rate)
                        filename = f"{entry_id}--american--{label.lower()}.mp3"
                        wav_path = temporary_root / filename.replace(".mp3", ".wav")
                        scratch_path = OUTPUT_ROOT / filename
                        public_path = PUBLIC_ROOT / filename
                        audio_write(wav_path, protected, results[0].sample_rate, format="wav")
                        REPAIR.encode_mp3(wav_path, scratch_path)
                        metrics = V24.measure_google_envelope(scratch_path)
                        max_total_duration_drift = BALLET_MAX_TOTAL_DURATION_DRIFT if entry_id == "gaokao-frequency-2396-ballet" else 0.15
                        if abs(metrics["durationSeconds"] - google["durationSeconds"]) > max_total_duration_drift:
                            raise ValueError("V29 total duration drift")
                        if abs(metrics["leadingSilenceSeconds"] - google["leadingSilenceSeconds"]) > 0.05:
                            raise ValueError("V29 leading envelope drift")
                        if abs(metrics["trailingSilenceSeconds"] - google["trailingSilenceSeconds"]) > 0.05:
                            raise ValueError("V29 trailing envelope drift")
                        public_path.write_bytes(scratch_path.read_bytes())
                        entries.append({
                            **base,
                            "candidateLabel": label,
                            "generationSeed": generation_seed,
                            "generationAttempt": generation_attempt,
                            "generationPrompt": f"{case['headword']}.",
                            "generationStrategy": "same-voice-surrogate-teacher-then-canonical-qwen-base",
                            "surrogateText": variant["surrogateText"],
                            "surrogateKind": variant["surrogateKind"],
                            "surrogatePath": str(surrogate_path.relative_to(ROOT)),
                            "surrogateSha256": surrogate_receipts[surrogate_key]["sha256"],
                            "referencePath": str(reference_path.relative_to(ROOT)),
                            "referenceSha256": final_references[surrogate_key]["sha256"],
                            "referenceText": reference_text,
                            "googleReferenceWords": google_words,
                            "googleReferenceSeconds": round(google_seconds, 6),
                            "activeToGoogleRatio": round(active_ratio, 6),
                            "path": filename,
                            "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-same-voice-surrogate-v29/{filename}",
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
