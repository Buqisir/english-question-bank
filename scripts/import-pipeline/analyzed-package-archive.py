#!/usr/bin/env python3
"""Read an analyzed-package ZIP without trusting its paths or size headers.

This is archive admission only, not semantic QA or permission to publish.
The destination must not exist. All entries are checked before any are written.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import zipfile


MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_ENTRIES = 1024


def fail(message):
    raise ValueError(message)


def checked_name(name):
    if (
        not name
        or len(name) > 240
        or "\\" in name
        or ":" in name
        or any(ord(char) < 32 for char in name)
        or any(part in ("", ".", "..") for part in name.split("/"))
    ):
        fail(f"Unsafe archive path: {name!r}")
    return name


def inspect_archive(archive):
    if Path(archive).stat().st_size > MAX_ARCHIVE_BYTES:
        fail("Archive exceeds 256 MiB")
    files = []
    seen = set()
    total = 0
    with zipfile.ZipFile(archive) as package:
        entries = package.infolist()
        if not entries or len(entries) > MAX_ENTRIES:
            fail("Archive must contain 1–1024 entries")
        for entry in entries:
            if entry.orig_filename != entry.filename:
                fail("Archive path contains a NUL character")
            name = checked_name(entry.filename.rstrip("/") if entry.is_dir() else entry.filename)
            identity = name.casefold()
            if identity in seen:
                fail(f"Duplicate archive path: {name}")
            seen.add(identity)
            mode = entry.external_attr >> 16
            kind = stat.S_IFMT(mode)
            if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                fail(f"Archive entry is not a regular file or directory: {name}")
            if (kind == stat.S_IFDIR) != entry.is_dir() and kind != 0:
                fail(f"Archive entry type disagrees with its path: {name}")
            if entry.flag_bits & 1:
                fail(f"Encrypted archive entry: {name}")
            if entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                fail(f"Unsupported compression: {name}")
            if entry.is_dir():
                continue
            if entry.file_size > MAX_FILE_BYTES:
                fail(f"File exceeds 64 MiB: {name}")
            total += entry.file_size
            if total > MAX_TOTAL_BYTES:
                fail("Expanded archive exceeds 256 MiB")
            files.append((name, entry))
        names = {name.casefold() for name, _ in files}
        for name, _ in files:
            parts = name.split("/")
            if any("/".join(parts[:index]).casefold() in names for index in range(1, len(parts))):
                fail(f"File/directory path collision: {name}")
        if "package.json" not in {name for name, _ in files}:
            fail("package.json must be at the archive root")
        result = []
        for name, entry in files:
            digest = hashlib.sha256()
            size = 0
            with package.open(entry) as stream:
                while block := stream.read(1024 * 1024):
                    size += len(block)
                    if size > min(entry.file_size, MAX_FILE_BYTES):
                        fail(f"Expanded file exceeds its declared size: {name}")
                    digest.update(block)
            if size != entry.file_size:
                fail(f"File size mismatch: {name}")
            result.append({"path": name, "byteLength": size, "sha256": "sha256:" + digest.hexdigest()})
    return result


def unpack_archive(archive, destination):
    # Snapshot once: inspection and extraction must consume the same bytes even
    # if another process replaces the original upload during validation.
    destination = Path(destination)
    if destination.exists() or destination.is_symlink():
        fail("Destination already exists; finalized data must not be overwritten")
    if not destination.parent.is_dir():
        fail("Destination parent must exist")
    if Path(archive).stat().st_size > MAX_ARCHIVE_BYTES:
        fail("Archive exceeds 256 MiB")
    with tempfile.TemporaryDirectory(prefix="eqb-package-") as scratch:
        snapshot = Path(scratch) / "input.zip"
        with open(archive, "rb") as source, snapshot.open("xb") as target:
            size = 0
            while block := source.read(1024 * 1024):
                size += len(block)
                if size > MAX_ARCHIVE_BYTES:
                    fail("Archive exceeds 256 MiB")
                target.write(block)
        files = inspect_archive(snapshot)
        temporary = Path(tempfile.mkdtemp(prefix=".eqb-package-", dir=destination.parent))
        try:
            with zipfile.ZipFile(snapshot) as package:
                for entry in files:
                    output = temporary / entry["path"]
                    output.parent.mkdir(parents=True, exist_ok=True)
                    with package.open(entry["path"]) as source, output.open("xb") as target:
                        shutil.copyfileobj(source, target, 1024 * 1024)
            # mkdir is the no-overwrite latch, including concurrent callers.
            destination.mkdir()
            try:
                for child in temporary.iterdir():
                    os.rename(child, destination / child.name)
            except BaseException:
                shutil.rmtree(destination)
                raise
        finally:
            shutil.rmtree(temporary)
    return files


def create_archive(source, destination):
    source = Path(source)
    destination = Path(destination)
    if not source.is_dir() or destination.exists():
        fail("Create source must be a directory and destination must not exist")
    paths = sorted(item for item in source.rglob("*") if item.is_file())
    if not paths or len(paths) > MAX_ENTRIES:
        fail("Archive must contain 1–1024 files")
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for item in paths:
            relative = item.relative_to(source).as_posix()
            checked_name(relative)
            package.write(item, relative)
    # The admission checker, rather than the writer, is authoritative.
    return inspect_archive(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", nargs="?")
    parser.add_argument("--destination")
    parser.add_argument("--create-from")
    args = parser.parse_args()
    try:
        if args.create_from:
            if not args.archive or args.destination:
                fail("Create requires --create-from SOURCE DESTINATION")
            files = create_archive(args.create_from, args.archive)
        else:
            if not args.archive:
                fail("Archive path is required")
            files = unpack_archive(args.archive, args.destination) if args.destination else inspect_archive(args.archive)
        print(json.dumps({"ok": True, "stage": "archive", "files": files}, ensure_ascii=False))
    except (ValueError, OSError, zipfile.BadZipFile, RuntimeError, NotImplementedError) as error:
        print(json.dumps({"ok": False, "stage": "archive", "message": str(error)}, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
