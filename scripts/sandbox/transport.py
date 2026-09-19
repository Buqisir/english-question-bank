#!/usr/bin/env python3
"""Chunk the renderer below the connector's 512 MiB per-artifact limit."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

CHUNK_BYTES = 256 * 1024**2
MAX_PARTS = 4
SAFE_ARTIFACT_BYTES = 480 * 1024**2
RENDER = 'render-rootfs.tar.gz'


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def matches(path, item):
    return (path.is_file() and not path.is_symlink()
            and path.stat().st_size == item['bytes'] and digest(path) == item['sha256'])


def split_render(folder, chunk_bytes=CHUNK_BYTES):
    folder = Path(folder)
    manifest_path = folder / 'manifest.json'
    data = json.loads(manifest_path.read_text())
    for key in ('source', 'node', *(['launcher'] if 'launcher' in data['layers'] else [])):
        if data['layers'][key]['bytes'] > SAFE_ARTIFACT_BYTES:
            raise ValueError(key + ' layer exceeds the bounded connector payload size')
    parts = []
    if data['profile'] == 'render':
        item = data['layers']['render']
        source = folder / RENDER
        if item['file'] != RENDER or not matches(source, item):
            raise ValueError('renderer changed before splitting')
        if not 0 < item['bytes'] <= chunk_bytes * MAX_PARTS:
            raise ValueError('renderer exceeds four bounded chunks')
        with source.open('rb') as reader:
            for index in range((item['bytes'] + chunk_bytes - 1) // chunk_bytes):
                name = f'{RENDER}.part{index:02}'
                remaining = min(chunk_bytes, item['bytes'] - index * chunk_bytes)
                with (folder / name).open('xb') as writer:
                    while remaining:
                        block = reader.read(min(1024 * 1024, remaining))
                        if not block:
                            raise ValueError('truncated renderer while splitting')
                        writer.write(block); remaining -= len(block)
                parts.append({'file': name, 'bytes': (folder / name).stat().st_size,
                              'sha256': digest(folder / name)})
    data['transfer'] = {'version': 1, 'renderParts': parts}
    manifest_path.write_text(json.dumps(data, indent=2) + '\n')
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(f'renderPartCount={len(parts)}\n')
    print(json.dumps(data['transfer']))


def assemble(folder):
    folder = Path(folder)
    data = json.loads((folder / 'manifest.json').read_text())
    if data['profile'] == 'node':
        return
    item = data['layers']['render']
    if item['file'] != RENDER:
        raise ValueError('wrong renderer filename')
    destination = folder / RENDER
    if destination.exists() or destination.is_symlink():
        if not matches(destination, item):
            raise ValueError('refusing to overwrite a different existing renderer')
        print('REUSED verified renderer archive'); return
    transfer = data.get('transfer', {})
    parts = transfer.get('renderParts', [])
    if transfer.get('version') != 1 or not 1 <= len(parts) <= MAX_PARTS:
        raise ValueError('missing bounded renderer transfer descriptor')
    if sum(part['bytes'] for part in parts) != item['bytes']:
        raise ValueError('renderer part lengths do not match')
    for index, part in enumerate(parts):
        if part['file'] != f'{RENDER}.part{index:02}' or not 0 < part['bytes'] <= CHUNK_BYTES:
            raise ValueError('unsafe part descriptor')
        if not matches(folder / part['file'], part):
            raise ValueError('missing or corrupt renderer part')
    # Validate all parts before assembling. Publish without overwriting another task.
    fd, temporary_name = tempfile.mkstemp(prefix='.render-assembling-', dir=folder)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, 'wb') as writer:
            for part in parts:
                with (folder / part['file']).open('rb') as reader:
                    shutil.copyfileobj(reader, writer)
        if not matches(temporary, item):
            raise ValueError('assembled renderer digest mismatch')
        os.link(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    print('ASSEMBLED verified renderer archive')



# Receiver metadata comes from the authorized GitHub connector, never from a URL
# embedded in repository content. This module deliberately has no HTTP client.
def require(ok, message):
    if not ok:
        raise ValueError(message)


def publish_verified(source, destination, item):
    """Publish validated bytes without overwriting an existing task/cache file."""
    destination = Path(destination)
    if destination.exists() or destination.is_symlink():
        require(matches(destination, item), 'different existing file: ' + destination.name)
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    # A copy, not a shared writable hardlink: callers may edit their input files.
    fd, name = tempfile.mkstemp(prefix='.verified-', dir=destination.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as writer, Path(source).open('rb') as reader:
            shutil.copyfileobj(reader, writer)
        require(matches(temporary, item), 'source changed during publication')
        try:
            os.link(temporary, destination)
        except FileExistsError:
            require(matches(destination, item), 'concurrent different destination')
    finally:
        temporary.unlink(missing_ok=True)


def from_local_or_cache(folder, cache, item):
    destination = folder / item['file']
    if destination.exists() or destination.is_symlink():
        require(matches(destination, item), 'corrupt existing input: ' + item['file'])
        return True
    if cache is not None:
        cached = cache / ('archive-' + item['sha256'])
        if cached.exists() or cached.is_symlink():
            require(matches(cached, item), 'corrupt cached input: ' + item['file'])
            publish_verified(cached, destination, item)
            return True
    return False


def receive_plan(folder, run, artifacts, target, base, bridge_sha, cache=None):
    """Bind one successful natural run; request only missing, exact-byte layers."""
    import datetime
    import re
    import bridge

    folder = Path(folder).resolve()
    cache = Path(cache).resolve() if cache else None
    data = json.loads((folder / 'manifest.json').read_text())
    require(type(run.get('id')) is int and type(run.get('run_attempt')) is int
            and run['id'] > 0 and run['run_attempt'] > 0, 'invalid run identity')
    require(run.get('repository', {}).get('full_name') == bridge.REPO
            and run['repository'].get('id') == 1240662826, 'wrong run repository')
    require(run.get('event') == 'push' and run.get('head_branch') == 'sandbox-sync/source-bridge'
            and run.get('head_sha') == bridge_sha
            and run.get('path') == '.github/workflows/sandbox-source-bridge.yml', 'wrong run source')
    require(run.get('status') == 'completed' and run.get('conclusion') == 'success', 'run is not successful')
    bridge.validate_manifest(data, target, bridge_sha, run['id'], base, run['run_attempt'])
    require(type(artifacts) is list, 'artifact metadata must be a list')

    source_key = target + '-' + base
    require(data.get('sourceKey') == source_key, 'wrong source key')
    for key in ('nodeKey', 'renderKey', 'launcherKey'):
        if key in data:
            require(re.fullmatch(r'[A-Za-z0-9_.-]{1,220}', data[key]), 'unsafe layer key')

    files = [(data['layers']['source'], '^sandbox-source-' + re.escape(source_key) + '$'),
             (data['layers']['node'], '^sandbox-node-' + re.escape(data['nodeKey']) + '$')]
    reused = []
    if data['profile'] == 'render':
        files.append((data['layers']['launcher'], '^sandbox-launcher-' + re.escape(data['launcherKey']) + '$'))
        whole = data['layers']['render']
        if from_local_or_cache(folder, cache, whole):
            reused.append(whole['file'])
        else:
            transfer = data.get('transfer', {})
            parts = transfer.get('renderParts', [])
            require(transfer.get('version') == 1 and 1 <= len(parts) <= MAX_PARTS, 'missing render chunks')
            require(sum(p['bytes'] for p in parts) == whole['bytes'], 'wrong chunk total')
            for index, part in enumerate(parts):
                require(part.get('file') == f'{RENDER}.part{index:02}'
                        and type(part.get('bytes')) is int and 0 < part['bytes'] <= CHUNK_BYTES
                        and re.fullmatch(r'[a-f0-9]{64}', part.get('sha256', '')), 'unsafe chunk descriptor')
                files.append((part, '^sandbox-render-' + f'{index:02}-' + re.escape(data['renderKey']) + r'-[a-f0-9]{64}$'))
    required = []
    for item, name_pattern in files:
        if from_local_or_cache(folder, cache, item):
            reused.append(item['file'])
            continue
        candidates = [a for a in artifacts if re.fullmatch(name_pattern, a.get('name', ''))]
        require(len(candidates) == 1, 'missing or ambiguous artifact: ' + item['file'])
        a = candidates[0]
        provenance = a.get('workflow_run', {})
        require(provenance.get('id') == run['id']
                and provenance.get('repository_id') == 1240662826
                and provenance.get('head_repository_id') == 1240662826
                and provenance.get('head_sha') == bridge_sha
                and provenance.get('head_branch') == run['head_branch'], 'wrong artifact provenance')
        expires = datetime.datetime.fromisoformat(a.get('expires_at', '').replace('Z', '+00:00'))
        require(expires.tzinfo is not None and not a.get('expired', True)
                and expires > datetime.datetime.now(datetime.timezone.utc), 'expired artifact')
        require(type(a.get('id')) is int and a['id'] > 0
                and type(a.get('size_in_bytes')) is int and 0 < a['size_in_bytes'] <= 512 * 1024**2
                and re.fullmatch(r'sha256:[a-f0-9]{64}', a.get('digest', '')), 'invalid artifact digest/size')
        required.append({'artifactId': a['id'], 'artifactName': a['name'],
                         'zipSha256': a['digest'].removeprefix('sha256:'), 'zipBytes': a['size_in_bytes'],
                         'payload': item,
                         'download': {'repo_full_name': bridge.REPO, 'artifact_id': a['id'],
                                      'file_name': f"eqb-artifact-{a['id']}.zip"}})
    result = {'schemaVersion': 1, 'manifestSha256': digest(folder / 'manifest.json'),
              'targetSha': target, 'baseSha': base, 'bridgeSha': bridge_sha,
              'runId': run['id'], 'runAttempt': run['run_attempt'],
              'reused': reused, 'required': required,
              'downloadBytes': sum(x['zipBytes'] for x in required)}
    print(json.dumps(result, indent=2))
    return result


def ingest(folder, plan, artifact_id, archive, cache=None):
    """Validate both ZIP and payload digests, then publish one expected member."""
    import re
    import stat
    import zipfile

    folder = Path(folder).resolve()
    archive = Path(archive)
    require(plan.get('schemaVersion') == 1
            and plan.get('manifestSha256') == digest(folder / 'manifest.json'), 'stale download plan')
    choices = [x for x in plan.get('required', []) if x.get('artifactId') == artifact_id]
    require(len(choices) == 1, 'artifact is not uniquely requested')
    expected = choices[0]
    item = expected['payload']
    require(item['file'] in ('source.bundle', 'node-deps.tar.gz', 'launcher.tar.gz')
            or re.fullmatch(r'render-rootfs\.tar\.gz\.part0[0-3]', item['file']), 'unsafe payload path')
    require(type(item['bytes']) is int and 0 < item['bytes'] <= SAFE_ARTIFACT_BYTES
            and re.fullmatch(r'[a-f0-9]{64}', item['sha256']), 'invalid payload descriptor')
    require(matches(archive, {'bytes': expected['zipBytes'], 'sha256': expected['zipSha256']}), 'outer ZIP integrity failure')
    fd, name = tempfile.mkstemp(prefix='.ingesting-', dir=folder)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as writer, zipfile.ZipFile(archive) as z:
            members = z.infolist()
            require(len(members) == 1, 'unexpected extra ZIP entries')
            info = members[0]
            require(info.filename == item['file'] and info.file_size == item['bytes']
                    and not info.is_dir() and not stat.S_ISLNK(info.external_attr >> 16)
                    and not info.flag_bits & 1, 'wrong ZIP member/type/size')
            size = 0
            with z.open(info) as reader:
                for block in iter(lambda: reader.read(1024 * 1024), b''):
                    size += len(block)
                    require(size <= item['bytes'], 'oversized decoded payload')
                    writer.write(block)
        require(matches(temporary, item), 'inner payload integrity failure')
        if cache:
            publish_verified(temporary, Path(cache).resolve() / ('archive-' + item['sha256']), item)
        publish_verified(temporary, folder / item['file'], item)
    finally:
        temporary.unlink(missing_ok=True)
    print('INGESTED verified ' + item['file'])


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation', choices=('split', 'assemble', 'needed', 'ingest'))
    p.add_argument('folder')
    for name in ('run', 'artifacts', 'target', 'base', 'bridge', 'cache', 'plan', 'archive'):
        p.add_argument('--' + name)
    p.add_argument('--artifact-id', type=int)
    args = p.parse_args()
    try:
        if args.operation in ('split', 'assemble'):
            (split_render if args.operation == 'split' else assemble)(args.folder)
        elif args.operation == 'needed':
            require(all((args.run, args.artifacts, args.target, args.base, args.bridge)), 'needed requires run/artifacts/target/base/bridge')
            run_data = json.loads(Path(args.run).read_text())
            artifact_data = json.loads(Path(args.artifacts).read_text())
            receive_plan(args.folder, run_data, artifact_data['artifacts'], args.target, args.base, args.bridge, args.cache)
        else:
            require(args.plan and args.archive and args.artifact_id, 'ingest requires plan/archive/artifact-id')
            ingest(args.folder, json.loads(Path(args.plan).read_text()), args.artifact_id, args.archive, args.cache)
    except (ValueError, KeyError, OSError, TypeError) as error:
        raise SystemExit('BLOCKED: ' + str(error))
