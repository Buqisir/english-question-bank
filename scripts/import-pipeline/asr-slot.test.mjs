import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('slot retains command exit/signal status and releases only after the model exits', () => {
  const result = spawnSync('python3', ['-c', `
import subprocess, tempfile, os, pathlib, time, fcntl, json, runpy
script = ${JSON.stringify(new URL('./asr-slot.py', import.meta.url).pathname)}
target = runpy.run_path(script)['timing_target']
for vad, label in [(True, 'asr-vad'), (False, 'asr-novad')]:
    output, job, paper = target(['python', 'transcribe-listening-windows.py', 'playback.mp3', 'original.mp3', '/tmp/paper-test/fast/asr-output'] + (['--vad'] if vad else []))
    assert str(output) == '/tmp/paper-test/fast/slot-timeline.jsonl' and job == label and paper == 'paper-test'
assert target(['python', 'ocr-figure-detect.py', '--output', '/tmp/paper-test/fast/figure.json']) == (pathlib.Path('/tmp/paper-test/fast/slot-timeline.jsonl'), 'ovis', 'paper-test')
with tempfile.TemporaryDirectory(prefix='eqb-slot-') as tmp:
    env = {**os.environ, 'EQB_ASR_LOCK_DIR': tmp+'/locks', 'EQB_ASR_CONCURRENCY': '1'}
    def command(code):
        return ['python3', script, 'python3', '-c', code, '--output', tmp+'/paper-test/fast/result.json']
    for code, expected in [('import time; time.sleep(1)', 0), ('raise SystemExit(1)', 1),
            ('import os,signal; os.kill(os.getpid(),signal.SIGTERM)', -15),
            ('import os,signal; os.kill(os.getpid(),signal.SIGKILL)', -9)]:
        assert subprocess.run(command(code), env=env, timeout=4).returncode == expected
        with open(tmp+'/locks/0.lock', 'a+') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    marker = pathlib.Path(tmp)/'ready'
    child = subprocess.Popen(command(f'import pathlib,time; pathlib.Path({str(marker)!r}).touch(); time.sleep(10)'), env=env)
    try:
        deadline = time.monotonic()+3
        while not marker.exists() and time.monotonic() < deadline: time.sleep(.02)
        assert marker.exists()
        child.terminate()
        assert child.wait(timeout=3) == -15
    finally:
        if child.poll() is None: child.kill(); child.wait()
    marker.unlink()
    child = subprocess.Popen(command(f'import pathlib,time; pathlib.Path({str(marker)!r}).touch(); time.sleep(1)'), env=env)
    try:
        deadline = time.monotonic()+3
        while not marker.exists() and time.monotonic() < deadline: time.sleep(.02)
        assert marker.exists()
        child.kill()
        assert child.wait() == -9
        started = time.monotonic()
        assert subprocess.run(command('pass'), env=env, timeout=4).returncode == 0
        assert time.monotonic()-started > .7
    finally:
        if child.poll() is None: child.kill(); child.wait()
    rows = [json.loads(line) for line in pathlib.Path(tmp+'/paper-test/fast/slot-timeline.jsonl').read_text().splitlines()]
    assert len(rows) == 6
    assert all(row['paperId'] == 'paper-test' and row['runSeconds'] >= 0 and row['waitSeconds'] >= 0 for row in rows)
    assert rows[-1]['waitSeconds'] > .7
`], { encoding: 'utf8', timeout: 15_000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})
