#!/usr/bin/env python3
"""Deduplicate finished paper files. Stop storage writers and readers before --apply."""

import argparse
from collections import Counter, defaultdict
import hashlib
import os
from pathlib import Path
import re
import stat


TEMP_PREFIXES = (".upload-", ".staging", ".candidate", ".owner-maintenance", ".sealed-publication-")
TEMP_SUFFIX = re.compile(r"\.(?:upload-|blob-|reuse-)[0-9a-f-]+$|\.[0-9a-f-]+\.tmp$")
DEDUP_SUFFIX = ".eqb-dedup-tmp"
DEDUP_TEMP = re.compile(rf"^\..+{re.escape(DEDUP_SUFFIX)}$")


def identity(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_uid, info.st_gid, info.st_mode)


def attributes(path):
    if not hasattr(os, "listxattr"):
        return ()
    return tuple((name, os.getxattr(path, name, follow_symlinks=False))
                 for name in sorted(os.listxattr(path, follow_symlinks=False)))


def hash_file(path, expected):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or identity(before) != identity(expected):
            raise ValueError("file changed")
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
        if os.fstat(fd).st_ctime_ns != before.st_ctime_ns or identity(path.lstat()) != identity(before):
            raise ValueError("file changed")
        return digest.digest()


def files_by_size(root, device, skipped, apply):
    sizes = defaultdict(list)
    mountinfo = Path("/proc/self/mountinfo")
    mounts = set()
    if mountinfo.exists():
        for line in mountinfo.read_text(errors="surrogateescape").splitlines():
            mounts.add(re.sub(r"\\([0-7]{3})", lambda m: chr(int(m[1], 8)), line.split()[4]))

    def scan_error(_error):
        skipped["scan error"] += 1

    for directory, dirs, files in os.walk(root, onerror=scan_error):
        children = set(dirs)
        dirs.clear()
        for name in sorted(children.union(files)):
            path = Path(directory, name)
            try:
                info = path.lstat()
                if stat.S_ISLNK(info.st_mode):
                    skipped["symbolic link"] += 1
                elif info.st_dev != device or str(path) in mounts or (name in children and path.is_mount()):
                    skipped["other mount"] += 1
                elif stat.S_ISREG(info.st_mode) and DEDUP_TEMP.fullmatch(name):
                    # A second name for this inode, including the final path, makes unlink safe.
                    if apply and info.st_nlink > 1:
                        print(f"Removing stale temporary link: {path}", flush=True)
                        path.unlink()
                    else:
                        skipped["dedup temporary link"] += 1
                elif name.startswith(TEMP_PREFIXES) or TEMP_SUFFIX.search(name) or name == "lost+found":
                    skipped["temporary or excluded path"] += 1
                elif name in children:
                    dirs.append(name)
                elif not stat.S_ISREG(info.st_mode):
                    skipped["non-regular file"] += 1
                elif info.st_size < 64 * 1024:
                    skipped["below 64 KiB"] += 1
                else:
                    sizes[info.st_size].append((path, info))
            except OSError:
                scan_error(None)
    return sizes


def replace_with_link(source, source_info, path, info, digest):
    if (hash_file(source, source_info) != digest or hash_file(path, info) != digest
            or attributes(source) != attributes(path)):
        raise ValueError("file changed")
    temporary = path.with_name(f".{path.name}{DEDUP_SUFFIX}")
    os.link(source, temporary, follow_symlinks=False)
    try:
        current = path.lstat()
        if identity(temporary.lstat()) != identity(source_info) or identity(current) != identity(info):
            raise ValueError("file changed")
        os.replace(temporary, path)
        return current.st_blocks * 512 if current.st_nlink == 1 else 0
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", type=Path, default=Path("/srv/eqb-paper-storage"))
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", dest="apply", action="store_false", default=False, help="estimate savings (default)")
    mode.add_argument("--apply", action="store_true", help="replace duplicate paths; stop the service first")
    args = parser.parse_args()
    if args.root.is_symlink() or not args.root.is_dir():
        parser.error("root must be an existing directory")
    root = args.root.resolve()
    if root == parser.get_default("root") and not root.is_mount():
        parser.error("default paper storage filesystem is not mounted")
    skipped = Counter()
    merged = saved = 0
    for candidates in files_by_size(root, root.stat().st_dev, skipped, args.apply).values():
        if len({info.st_ino for _, info in candidates}) < 2:
            skipped["no separate same-size inode"] += len(candidates)
            continue
        groups = defaultdict(list)
        hashes = {}
        for path, scanned in candidates:
            try:
                # An interrupted run may have left a link to this inode in another directory.
                info = path.lstat()
                if identity(info) != identity(scanned):
                    raise ValueError("file changed")
                if info.st_ino not in hashes:
                    hashes[info.st_ino] = hash_file(path, info)
                key = (hashes[info.st_ino], info.st_uid, info.st_gid, info.st_mode, attributes(path))
                groups[key].append((path, info))
            except (OSError, ValueError):
                skipped["read error or changed file"] += 1
        for (digest, *_), copies in groups.items():
            seen = Counter(info.st_ino for _, info in copies)
            sources = [entry for entry in copies if entry[1].st_nlink == seen[entry[1].st_ino]]
            if not sources:
                skipped["all inodes have unscanned links"] += len(copies)
                continue
            source, source_info = max(sources, key=lambda entry: entry[1].st_nlink)
            remaining_links = {}
            for path, info in copies:
                if info.st_ino == source_info.st_ino:
                    reason = "retained or already linked" if len(copies) > 1 else "no matching content and permissions"
                    skipped[reason] += 1
                    continue
                try:
                    if args.apply:
                        saved += replace_with_link(source, source_info, path, info, digest)
                    else:
                        remaining = remaining_links.get(info.st_ino, info.st_nlink) - 1
                        remaining_links[info.st_ino] = remaining
                        if remaining == 0:
                            saved += info.st_blocks * 512
                    merged += 1
                except (OSError, ValueError):
                    skipped["replace error or changed file"] += 1
    print(f"{'apply' if args.apply else 'dry-run'}: merged={merged}, saved_bytes={saved}, skipped={sum(skipped.values())}")
    for reason, count in sorted(skipped.items()):
        print(f"  {reason}: {count}")
    return int(any("error" in reason for reason in skipped))


if __name__ == "__main__":
    raise SystemExit(main())
