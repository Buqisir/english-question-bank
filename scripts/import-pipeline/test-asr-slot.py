#!/usr/bin/env python3
"""Offline process-level checks for ASR slot lifetime and concurrency."""
import json
import os
from pathlib import Path
import subprocess
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

    def start(self, name, seconds=0, code=0, limit=None):
        env = {**os.environ, "EQB_ASR_LOCK_DIR": str(self.root / "slots")}
        env.pop("EQB_ASR_CONCURRENCY", None)
        if limit is not None:
            env["EQB_ASR_CONCURRENCY"] = str(limit)
        cwd = self.root / name
        cwd.mkdir()
        process = subprocess.Popen([sys.executable, str(WRAPPER), sys.executable,
            "-c", WORKER, str(self.root / f"{name}.json"), str(seconds), str(code)],
            env=env, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.addCleanup(self.stop, process)
        return process

    @staticmethod
    def stop(process):
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)

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
        self.assertEqual(json.loads((self.root / "first.json").read_text())["pid"], first.pid)
        second = self.start("second")
        time.sleep(0.3)
        self.assertFalse(self.started("second"))
        first.kill()
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
        first.kill()
        first.wait(timeout=5)
        self.assertEqual(third.wait(timeout=5), 0)
        self.assertTrue(self.started("third"))
        self.assertIsNone(second.poll())


if __name__ == "__main__":
    unittest.main()
