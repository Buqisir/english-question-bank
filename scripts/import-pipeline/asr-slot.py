#!/usr/bin/env python3
"""Run a local model command in a machine-wide slot, retaining timing receipts."""
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone


def stamp():
    return datetime.now(timezone.utc).isoformat()


def timing_target(command):
    job = "local-model"
    output = None
    for index, arg in enumerate(command):
        if Path(arg).name == "transcribe-listening-windows.py" and len(command) > index + 3:
            job = "asr-vad" if "--vad" in command else "asr-novad"
            output = Path(command[index + 3])
        elif Path(arg).name == "ocr-figure-detect.py":
            job = "ovis"
    if output is None and "--output" in command:
        index = command.index("--output")
        if len(command) > index + 1:
            output = Path(command[index + 1]).parent
    paper_id = next((part for arg in command for part in Path(arg).parts
                     if part.startswith("paper-")), None)
    if output is None:
        return None, job, paper_id
    fast = next((parent for parent in [output, *output.parents] if parent.name == "fast"), None)
    return (fast or output) / "slot-timeline.jsonl", job, paper_id


def record_timing(target, record):
    if target is None:
        return
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("a") as stream:
            stream.write(json.dumps(record) + "\n")
    except OSError as error:
        print(f"Timing receipt unavailable: {error}", file=sys.stderr)


def main():
    limit = int(os.environ.get("EQB_ASR_CONCURRENCY", "1"))
    if limit < 1:
        raise ValueError("EQB_ASR_CONCURRENCY must be a positive integer")
    if len(sys.argv) < 2:
        raise ValueError("Usage: asr-slot.py <command> [args...]")
    requested_at = stamp()
    requested = time.monotonic()
    target, job, paper_id = timing_target(sys.argv[1:])
    directory = Path(os.environ.get("EQB_ASR_LOCK_DIR", Path.home() / ".cache/eqbank/asr-slots"))
    directory.mkdir(parents=True, exist_ok=True)
    waiting = False
    while True:
        for index in range(limit):
            # Never unlink slot files: waiters must always lock the same inode.
            with (directory / f"{index}.lock").open("a+") as slot:
                try:
                    fcntl.flock(slot, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    continue
                slot.seek(0)
                slot.truncate()
                json.dump({"pid": os.getpid(), "startedAt": time.time()}, slot)
                slot.flush()
                acquired = time.monotonic()
                record = {"requestedAt": requested_at, "acquiredAt": stamp(),
                          "waitSeconds": acquired - requested, "job": job, "paperId": paper_id}
                # Both processes retain the same locked open file description.
                # If this wrapper is killed, the command still owns the lock.
                os.set_inheritable(slot.fileno(), True)
                # Match exec's inherited ignored signal dispositions (e.g. SIGPIPE).
                child = subprocess.Popen(sys.argv[1:], pass_fds=(slot.fileno(),),
                                         restore_signals=False)
                def forward(signum, _frame):
                    if child.poll() is None:
                        child.send_signal(signum)
                for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGQUIT):
                    signal.signal(signum, forward)
                code = child.wait()
                record_timing(target, {**record, "finishedAt": stamp(),
                                      "runSeconds": time.monotonic() - acquired, "exit": code})
                if code < 0:
                    signum = -code
                    if signum != signal.SIGKILL:
                        signal.signal(signum, signal.SIG_DFL)
                    os.kill(os.getpid(), signum)
                return code
        if not waiting:
            print(f"ASR slots busy (limit {limit}); waiting", file=sys.stderr, flush=True)
            waiting = True
        time.sleep(0.25)


if __name__ == "__main__":
    sys.exit(main())
