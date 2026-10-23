#!/usr/bin/env python3
"""Offline process-level checks for ASR slot lifetime and concurrency."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import signal
import sys
import tempfile
import time
import unittest


WRAPPER = Path(__file__).with_name("asr-slot.py")
WORKER = """
import json, os, pathlib, sys, time
pathlib.Path(sys.argv[1]).write_text(json.dumps({"pid": os.getpid()}))
time.sleep(float(sys.argv[2]))
sys.exit(int(sys.argv[3]))
"""


class SlotsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def start(self, name, seconds=0, code=0, limit=None, queue=900, run=900, worker=WORKER):
        env = {**os.environ, "EQB_ASR_LOCK_DIR": str(self.root / "slots")}
        env.update({"ASR_QUEUE_TIMEOUT": str(queue), "ASR_RUN_TIMEOUT": str(run),
                    "EQB_ASR_RECEIPT": str(self.root / f"{name}-receipt.jsonl"),
                    "EQB_ASR_JOB_BINDING": json.dumps({"attemptId": "offline-attempt", "jobId": name,
                        "audioSha256": "sha256:offline", "startSeconds": 1, "endSeconds": 12})})
        env.pop("EQB_ASR_CONCURRENCY", None)
        if limit is not None:
            env["EQB_ASR_CONCURRENCY"] = str(limit)
        cwd = self.root / name
        cwd.mkdir()
        process = subprocess.Popen([sys.executable, str(WRAPPER), sys.executable,
            "-c", worker, str(self.root / f"{name}.json"), str(seconds), str(code)],
            env=env, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.addCleanup(self.stop, process, name)
        return process

    def stop(self, process, name):
        if process.poll() is None:
            process.terminate()
        process.wait(timeout=5)
        marker = self.root / f"{name}.json"
        if marker.exists():
            try:
                os.kill(json.loads(marker.read_text())["pid"], signal.SIGKILL)
            except ProcessLookupError:
                pass

    def rows(self, name):
        return [json.loads(line) for line in (self.root / f"{name}-receipt.jsonl").read_text().splitlines()]

    def started(self, name):
        return (self.root / f"{name}.json").exists()

    def wait_started(self, name):
        deadline = time.monotonic() + 5
        while not self.started(name) and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertTrue(self.started(name), f"{name} did not start")

    def test_default_one_queues_across_working_directories(self):
        first = self.start("first", seconds=0.8)
        self.wait_started("first")
        second = self.start("second")
        time.sleep(0.3)
        self.assertFalse(self.started("second"))
        self.assertIsNone(second.poll())
        self.assertEqual(first.wait(timeout=5), 0)
        self.assertEqual(second.wait(timeout=5), 0)
        self.assertTrue(self.started("second"))

    def test_sigkill_releases_actual_worker_lock(self):
        first = self.start("first", seconds=60)
        self.wait_started("first")
        worker_pid = json.loads((self.root / "first.json").read_text())["pid"]
        self.assertNotEqual(worker_pid, first.pid)
        second = self.start("second")
        time.sleep(0.3)
        self.assertFalse(self.started("second"))
        os.kill(worker_pid, signal.SIGKILL)
        self.assertEqual(first.wait(timeout=5), -9)
        self.assertEqual(second.wait(timeout=5), 0)
        self.assertTrue(self.started("second"))

    def test_failure_preserves_exit_code_and_releases_slot(self):
        first = self.start("first", code=7)
        self.assertEqual(first.wait(timeout=5), 7)
        second = self.start("second")
        self.assertEqual(second.wait(timeout=5), 0)
        self.assertTrue(self.started("second"))

    def test_two_slots_queue_third(self):
        first = self.start("first", seconds=60, limit=2)
        second = self.start("second", seconds=60, limit=2)
        self.wait_started("first")
        self.wait_started("second")
        third = self.start("third", limit=2)
        time.sleep(0.3)
        self.assertFalse(self.started("third"))
        os.kill(json.loads((self.root / "first.json").read_text())["pid"], signal.SIGKILL)
        first.wait(timeout=5)
        self.assertEqual(third.wait(timeout=5), 0)
        self.assertTrue(self.started("third"))
        self.assertIsNone(second.poll())

    def test_queue_timeout_does_not_start_inference_or_replace_lock_inode(self):
        first = self.start("first", seconds=0.6)
        self.wait_started("first")
        lock = self.root / "slots/0.lock"
        inode = lock.stat().st_ino
        queued = self.start("queued", queue=0.15, run=0.2)
        self.assertEqual(queued.wait(timeout=3), 75)
        self.assertFalse(self.started("queued"))
        rows = self.rows("queued")
        self.assertEqual([r["phase"] for r in rows], ["started", "timeout"])
        self.assertEqual(rows[-1]["code"], "ASR_QUEUE_TIMEOUT")
        self.assertFalse(rows[-1]["inferenceStarted"])
        self.assertEqual(rows[-1]["binding"]["jobId"], "queued")
        self.assertEqual(lock.stat().st_ino, inode)
        self.assertEqual(first.wait(timeout=3), 0)
        resumed = self.start("resumed")
        self.assertEqual(resumed.wait(timeout=3), 0)
        self.assertEqual(lock.stat().st_ino, inode)
        self.assertEqual(sorted(p.name for p in lock.parent.iterdir()), ["0.lock"])

    def test_waiting_does_not_consume_acquired_run_budget(self):
        first = self.start("first", seconds=0.5)
        self.wait_started("first")
        second = self.start("second", seconds=0.15, queue=2, run=1.5)
        self.assertEqual(first.wait(timeout=3), 0)
        self.assertEqual(second.wait(timeout=3), 0)
        rows = self.rows("second")
        self.assertEqual([r["phase"] for r in rows], ["started", "acquired", "finished"])
        self.assertGreater(rows[-1]["waitSeconds"], 0.3)
        self.assertGreater(rows[-1]["runSeconds"], 0.1)
        self.assertTrue(rows[-1]["inferenceStarted"])

    def test_run_timeout_terminates_child_before_releasing_same_lock(self):
        first = self.start("first", seconds=60, queue=2, run=1.5)
        self.wait_started("first")
        worker_pid = json.loads((self.root / "first.json").read_text())["pid"]
        lock = self.root / "slots/0.lock"
        inode = lock.stat().st_ino
        self.assertEqual(first.wait(timeout=3), 124)
        with self.assertRaises(ProcessLookupError):
            os.kill(worker_pid, 0)
        rows = self.rows("first")
        self.assertEqual([r["phase"] for r in rows], ["started", "acquired", "timeout"])
        self.assertEqual(rows[-1]["code"], "ASR_RUN_TIMEOUT")
        self.assertTrue(rows[-1]["inferenceStarted"])
        with lock.open("a+") as slot:
            fcntl.flock(slot, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.assertEqual(self.start("second").wait(timeout=3), 0)
        self.assertEqual(lock.stat().st_ino, inode)

    def test_term_while_queued_never_starts_child(self):
        first = self.start("first", seconds=0.8)
        self.wait_started("first")
        second = self.start("second")
        deadline = time.monotonic() + 3
        while not (self.root / "second-receipt.jsonl").exists() and time.monotonic() < deadline:
            time.sleep(0.02)
        second.terminate()
        self.assertEqual(second.wait(timeout=3), -signal.SIGTERM)
        self.assertFalse(self.started("second"))
        self.assertFalse(self.rows("second")[-1]["inferenceStarted"])
        self.assertEqual(first.wait(timeout=3), 0)

    def test_run_timeout_kills_a_worker_that_ignores_term(self):
        worker = "import signal; signal.signal(signal.SIGTERM, signal.SIG_IGN)\n" + WORKER
        first = self.start("first", seconds=60, queue=2, run=1.5, worker=worker)
        self.wait_started("first")
        worker_pid = json.loads((self.root / "first.json").read_text())["pid"]
        self.assertEqual(first.wait(timeout=10), 124)
        self.assertEqual(self.rows("first")[-1]["exit"], -signal.SIGKILL)
        with self.assertRaises(ProcessLookupError):
            os.kill(worker_pid, 0)
        self.assertEqual(self.start("second").wait(timeout=3), 0)


if __name__ == "__main__":
    unittest.main()
