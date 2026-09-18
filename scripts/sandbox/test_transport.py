"""Named failures: oversized connector upload, partial/corrupt chunks and overwrite."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import transport


class Transport(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.content = b'renderer byte exact proof and reuse 012345'
        (self.root / transport.RENDER).write_bytes(self.content)
        self.manifest = {'profile': 'render', 'layers': {
            'source': {'bytes': 100}, 'node': {'bytes': 100},
            'render': {'file': transport.RENDER, 'bytes': len(self.content),
                       'sha256': transport.digest(self.root / transport.RENDER)}}}
        (self.root / 'manifest.json').write_text(json.dumps(self.manifest))

    def split(self):
        with contextlib.redirect_stdout(io.StringIO()): transport.split_render(self.root, chunk_bytes=16)
        (self.root / transport.RENDER).unlink()

    def test_chunk_roundtrip_and_reuse(self):
        self.split()
        with contextlib.redirect_stdout(io.StringIO()):
            transport.assemble(self.root); transport.assemble(self.root)
        self.assertEqual((self.root / transport.RENDER).read_bytes(), self.content)

    def test_missing_and_corrupt_chunks_fail_before_output(self):
        self.split(); part = self.root / (transport.RENDER + '.part01')
        part.write_bytes(b'corrupt')
        with self.assertRaises(ValueError): transport.assemble(self.root)
        self.assertFalse((self.root / transport.RENDER).exists())
        part.unlink()
        with self.assertRaises(ValueError): transport.assemble(self.root)

    def test_traversal_descriptor_rejected(self):
        self.split(); p = self.root / 'manifest.json'; data = json.loads(p.read_text())
        data['transfer']['renderParts'][0]['file'] = '../outside'; p.write_text(json.dumps(data))
        with self.assertRaises(ValueError): transport.assemble(self.root)

    def test_wrong_existing_archive_is_preserved(self):
        self.split(); p = self.root / transport.RENDER; p.write_bytes(b'preserve')
        with self.assertRaises(ValueError): transport.assemble(self.root)
        self.assertEqual(p.read_bytes(), b'preserve')

    def test_single_artifact_limit_fails_at_builder(self):
        self.manifest['layers']['source']['bytes'] = transport.SAFE_ARTIFACT_BYTES + 1
        (self.root / 'manifest.json').write_text(json.dumps(self.manifest))
        with self.assertRaises(ValueError): transport.split_render(self.root)

    def test_four_chunk_limit(self):
        with self.assertRaises(ValueError): transport.split_render(self.root, chunk_bytes=1)


if __name__ == '__main__': unittest.main()
