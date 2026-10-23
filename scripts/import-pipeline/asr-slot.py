#!/usr/bin/env python3
"""Run a local model in a machine-wide slot with separate queue/run deadlines."""
import fcntl
import json
import math
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
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a") as stream:
        stream.write(json.dumps(record) + "\n")
        stream.flush()
        os.fsync(stream.fileno())


def timeout_seconds(name):
    value = float(os.environ.get(name, "900"))
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be finite and positive")
    return value


class Interrupted(Exception):
    def __init__(self, signum):
        self.signum = signum


def main():
    limit = int(os.environ.get("EQB_ASR_CONCURRENCY", "1"))
    if limit < 1:
        raise ValueError("EQB_ASR_CONCURRENCY must be a positive integer")
    if len(sys.argv) < 2:
        raise ValueError("Usage: asr-slot.py <command> [args...]")
    queue_timeout = timeout_seconds("ASR_QUEUE_TIMEOUT")
    run_timeout = timeout_seconds("ASR_RUN_TIMEOUT")
    requested = time.monotonic()
    target, job, paper_id = timing_target(sys.argv[1:])
    receipt = os.environ.get("EQB_ASR_RECEIPT")
    targets = list(dict.fromkeys(p for p in [target, Path(receipt) if receipt else None] if p))
    binding = json.loads(os.environ.get("EQB_ASR_JOB_BINDING", "{}"))
    record = {"requestedAt": stamp(), "job": job, "paperId": paper_id,
              "pid": os.getpid(), "binding": binding, "inferenceStarted": False,
              "queueTimeoutSeconds": queue_timeout, "runTimeoutSeconds": run_timeout}
    acquired = None
    child = None

    def emit(phase, **fields):
        row = {**record, "phase": phase, "at": stamp(),
               "waitSeconds": (acquired or time.monotonic()) - requested,
               "runSeconds": time.monotonic() - acquired if acquired is not None else 0, **fields}
        for destination in targets:
            record_timing(destination, row)

    def interrupt(signum, _frame):
        raise Interrupted(signum)

    signals = (signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGQUIT)
    for signum in signals:
        signal.signal(signum, interrupt)

    def stop_child(signum):
        # The process group includes decoder/model descendants. Wait for the
        # actual child before closing our lock; SIGKILL of this wrapper still
        # leaves the inherited lock held by the surviving worker.
        for item in signals:
            signal.signal(item, signal.SIG_IGN)
        try:
            os.killpg(child.pid, signum)
        except ProcessLookupError:
            pass
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
        # A descendant may ignore TERM even if the direct child already exited.
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    def exit_code(code):
        if code < 0:
            signum = -code
            if signum != signal.SIGKILL:
                signal.signal(signum, signal.SIG_DFL)
            os.kill(os.getpid(), signum)
        return code

    emit("started")
    directory = Path(os.environ.get("EQB_ASR_LOCK_DIR", Path.home() / ".cache/eqbank/asr-slots"))
    directory.mkdir(parents=True, exist_ok=True)
    waiting = False
    try:
        while True:
            if time.monotonic() - requested >= queue_timeout:
                emit("timeout", code="ASR_QUEUE_TIMEOUT", inferenceStarted=False)
                print("ASR_QUEUE_TIMEOUT", file=sys.stderr, flush=True)
                return 75
            for index in range(limit):
                # Never unlink slot files: waiters must always lock one inode.
                with (directory / f"{index}.lock").open("a+") as slot:
                    try:
                        fcntl.flock(slot, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        continue
                    acquired = time.monotonic()
                    record["acquiredAt"] = stamp()
                    slot.seek(0)
                    slot.truncate()
                    json.dump({"pid": os.getpid(), "startedAt": time.time()}, slot)
                    slot.flush()
                    emit("acquired", slot=index)
                    os.set_inheritable(slot.fileno(), True)
                    try:
                        child = subprocess.Popen(sys.argv[1:], pass_fds=(slot.fileno(),),
                                                 restore_signals=False, start_new_session=True)
                        record["inferenceStarted"] = True
                        code = child.wait(timeout=run_timeout)
                        emit("finished", exit=code, childPid=child.pid)
                        return exit_code(code)
                    except subprocess.TimeoutExpired:
                        stop_child(signal.SIGTERM)
                        emit("timeout", code="ASR_RUN_TIMEOUT", childPid=child.pid, exit=child.returncode)
                        print("ASR_RUN_TIMEOUT", file=sys.stderr, flush=True)
                        return 124
                    except Interrupted as error:
                        if child is not None:
                            stop_child(error.signum)
                        emit("finished", code="ASR_INTERRUPTED", signal=error.signum,
                             childPid=child.pid if child else None)
                        return exit_code(-error.signum)
                    except Exception:
                        if child is not None:
                            stop_child(signal.SIGTERM)
                        emit("finished", code="ASR_WRAPPER_ERROR", childPid=child.pid if child else None)
                        raise
            if not waiting:
                print(f"ASR slots busy (limit {limit}); waiting", file=sys.stderr, flush=True)
                waiting = True
            time.sleep(min(0.25, max(0, queue_timeout - (time.monotonic() - requested))))
    except Interrupted as error:
        emit("finished", code="ASR_INTERRUPTED", signal=error.signum)
        return exit_code(-error.signum)


if __name__ == "__main__":
    sys.exit(main())
