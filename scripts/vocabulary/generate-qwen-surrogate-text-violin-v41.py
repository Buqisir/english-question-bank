#!/usr/bin/env python3

"""Test whether violin's orthography, not its reference audio, causes the stress error."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from typing import Any

import mlx.core as mx
import numpy as np
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


ROOT = Path(__file__).resolve().parents[2]
MODEL = Path('/Users/huangxuewei/.cache/eqbank/models/qwen3-tts-base-6bit')
OUTPUT_ROOT = ROOT / '.scratch/gaokao-qwen-surrogate-text-violin-v41'
PUBLIC_ROOT = ROOT / 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/qwen-surrogate-text-violin-v41'
V40_MANIFEST = ROOT / '.scratch/gaokao-qwen-dual-teacher-violin-v40/manifest.json'
V40_QA = ROOT / '.scratch/gaokao-qwen-dual-teacher-violin-v40/owner-qa-summary-v40.json'
MANIFEST = OUTPUT_ROOT / 'manifest.json'


def load_module(name: str, relative_path: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Could not load helper: {relative_path}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


V12 = load_module('eqb_qwen_v12_for_v41', 'scripts/vocabulary/generate-google-voice-qwen-pilot-v12.py')
v40 = json.loads(V40_MANIFEST.read_text(encoding='utf-8'))
v40_qa = json.loads(V40_QA.read_text(encoding='utf-8'))
if not any(entry['entryId'] == 'gaokao-frequency-2081-violin' and entry['verdict'] == 'fail' for entry in v40_qa['entries']):
    raise ValueError('V41 requires explicit V40 rejection')
reference_path = ROOT / v40['reference']['path']
if sha256(reference_path) != v40['reference']['sha256']:
    raise ValueError('V41 must reuse the exact V40 reference')

OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
model_receipt = V12.validate_model(MODEL)
print('Loading Qwen Base for one V41 orthography probe', flush=True)
model = load_model(model_path=str(MODEL))
loaded_reference = load_audio(str(reference_path), sample_rate=model.sample_rate)
mx.random.seed(40040)
generation_text = 'vie-a-Lynn.'
results = list(model.generate(
    text=generation_text,
    ref_audio=loaded_reference,
    ref_text=v40['reference']['referenceText'],
    temperature=0.18,
    lang_code='English',
    max_tokens=180,
    top_k=18,
    top_p=0.84,
    repetition_penalty=1.5,
    stream=False,
    verbose=False,
))
if len(results) != 1:
    raise RuntimeError(f'Unexpected Qwen V41 result count: {len(results)}')

samples = np.asarray(results[0].audio, dtype=np.float32).reshape(-1)
frame = max(1, round(results[0].sample_rate * 0.02))
padding = (-samples.size) % frame
frames = np.pad(samples, (0, padding)).reshape(-1, frame)
rms = np.sqrt(np.mean(frames ** 2, axis=1))
active = np.flatnonzero(rms >= 0.004)
if active.size == 0:
    raise ValueError('V41 candidate is silent')
start = max(0, active[0] * frame - round(0.015 * results[0].sample_rate))
end = min(samples.size, (active[-1] + 1) * frame + round(0.025 * results[0].sample_rate))
trimmed = samples[start:end]

filename = 'gaokao-frequency-2081-violin--american--v41.mp3'
scratch_path = OUTPUT_ROOT / filename
public_path = PUBLIC_ROOT / filename
with tempfile.TemporaryDirectory(prefix='eqb-qwen-surrogate-text-v41-') as temporary:
    wav_path = Path(temporary) / 'violin.wav'
    audio_write(wav_path, trimmed, results[0].sample_rate, format='wav')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(wav_path), '-ar', '24000', '-ac', '1', '-b:a', '64k', str(scratch_path)], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-i', str(scratch_path), '-f', 'null', '-'], check=True)
public_path.write_bytes(scratch_path.read_bytes())
duration = float(json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(scratch_path)], check=True, capture_output=True, text=True).stdout)['format']['duration'])

manifest = {
    'schemaVersion': 'gaokao-frequency-qwen-surrogate-text-violin-v41',
    'status': 'private_local_candidate_pending_owner_qa',
    'distribution': 'local_private_evaluation_only',
    'formalAssetsChanged': False,
    'changedVariable': 'Generation text only: V40 violin. -> V41 vie-a-Lynn.',
    'model': {'name': 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit', **model_receipt},
    'reference': v40['reference'],
    'entry': {
        'entryId': 'gaokao-frequency-2081-violin',
        'headword': 'violin',
        'accent': 'american',
        'candidateLabel': 'V41',
        'generationSeed': 40040,
        'generationPrompt': generation_text,
        'path': filename,
        'publicPath': f'/vocabulary-assets/gaokao-frequency-v1/audio/qwen-surrogate-text-violin-v41/{filename}',
        'bytes': scratch_path.stat().st_size,
        'sha256': sha256(scratch_path),
        'durationSeconds': round(duration, 3),
    },
}
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'manifest': str(MANIFEST), 'candidate': str(public_path), 'durationSeconds': manifest['entry']['durationSeconds']}, ensure_ascii=False), flush=True)
