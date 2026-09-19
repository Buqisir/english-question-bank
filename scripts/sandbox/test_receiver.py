"""Named failures: wrong run, stale bytes, redundant transfer and unsafe ZIPs."""
import contextlib
import copy
import datetime
import hashlib
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile
import bridge
import transport


class Receiver(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.inputs = self.root / 'inputs'; self.inputs.mkdir()
        self.cache = self.root / 'cache'
        self.target = 'a' * 40; self.base = 'b' * 40; self.bridge = 'c' * 40
        self.run = {'id': 123, 'run_attempt': 1,
                    'repository': {'id': 1240662826, 'full_name': bridge.REPO},
                    'event': 'push', 'head_branch': 'sandbox-sync/source-bridge',
                    'head_sha': self.bridge, 'path': '.github/workflows/sandbox-source-bridge.yml',
                    'status': 'completed', 'conclusion': 'success'}
        self.data = {'schemaVersion': 2, 'repository': bridge.REPO, 'targetSha': self.target,
                     'baseSha': self.base, 'bridgeSha': self.bridge, 'runId': '123',
                     'runAttempt': '1', 'workflow': self.run['path'], 'architecture': 'x86_64',
                     'nodeVersion': bridge.NODE, 'pnpmVersion': bridge.PNPM,
                     'profile': 'node', 'sourceKey': self.target + '-' + self.base,
                     'nodeKey': 'node-test-key', 'renderKey': 'render-test-key',
                     'launcherKey': 'launcher-test-key', 'prootCommit': bridge.PROOT, 'layers': {}}
        self.artifacts = []; self.archives = {}
        self.layer('source', 'source.bundle', b'exact source', 'sandbox-source-' + self.data['sourceKey'])
        self.layer('node', 'node-deps.tar.gz', b'exact runtime', 'sandbox-node-node-test-key')
        self.save()

    def layer(self, key, filename, payload, name):
        item = {'file': filename, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
        self.data['layers'][key] = item
        aid = 100 + len(self.artifacts)
        archive = self.root / f'{aid}.zip'
        with zipfile.ZipFile(archive, 'w') as z: z.writestr(filename, payload)
        meta = {'id': aid, 'name': name, 'size_in_bytes': archive.stat().st_size,
                'digest': 'sha256:' + transport.digest(archive), 'expired': False,
                'expires_at': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).isoformat(),
                'workflow_run': {'id': 123, 'repository_id': 1240662826, 'head_repository_id': 1240662826,
                                 'head_sha': self.bridge, 'head_branch': 'sandbox-sync/source-bridge'}}
        self.artifacts.append(meta); self.archives[aid] = archive
        return item

    def save(self):
        (self.inputs / 'manifest.json').write_text(json.dumps(self.data))

    def plan(self, **changes):
        args = dict(folder=self.inputs, run=self.run, artifacts=self.artifacts, target=self.target,
                    base=self.base, bridge_sha=self.bridge, cache=self.cache)
        args.update(changes)
        with contextlib.redirect_stdout(io.StringIO()): return transport.receive_plan(**args)

    def ingest(self, plan, aid=100):
        with contextlib.redirect_stdout(io.StringIO()):
            transport.ingest(self.inputs, plan, aid, self.archives.get(aid, self.archives[100]), self.cache)

    def test_select_only_required_artifacts_and_no_signed_urls(self):
        p = self.plan()
        self.assertEqual([x['artifactId'] for x in p['required']], [100, 101])
        self.assertEqual(p['downloadBytes'], sum(x['size_in_bytes'] for x in self.artifacts))
        self.assertNotIn('https:', json.dumps(p))
        self.assertEqual(p['required'][0]['download']['repo_full_name'], bridge.REPO)

    def test_end_to_end_ingest_reuse_no_redundant_download(self):
        p = self.plan()
        self.ingest(p); self.ingest(p, 101)
        self.assertEqual((self.inputs / 'source.bundle').read_bytes(), b'exact source')
        self.assertEqual(self.plan()['required'], [])
        self.assertEqual(self.plan()['downloadBytes'], 0)
        (self.inputs / 'source.bundle').unlink(); (self.inputs / 'node-deps.tar.gz').unlink()
        self.assertEqual(self.plan(artifacts=[])['required'], [])
        self.assertEqual((self.inputs / 'source.bundle').read_bytes(), b'exact source')

    def test_cache_copy_is_not_writable_hardlink_to_input(self):
        self.ingest(self.plan())
        item = self.data['layers']['source']; cached = self.cache / ('archive-' + item['sha256'])
        source = self.inputs / 'source.bundle'
        self.assertNotEqual(source.stat().st_ino, cached.stat().st_ino)
        source.write_bytes(b'mutated')
        self.assertEqual(cached.read_bytes(), b'exact source')

    def test_wrong_run_identity_and_nonterminal_state_rejected(self):
        cases = [('id', 124), ('run_attempt', 2), ('event', 'pull_request'), ('head_sha', 'd' * 40),
                 ('head_branch', 'main'), ('path', '.github/workflows/verify.yml'),
                 ('status', 'in_progress'), ('conclusion', 'failure'),
                 ('repository', {'id': 1, 'full_name': bridge.REPO})]
        for key, bad in cases:
            with self.subTest(key=key), self.assertRaises(ValueError): self.plan(run={**self.run, key: bad})

    def test_wrong_caller_target_base_and_bridge_rejected(self):
        for key in ('target', 'base', 'bridge_sha'):
            with self.subTest(key=key), self.assertRaises(ValueError): self.plan(**{key: 'e' * 40})

    def test_wrong_artifact_origin_and_expiry_rejected(self):
        for key, bad in [('id', 124), ('repository_id', 1), ('head_repository_id', 1),
                         ('head_sha', 'e' * 40), ('head_branch', 'wrong')]:
            artifacts = copy.deepcopy(self.artifacts); artifacts[0]['workflow_run'][key] = bad
            with self.subTest(key=key), self.assertRaises(ValueError): self.plan(artifacts=artifacts)
        for changes in ({'expired': True}, {'expires_at': '2000-01-01T00:00:00Z'},
                        {'digest': None}, {'size_in_bytes': 1024**3}):
            with self.subTest(changes=changes), self.assertRaises((ValueError, TypeError)):
                self.plan(artifacts=[{**self.artifacts[0], **changes}, self.artifacts[1]])

    def test_missing_and_duplicate_artifact_rejected(self):
        for entries in (self.artifacts[1:], self.artifacts + [self.artifacts[0]]):
            with self.assertRaises(ValueError): self.plan(artifacts=entries)

    def test_corrupt_outer_zip_does_not_write_inputs(self):
        p = self.plan(); self.archives[100].write_bytes(b'wrong')
        with self.assertRaises(ValueError): self.ingest(p)
        self.assertFalse((self.inputs / 'source.bundle').exists())
        self.assertEqual(list(self.inputs.glob('.ingesting-*')), [])

    def rewrite_zip(self, entries):
        p = self.plan(); archive = self.archives[100]
        with zipfile.ZipFile(archive, 'w') as z:
            for filename, value in entries: z.writestr(filename, value)
        p['required'][0]['zipBytes'] = archive.stat().st_size
        p['required'][0]['zipSha256'] = transport.digest(archive)
        return p

    def test_inner_digest_mismatch_despite_valid_zip_digest_rejected(self):
        p = self.rewrite_zip([('source.bundle', b'wrong source')])
        with self.assertRaises(ValueError): self.ingest(p)
        self.assertFalse((self.inputs / 'source.bundle').exists())

    def test_extra_paths_traversal_and_symlinks_rejected(self):
        link = zipfile.ZipInfo('source.bundle'); link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        cases = [[('source.bundle', b'exact source'), ('extra', b'x')],
                 [('../escape', b'exact source')], [(link, b'exact source')]]
        for entries in cases:
            with self.subTest(entries=entries), self.assertRaises(ValueError): self.ingest(self.rewrite_zip(entries))
        self.assertFalse((self.root / 'escape').exists())

    def test_stale_plan_and_unrequested_artifact_rejected(self):
        p = self.plan(); self.data['requestId'] = 'changed'; self.save()
        with self.assertRaises(ValueError): self.ingest(p)
        with self.assertRaises(ValueError): self.ingest(self.plan(), 999)

    def test_different_existing_input_and_corrupt_cache_preserved(self):
        p = self.plan(); source = self.inputs / 'source.bundle'; source.write_bytes(b'keep')
        with self.assertRaises(ValueError): self.ingest(p)
        with self.assertRaises(ValueError): self.plan()
        self.assertEqual(source.read_bytes(), b'keep')
        source.unlink(); cached = self.cache / ('archive-' + self.data['layers']['source']['sha256'])
        cached.write_bytes(b'keep-cache')
        with self.assertRaises(ValueError): self.plan()
        self.assertEqual(cached.read_bytes(), b'keep-cache')

    def test_complete_render_cache_avoids_all_chunk_downloads(self):
        self.data['profile'] = 'render'
        self.layer('launcher', 'launcher.tar.gz', b'launcher', 'sandbox-launcher-launcher-test-key')
        whole = b'exact renderer'
        self.data['layers']['render'] = {'file': transport.RENDER, 'bytes': len(whole), 'sha256': hashlib.sha256(whole).hexdigest()}
        self.cache.mkdir(); (self.cache / ('archive-' + hashlib.sha256(whole).hexdigest())).write_bytes(whole)
        self.save(); p = self.plan()
        self.assertIn(transport.RENDER, p['reused'])
        self.assertEqual([x['artifactId'] for x in p['required']], [100, 101, 102])




class Resources(unittest.TestCase):
    def test_cgroup_limit_and_counter_parse(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            (root / 'memory.max').write_text('4294967296\n')
            (root / 'memory.current').write_text('123456\n')
            (root / 'memory.events').write_text('oom 7\noom_kill 1\n')
            (root / 'cpu.max').write_text('200000 100000\n')
            result = bridge.resource_snapshot(root)
            self.assertEqual(result['memoryLimitBytes'], 4294967296)
            self.assertEqual(result['memoryEvents']['oom_kill'], 1)
            self.assertEqual(result['cpuQuota'], 2)

    def test_unavailable_cgroup_is_unknown_not_success_or_error(self):
        with tempfile.TemporaryDirectory() as t:
            result = bridge.resource_snapshot(t)
            self.assertIsNone(result['memoryLimitBytes'])
            self.assertEqual(result['memoryEvents'], {})

    def test_unlimited_and_malformed_memory_values_stay_unknown(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            (root / 'memory.max').write_text('max\n')
            (root / 'memory.current').write_text('bad\n')
            self.assertIsNone(bridge.resource_snapshot(root)['memoryLimitBytes'])
            self.assertIsNone(bridge.resource_snapshot(root)['memoryCurrentBytes'])


class CommandExecution(unittest.TestCase):
    def invoke(self, command, timeout=5):
        import subprocess
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as t:
            root = Path(t); work = root / 'work'; work.mkdir()
            subprocess.run(['git', 'init', '-q', str(work)], check=True)
            subprocess.run(['git', '-C', str(work), '-c', 'user.name=bridge-test',
                            '-c', 'user.email=bridge-test@example.invalid', 'commit', '-qm',
                            'fixture', '--allow-empty'], check=True)
            sha = bridge.git(work, 'rev-parse', 'HEAD')
            state = root / 'state.json'
            state.write_text(json.dumps({'workspace': str(work), 'layers': {'node': str(root)},
                                         'manifest': {'targetSha': sha}}))
            args = SimpleNamespace(state=str(state), command=command, engine='native', timeout=timeout)
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as result:
                bridge.run(args)
            reports = list(root.glob('eqb-bridge-run-*/result.json'))
            self.assertEqual(len(reports), 1)
            report = json.loads(reports[0].read_text())
            self.assertIn('resourcesBefore', report)
            self.assertIn('sandboxOOMKillDelta', report)
            return result.exception.code, report

    def test_nonzero_exit_and_resource_report_survive(self):
        code, report = self.invoke(['/bin/sh', '-c', 'exit 7'])
        self.assertEqual(code, 7); self.assertEqual(report['exitCode'], 7)

    def test_deadline_is_not_a_success(self):
        code, report = self.invoke(['/bin/sh', '-c', 'sleep 30'], timeout=1)
        self.assertEqual(code, 124); self.assertEqual(report['exitCode'], 124)

    def test_serial_default_and_clean_environment(self):
        from unittest.mock import patch
        with patch.dict('os.environ', {'EQB_FAKE_SECRET_CANARY': 'must-not-leak'}):
            code, report = self.invoke(['/bin/sh', '-c',
                'test "$VERIFY_CONCURRENCY" = 1 && test -z "$EQB_FAKE_SECRET_CANARY"'])
        self.assertEqual(code, 0)
        self.assertEqual(report['verifyConcurrencyDefault'], 1)


if __name__ == '__main__': unittest.main()
