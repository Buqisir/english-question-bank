#!/usr/bin/env python3

"""Generate one Qwen violin probe: Google-C timbre majority + correct phonetic teacher."""

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
from mlx_audio.audio_io import read as audio_read
from mlx_audio.audio_io import write as audio_write
from mlx_audio.tts.utils import load_model
from mlx_audio.utils import load_audio


ROOT = Path(__file__).resolve().parents[2]
MODEL = Path('/Users/huangxuewei/.cache/eqbank/models/qwen3-tts-base-6bit')
OUTPUT_ROOT = ROOT / '.scratch/gaokao-qwen-dual-teacher-violin-v40'
PUBLIC_ROOT = ROOT / 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/qwen-dual-teacher-violin-v40'
V21_MANIFEST = ROOT / '.scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json'
TEACHER_RECEIPT = OUTPUT_ROOT / 'teacher-receipt.json'
TEACHER_AUDIO = OUTPUT_ROOT / 'violin--chirp3-leda-canonical-teacher.wav'
MANIFEST = OUTPUT_ROOT / 'manifest.json'


def load_module(name: str, relative_path: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Could not load helper: {relative_path}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V12 = load_module('eqb_qwen_v12_for_v40', 'scripts/vocabulary/generate-google-voice-qwen-pilot-v12.py')


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


teacher = json.loads(TEACHER_RECEIPT.read_text(encoding='utf-8'))
v21 = json.loads(V21_MANIFEST.read_text(encoding='utf-8'))
if teacher.get('schemaVersion') != 'gaokao-frequency-google-chirp3-violin-teacher-v40' or sha256(TEACHER_AUDIO) != teacher['sha256']:
    raise ValueError('V40 pronunciation teacher is missing or changed')
v21_entry = next(entry for entry in v21['entries'] if entry['entryId'] == 'gaokao-frequency-2081-violin' and entry['candidateLabel'] == 'A21')
google_reference = v21['references'][v21_entry['referenceId']]
google_path = ROOT / google_reference['path']
if sha256(google_path) != google_reference['sha256']:
    raise ValueError('V40 Google timbre reference hash mismatch')

google_audio, google_rate = audio_read(google_path, dtype='float32', sample_rate=24000, nchannels=1)
teacher_audio, teacher_rate = audio_read(TEACHER_AUDIO, dtype='float32', sample_rate=24000, nchannels=1)
if google_rate != 24000 or teacher_rate != 24000:
    raise ValueError('V40 references must be 24 kHz')
google_samples = np.asarray(google_audio, dtype=np.float32).reshape(-1)
teacher_samples = np.asarray(teacher_audio, dtype=np.float32).reshape(-1)
silence = np.zeros(round(0.12 * 24000), dtype=np.float32)
mixed_samples = np.concatenate([google_samples, silence, teacher_samples])
mixed_path = OUTPUT_ROOT / 'violin--google-c-timbre-plus-correct-teacher.wav'
audio_write(mixed_path, mixed_samples, 24000, format='wav')
reference_text = f"{google_reference['referenceText'].strip()} violin."

OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
model_receipt = V12.validate_model(MODEL)
print('Loading Qwen Base for one V40 dual-teacher candidate', flush=True)
model = load_model(model_path=str(MODEL))
loaded_reference = load_audio(str(mixed_path), sample_rate=model.sample_rate)
mx.random.seed(40040)
results = list(model.generate(
    text='violin.',
    ref_audio=loaded_reference,
    ref_text=reference_text,
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
    raise RuntimeError(f'Unexpected Qwen V40 result count: {len(results)}')

samples = np.asarray(results[0].audio, dtype=np.float32).reshape(-1)
frame = max(1, round(results[0].sample_rate * 0.02))
padding = (-samples.size) % frame
frames = np.pad(samples, (0, padding)).reshape(-1, frame)
rms = np.sqrt(np.mean(frames ** 2, axis=1))
active = np.flatnonzero(rms >= 0.004)
if active.size == 0:
    raise ValueError('V40 Qwen candidate is silent')
start = max(0, active[0] * frame - round(0.015 * results[0].sample_rate))
end = min(samples.size, (active[-1] + 1) * frame + round(0.025 * results[0].sample_rate))
trimmed = samples[start:end]

filename = 'gaokao-frequency-2081-violin--american--v40.mp3'
scratch_path = OUTPUT_ROOT / filename
public_path = PUBLIC_ROOT / filename
with tempfile.TemporaryDirectory(prefix='eqb-qwen-dual-teacher-v40-') as temporary:
    wav_path = Path(temporary) / 'violin.wav'
    audio_write(wav_path, trimmed, results[0].sample_rate, format='wav')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(wav_path), '-ar', '24000', '-ac', '1', '-b:a', '64k', str(scratch_path)], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-i', str(scratch_path), '-f', 'null', '-'], check=True)
public_path.write_bytes(scratch_path.read_bytes())
duration = float(json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(scratch_path)], check=True, capture_output=True, text=True).stdout)['format']['duration'])

manifest = {
    'schemaVersion': 'gaokao-frequency-qwen-dual-teacher-violin-v40',
    'status': 'private_local_candidate_pending_owner_qa',
    'distribution': 'local_private_evaluation_only',
    'formalAssetsChanged': False,
    'hypothesis': 'A mostly Google Neural2-C reference preserves timbre while one correct Chirp3 pronunciation teacher supplies the missing /ˌvaɪ.əˈlɪn/ sequence.',
    'model': {'name': 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit', **model_receipt},
    'reference': {
        'path': str(mixed_path.relative_to(ROOT)),
        'sha256': sha256(mixed_path),
        'referenceText': reference_text,
        'googleTimbrePath': google_reference['path'],
        'googleTimbreSeconds': round(google_samples.size / 24000, 6),
        'phoneticTeacherPath': teacher['path'],
        'phoneticTeacherSeconds': teacher['durationSeconds'],
        'finalVoiceTarget': google_reference['voice'],
    },
    'entry': {
        'entryId': 'gaokao-frequency-2081-violin',
        'headword': 'violin',
        'accent': 'american',
        'candidateLabel': 'V40',
        'generationSeed': 40040,
        'generationPrompt': 'violin.',
        'path': filename,
        'publicPath': f'/vocabulary-assets/gaokao-frequency-v1/audio/qwen-dual-teacher-violin-v40/{filename}',
        'bytes': scratch_path.stat().st_size,
        'sha256': sha256(scratch_path),
        'durationSeconds': round(duration, 3),
    },
}
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'manifest': str(MANIFEST), 'candidate': str(public_path), 'durationSeconds': manifest['entry']['durationSeconds']}, ensure_ascii=False), flush=True)
