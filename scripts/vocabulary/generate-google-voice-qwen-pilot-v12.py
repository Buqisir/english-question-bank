#!/usr/bin/env python3

"""Build private Google-voice references and isolated Qwen repair candidates."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
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
PILOT_OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-pilot-v12"
PILOT_PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-pilot-v12"
FULL_OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-full-v13"
FULL_PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-full-v13"
CONTEXT_PILOT_OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-context-pilot-v14"
CONTEXT_PILOT_PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-context-pilot-v14"
CONTEXT_FULL_OUTPUT_ROOT = ROOT / ".scratch/gaokao-google-voice-qwen-context-full-v15"
CONTEXT_FULL_PUBLIC_ROOT = ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-context-full-v15"
PILOT_SCHEMA = "gaokao-frequency-google-voice-qwen-pilot-v12"
FULL_SCHEMA = "gaokao-frequency-google-voice-qwen-full-v13"
CONTEXT_PILOT_SCHEMA = "gaokao-frequency-google-voice-qwen-context-pilot-v14"
CONTEXT_FULL_SCHEMA = "gaokao-frequency-google-voice-qwen-context-full-v15"
GENERATION_TEXT_OVERRIDES = {
    ("gaokao-frequency-0832-a-m-am", "american"): "A M",
    ("gaokao-frequency-0832-a-m-am", "british"): "A M",
    ("gaokao-frequency-2739-ad-a-d", "british"): "A D",
}
CONTEXT_PILOT_KEYS = (
    ("gaokao-frequency-0001-the", "american"),
    ("gaokao-frequency-0001-the", "british"),
    ("gaokao-frequency-0363-enough", "american"),
    ("gaokao-frequency-0478-reduce", "american"),
    ("gaokao-frequency-0625-percent", "american"),
    ("gaokao-frequency-0877-conduct", "american"),
    ("gaokao-frequency-0877-conduct", "british"),
    ("gaokao-frequency-1372-separate", "american"),
    ("gaokao-frequency-2081-violin", "american"),
    ("gaokao-frequency-2081-violin", "british"),
    ("gaokao-frequency-2619-superb", "american"),
    ("gaokao-frequency-2619-superb", "british"),
    ("gaokao-frequency-2921-kangaroo", "american"),
    ("gaokao-frequency-2921-kangaroo", "british"),
    ("gaokao-frequency-2951-directory", "british"),
)
TARGET_CONTEXTS = {
    "gaokao-frequency-0001-the": ("Open", "book"),
    "gaokao-frequency-0363-enough": ("That is", "for today"),
    "gaokao-frequency-0478-reduce": ("We must", "waste"),
    "gaokao-frequency-0625-percent": ("Fifty", "finished"),
    "gaokao-frequency-0877-conduct": ("They will", "the study"),
    "gaokao-frequency-1372-separate": ("Keep them", "from each other"),
    "gaokao-frequency-2081-violin": ("She plays the", "beautifully"),
    "gaokao-frequency-2619-superb": ("The result was", "indeed"),
    "gaokao-frequency-2921-kangaroo": ("A wild", "jumped away"),
    "gaokao-frequency-2951-directory": ("Check the", "for the file"),
    "gaokao-frequency-0582-communication": ("Clear", "matters"),
    "gaokao-frequency-0583-describe": ("Please", "the scene"),
    "gaokao-frequency-0662-protect": ("We must", "the children"),
    "gaokao-frequency-0832-a-m-am": ("At eight", "tomorrow"),
    "gaokao-frequency-0865-respect": ("They", "each other"),
    "gaokao-frequency-0878-unique": ("We found a truly", "opportunity for everyone"),
    "gaokao-frequency-0994-reflect": ("Mirrors", "light"),
    "gaokao-frequency-1402-electricity": ("We need", "today"),
    "gaokao-frequency-1488-characteristic": ("A key", "of success"),
    "gaokao-frequency-1689-diverse": ("The city has a very", "community today"),
    "gaokao-frequency-1887-hello": ("She said", "to everyone"),
    "gaokao-frequency-1902-maintain": ("We need to", "the system carefully"),
    "gaokao-frequency-2035-suspect": ("They", "a problem"),
    "gaokao-frequency-2172-digest": ("Please", "the information"),
    "gaokao-frequency-2213-energetic": ("She is an", "student in class"),
    "gaokao-frequency-2214-alongside": ("Walk", "the river"),
    "gaokao-frequency-2396-ballet": ("She studies", "every day"),
    "gaokao-frequency-2656-erupt": ("Some volcanoes can", "without any warning"),
    "gaokao-frequency-2662-occupation": ("Her current", "is teaching English"),
    "gaokao-frequency-2684-era": ("A completely new", "began at that time"),
    "gaokao-frequency-2739-ad-a-d": ("The abbreviation", "means Anno Domini"),
    "gaokao-frequency-2741-canteen": ("The school", "is open"),
    "gaokao-frequency-2754-eighteen": ("She is now", "years old today"),
    "gaokao-frequency-2760-sixteen": ("He is nearly", "years old today"),
    "gaokao-frequency-2766-download": ("You should now", "the file below"),
    "gaokao-frequency-2814-premier": ("The national", "attended the meeting"),
    "gaokao-frequency-2823-dolphin": ("A young", "swam close beside us"),
    "gaokao-frequency-2866-downstairs": ("Go", "now"),
    "gaokao-frequency-2952-domain": ("This", "is public"),
    "gaokao-frequency-2955-entitle": ("They plan to", "the book tomorrow"),
    "gaokao-frequency-2956-equator": ("The", "crosses the ocean"),
}
REFERENCE_WORDS = (
    "people", "student", "author", "family", "paragraph", "because",
    "speaker", "problem", "human", "around", "experience",
)
ACCENTS = {
    "american": {
        "voice": "en-US-Neural2-C",
        "manifest": ROOT / "data/vocabulary/gaokao-frequency-full-american-audio-manifest-v1.json",
        "audioRoot": ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-us-c-v1",
    },
    "british": {
        "voice": "en-GB-Neural2-D",
        "manifest": ROOT / "data/vocabulary/gaokao-frequency-full-british-audio-manifest-v1.json",
        "audioRoot": ROOT / "app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-gb-d-v1",
    },
}
CASES = (
    {
        "entryId": "gaokao-frequency-0139-become",
        "headword": "become",
        "accent": "american",
        "pronunciation": "/bɪˈkʌm/",
        "stressInstruction": "Use natural American English. Keep the first syllable short, weak, and unstressed. Put clear primary stress on the second syllable. Do not add any other words.",
    },
    {
        "entryId": "gaokao-frequency-0227-research",
        "headword": "research",
        "accent": "british",
        "pronunciation": "/rɪˈsɜːtʃ/",
        "stressInstruction": "Use natural British English. Keep the first syllable short, weak, and unstressed. Put clear primary stress on the second syllable. Do not add any other words.",
    },
    {
        "entryId": "gaokao-frequency-0363-enough",
        "headword": "enough",
        "accent": "american",
        "pronunciation": "/ɪˈnʌf/",
        "stressInstruction": "Use natural American English. Keep the first syllable short, weak, and unstressed. Put clear primary stress on the second syllable. Do not add any other words.",
    },
    {
        "entryId": "gaokao-frequency-0469-hotel",
        "headword": "hotel",
        "accent": "american",
        "pronunciation": "/hoʊˈtel/",
        "stressInstruction": "Use natural American English. Keep the first syllable short and unstressed. Put clear primary stress on the second syllable. Do not add any other words.",
    },
    {
        "entryId": "gaokao-frequency-0469-hotel",
        "headword": "hotel",
        "accent": "british",
        "pronunciation": "/həʊˈtel/",
        "stressInstruction": "Use natural British English. Keep the first syllable short and unstressed. Put clear primary stress on the second syllable. Do not add any other words.",
    },
)


def load_existing_generator() -> Any:
    path = ROOT / "scripts/vocabulary/generate-qwen-audio.py"
    spec = importlib.util.spec_from_file_location("eqb_qwen_audio", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load the existing Qwen audio generator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


QWEN_AUDIO = load_existing_generator()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=MODEL_DEFAULT)
    parser.add_argument("--scope", choices=("pilot", "full", "context-pilot", "context-full"), default="pilot")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--retry-failures", action="store_true")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_model(model_path: Path) -> dict[str, str]:
    profile = read_json(ROOT / "data/vocabulary/eqb-british-teacher-v1.json")
    expected_model = profile["base"]["modelSha256"]
    expected_tokenizer = profile["base"]["speechTokenizerSha256"]
    if sha256_file(model_path / "model.safetensors") != expected_model:
        raise ValueError("Qwen Base model hash mismatch")
    if sha256_file(model_path / "speech_tokenizer/model.safetensors") != expected_tokenizer:
        raise ValueError("Qwen tokenizer hash mismatch")
    return {"modelSha256": expected_model, "speechTokenizerSha256": expected_tokenizer}


def build_references(output_root: Path) -> dict[str, dict[str, Any]]:
    repair_plan = read_json(ROOT / "data/vocabulary/gaokao-frequency-full-audio-repair-plan-v1.json")
    rejected_ids = {entry["entryId"] for entry in repair_plan["entries"]}
    references: dict[str, dict[str, Any]] = {}
    reference_root = output_root / "references"
    reference_root.mkdir(parents=True, exist_ok=True)

    for accent, config in ACCENTS.items():
        manifest = read_json(config["manifest"])
        if manifest.get("voice") != config["voice"] or len(manifest.get("entries", [])) != 3000:
            raise ValueError(f"Unexpected {accent} full-audio manifest")
        by_word = {entry["headword"]: entry for entry in manifest["entries"]}
        selected = []
        chunks = []
        sample_rate = 24000
        for word in REFERENCE_WORDS:
            entry = by_word.get(word)
            if not entry or entry["entryId"] in rejected_ids:
                raise ValueError(f"Reference word is missing or belongs to the 117 repairs: {word}")
            source_path = config["audioRoot"] / entry["path"]
            if sha256_file(source_path) != entry["sha256"]:
                raise ValueError(f"Reference source hash mismatch: {source_path}")
            samples, decoded_rate = audio_read(source_path, dtype="float32", sample_rate=sample_rate, nchannels=1)
            if decoded_rate != sample_rate:
                raise ValueError(f"Reference source sample-rate mismatch: {source_path}")
            chunks.append(np.asarray(samples, dtype=np.float32).reshape(-1))
            selected.append({
                "entryId": entry["entryId"],
                "headword": word,
                "path": str(source_path.relative_to(ROOT)),
                "sha256": entry["sha256"],
                "durationSeconds": entry["durationSeconds"],
            })
        joined = np.concatenate(chunks)
        output_path = reference_root / f"{accent}.wav"
        audio_write(output_path, joined, sample_rate, format="wav")
        reference_text = ". ".join(REFERENCE_WORDS) + "."
        duration_seconds = joined.size / sample_rate
        if not 8 <= duration_seconds <= 20:
            raise ValueError(f"Unexpected {accent} reference duration: {duration_seconds}")
        references[accent] = {
            "voice": config["voice"],
            "path": str(output_path.relative_to(ROOT)),
            "sha256": sha256_file(output_path),
            "sampleRate": sample_rate,
            "channels": 1,
            "durationSeconds": round(duration_seconds, 6),
            "referenceText": reference_text,
            "entries": selected,
        }
    return references


def build_full_cases() -> tuple[dict[str, Any], ...]:
    repair_plan = read_json(ROOT / "data/vocabulary/gaokao-frequency-full-audio-repair-plan-v1.json")
    entries = repair_plan.get("entries", [])
    if repair_plan.get("schemaVersion") != "gaokao-frequency-full-audio-repair-plan-v1" or len(entries) != 117:
        raise ValueError("Expected the reviewed 117-word audio repair plan")
    audio_entries_by_accent = {
        accent: {entry["entryId"]: entry for entry in read_json(config["manifest"])["entries"]}
        for accent, config in ACCENTS.items()
    }
    cases: list[dict[str, Any]] = []
    for entry in entries:
        repairs = entry.get("repairs", {})
        for accent in ("american", "british"):
            repair = repairs.get(accent)
            if not repair:
                continue
            audio_entry = audio_entries_by_accent[accent].get(entry["entryId"])
            if not audio_entry or audio_entry.get("headword") != entry["headword"]:
                raise ValueError(f"Repair has no matching formal audio text: {entry['entryId']} {accent}")
            ipa = repair.get("ipa")
            if not ipa:
                ipa_parts = re.findall(r'ph="([^"]+)"', repair.get("ssml", ""))
                if not ipa_parts:
                    raise ValueError(f"Repair has no reviewed IPA content: {entry['entryId']} {accent}")
                ipa = " ".join(ipa_parts)
            cases.append({
                "entryId": entry["entryId"],
                "headword": entry["headword"],
                "audioText": audio_entry["text"],
                "generationText": GENERATION_TEXT_OVERRIDES.get(
                    (entry["entryId"], accent),
                    audio_entry["text"],
                ),
                "accent": accent,
                "pronunciation": f"/{ipa}/",
                "pronunciationSource": repair["source"],
                "sourceVariants": repair.get("sourceVariants", []),
                "ownerVerdict": entry["ownerVerdict"],
            })
    if len(cases) != 158 or len({(case["entryId"], case["accent"]) for case in cases}) != 158:
        raise ValueError(f"Expected 158 unique accent repairs for 117 words, received {len(cases)}")
    return tuple(cases)


class CandidateGenerationError(RuntimeError):
    """Raised when every safe isolation strategy fails for one word/accent."""


def validate_candidate_signal(samples: np.ndarray, sample_rate: int) -> dict[str, float]:
    values = np.asarray(samples, dtype=np.float32).reshape(-1)
    duration = values.size / sample_rate
    peak = float(np.max(np.abs(values))) if values.size else 0.0
    rms = float(np.sqrt(np.mean(values ** 2))) if values.size else 0.0
    window = max(1, round(sample_rate * 0.02))
    padding = (-values.size) % window
    frames = np.pad(values, (0, padding)).reshape(-1, window)
    frame_rms = np.sqrt(np.mean(frames ** 2, axis=1))
    active_fraction = float(np.mean(frame_rms >= 0.01)) if frame_rms.size else 0.0
    if not 0.15 <= duration <= 15:
        raise ValueError(f"Candidate duration is invalid: {duration:.3f}s")
    if peak < 0.03 or rms < 0.015 or active_fraction < 0.08:
        raise ValueError(
            "Candidate is silent, near-silent, or click-only: "
            f"peak={peak:.6f}, rms={rms:.6f}, activeFraction={active_fraction:.6f}"
        )
    return {
        "rawPeak": round(peak, 6),
        "rawRms": round(rms, 6),
        "rawActiveFrameFraction": round(active_fraction, 6),
    }


def generate_candidate(
    model: Any,
    reference_audio: Any,
    reference_text: str,
    case: dict[str, str],
    seed: int,
) -> tuple[np.ndarray, int]:
    last_error: Exception | None = None
    audio_text = case.get("generationText", case.get("audioText", case["headword"]))
    for attempt, separator in enumerate(QWEN_AUDIO.REPETITION_SEPARATORS):
        mx.random.seed(seed + attempt)
        results = list(model.generate(
            QWEN_AUDIO.repeated_prompt(audio_text, separator),
            ref_audio=reference_audio,
            ref_text=reference_text,
            temperature=0.0,
            lang_code="English",
            max_tokens=300,
            top_k=1,
            top_p=1.0,
            repetition_penalty=1.5,
            stream=False,
            verbose=False,
        ))
        if len(results) != 1:
            last_error = RuntimeError(f"Unexpected Qwen result count: {len(results)}")
            continue
        try:
            samples = QWEN_AUDIO.extract_middle_occurrence(results[0].audio, results[0].sample_rate)
            validate_candidate_signal(samples, results[0].sample_rate)
            return samples, results[0].sample_rate
        except ValueError as error:
            last_error = error

    for fallback_index, tail in enumerate(QWEN_AUDIO.FALLBACK_TAILS):
        mx.random.seed(seed + 100 + fallback_index)
        results = list(model.generate(
            QWEN_AUDIO.first_occurrence_prompt(audio_text, tail),
            ref_audio=reference_audio,
            ref_text=reference_text,
            temperature=0.0,
            lang_code="English",
            max_tokens=300,
            top_k=1,
            top_p=1.0,
            repetition_penalty=1.5,
            stream=False,
            verbose=False,
        ))
        if len(results) != 1:
            last_error = RuntimeError(f"Unexpected Qwen fallback result count: {len(results)}")
            continue
        try:
            samples = QWEN_AUDIO.extract_first_occurrence(results[0].audio, results[0].sample_rate)
            validate_candidate_signal(samples, results[0].sample_rate)
            return samples, results[0].sample_rate
        except ValueError as error:
            last_error = error

    for fallback_index, (before, after) in enumerate(QWEN_AUDIO.CONTEXT_PAIRS):
        mx.random.seed(seed + 200 + fallback_index)
        results = list(model.generate(
            QWEN_AUDIO.context_middle_prompt(audio_text, before, after),
            ref_audio=reference_audio,
            ref_text=reference_text,
            temperature=0.0,
            lang_code="English",
            max_tokens=300,
            top_k=1,
            top_p=1.0,
            repetition_penalty=1.5,
            stream=False,
            verbose=False,
        ))
        if len(results) != 1:
            last_error = RuntimeError(f"Unexpected Qwen context result count: {len(results)}")
            continue
        try:
            samples = QWEN_AUDIO.extract_middle_occurrence(results[0].audio, results[0].sample_rate)
            validate_candidate_signal(samples, results[0].sample_rate)
            return samples, results[0].sample_rate
        except ValueError as error:
            last_error = error
    raise CandidateGenerationError(
        f"Could not isolate a non-silent candidate for {case['headword']} {case['accent']}: {last_error}"
    ) from last_error


def generate_context_candidate(
    model: Any,
    reference_audio: Any,
    reference_text: str,
    case: dict[str, Any],
    seed: int,
) -> tuple[np.ndarray, int, dict[str, str]]:
    audio_text = case.get("generationText", case.get("audioText", case["headword"]))
    intended_context = (case["contextBefore"], case["contextAfter"])
    context_pairs = (
        *(("target-specific-syntactic-context", *intended_context),) * 4,
        ("recorded-carrier-context", "Listen to", "once more"),
        ("recorded-carrier-context", "Here comes", "clearly"),
        ("recorded-carrier-context", "We say", "now"),
    )
    last_error: Exception | None = None
    for attempt, (context_strategy, before, after) in enumerate(context_pairs):
        mx.random.seed(seed + 4 + attempt)
        results = list(model.generate(
            QWEN_AUDIO.context_middle_prompt(audio_text, before, after),
            ref_audio=reference_audio,
            ref_text=reference_text,
            temperature=0.0,
            lang_code="English",
            max_tokens=300,
            top_k=1,
            top_p=1.0,
            repetition_penalty=1.5,
            stream=False,
            verbose=False,
        ))
        if len(results) != 1:
            last_error = RuntimeError(f"Unexpected Qwen context result count: {len(results)}")
            continue
        try:
            samples = QWEN_AUDIO.extract_middle_occurrence(results[0].audio, results[0].sample_rate)
            validate_candidate_signal(samples, results[0].sample_rate)
            return samples, results[0].sample_rate, {
                "contextBeforeUsed": before,
                "contextAfterUsed": after,
                "contextStrategyUsed": context_strategy,
            }
        except ValueError as error:
            last_error = error
    raise CandidateGenerationError(
        f"Could not isolate a non-silent context candidate for {case['headword']} {case['accent']}: {last_error}"
    ) from last_error


def write_manifest(manifest_path: Path, payload: dict[str, Any]) -> None:
    partial_path = manifest_path.with_suffix(".json.partial")
    partial_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial_path.replace(manifest_path)


def main() -> None:
    args = parse_args()
    if args.scope == "full":
        output_root = FULL_OUTPUT_ROOT
        public_root = FULL_PUBLIC_ROOT
        schema = FULL_SCHEMA
        cases = build_full_cases()
        public_directory = "google-voice-qwen-full-v13"
        base_seed = 13000
        generation_mode = "isolated-repetition"
    elif args.scope == "context-pilot":
        output_root = CONTEXT_PILOT_OUTPUT_ROOT
        public_root = CONTEXT_PILOT_PUBLIC_ROOT
        schema = CONTEXT_PILOT_SCHEMA
        full_cases_by_key = {
            (case["entryId"], case["accent"]): case
            for case in build_full_cases()
        }
        cases = tuple({
            **full_cases_by_key[key],
            "contextBefore": TARGET_CONTEXTS[key[0]][0],
            "contextAfter": TARGET_CONTEXTS[key[0]][1],
        } for key in CONTEXT_PILOT_KEYS)
        public_directory = "google-voice-qwen-context-pilot-v14"
        base_seed = 14000
        generation_mode = "target-in-syntactic-context"
    elif args.scope == "context-full":
        output_root = CONTEXT_FULL_OUTPUT_ROOT
        public_root = CONTEXT_FULL_PUBLIC_ROOT
        schema = CONTEXT_FULL_SCHEMA
        full_cases_by_key = {
            (case["entryId"], case["accent"]): case
            for case in build_full_cases()
        }
        owner_qa = read_json(
            ROOT / ".scratch/gaokao-google-voice-qwen-full-v13/owner-qa-summary-v13.json"
        )
        pilot_keys = set(CONTEXT_PILOT_KEYS)
        context_full_keys = tuple(
            (entry["entryId"], entry["accent"])
            for entry in owner_qa["remaining"]
            if (entry["entryId"], entry["accent"]) not in pilot_keys
        )
        if len(context_full_keys) != 34 or len(set(context_full_keys)) != 34:
            raise ValueError(f"Expected 34 untested V13 Owner-QA failures, received {len(context_full_keys)}")
        cases = tuple({
            **full_cases_by_key[key],
            "contextBefore": TARGET_CONTEXTS[key[0]][0],
            "contextAfter": TARGET_CONTEXTS[key[0]][1],
        } for key in context_full_keys)
        public_directory = "google-voice-qwen-context-full-v15"
        base_seed = 15000
        generation_mode = "target-in-syntactic-context"
    else:
        output_root = PILOT_OUTPUT_ROOT
        public_root = PILOT_PUBLIC_ROOT
        schema = PILOT_SCHEMA
        cases = CASES
        public_directory = "google-voice-qwen-pilot-v12"
        base_seed = 12100
        generation_mode = "isolated-repetition"

    total = len(cases)
    manifest_path = output_root / "manifest.json"
    output_root.mkdir(parents=True, exist_ok=True)
    public_root.mkdir(parents=True, exist_ok=True)
    model_receipt = validate_model(args.model)
    references = build_references(output_root)

    manifest_entries: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    expected_cases = {
        (case["entryId"], case["accent"]): {**case, "caseIndex": case_index}
        for case_index, case in enumerate(cases)
    }
    if manifest_path.exists() and not args.replace:
        existing = read_json(manifest_path)
        if existing.get("schemaVersion") != schema:
            raise ValueError(f"Cannot resume a different manifest schema: {manifest_path}")
        invalidated = 0
        for collection_name, destination in (("entries", manifest_entries), ("failures", failures)):
            for record in existing.get(collection_name, []):
                key = (record["entryId"], record["accent"])
                expected = expected_cases.get(key)
                expected_text = expected.get("audioText", expected["headword"]) if expected else None
                generated_text = record.get("audioText", record["headword"])
                expected_generation_text = expected.get("generationText", expected_text) if expected else None
                generated_generation_text = record.get("generationText", generated_text)
                context_strategy = record.get("contextStrategyUsed")
                if generation_mode == "target-in-syntactic-context" and expected and not context_strategy:
                    used_context = (record.get("contextBeforeUsed"), record.get("contextAfterUsed"))
                    expected_context = (expected.get("contextBefore"), expected.get("contextAfter"))
                    if used_context == expected_context:
                        context_strategy = "target-specific-syntactic-context"
                    elif used_context in {
                        ("Listen to", "once more"),
                        ("Here comes", "clearly"),
                        ("We say", "now"),
                    }:
                        context_strategy = "recorded-carrier-context"
                if (
                    not expected
                    or generated_text != expected_text
                    or generated_generation_text != expected_generation_text
                    or (
                        generation_mode == "target-in-syntactic-context"
                        and not context_strategy
                    )
                ):
                    invalidated += 1
                    continue
                destination.append({**record, **expected, **(
                    {"contextStrategyUsed": context_strategy}
                    if context_strategy else {}
                )})
        if args.retry_failures and failures:
            print(f"Retrying {len(failures)} checkpointed generation failures", flush=True)
            failures = []
        if invalidated:
            print(f"Invalidated {invalidated} checkpointed candidates with stale audio-text binding", flush=True)
        for entry in manifest_entries:
            output_path = output_root / entry["path"]
            public_path = ROOT / "app/public" / entry["publicPath"].lstrip("/")
            if not output_path.exists() or not public_path.exists():
                raise FileNotFoundError(f"Checkpointed candidate is missing: {entry['entryId']} {entry['accent']}")
            if sha256_file(output_path) != entry["sha256"] or sha256_file(public_path) != entry["sha256"]:
                raise ValueError(f"Checkpointed candidate hash mismatch: {entry['entryId']} {entry['accent']}")

    def payload(status: str) -> dict[str, Any]:
        return {
            "schemaVersion": schema,
            "status": status,
            "formalAssetsChanged": False,
            "distribution": "local_private_evaluation_only",
            "plannedWords": 117 if args.scope == "full" else len({case["entryId"] for case in cases}),
            "plannedCandidates": total,
            "strategy": (
                "target word first uses paused target-specific syntactic fragments; when those cannot be safely "
                "isolated after repeated seeds, the recorded carrier context is used; frozen same-accent Google "
                "references preserve the voice; no instruct claim, syllable splice, or post-generation prosody warp"
                if generation_mode == "target-in-syntactic-context" else
                "frozen passed Google word assets form exact-text references; Qwen Base ICL voice cloning "
                "produces natural complete-word candidates; no unsupported instruct claim, syllable splice, "
                "or post-generation prosody warp"
            ),
            "generationMode": generation_mode,
            "signalGate": {
                "minimumPeak": 0.03,
                "minimumRms": 0.015,
                "minimumActiveFrameFraction": 0.08,
                "frameSeconds": 0.02,
            },
            "model": {
                "name": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit",
                **model_receipt,
            },
            "references": references,
            "entries": manifest_entries,
            "failures": failures,
        }

    attempted_keys = {
        (entry["entryId"], entry["accent"]) for entry in manifest_entries
    } | {
        (failure["entryId"], failure["accent"]) for failure in failures
    }
    if len(attempted_keys) == total:
        final_status = (
            "private_local_candidates_pending_owner_qa"
            if not failures else
            "private_local_candidates_with_generation_failures"
        )
        write_manifest(manifest_path, payload(final_status))
        print(json.dumps({
            "manifest": str(manifest_path),
            "resumed": True,
            "candidates": len(manifest_entries),
            "failures": len(failures),
        }, ensure_ascii=False))
        return

    write_manifest(manifest_path, payload("generation_in_progress"))
    print(
        f"Loading Qwen Base for {total - len(attempted_keys)} remaining of {total} Google-voice candidates",
        flush=True,
    )
    model = load_model(model_path=str(args.model))
    loaded_references = {
        accent: load_audio(str(ROOT / receipt["path"]), sample_rate=model.sample_rate)
        for accent, receipt in references.items()
    }
    with tempfile.TemporaryDirectory(prefix=f"eqb-google-voice-qwen-{args.scope}-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        for case_index, case in enumerate(cases):
            key = (case["entryId"], case["accent"])
            if key in attempted_keys:
                continue
            accent = case["accent"]
            seed = base_seed + case_index * 10
            try:
                generation_receipt: dict[str, str] = {}
                if generation_mode == "target-in-syntactic-context":
                    samples, sample_rate, generation_receipt = generate_context_candidate(
                        model,
                        loaded_references[accent],
                        references[accent]["referenceText"],
                        case,
                        seed,
                    )
                else:
                    samples, sample_rate = generate_candidate(
                        model,
                        loaded_references[accent],
                        references[accent]["referenceText"],
                        case,
                        seed,
                    )
                signal_metrics = validate_candidate_signal(samples, sample_rate)
                filename = f"{case['entryId']}--{accent}--qwen.mp3"
                wav_path = temporary_root / filename.replace(".mp3", ".wav")
                candidate_path = temporary_root / filename
                output_path = output_root / filename
                public_path = public_root / filename
                audio_write(wav_path, samples, sample_rate, format="wav")
                QWEN_AUDIO.encode_mp3(wav_path, candidate_path)
                metrics = QWEN_AUDIO.probe_audio(candidate_path)
                if metrics["rms"] < 0.015:
                    raise ValueError(f"Encoded candidate failed the full-run RMS gate: {metrics['rms']}")
                shutil.copyfile(candidate_path, output_path)
                shutil.copyfile(candidate_path, public_path)
                manifest_entries.append({
                    **case,
                    "caseIndex": case_index,
                    "seed": seed,
                    "voiceReference": references[accent]["voice"],
                    "referenceSha256": references[accent]["sha256"],
                    **generation_receipt,
                    "path": filename,
                    "publicPath": f"/vocabulary-assets/gaokao-frequency-v1/audio/{public_directory}/{filename}",
                    "bytes": output_path.stat().st_size,
                    "sha256": sha256_file(output_path),
                    **signal_metrics,
                    **metrics,
                })
                result_label = "generated"
            except (CandidateGenerationError, ValueError) as error:
                failures.append({
                    **case,
                    "caseIndex": case_index,
                    "seed": seed,
                    "voiceReference": references[accent]["voice"],
                    "referenceSha256": references[accent]["sha256"],
                    "error": str(error),
                })
                result_label = "failed"
            attempted_keys.add(key)
            write_manifest(manifest_path, payload("generation_in_progress"))
            print(
                f"{len(attempted_keys)}/{total} {result_label}: {case['headword']} {accent} "
                f"(ok={len(manifest_entries)}, failed={len(failures)})",
                flush=True,
            )
            mx.clear_cache()

    final_status = (
        "private_local_candidates_pending_owner_qa"
        if not failures else
        "private_local_candidates_with_generation_failures"
    )
    write_manifest(manifest_path, payload(final_status))
    print(json.dumps({
        "manifest": str(manifest_path),
        "references": 2,
        "candidates": len(manifest_entries),
        "failures": len(failures),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
