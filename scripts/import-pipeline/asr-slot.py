#!/usr/bin/env python3
"""Run an ASR command in a machine-wide slot; exec keeps the kernel lock alive."""
import fcntl
import json
import os
from pathlib import Path
import sys
import time


def main():
    limit = int(os.environ.get("EQB_ASR_CONCURRENCY", "1"))
    if limit < 1:
        raise ValueError("EQB_ASR_CONCURRENCY must be a positive integer")
    if len(sys.argv) < 2:
        raise ValueError("Usage: asr-slot.py <command> [args...]")
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
                # exec preserves the PID and this descriptor. The OS releases the
                # lock only when the actual ASR process exits, even after SIGKILL.
                os.set_inheritable(slot.fileno(), True)
                os.execvp(sys.argv[1], sys.argv[1:])
        if not waiting:
            print(f"ASR slots busy (limit {limit}); waiting", file=sys.stderr, flush=True)
            waiting = True
        time.sleep(0.25)


if __name__ == "__main__":
    main()
