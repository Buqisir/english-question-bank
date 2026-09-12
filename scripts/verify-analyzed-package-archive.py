#!/usr/bin/env python3
"""Public CLI checks for complete-package archive admission."""

import hashlib
import json
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
import warnings
import zipfile


CLI = Path(__file__).parent / "import-pipeline/analyzed-package-archive.py"


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="eqb-archive-test-")
        self.root = Path(self.scratch.name)
        self.addCleanup(self.scratch.cleanup)

    def archive(self, entries, compression=zipfile.ZIP_DEFLATED):
        archive = self.root / "input.zip"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(archive, "w", compression=compression) as package:
                for name, content in entries:
                    package.writestr(name, content)
        return archive

    def run_cli(self, archive, destination=None):
        args = ["python3", "-B", str(CLI), str(archive)]
        if destination is not None:
            args.extend(["--destination", str(destination)])
        result = subprocess.run(args, capture_output=True, text=True, check=False)
        body = json.loads(result.stdout)
        self.assertEqual(result.returncode, 0 if body["ok"] else 1, result.stderr)
        return body

    def test_valid_nested_package_preserves_bytes_and_digests(self):
        image = bytes([0, 3, 255, 7])
        archive = self.archive([("package.json", b"{}"), ("media/chart.png", image)])
        destination = self.root / "unpacked"
        result = self.run_cli(archive, destination)
        self.assertTrue(result["ok"], result)
        self.assertEqual((destination / "media/chart.png").read_bytes(), image)
        self.assertEqual(result["files"][1], {
            "path": "media/chart.png", "byteLength": 4,
            "sha256": "sha256:" + hashlib.sha256(image).hexdigest(),
        })
        self.assertEqual(result["stage"], "archive")

    def test_unsafe_paths_are_rejected_without_output(self):
        for name in ("../outside", "/absolute", "a/../../outside", "a\\outside", "C:/outside", "a//b", "a/./b"):
            with self.subTest(name=name):
                archive = self.archive([("package.json", "{}"), (name, "bad")])
                destination = self.root / "unpacked"
                self.assertFalse(self.run_cli(archive, destination)["ok"])
                self.assertFalse(destination.exists())
        self.assertFalse((self.root / "outside").exists())

    def test_duplicate_and_file_directory_collisions(self):
        for names in (("package.json", "package.json"), ("media/A.png", "media/a.png"), ("media", "media/a.png")):
            with self.subTest(names=names):
                entries = [(name, "x") for name in names]
                if "package.json" not in names:
                    entries.insert(0, ("package.json", "{}"))
                result = self.run_cli(self.archive(entries))
                self.assertFalse(result["ok"])

    def test_symlink_rejected(self):
        link = zipfile.ZipInfo("media/link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        result = self.run_cli(self.archive([("package.json", "{}"), (link, "../../outside")]))
        self.assertFalse(result["ok"])
        self.assertIn("not a regular file", result["message"])

    def test_existing_destination_is_not_modified(self):
        destination = self.root / "existing"
        destination.mkdir()
        (destination / "keep").write_text("original")
        result = self.run_cli(self.archive([("package.json", "{}")]), destination)
        self.assertFalse(result["ok"])
        self.assertEqual([file.name for file in destination.iterdir()], ["keep"])
        self.assertEqual((destination / "keep").read_text(), "original")

    def test_manifest_must_be_at_root(self):
        self.assertFalse(self.run_cli(self.archive([("wrapper/package.json", "{}")]))["ok"])

    def test_crc_damage_rejected(self):
        archive = self.archive([("package.json", b'{"unique":"content"}')], zipfile.ZIP_STORED)
        original = archive.read_bytes()
        archive.write_bytes(original.replace(b'{"unique":"content"}', b'{"unique":"changed"}', 1))
        self.assertFalse(self.run_cli(archive)["ok"])

    def test_declared_size_limit_rejected_before_decompression(self):
        archive = self.archive([("package.json", "{}")])
        raw = bytearray(archive.read_bytes())
        central = raw.index(b"PK\x01\x02")
        raw[central + 24:central + 28] = (64 * 1024 * 1024 + 1).to_bytes(4, "little")
        archive.write_bytes(raw)
        result = self.run_cli(archive)
        self.assertFalse(result["ok"])
        self.assertIn("64 MiB", result["message"])


if __name__ == "__main__":
    unittest.main()
