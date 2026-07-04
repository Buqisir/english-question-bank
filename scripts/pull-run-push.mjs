#!/usr/bin/env node
// launch-deploy Slice 4 — pull-run-push.mjs
//
// The local-only transport for "import new real exam papers": pull the
// server's question-bank.sqlite down, run the local import pipeline against
// it, push the updated library back up. This is NOT part of the running
// product — it's an ops tool the owner runs by hand around the import
// pipeline (scripts/import-pipeline/README.md). A mistake here can
// overwrite/corrupt years of curated question-bank data, so every step is
// deliberately explicit (no `data/` globbing, no in-place writes).
//
// docs/cuts/launch-deploy/plan.md — PM 拍板 #7, Slice 4, PA 裁决 R1/R2 (MF-1/MF-2).
//
// ── Locked recipe (do not reorder) ──────────────────────────────────────────
// push:
//   1. Manifest assertion (MF-2): explicit transfer list, abort if any
//      basename matches /user-data/i.
//   2. Local question-bank.sqlite must exist + pass PRAGMA integrity_check.
//   3. EQB_SERVICE_STOP on remote (frees nothing — journal_mode=delete, no
//      long-held handle — but flushes the server's startup-time in-memory
//      indexes/route cache; see import-pipeline/README.md:29-31 precedent).
//   4. Backup remote OLD db to a timestamped path (offline cp, service is
//      stopped).
//   5. Transfer local db -> remote TEMP path in the same dir as the final
//      (never the live path itself — 禁原位写, MF-1).
//   6. Remote atomic `mv` temp -> final (same-filesystem rename replaces the
//      inode in one syscall); rsync new paper-assets additively.
//   7. EQB_SERVICE_START on remote.
//
// pull:
//   1. Manifest assertion.
//   2. Remote ONLINE `.backup` snapshot of question-bank.sqlite to a remote
//      temp path (never cp the live db — the remote server may be running).
//   3. Transfer that single snapshot + paper-assets/ to local temp; back up
//      the local old db (timestamped), then move the snapshot into place.
//   4. Never touch remote or local user-data.sqlite (or any *.sqlite-*
//      sidecar) at any point.
//
// ── Remote dispatch (the VA5 test seam) ─────────────────────────────────────
// EQB_REMOTE selects one of two schemes:
//   - `user@host` / `ssh://user@host` -> REAL mode: remote commands run via
//     `ssh user@host <argv-joined>`; file transfer via rsync to
//     `user@host:path`.
//   - `local:<abs-dir>` -> TEST mode: <abs-dir> IS the remote repo root on
//     the local fs. "Remote" commands spawn locally with cwd=<abs-dir>
//     (no ssh); transfers use local rsync/cp. This is the fake-remote seam
//     VA5 drives.
//
// EQB_REMOTE_REPO overrides the remote repo path in ssh mode (default
// /opt/eqb/english-question-bank). In local: mode the <abs-dir> after
// `local:` IS the repo root, so EQB_REMOTE_REPO is ignored there.
//
// EQB_LOCAL_REPO overrides the LOCAL repo root (default: this script's own
// repo, resolved via `git rev-parse --show-toplevel`). This is the override
// the fake-remote test uses to point "local" at a throwaway fixture dir
// instead of the real working tree.
//
// EQB_SERVICE_STOP / EQB_SERVICE_START (default `sudo systemctl stop|start
// eqb`) are run through the SAME dispatch as remote commands (ssh in real
// mode, local shell in `local:` mode) so the VA5 test can inject logging
// shell commands here to prove ordering.
//
// Usage:
//   node scripts/pull-run-push.mjs check-manifest <comma,separated,paths>
//   node scripts/pull-run-push.mjs pull
//   node scripts/pull-run-push.mjs push
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Manifest guard (MF-2) ────────────────────────────────────────────────────
// Basename REGEX (not exact-string) match so it also catches
// user-data.sqlite-journal / -wal / any future rename that still contains
// "user-data" in the basename.
const USER_DATA_BASENAME_RE = /user-data/i

function basenameOf(p) {
  // Path may be a directory with a trailing slash; strip it before taking
  // the last segment so "app/public/paper-assets/" -> "paper-assets".
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx === -1 ? trimmed : trimmed.slice(idx + 1)
}

// Returns the list of offending paths (empty = clean).
function assertManifest(paths) {
  return paths.filter((p) => USER_DATA_BASENAME_RE.test(basenameOf(p)))
}

function fail(message) {
  console.error(`\n[pull-run-push] FAILED: ${message}`)
  process.exitCode = 1
}

// The two, and only two, explicitly-named transfer targets (MF-2 / R2):
// never a `data/` glob.
const QUESTION_BANK_REL = 'data/question-bank.sqlite'
const PAPER_ASSETS_REL = 'app/public/paper-assets'

function runManifestGateOrExit(paths, label) {
  const offenders = assertManifest(paths)
  if (offenders.length > 0) {
    fail(
      `manifest assertion (${label}) found user-data-like path(s), aborting before any transfer: ${offenders.join(', ')}`,
    )
    process.exit(1)
  }
  console.log(`[pull-run-push] manifest assertion (${label}) clean: ${paths.join(', ')}`)
}

// ── Repo root resolution ─────────────────────────────────────────────────────
function resolveLocalRepoRoot() {
  if (process.env.EQB_LOCAL_REPO) return resolve(process.env.EQB_LOCAL_REPO)
  const startDir = dirname(fileURLToPath(import.meta.url))
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: startDir,
      encoding: 'utf8',
    }).trim()
  } catch {
    return resolve(startDir, '..')
  }
}

// ── Remote spec dispatch ─────────────────────────────────────────────────────
function parseRemoteSpec() {
  const spec = process.env.EQB_REMOTE
  if (!spec) {
    fail('EQB_REMOTE is required (either "user@host" / "ssh://user@host", or "local:<abs-dir>" for test mode)')
    process.exit(1)
  }
  if (spec.startsWith('local:')) {
    const dir = spec.slice('local:'.length)
    if (!dir) {
      fail('EQB_REMOTE=local: requires an absolute directory after the prefix')
      process.exit(1)
    }
    return { mode: 'local', repoRoot: resolve(dir) }
  }
  const sshTarget = spec.startsWith('ssh://') ? spec.slice('ssh://'.length) : spec
  const repoRoot = process.env.EQB_REMOTE_REPO || '/opt/eqb/english-question-bank'
  return { mode: 'ssh', sshTarget, repoRoot }
}

// Run a command on the "remote" (ssh in real mode, local spawn with cwd in
// `local:` mode). `command` is a single shell-command STRING (not an argv
// array) because EQB_SERVICE_STOP/START and internal recipe steps (mv,
// .backup, mkdir -p) are expressed as one shell line, and ssh itself takes
// a single command string to run remotely. This is fine here because the
// command originates from this script's own locked recipe or from an
// operator-supplied env var (trusted config, not untrusted user input) —
// never from unsanitized external data.
function runRemote(remote, command, { allowFailure = false } = {}) {
  let result
  if (remote.mode === 'local') {
    result = spawnSync('sh', ['-c', command], { cwd: remote.repoRoot, encoding: 'utf8', stdio: 'inherit' })
  } else {
    result = spawnSync('ssh', [remote.sshTarget, command], { encoding: 'utf8', stdio: 'inherit' })
  }
  if (result.status !== 0 && !allowFailure) {
    fail(`remote command failed (exit ${result.status}): ${command}`)
    process.exit(1)
  }
  return result
}

function remotePath(remote, relPath) {
  return join(remote.repoRoot, relPath)
}

// Transfer a single file or directory from local fs into the remote target.
// `isDir` uses rsync -a with a trailing slash (contents-of semantics);
// single files use rsync too (works uniformly for both `local:` fixture
// paths and real remote scp-style targets), never a raw shell-interpolated
// cp/scp string — always execFileSync with an argv array.
function transferToRemote(remote, localAbsPath, remoteRelPath, { isDir = false } = {}) {
  if (remote.mode === 'local') {
    const destAbs = remotePath(remote, remoteRelPath)
    mkdirSync(dirname(destAbs), { recursive: true })
    const src = isDir ? `${localAbsPath.replace(/\/+$/, '')}/` : localAbsPath
    const dest = isDir ? `${destAbs.replace(/\/+$/, '')}/` : destAbs
    if (isDir) mkdirSync(destAbs, { recursive: true })
    execFileSync('rsync', ['-a', src, dest], { encoding: 'utf8' })
  } else {
    const destAbs = remotePath(remote, remoteRelPath)
    // Ensure destination directory exists on the real remote before rsync.
    runRemote(remote, `mkdir -p ${shellQuote(dirname(destAbs))}${isDir ? ` ${shellQuote(destAbs)}` : ''}`)
    const src = isDir ? `${localAbsPath.replace(/\/+$/, '')}/` : localAbsPath
    const dest = `${remote.sshTarget}:${isDir ? `${destAbs.replace(/\/+$/, '')}/` : destAbs}`
    execFileSync('rsync', ['-a', src, dest], { encoding: 'utf8' })
  }
}

// Transfer a single remote file down to a local absolute path.
function transferFromRemote(remote, remoteRelPath, localAbsPath, { isDir = false } = {}) {
  mkdirSync(dirname(localAbsPath), { recursive: true })
  if (isDir) mkdirSync(localAbsPath, { recursive: true })
  if (remote.mode === 'local') {
    const srcAbs = remotePath(remote, remoteRelPath)
    const src = isDir ? `${srcAbs.replace(/\/+$/, '')}/` : srcAbs
    const dest = isDir ? `${localAbsPath.replace(/\/+$/, '')}/` : localAbsPath
    execFileSync('rsync', ['-a', src, dest], { encoding: 'utf8' })
  } else {
    const srcAbs = remotePath(remote, remoteRelPath)
    const src = `${remote.sshTarget}:${isDir ? `${srcAbs.replace(/\/+$/, '')}/` : srcAbs}`
    const dest = isDir ? `${localAbsPath.replace(/\/+$/, '')}/` : localAbsPath
    execFileSync('rsync', ['-a', src, dest], { encoding: 'utf8' })
  }
}

// Minimal POSIX shell quoting for the few remote-command strings we build
// ourselves (paths under our control, not external input).
function shellQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

// ── push ─────────────────────────────────────────────────────────────────────
function push() {
  const remote = parseRemoteSpec()
  const localRepo = resolveLocalRepoRoot()
  const localDb = join(localRepo, QUESTION_BANK_REL)
  const localAssets = join(localRepo, PAPER_ASSETS_REL)

  // 1. Manifest assertion — before ANY transfer.
  runManifestGateOrExit([QUESTION_BANK_REL, PAPER_ASSETS_REL], 'push')

  // 2. Local db must exist and pass integrity_check.
  if (!existsSync(localDb)) {
    fail(`local question-bank.sqlite not found at ${localDb}`)
    process.exit(1)
  }
  const integrity = spawnSync('sqlite3', [localDb, 'PRAGMA integrity_check'], { encoding: 'utf8' })
  if (integrity.stdout.trim() !== 'ok') {
    fail(`local question-bank.sqlite failed PRAGMA integrity_check (got: ${integrity.stdout.trim() || integrity.stderr.trim()}) — refusing to push a corrupt db`)
    process.exit(1)
  }
  console.log('[pull-run-push] local question-bank.sqlite passes integrity_check')

  const stamp = timestamp()
  const remoteFinal = remotePath(remote, QUESTION_BANK_REL)
  const remoteBackup = `${remoteFinal}.bak.${stamp}`
  const remoteIncoming = `${remoteFinal}.incoming.${stamp}`

  // 3. Stop the service BEFORE any swap (flush startup-time in-memory
  //    indexes/route cache on the NEXT start — see import-pipeline README).
  const stopCmd = process.env.EQB_SERVICE_STOP || 'sudo systemctl stop eqb'
  console.log(`[pull-run-push] stopping remote service: ${stopCmd}`)
  runRemote(remote, stopCmd)

  // 4. Backup the remote OLD db (offline cp — service is stopped, this is
  //    the one place a plain cp of question-bank.sqlite is safe).
  console.log(`[pull-run-push] backing up remote old db -> ${remoteBackup}`)
  runRemote(remote, `cp ${shellQuote(remoteFinal)} ${shellQuote(remoteBackup)}`)

  // 5. Transfer local db -> remote TEMP path (same dir as final, never the
  //    final path itself — 禁原位写).
  console.log(`[pull-run-push] transferring local db -> remote temp ${remoteIncoming}`)
  transferToRemote(remote, localDb, `${QUESTION_BANK_REL}.incoming.${stamp}`)

  // 6. Atomic same-filesystem rename replaces the final db in one syscall.
  console.log('[pull-run-push] atomic mv temp -> final on remote')
  runRemote(remote, `mv ${shellQuote(remoteIncoming)} ${shellQuote(remoteFinal)}`)

  // Sync new paper-assets additively (not the live-swap concern).
  if (existsSync(localAssets)) {
    console.log('[pull-run-push] syncing paper-assets (additive)')
    transferToRemote(remote, localAssets, PAPER_ASSETS_REL, { isDir: true })
  } else {
    console.log('[pull-run-push] local paper-assets dir not found, skipping asset sync')
  }

  // 7. Start the service.
  const startCmd = process.env.EQB_SERVICE_START || 'sudo systemctl start eqb'
  console.log(`[pull-run-push] starting remote service: ${startCmd}`)
  runRemote(remote, startCmd)

  console.log('[pull-run-push] push complete.')
}

// ── pull ─────────────────────────────────────────────────────────────────────
function pull() {
  const remote = parseRemoteSpec()
  const localRepo = resolveLocalRepoRoot()
  const localDb = join(localRepo, QUESTION_BANK_REL)
  const localAssets = join(localRepo, PAPER_ASSETS_REL)

  // 1. Manifest assertion — before ANY transfer.
  runManifestGateOrExit([QUESTION_BANK_REL, PAPER_ASSETS_REL], 'pull')

  const stamp = timestamp()
  const remoteFinal = remotePath(remote, QUESTION_BANK_REL)
  const remoteSnapshotRel = `${QUESTION_BANK_REL}.snapshot.${stamp}`
  const remoteSnapshotAbs = remotePath(remote, remoteSnapshotRel)

  // 2. Remote ONLINE .backup snapshot (never cp the live db — it may be
  //    served by a running process on the real remote).
  console.log(`[pull-run-push] taking remote online .backup snapshot -> ${remoteSnapshotAbs}`)
  runRemote(remote, `sqlite3 ${shellQuote(remoteFinal)} ${shellQuote(`.backup '${remoteSnapshotAbs}'`)}`)

  // 3. Land the snapshot on a LOCAL temp path IN THE SAME DIRECTORY as the
  //    live db, so the final swap is a same-filesystem atomic `mv` (rename)
  //    rather than a cross-fs copy — symmetric with push's remote swap, and
  //    it removes the reliance on "the local API happens to be stopped".
  mkdirSync(dirname(localDb), { recursive: true })
  const localIncoming = `${localDb}.incoming.${stamp}`
  try {
    console.log('[pull-run-push] transferring remote snapshot -> local temp (same dir as db)')
    transferFromRemote(remote, remoteSnapshotRel, localIncoming)

    // Integrity-gate the pulled snapshot BEFORE it can replace the live local
    // db — refuse to swap in a corrupt/truncated transfer (symmetric with
    // push's pre-transfer integrity_check). On failure remove the temp
    // ourselves — process.exit() does not run the finally block below.
    const integrity = spawnSync('sqlite3', [localIncoming, 'PRAGMA integrity_check'], { encoding: 'utf8' })
    if (integrity.stdout.trim() !== 'ok') {
      if (existsSync(localIncoming)) rmSync(localIncoming, { force: true })
      fail(`pulled snapshot failed PRAGMA integrity_check (got: ${integrity.stdout.trim() || integrity.stderr.trim()}) — refusing to replace the local db`)
      process.exit(1)
    }
    console.log('[pull-run-push] pulled snapshot passes integrity_check')

    // Back up the LOCAL old db (timestamped) before the swap.
    if (existsSync(localDb)) {
      const localBackup = `${localDb}.bak.${stamp}`
      console.log(`[pull-run-push] backing up local old db -> ${localBackup}`)
      execFileSync('cp', [localDb, localBackup], { encoding: 'utf8' })
    }
    console.log('[pull-run-push] atomic mv snapshot -> local db')
    execFileSync('mv', [localIncoming, localDb], { encoding: 'utf8' })

    // paper-assets/ (additive, not part of the atomic-swap concern).
    console.log('[pull-run-push] transferring paper-assets (additive)')
    transferFromRemote(remote, PAPER_ASSETS_REL, localAssets, { isDir: true })
  } finally {
    // If we threw before the mv consumed it, don't leave a temp in data/.
    if (existsSync(localIncoming)) rmSync(localIncoming, { force: true })
  }

  // Clean up the remote snapshot temp file (it was a throwaway transfer
  // artifact, not the live db — not a "禁原位写" concern).
  runRemote(remote, `rm -f ${shellQuote(remoteSnapshotAbs)}`, { allowFailure: true })

  console.log('[pull-run-push] pull complete.')
}

// ── check-manifest ───────────────────────────────────────────────────────────
function checkManifest(argv) {
  const raw = argv[0]
  if (!raw) {
    fail('check-manifest requires a comma-separated path list argument')
    process.exit(1)
  }
  const paths = raw.split(',').map((p) => p.trim()).filter(Boolean)
  const offenders = assertManifest(paths)
  if (offenders.length > 0) {
    fail(`manifest contains user-data-like basename(s): ${offenders.join(', ')}`)
    process.exit(1)
  }
  console.log(`[pull-run-push] check-manifest: clean (${paths.join(', ')})`)
}

// ── CLI dispatch ──────────────────────────────────────────────────────────────
function main() {
  const [sub, ...rest] = process.argv.slice(2)
  switch (sub) {
    case 'check-manifest':
      checkManifest(rest)
      break
    case 'pull':
      pull()
      break
    case 'push':
      push()
      break
    default:
      fail(`unknown subcommand: ${sub || '(none)'} — expected pull | push | check-manifest`)
      console.error('Usage: node scripts/pull-run-push.mjs <pull|push|check-manifest> [args]')
      process.exit(1)
  }
}

main()
