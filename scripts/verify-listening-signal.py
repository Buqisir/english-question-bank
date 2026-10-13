"""Exercise the public segmentation CLI with repeated and substituted audio."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile

SR = 8000
CLI = Path(__file__).parent / 'import-pipeline/segment-listening.py'


def voice_like(seconds, seed):
    rng = np.random.default_rng(seed)
    times = np.arange(round(seconds*SR))/SR
    audio = np.zeros(len(times))
    for start in np.arange(0, seconds, .4):
        mask = (times >= start) & (times < start+.34)
        local = times[mask]-start
        frequency = rng.uniform(110, 270)
        audio[mask] = np.sin(np.pi*local/.34)**2 * sum(
            rng.uniform(.03, .12)*np.sin(2*np.pi*(frequency*k*local
            + rng.uniform(-12, 12)*local**2)+rng.uniform(0, 6.28)) for k in range(1, 6))
        audio[mask] += rng.normal(0, .003, len(local))
    return audio


def main():
    first = voice_like(16, 200)
    replaced = first.copy()
    replaced[6*SR:7*SR] = voice_like(1, 601)
    tail = first.copy()
    last = np.flatnonzero(first)[-1]+1
    tail[last-round(.2*SR):last] = voice_like(.2, 1102)
    quiet = first.copy()
    quiet[6*SR:7*SR] *= .001
    quiet_changed = quiet.copy()
    quiet_changed[6*SR:7*SR] = voice_like(1, 1220)*.001
    silenced = quiet.copy()
    silenced[6*SR:7*SR] = 0
    dc_first, dc_second = first.copy(), first.copy()
    dc_first[6*SR:7*SR], dc_second[6*SR:7*SR] = 2/32768, -2/32768
    long_body = voice_like(30, 130)
    with_cue = np.concatenate([voice_like(1, 750), np.zeros(round(1.6*SR)), long_body])
    cases = [
        ('repeat', first, first, 1),
        ('gain', first, first*.7, 1),
        ('quiet_repeat', quiet, quiet, 1),
        ('different_dc_silence', dc_first, dc_second, 1),
        ('existing_long_repeat_with_cue', with_cue, long_body, 1),
        ('one_second_replaced', first, replaced, 0),
        ('short_tail_replaced', first, tail, 0),
        ('quiet_phrase_replaced', quiet, quiet_changed, 0),
        ('quiet_phrase_silenced', quiet, silenced, 0),
        ('unrelated', first, voice_like(16, 401), 0),
    ]
    with tempfile.TemporaryDirectory(prefix='eqb-repeat-cli-') as temporary:
        root = Path(temporary)
        for name, a, b, expected in cases:
            pcm = np.concatenate([np.zeros(5*SR), a, np.zeros(round(2.2*SR)), b, np.zeros(5*SR)])
            source = root / f'{name}.wav'
            wavfile.write(source, SR, np.clip(pcm*32767, -32768, 32767).astype(np.int16))
            process = subprocess.run([sys.executable, str(CLI), str(source), str(root/name)],
                                     capture_output=True, text=True, check=True)
            result = json.loads(process.stdout)
            assert len(result['candidates']) == expected, (name, result['candidates'])
            if expected:
                segment = result['candidates'][0]
                assert 4.7 < segment['startSeconds'] < 5.2, (name, segment)
                expected_end = 5+len(a)/SR+2.2+len(b)/SR+1
                assert abs(segment['endSeconds']-expected_end) < .25, (name, segment)
                assert segment['status'] == 'unverified_candidate'
            print(f'PASS CLI {name}: {expected} candidates', flush=True)


if __name__ == '__main__':
    main()
