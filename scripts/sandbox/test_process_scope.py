"""Regression: detached test servers must not survive; other tasks must survive."""
from pathlib import Path
import tempfile
import unittest
import test_receiver


class Scope(unittest.TestCase):
    invoke = test_receiver.CommandExecution.invoke

    def test_detached_child_is_reaped_after_parent_success(self):
        import os
        import sys
        with tempfile.TemporaryDirectory() as t:
            pidfile = Path(t) / 'child.pid'
            script = ('import subprocess,pathlib; '
                      'p=subprocess.Popen(["/bin/sleep","30"],start_new_session=True, '
                      'stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); '
                      f'pathlib.Path({str(pidfile)!r}).write_text(str(p.pid))')
            code, report = self.invoke([sys.executable, '-c', script])
            pid = int(pidfile.read_text())
            self.assertEqual(code, 0)
            self.assertEqual(report['processCleanup']['remaining'], {})
            self.assertFalse(Path(f'/proc/{pid}').exists(), 'detached orphan must be reaped')

    def test_preexisting_sibling_child_is_not_terminated(self):
        import subprocess
        guardian = subprocess.Popen(['/bin/sleep', '30'], start_new_session=True)
        try:
            code, report = self.invoke(['/bin/sh', '-c', 'exit 0'])
            self.assertEqual(code, 0)
            self.assertIsNone(guardian.poll(), 'unrelated preexisting child must survive')
            self.assertNotIn(str(guardian.pid), report['processCleanup']['signaled'])
        finally:
            guardian.terminate(); guardian.wait()


if __name__ == '__main__': unittest.main()
