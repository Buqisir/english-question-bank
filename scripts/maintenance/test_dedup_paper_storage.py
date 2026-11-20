import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest


SCRIPT = Path(__file__).with_name("dedup-paper-storage.py")
CONTENT = b"eqb-test" * 10_000


class DedupTests(unittest.TestCase):
    def run_dedup(self, root, *mode):
        return subprocess.check_output([sys.executable, str(SCRIPT), str(root), *mode], text=True)

    def test_no_keeper_when_both_inodes_have_unscanned_aliases(self):
        with TemporaryDirectory() as directory:
            parent = Path(directory)
            root = parent / "storage"
            excluded = root / ".candidate-excluded"
            excluded.mkdir(parents=True)
            first, second = root / "first", root / "second"
            for file in (first, second):
                file.write_bytes(CONTENT)
            os.link(first, parent / "outside")
            os.link(second, excluded / "alias")
            inodes = [file.stat().st_ino for file in (first, second)]

            output = self.run_dedup(root, "--apply")
            self.assertIn("merged=0, saved_bytes=0", output)
            self.assertIn("all inodes have unscanned links: 2", output)
            self.assertEqual([file.stat().st_ino for file in (first, second)], inodes)

    def test_apply_reclaims_interrupted_link_and_keeps_a_single_link(self):
        with TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            keeper = root / "a" / "keeper"
            duplicate = root / "z" / "duplicate"
            for file in (keeper, duplicate):
                file.parent.mkdir()
                file.write_bytes(CONTENT)
            stale = duplicate.with_name(".duplicate.eqb-dedup-tmp")
            os.link(keeper, stale)
            single = duplicate.with_name(".single.eqb-dedup-tmp")
            single.write_bytes(CONTENT)
            inode = keeper.stat().st_ino

            self.run_dedup(root, "--dry-run")
            self.assertTrue(stale.exists())
            output = self.run_dedup(root, "--apply")
            self.assertIn(f"Removing stale temporary link: {stale}", output)
            self.assertIn("merged=1", output)
            self.assertFalse(stale.exists())
            self.assertEqual(single.stat().st_nlink, 1)
            self.assertEqual(duplicate.read_bytes(), CONTENT)
            self.assertEqual(duplicate.stat().st_ino, inode)
            self.assertEqual(keeper.stat().st_nlink, 2)
            self.assertIn("merged=0, saved_bytes=0", self.run_dedup(root, "--apply"))


if __name__ == "__main__":
    unittest.main()
