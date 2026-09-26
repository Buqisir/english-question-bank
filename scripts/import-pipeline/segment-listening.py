"""Recovered signal-only experiment, with explicit input/output and PCM clock.

Restores the final listening-four experiment from this thread's tool history.
Candidates are NOT verified question mappings or content-approval evidence.
"""
import argparse
import hashlib
import json
import re
import subprocess
import time
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import uniform_filter1d
from scipy.signal import stft


def candidates(audio, sr, gaps):
    if sr != 8000 or audio.ndim != 1:
        raise ValueError('Expected 8000 Hz mono PCM')
    a = audio.astype(np.float32) / 32768
    _, times, z = stft(a, sr, nperseg=512, noverlap=112)
    power = np.abs(z) ** 2
    edges = np.unique(np.round(np.geomspace(3, 250, 33)).astype(int))
    bands = np.stack([power[x:y].mean(axis=0) for x, y in zip(edges[:-1], edges[1:])])
    bands = (bands[:, :bands.shape[1]//2*2:2] + bands[:, 1:bands.shape[1]//2*2:2]) / 2
    times = times[:bands.shape[1]*2:2]
    active = bands.sum(axis=0) > 1e-5
    f = np.log(np.maximum(uniform_filter1d(bands, 3, axis=1), 1e-10)).T
    f -= f.mean(axis=1, keepdims=True)
    f /= np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-8)
    matches = []
    for lag in range(60, min(1501, len(f)-80)):
        both = active[:-lag] & active[lag:]
        sums = np.r_[0., np.cumsum((f[:-lag]*f[lag:]).sum(axis=1)*both)]
        counts = np.r_[0, np.cumsum(both)]
        count = counts[80:] - counts[:-80]
        score = (sums[80:] - sums[:-80]) / np.maximum(count, 1)
        changes = np.diff(np.r_[False, (score > .95) & (count >= 48), False].astype(int))
        for x, y in zip(np.where(changes == 1)[0], np.where(changes == -1)[0]):
            if y-x >= 20:
                matches.append(dict(start=float(times[x]), end=float(times[y+79]), lag=lag*.1))
    selected = []
    for m in sorted(matches, key=lambda m: -(m['end']-m['start'])):
        if not any(abs(m['lag']-p['lag']) < 1 and m['start'] < p['end'] and m['end'] > p['start'] for p in selected):
            selected.append(m)
    selected.sort(key=lambda m: m['start'])
    long = [p for p in gaps if p[1]-p[0] >= 4]
    units = []
    for m in selected:
        left = [p for p in long if p[1] <= m['start']+3]
        right = [p for p in long if p[0] > m['start']+m['lag']+5]
        if left and right:
            units.append(dict(start=left[-1][1], end=right[0][0], kind='repeated'))
    units = list({(u['start'], u['end']): u for u in units}.values())
    units.sort(key=lambda u: u['start'])
    first = min((u['start'] for u in units), default=len(a)/sr)
    singles = []
    for p, q in zip(long, long[1:]):
        if p[1] >= first:
            break
        after = next((g for g in gaps if g[0] >= p[1]-.01), None)
        if after and .4 <= after[0]-p[1] <= 1.6 and 1.2 <= after[1]-after[0] <= 3.5 and q[0]-after[1] >= 5:
            singles.append(dict(start=p[1], end=q[0], kind='single', body=after[1]))
    if singles:
        typical = np.median([u['end']-u['body'] for u in singles])
        units.extend(u for u in singles if .5*typical <= u['end']-u['body'] <= 1.8*typical)
    units.sort(key=lambda u: u['start'])
    result = []
    for index, u in enumerate(units):
        start = u['start']
        reason = 'existing leading cue; presence requires audit'
        if index >= 5 and len(units) == 10:
            prep = next((p for p in long if abs(p[1]-start) < .05), None)
            if prep:
                before = [p for p in gaps if p[1] < prep[0] and p[1] > units[index-1]['end']]
                if before:
                    last = before[-1]
                    earlier = [p for p in gaps if p[1] < last[0]]
                    start = earlier[-1][1] if earlier and .4 <= last[0]-earlier[-1][1] <= 1.6 else last[1]
                    reason = 'announcement preceding reading pause'
                answer_gaps = [p for p in long if p[0] >= units[index-1]['end']-.05 and p[1] < prep[0]]
                if index >= 6 and answer_gaps:
                    start = answer_gaps[0][1]
                    reason = 'full announcement after preceding answer gap'
        result.append(dict(candidate=index+1, startSeconds=round(max(0, start-.15), 3),
                           endSeconds=round(min(len(a)/sr, u['end']+1), 3),
                           bodyRegionStart=u['start'], kind=u['kind'], startReason=reason,
                           status='unverified_candidate'))
    return result, selected


def run(source, output):
    source = source.resolve()
    output.mkdir(parents=True, exist_ok=False)
    started = time.perf_counter()
    with (output/'decode.log').open('w') as log:
        subprocess.run(['ffmpeg', '-v', 'warning', '-i', str(source), '-ar', '44100', '-ac', '1',
                        '-c:a', 'pcm_s16le', str(output/'full.wav')], stderr=log, check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(output/'full.wav'), '-ar', '8000',
                    '-c:a', 'pcm_s16le', str(output/'analysis.wav')], check=True)
    with (output/'silence.log').open('w') as log:
        subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(output/'analysis.wav'),
                        '-af', 'silencedetect=noise=-35dB:d=1.2', '-f', 'null', '-'], stderr=log, check=True)
    gaps = [(float(x), float(y)) for x, y in re.findall(
        r'silence_start: ([\d.]+).*?silence_end: ([\d.]+)', (output/'silence.log').read_text(), re.S)]
    sr, audio = wavfile.read(output/'analysis.wav')
    result, repeats = candidates(audio, sr, gaps)
    warnings = (output/'decode.log').read_text().strip()
    report = dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                  decodedDurationSeconds=len(audio)/sr, elapsedSeconds=round(time.perf_counter()-started, 3),
                  method='recovered spectral similarity plus silence; no ASR',
                  candidates=result, repeatMatches=repeats, decodeWarnings=warnings,
                  structuralStatus='needs_audio_audit' if len(result) == 10 else 'blocked_unresolved_group_count',
                  limitations=['Ten candidates do not prove question mapping or cue correctness.',
                               'Times use the normalized PCM playback clock, not source MP3 header estimates.'])
    (output/'candidates.json').write_text(json.dumps(report, indent=2)+'\n')
    for g in result:
        subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(g['startSeconds']), '-i', str(output/'full.wav'),
                        '-t', str(g['endSeconds']-g['startSeconds']), '-c:a', 'libmp3lame', '-b:a', '96k',
                        str(output/f"group-{g['candidate']:02}.mp3")], check=True)
    print(json.dumps({k: v for k, v in report.items() if k not in ('repeatMatches', 'decodeWarnings')}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    run(args.source, args.output)
