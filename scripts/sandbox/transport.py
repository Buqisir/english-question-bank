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
    for key in ('source', 'node'):
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


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation', choices=('split', 'assemble'))
    p.add_argument('folder')
    args = p.parse_args()
    try:
        (split_render if args.operation == 'split' else assemble)(args.folder)
    except (ValueError, KeyError, OSError, TypeError) as error:
        raise SystemExit('BLOCKED: ' + str(error))
