"""Named failures: wrong provenance, path traversal, cache/input ambiguity and exit masking."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import bridge


class Contracts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.request = {'schemaVersion': 2, 'targetSha': 'a' * 40, 'baseSha': 'b' * 40,
                        'profile': 'render', 'requestId': 'probe-1'}

    def archive(self, entries):
        p = self.root / 'test.tar.gz'
        with tarfile.open(p, 'w:gz') as tar:
            for name, kind, value in entries:
                item = tarfile.TarInfo(name)
                if kind == 'file':
                    item.size = len(value); item.mode = 0o755
                    tar.addfile(item, io.BytesIO(value))
                elif kind == 'symlink':
                    item.type = tarfile.SYMTYPE; item.linkname = value; tar.addfile(item)
                elif kind == 'hardlink':
                    item.type = tarfile.LNKTYPE; item.linkname = value; tar.addfile(item)
                else:
                    item.type = tarfile.CHRTYPE; tar.addfile(item)
        return p

    def test_valid_immutable_request(self):
        self.assertEqual(bridge.request(self.request), self.request)

    def test_mutable_refs_and_shell_payloads_rejected(self):
        for bad in ['main', 'HEAD^', 'refs/pull/478/head', 'a' * 39, 'A' * 40, 'a' * 40 + '\n', '$(id)']:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                bridge.request({**self.request, 'targetSha': bad})

    def test_unknown_profile_fields_and_request_ids_rejected(self):
        for changes in [{'profile': 'shell'}, {'requestId': '../../x'}, {'requestId': 'x\ny'}, {'extra': True}, {'schemaVersion': 1}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                bridge.request({**self.request, **changes})

    def test_safe_executable_and_relative_symlink(self):
        p = self.archive([('bin/tool', 'file', b'hello'), ('bin/link', 'symlink', 'tool')])
        bridge.safe_extract(p, self.root / 'out')
        self.assertEqual((self.root / 'out/bin/link').read_bytes(), b'hello')
        self.assertTrue((self.root / 'out/bin/tool').stat().st_mode & 0o111)

    def test_path_traversal_absolute_duplicate_and_device_rejected(self):
        cases = [[('../escape', 'file', b'x')], [('/escape', 'file', b'x')],
                 [('a', 'file', b'1'), ('a', 'file', b'2')], [('dev/x', 'device', '')], [('.bridge-complete', 'file', b'forged')]]
        for entries in cases:
            with self.subTest(entries=entries), self.assertRaises(ValueError):
                bridge.safe_extract(self.archive(entries), self.root / 'out')
            self.assertFalse((self.root / 'out').exists())

    def test_escaping_symlinks_rejected_for_node_layer(self):
        for target in ['/tmp', '../../outside']:
            with self.subTest(target=target), self.assertRaises(ValueError):
                bridge.safe_extract(self.archive([('bin/a', 'symlink', target)]), self.root / 'out')

    def test_rootfs_absolute_link_allowed_but_never_followed_while_extracting(self):
        outside = self.root / 'outside'; outside.mkdir()
        p = self.archive([('escape', 'symlink', str(outside)), ('escape/new/link', 'symlink', '/etc')])
        with self.assertRaises(ValueError):
            bridge.safe_extract(p, self.root / 'out', rootfs=True)
        self.assertEqual(list(outside.iterdir()), [])

    def test_rootfs_link_preserved(self):
        bridge.safe_extract(self.archive([('lib', 'symlink', '/usr/lib')]), self.root / 'out', rootfs=True)
        self.assertEqual(os.readlink(self.root / 'out/lib'), '/usr/lib')

    def test_hardlink_and_setuid_stripping(self):
        p = self.archive([('a', 'file', b'ok'), ('b', 'hardlink', 'a')])
        bridge.safe_extract(p, self.root / 'out')
        self.assertEqual((self.root / 'out/a').stat().st_ino, (self.root / 'out/b').stat().st_ino)
        self.assertFalse((self.root / 'out/a').stat().st_mode & 0o6000)

    def test_existing_destination_is_not_removed(self):
        out = self.root / 'out'; out.mkdir(); (out / 'keep').write_text('keep')
        with self.assertRaises(ValueError):
            bridge.safe_extract(self.archive([('a', 'file', b'x')]), out)
        self.assertEqual((out / 'keep').read_text(), 'keep')

    def manifest(self):
        return {**self.request, 'repository': bridge.REPO, 'bridgeSha': 'c' * 40, 'runId': '123', 'runAttempt': '1',
                'workflow': '.github/workflows/sandbox-source-bridge.yml', 'architecture': 'x86_64',
                'nodeVersion': bridge.NODE, 'pnpmVersion': bridge.PNPM, 'prootCommit': bridge.PROOT,
                'layers': {k: {'file': v, 'sha256': 'd' * 64, 'bytes': 100} for k, v in bridge.FILES.items()}}

    def test_exact_manifest_binding(self):
        bridge.validate_manifest(self.manifest(), 'a' * 40, 'c' * 40, '123', 'b' * 40, '1')
        for key, bad in [('targetSha', 'b' * 40), ('bridgeSha', 'f' * 40), ('runId', '124'), ('runAttempt', '2'), ('baseSha', 'e' * 40),
                         ('repository', 'another/repo'), ('architecture', 'arm64'), ('workflow', 'other.yml')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                bridge.validate_manifest({**self.manifest(), key: bad}, 'a' * 40, 'c' * 40, '123', 'b' * 40, '1')

    def test_missing_layer_bad_path_and_digest_rejected(self):
        for kind in ['missing', 'path', 'digest', 'size']:
            data = copy.deepcopy(self.manifest())
            if kind == 'missing': del data['layers']['render']
            if kind == 'path': data['layers']['source']['file'] = '../x'
            if kind == 'digest': data['layers']['source']['sha256'] = 'xx'
            if kind == 'size': data['layers']['source']['bytes'] = -1
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                bridge.validate_manifest(data, 'a' * 40, 'c' * 40, '123', 'b' * 40, '1')

    def test_digest_detects_tamper(self):
        p = self.root / 'data'; p.write_bytes(b'before'); old = bridge.digest(p)
        p.write_bytes(b'after'); self.assertNotEqual(old, bridge.digest(p))

    def test_node_profile_does_not_require_render(self):
        data = self.manifest(); data['profile'] = 'node'; del data['layers']['render']; del data['layers']['launcher']
        bridge.validate_manifest(data, 'a' * 40, 'c' * 40, '123', 'b' * 40, '1')

    def test_native_nonzero_exit_is_not_success(self):
        work = self.root / 'work'; work.mkdir()
        subprocess.run(['git', 'init', '-q', str(work)], check=True)
        subprocess.run(['git', '-C', str(work), '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture', '--allow-empty'], check=True)
        sha = bridge.git(work, 'rev-parse', 'HEAD')
        state = self.root / 'state.json'
        state.write_text(json.dumps({'workspace': str(work), 'layers': {'node': str(self.root)}, 'manifest': {'targetSha': sha}}))
        args = type('Args', (), {'state': str(state), 'engine': 'native', 'timeout': 10, 'command': ['/bin/sh', '-c', 'exit 7']})()
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as caught:
            bridge.run(args)
        self.assertEqual(caught.exception.code, 7)


if __name__ == '__main__':
    unittest.main()
