#!/usr/bin/env python3
"""Private source bridge. Python stdlib only; never installs into the host OS.

Trust starts with GitHub's authenticated run/artifact metadata, not this manifest.
The receiver checks digests, exact source refs, architecture and archive paths.
PRoot is a compatibility layer, NOT a security boundary for hostile programs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
import uuid

REPO = 'Buqisir/english-question-bank'
NODE = '24.21.0'
PNPM = '10.28.1'
SHA = re.compile(r'[a-f0-9]{40}')
DIGEST = re.compile(r'[a-f0-9]{64}')
FILES = {'source': 'source.bundle', 'node': 'node-deps.tar.gz', 'render': 'render-rootfs.tar.gz'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def request(value):
    require(set(value) == {'schemaVersion', 'targetSha', 'baseSha', 'profile', 'requestId'}, 'unknown/missing request fields')
    require(value['schemaVersion'] == 2, 'wrong request version')
    for key in ['targetSha', 'baseSha']:
        require(isinstance(value[key], str) and SHA.fullmatch(value[key]), 'explicit immutable SHA required: ' + key)
    require(value['profile'] in ('node', 'render'), 'profile must be node or render')
    require(isinstance(value['requestId'], str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', value['requestId']), 'invalid requestId')
    return value


def plan(root):
    root = Path(root).resolve()
    req = request(json.loads((root / '.github/sandbox-source-request.json').read_text()))
    for key in ['targetSha', 'baseSha']:
        require(git(root, 'rev-parse', req[key] + '^{commit}') == req[key], 'commit not available')
    policy = hashlib.sha256()
    for p in [root / '.github/workflows/sandbox-source-bridge.yml', *sorted((root / 'scripts/sandbox').glob('*'))]:
        if p.is_file():
            policy.update(p.name.encode() + b'\0' + p.read_bytes())
    inputs = hashlib.sha256()
    paths = ['app/package.json', 'app/pnpm-lock.yaml', 'server/package.json', 'server/package-lock.json']
    for p in paths:
        inputs.update(p.encode() + b'\0' + git(root, 'show', req['targetSha'] + ':' + p).encode())
    # Local installs/hooks can depend on arbitrary source files: never reuse across trees.
    app = json.loads(git(root, 'show', req['targetSha'] + ':app/package.json'))
    server = json.loads(git(root, 'show', req['targetSha'] + ':server/package.json'))
    tracked = git(root, 'ls-tree', '-r', '--name-only', req['targetSha']).splitlines()
    special = any(p in ('package.json', '.npmrc', '.pnpmfile.cjs', 'pnpm-workspace.yaml',
                            'app/.npmrc', 'app/.pnpmfile.cjs', 'app/pnpm-workspace.yaml', 'server/.npmrc')
                  or p.startswith(('patches/', 'app/patches/', 'server/patches/')) for p in tracked)
    for package in [app, server]:
        special |= any(k in package.get('scripts', {}) for k in ('preinstall', 'install', 'postinstall', 'prepare'))
        special |= any(str(v).startswith(('file:', 'link:', 'workspace:'))
                       for group in ('dependencies', 'devDependencies', 'optionalDependencies')
                       for v in package.get(group, {}).values())
    if special:
        inputs.update(git(root, 'rev-parse', req['targetSha'] + '^{tree}').encode())
    pw = app.get('devDependencies', {}).get('playwright')
    require(isinstance(pw, str) and re.fullmatch(r'\d+\.\d+\.\d+', pw), 'Playwright must be exactly pinned')
    # Include an explicit recipe revision and weekly OS refresh; actual bytes get SHA-256.
    common = f'v2-ubuntu2404-x64-node{NODE}-pnpm{PNPM}-' + digest(root / '.github/workflows/sandbox-source-bridge.yml')[:16]
    render_recipe = digest(root / 'scripts/sandbox/build-render.sh')[:24]
    result = {**req, 'repository': REPO, 'nodeVersion': NODE, 'pnpmVersion': PNPM,
              'playwrightVersion': pw, 'sourceKey': req['targetSha'] + '-' + req['baseSha'],
              'nodeKey': common + '-' + inputs.hexdigest()[:24],
              'renderKey': 'v2-ubuntu2404-x64-pw' + pw + '-' + render_recipe + '-' + time.strftime('%Y-W%W', time.gmtime()),
              'policySha256': policy.hexdigest(), 'architecture': 'x86_64'}
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            for k, v in result.items():
                f.write(f'{k}={v}\n')
    print(json.dumps(result, indent=2))


def manifest(plan_file, output):
    data = json.loads(Path(plan_file).read_text())
    data['schemaVersion'] = 2
    data['bridgeSha'] = os.environ['GITHUB_SHA']
    data['runId'] = os.environ['GITHUB_RUN_ID']
    data['runAttempt'] = os.environ['GITHUB_RUN_ATTEMPT']
    data['workflow'] = '.github/workflows/sandbox-source-bridge.yml'
    data['layers'] = {}
    for name, filename in FILES.items():
        p = Path(output) / filename
        if name == 'render' and data['profile'] == 'node':
            continue
        require(p.is_file(), 'missing layer: ' + filename)
        data['layers'][name] = {'file': filename, 'sha256': digest(p), 'bytes': p.stat().st_size}
    data['validation'] = 'Transport manifest only. No product test/CI success is asserted.'
    (Path(output) / 'manifest.json').write_text(json.dumps(data, indent=2) + '\n')


def safe_extract(archive, destination, rootfs=False):
    """Extract into a NEW directory. Symlinks last; never write through archive links."""
    destination = Path(destination)
    require(not destination.exists(), 'extraction destination already exists')
    destination.mkdir(parents=True)
    try:
        with tarfile.open(archive) as tar:
            members = tar.getmembers()
            require(len(members) <= 300000 and sum(m.size for m in members) <= 8 * 1024**3, 'oversized archive')
            links = []
            seen = set()
            for member in members:
                p = PurePosixPath(member.name)
                require(not p.is_absolute() and '..' not in p.parts, 'unsafe archive path')
                if str(p) == '.':
                    continue
                require(str(p) != '.bridge-complete', 'reserved cache marker')
                require(str(p) not in seen, 'duplicate archive path')
                seen.add(str(p))
                target = destination / str(p)
                require(member.isdir() or member.isfile() or member.issym() or member.islnk(), 'special archive entry rejected')
                if member.issym() or member.islnk():
                    links.append(member)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                if member.isdir():
                    target.mkdir(exist_ok=True)
                else:
                    with tar.extractfile(member) as src, target.open('xb') as dst:
                        shutil.copyfileobj(src, dst)
                    target.chmod(member.mode & 0o777)  # never restore setuid/setgid
            # Hardlinks before symlinks. All link parents must remain real directories.
            for member in sorted(links, key=lambda m: m.issym()):
                target = destination / str(PurePosixPath(member.name))
                require(all(not parent.is_symlink() for parent in target.parents if parent != destination.parent), 'symlink parent')
                target.parent.mkdir(parents=True, exist_ok=True)
                require(not target.exists() and not target.is_symlink(), 'link overlaps a directory/file')
                require(all(not parent.is_symlink() for parent in target.parents if parent != destination.parent), 'symlink parent')
                link = PurePosixPath(member.linkname)
                if member.islnk():
                    require(not link.is_absolute() and '..' not in link.parts, 'unsafe hardlink')
                    source = destination / str(link)
                    require(source.is_file() and not source.is_symlink(), 'hardlink source unavailable')
                    os.link(source, target)
                else:
                    if not rootfs:
                        resolved = (target.parent / member.linkname).resolve()
                        require(not link.is_absolute() and resolved.is_relative_to(destination.resolve()), 'escaping symlink')
                    # Absolute rootfs symlinks are interpreted only inside PRoot.
                    target.symlink_to(member.linkname)
    except BaseException:
        shutil.rmtree(destination)
        raise


def validate_manifest(data, target, bridge, run_id, base, attempt):
    require(data.get('schemaVersion') == 2 and data.get('repository') == REPO, 'wrong manifest repository/schema')
    require(data.get('targetSha') == target and SHA.fullmatch(target), 'wrong target SHA')
    require(data.get('bridgeSha') == bridge and SHA.fullmatch(bridge), 'wrong bridge SHA')
    require(str(data.get('runId')) == str(run_id), 'wrong Actions run')
    require(data.get('workflow') == '.github/workflows/sandbox-source-bridge.yml', 'wrong workflow')
    require(data.get('baseSha') == base and SHA.fullmatch(base), 'wrong base SHA')
    require(str(data.get('runAttempt')) == str(attempt), 'wrong run attempt')
    require(data.get('architecture') == 'x86_64' and platform.system() == 'Linux'
            and platform.machine() == 'x86_64', 'unsupported receiver platform')
    require(data.get('nodeVersion') == NODE and data.get('pnpmVersion') == PNPM, 'runtime version drift')
    expected = {'source', 'node', 'render'} if data.get('profile') == 'render' else {'source', 'node'}
    require(data.get('profile') in ('node', 'render') and set(data.get('layers', {})) == expected, 'incomplete layer set')
    for name, item in data['layers'].items():
        require(item.get('file') == FILES[name] and DIGEST.fullmatch(item.get('sha256', '')), 'bad layer descriptor')
        require(isinstance(item.get('bytes'), int) and 0 < item['bytes'] <= 4 * 1024**3, 'bad layer size')


def restore(args):
    data = json.loads(Path(args.manifest).read_text())
    validate_manifest(data, args.target, args.bridge, args.run_id, args.base, args.attempt)
    destination = Path(args.destination).resolve()
    require(not destination.exists(), 'refusing to overwrite an existing worktree')
    cache = Path(args.cache).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    # Verify ALL supplied layer bytes before executing Git or any bundled program.
    for name, item in data['layers'].items():
        p = Path(args.inputs) / item['file']
        require(p.is_file() and p.stat().st_size == item['bytes'] and digest(p) == item['sha256'], 'layer integrity failure: ' + name)
    paths = {}
    for name in ('node', 'render'):
        if name not in data['layers']:
            continue
        item = data['layers'][name]
        path = cache / (name + '-' + item['sha256'])
        if path.exists():
            require((path / '.bridge-complete').read_text().strip() == item['sha256'], 'incomplete cached extraction')
        else:
            staging = cache / (name + '-partial-' + uuid.uuid4().hex)
            safe_extract(Path(args.inputs) / item['file'], staging, rootfs=name == 'render')
            (staging / '.bridge-complete').write_text(item['sha256'] + '\n')
            try:
                staging.rename(path)
            except OSError:
                shutil.rmtree(staging)
                require((path / '.bridge-complete').read_text().strip() == item['sha256'], 'cache publication collision')
        paths[name] = str(path)
    source = (Path(args.inputs) / 'source.bundle').resolve()
    try:
        subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', 'clone', '--branch', 'sandbox-target', str(source), str(destination)], check=True)
        subprocess.run(['git', '-C', str(destination), 'fetch', str(source), 'refs/heads/sandbox-base:refs/remotes/origin/main'], check=True)
        require(git(destination, 'rev-parse', 'HEAD') == args.target, 'source HEAD mismatch')
        require(git(destination, 'rev-parse', 'origin/main') == data['baseSha'], 'source base mismatch')
        git(destination, 'config', 'core.hooksPath', '/dev/null')
        git(destination, 'update-ref', 'refs/heads/main', data['baseSha'])
        git(destination, 'remote', 'set-url', 'origin', 'https://github.com/' + REPO + '.git')
        # Copy dependencies: do not let tests contaminate a shared layer cache.
        for sub in ('app/node_modules', 'server/node_modules'):
            require(not (destination / sub).exists(), 'tracked node_modules are unsupported')
            shutil.copytree(Path(paths['node']) / sub, destination / sub, symlinks=True)
        require(not git(destination, 'status', '--porcelain'), 'restored checkout is not clean')
        state = {'manifest': data, 'layers': paths, 'workspace': str(destination)}
        state_path = destination.parent / (destination.name + '.bridge.json')
        require(not state_path.exists() and not state_path.is_symlink(), 'state file already exists')
        state_path.write_text(json.dumps(state, indent=2) + '\n')
        print('RESTORED', state_path)
    except BaseException:
        if destination.exists():
            shutil.rmtree(destination)
        raise


def run(args):
    state = json.loads(Path(args.state).read_text())
    require(args.command, 'missing command after --')
    work = Path(state['workspace']).resolve()
    runtime = Path(state['layers']['node']) / 'runtime'
    require(git(work, 'rev-parse', 'HEAD') == state['manifest']['targetSha'], 'HEAD changed; create a new state before changing commits')
    session = Path(tempfile.mkdtemp(prefix='eqb-bridge-run-', dir=work.parent))
    (session / 'home').mkdir(); (session / 'tmp').mkdir()
    receipt = session / 'exit-code'
    env = {'HOME': str(session / 'home'), 'TMPDIR': str(session / 'tmp'),
           'PATH': str(runtime / 'bin') + ':/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8', 'TZ': 'UTC'}
    if args.engine == 'native':
        command = args.command
    else:
        require('render' in state['layers'], 'render profile was not downloaded')
        rootfs = Path(state['layers']['render'])
        loader = rootfs / 'opt/eqb-launcher/ld-linux-x86-64.so.2'
        launcher = rootfs / 'opt/eqb-launcher'
        tooling = Path(__file__).resolve().parent
        command = [str(loader), '--library-path', str(launcher), str(launcher / 'proot'),
                   '-0', '-r', str(rootfs), '-b', '/dev', '-b', '/proc', '-b', '/sys',
                   '-b', str(work) + ':/workspace', '-b', str(runtime) + ':/runtime',
                   '-b', str(session) + ':/opt/eqb-state', '-b', str(session / 'home') + ':/root',
                   '-b', str(session / 'tmp') + ':/tmp', '-b', str(tooling) + ':/opt/eqb-tooling',
                   '-w', '/workspace', '/usr/bin/env', '-i', 'HOME=/root', 'TMPDIR=/tmp',
                   'PATH=/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                   'LANG=C.UTF-8', 'TZ=UTC', 'PLAYWRIGHT_BROWSERS_PATH=/opt/eqb-browsers',
                   '/bin/bash', '-c', '"$@"; rc=$?; printf "%s\\n" "$rc" > /opt/eqb-state/exit-code; exit "$rc"',
                   'eqb-command', *args.command]
    started = time.monotonic()
    process = subprocess.Popen(command, cwd=work, env=env, start_new_session=True)
    result = 125
    try:
        while time.monotonic() - started < args.timeout:
            code = process.poll()
            if args.engine == 'native' and code is not None:
                result = code; break
            if receipt.exists():
                text = receipt.read_text().strip()
                if re.fullmatch(r'\d{1,3}', text):
                    result = int(text); break
            if code is not None:
                result = code if code != 0 else 125; break
            time.sleep(0.2)
        else:
            result = 124
    finally:
        # Only our newly-created process group. No pkill/killall or host services.
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(process.pid, sig)
            except ProcessLookupError:
                pass
            if sig == signal.SIGTERM:
                time.sleep(0.5)
        process.wait()
        report = {'engine': args.engine, 'targetSha': state['manifest']['targetSha'],
                  'command': args.command, 'exitCode': result,
                  'elapsedSeconds': round(time.monotonic() - started, 3),
                  'host': platform.platform(),
                  'worktreeStatus': git(work, 'status', '--porcelain'),
                  'trackedDiffSha256': hashlib.sha256(subprocess.check_output(['git', '-C', str(work), 'diff', '--binary', 'HEAD'])).hexdigest(),
                  'receipt': str(receipt) if receipt.exists() else None}
        (session / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report), flush=True)
    raise SystemExit(result if 0 <= result <= 255 else 125)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='op', required=True)
    p = sub.add_parser('plan'); p.add_argument('root')
    p = sub.add_parser('manifest'); p.add_argument('plan_file'); p.add_argument('output')
    p = sub.add_parser('restore')
    for name in ('manifest', 'inputs', 'destination', 'cache', 'target', 'bridge', 'run-id', 'base', 'attempt'):
        p.add_argument('--' + name, required=True)
    p = sub.add_parser('run'); p.add_argument('--state', required=True)
    p.add_argument('--engine', choices=('native', 'render'), default='render')
    p.add_argument('--timeout', type=int, default=600)
    p.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.op == 'plan': plan(args.root)
    elif args.op == 'manifest': manifest(args.plan_file, args.output)
    elif args.op == 'restore': restore(args)
    else:
        if args.command[:1] == ['--']: args.command = args.command[1:]
        run(args)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit('BLOCKED: ' + str(error))
