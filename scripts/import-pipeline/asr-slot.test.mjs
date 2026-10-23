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
    assert len([r for r in rows if r['phase'] == 'started']) == 7
    assert len([r for r in rows if r['phase'] == 'acquired']) == 7
    assert len([r for r in rows if r['phase'] == 'finished']) == 6
    assert all(row['paperId'] == 'paper-test' and row['runSeconds'] >= 0 and row['waitSeconds'] >= 0 for row in rows)
    assert rows[-1]['waitSeconds'] > .7
`], { encoding: 'utf8', timeout: 15_000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test('standalone wrapper receipts do not precreate an exclusive transcriber output directory', () => {
  const result = spawnSync('python3', ['-c', `
import subprocess, tempfile, os, pathlib, json, runpy, sys
wrapper = ${JSON.stringify(new URL('./asr-slot.py', import.meta.url).pathname)}
target = runpy.run_path(wrapper)['timing_target']
with tempfile.TemporaryDirectory(prefix='eqb-slot-output-') as tmp:
    root = pathlib.Path(tmp)
    transcriber = root/'transcribe-listening-windows.py'
    transcriber.write_text("import pathlib,sys\\noutput = pathlib.Path(sys.argv[3])\\noutput.mkdir(parents=True, exist_ok=False)\\n(output/'completed.json').write_text('frozen output; no model loaded')\\n")
    env = {**os.environ, 'EQB_ASR_LOCK_DIR': str(root/'locks'), 'EQB_ASR_CONCURRENCY': '1',
        'ASR_QUEUE_TIMEOUT': '5', 'ASR_RUN_TIMEOUT': '5', 'EQB_ASR_RECEIPT': str(root/'receipts/job.jsonl')}
    for name in ['raw', 'another-raw']:
        output = root/'standalone'/name
        command = [sys.executable, str(transcriber), 'audio.mp3', 'source.json', str(output)]
        receipt, job, paper = target(command)
        assert not output.exists()
        completed = subprocess.run([sys.executable, wrapper, *command], env=env, capture_output=True, text=True, timeout=8)
        assert completed.returncode == 0, completed.stderr
        assert output.is_dir()
        assert not receipt.is_relative_to(output), receipt
        rows = [json.loads(line) for line in receipt.read_text().splitlines()]
        assert [r['phase'] for r in rows] == ['started', 'acquired', 'finished']
        original = (output/'completed.json').read_bytes()
        repeated = subprocess.run([sys.executable, wrapper, *command], env=env, capture_output=True, text=True, timeout=8)
        assert repeated.returncode != 0 and 'FileExistsError' in repeated.stderr
        assert (output/'completed.json').read_bytes() == original
`], { encoding: 'utf8', timeout: 20_000 })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})
