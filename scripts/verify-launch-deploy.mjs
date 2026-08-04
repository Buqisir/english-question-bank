/**
 * launch-deploy cut verify — Slice 1 (prod same-origin addressing) +
 * Slice 2 (deploy scaffolding: Caddy topology, systemd unit, .nvmrc, deploy.sh).
 *
 * Regression gate for the launch-critical fix: the frontend must never again
 * ship an absolute `http://127.0.0.1:8787` API origin (which broke the prod
 * build off localhost), and the Caddy reverse-proxy / SPA-fallback topology
 * must stay structurally correct.
 *
 * Slice 3 (R2 backup) has landed: VA6 below covers scripts/backup-to-r2.sh
 * (bash -n, rclone copy-not-sync, and a behavioral integrity_check run with
 * --dry-run against a temp fixture — no rclone binary required).
 * Slice 4 (pull-run-push) has landed: VA5 below covers
 * scripts/pull-run-push.mjs (node --check, a real abort-triggering
 * check-manifest run, and a full fake-remote push round-trip that proves
 * user-data.sqlite is byte-for-byte untouched, the question-bank swap is an
 * atomic rename (inode change, no leftover temp file), and the service stop
 * genuinely happens before the swap).
 *
 * Behavioral browser QA (LAN-host Caddy topology, relative addressing, SPA
 * deep-link fallback) was run manually at Slice 1/2 acceptance; this script is
 * the durable static/structural regression net around that result.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('launch-deploy verify (Slice 1+2+3+4)')

const ABSOLUTE_ORIGIN = 'http://127.0.0.1:8787'

// Assert on CODE, not comments: the httpClient top-comment legitimately
// narrates the retired API_ORIGIN / 127.0.0.1:8787 history, so strip comments
// before token checks.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

// ── Slice 1: production same-origin addressing ──────────────────────────────
section('Slice 1 — httpClient same-origin relative addressing')

const httpClient = readText(ROOT, 'app/src/services/httpClient.ts')
const httpClientCode = stripComments(httpClient)
assert(!httpClientCode.includes('API_ORIGIN'), 'httpClient.ts code no longer defines/uses API_ORIGIN')
assert(!httpClientCode.includes('127.0.0.1:8787'), 'httpClient.ts code has no absolute 127.0.0.1:8787 origin')
assert(/export function apiPath\(/.test(httpClient), 'apiPath export preserved')
assert(/export function apiPathNoIpv6\(/.test(httpClient), 'apiPathNoIpv6 export preserved (import-site stability)')
// apiPath must hand back the relative path unchanged in the browser (no host prepend).
assert(
  /export function apiPath\(path: string\) \{[^}]*return path[^}]*\}/s.test(httpClientCode),
  'apiPath returns the relative path (no host prepend)',
)

// No service file may reintroduce the absolute origin in code.
const servicesDir = resolve(ROOT, 'app/src/services')
const serviceFiles = readdirSync(servicesDir).filter((f) => f.endsWith('.ts'))
let offenders = []
for (const f of serviceFiles) {
  if (stripComments(readFileSync(resolve(servicesDir, f), 'utf8')).includes(ABSOLUTE_ORIGIN)) offenders.push(f)
}
assert(offenders.length === 0, `no app/src/services/*.ts code contains ${ABSOLUTE_ORIGIN} (offenders: ${offenders.join(', ') || 'none'})`)

// Bonus artifact check: if a prod build exists, the shipped bundle is clean.
const distAssets = resolve(ROOT, 'app/dist/assets')
if (existsSync(distAssets)) {
  const bundleOffenders = readdirSync(distAssets)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => readFileSync(resolve(distAssets, f), 'utf8').includes('127.0.0.1:8787'))
  assert(bundleOffenders.length === 0, `built bundle free of 127.0.0.1:8787 (offenders: ${bundleOffenders.join(', ') || 'none'})`)
} else {
  console.log('  · app/dist absent — skipping shipped-bundle grep (built in CI preflight)')
}

// ── Slice 2: Caddy reverse-proxy + SPA fallback topology ─────────────────────
section('Slice 2 — deploy/Caddyfile topology')

const caddyfile = readText(ROOT, 'deploy/Caddyfile')
for (const p of ['/api/*', '/paper-assets/*', '/user-space/*']) {
  assert(caddyfile.includes(`handle ${p}`), `Caddyfile routes ${p} in its own handle block`)
}
const reverseProxyCount = (caddyfile.match(/reverse_proxy 127\.0\.0\.1:8787/g) || []).length
assert(reverseProxyCount === 3, `Caddyfile has exactly 3 reverse_proxy → 127.0.0.1:8787 (found ${reverseProxyCount})`)
assert(caddyfile.includes('try_files {path} /index.html'), 'Caddyfile SPA fallback: try_files {path} /index.html')
assert(caddyfile.includes('file_server'), 'Caddyfile serves static via file_server')
// SW-3: reverse_proxy handles must precede the SPA fallback, or try_files swallows /api.
assert(
  caddyfile.lastIndexOf('reverse_proxy 127.0.0.1:8787') < caddyfile.indexOf('try_files'),
  'SW-3: reverse_proxy handles ordered before the SPA try_files fallback',
)
assert(/eqbank\.cc/.test(caddyfile), 'Caddyfile site address targets eqbank.cc')

// ── Slice 2: systemd unit + node pin + deploy script ─────────────────────────
section('Slice 2 — systemd unit / .nvmrc / deploy.sh')

const unit = readText(ROOT, 'deploy/eqb.service')
assert(/^User=eqb$/m.test(unit), 'eqb.service runs as User=eqb')
assert(/^Restart=/m.test(unit), 'eqb.service sets Restart=')
assert(unit.includes('--env-file-if-exists='), 'eqb.service loads .env via --env-file-if-exists')
assert(/ExecStart=.*server\/api\.mjs/.test(unit), 'eqb.service ExecStart launches server/api.mjs')
assert(unit.includes('WorkingDirectory=/opt/eqb/english-question-bank'), 'eqb.service WorkingDirectory pinned')

const nvmrc = readText(ROOT, '.nvmrc').trim()
assert(nvmrc === '24', `.nvmrc pins Node 24 (found "${nvmrc}")`)

const deploySh = readText(ROOT, 'scripts/deploy.sh')
const deployRemoteSh = readText(ROOT, 'scripts/deploy-remote.sh')
const chromiumSmoke = readText(ROOT, 'scripts/smoke-production-chromium.mjs')
const deployRunbook = readText(ROOT, 'docs/cuts/launch-deploy/runbook.md')
assert(deploySh.includes('/api/health'), 'deploy.sh smoke-checks /api/health after restart')
assert(/systemctl restart eqb/.test(deploySh), 'deploy.sh restarts the eqb service')
assert(/pnpm -C .*app.* build/.test(deploySh), 'deploy.sh builds the app')
assert(
  deploySh.includes('playwright install --no-shell chromium'),
  'deploy.sh installs the Playwright-matched full Chromium',
)
assert(
  deploySh.includes('smoke-production-chromium.mjs'),
  'deploy.sh launches Chromium and checks PDF bytes before restart',
)
assert(
  deploySh.includes('id -un') && deploySh.includes('!= "eqb"'),
  'deploy.sh requires the same eqb user that runs the systemd service',
)
assert(
  deployRemoteSh.includes('runuser -u eqb -- pnpm -C app exec playwright install --no-shell chromium'),
  'deploy-remote.sh installs Chromium as the eqb service user',
)
assert(
  deployRemoteSh.includes('runuser -u eqb -- node scripts/smoke-production-chromium.mjs'),
  'deploy-remote.sh runs the production Chromium smoke as the eqb service user',
)
assert(
  chromiumSmoke.includes("from '../server/draft-paper/chromiumPool.mjs'") &&
    chromiumSmoke.includes('page.pdf(') &&
    chromiumSmoke.includes("'%PDF-'"),
  'production Chromium smoke exercises the real pool and verifies PDF bytes',
)
assert(
  deployRunbook.includes('playwright install-deps chromium'),
  'first-time runbook installs Chromium system dependencies',
)
const runbookAppInstall = deployRunbook.indexOf('pnpm -C app install --frozen-lockfile')
const runbookSystemDeps = deployRunbook.indexOf('playwright install-deps chromium')
const runbookEqbBrowserSession = deployRunbook.lastIndexOf('sudo -iu eqb')
const runbookBrowserInstall = deployRunbook.indexOf('playwright install --no-shell chromium')
const runbookBrowserSmoke = deployRunbook.indexOf('node scripts/smoke-production-chromium.mjs')
assert(
  runbookAppInstall >= 0 &&
    runbookAppInstall < runbookSystemDeps &&
    runbookSystemDeps < runbookEqbBrowserSession &&
    runbookEqbBrowserSession < runbookBrowserInstall &&
    runbookBrowserInstall < runbookBrowserSmoke,
  'first-time runbook installs system deps, then downloads and smokes Chromium in an eqb login shell',
)
const bashCheck = spawnSync('bash', ['-n', resolve(ROOT, 'scripts/deploy.sh')], { encoding: 'utf8' })
assert(bashCheck.status === 0, `deploy.sh passes bash -n${bashCheck.stderr ? ' — ' + bashCheck.stderr.trim() : ''}`)
const remoteBashCheck = spawnSync('bash', ['-n', resolve(ROOT, 'scripts/deploy-remote.sh')], { encoding: 'utf8' })
assert(remoteBashCheck.status === 0, `deploy-remote.sh passes bash -n${remoteBashCheck.stderr ? ' — ' + remoteBashCheck.stderr.trim() : ''}`)

// ── Slice 3: backup-to-r2.sh (R2 daily backup) ───────────────────────────────
section('Slice 3 — backup-to-r2.sh')

const backupScriptPath = resolve(ROOT, 'scripts/backup-to-r2.sh')
const backupSh = readText(ROOT, 'scripts/backup-to-r2.sh')

const backupBashCheck = spawnSync('bash', ['-n', backupScriptPath], { encoding: 'utf8' })
assert(backupBashCheck.status === 0, `backup-to-r2.sh passes bash -n${backupBashCheck.stderr ? ' — ' + backupBashCheck.stderr.trim() : ''}`)

// SW-1: copy only adds; sync would let a local mis-delete propagate to the
// off-site copy. Strip full-line comments before checking so narrative
// mentions of "sync" in prose don't produce false positives/negatives.
const backupShCodeLines = backupSh
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
const backupShCode = backupShCodeLines.join('\n')
assert(/rclone\s+copy/.test(backupShCode), 'backup-to-r2.sh uses rclone copy (code, not just comments)')
assert(!/rclone\s+sync/.test(backupShCode), 'backup-to-r2.sh does not use rclone sync anywhere in code (SW-1)')

// Behavioral integrity_check: run the script's --dry-run path against a
// throwaway fixture (temp sqlite db + temp dirs) with no rclone installed,
// and confirm the snapshot IT wrote passes PRAGMA integrity_check.
const fixtureDir = mkdtempSync(join(tmpdir(), 'eqb-backup-verify-'))
try {
  const fixtureDb = join(fixtureDir, 'fixture.sqlite')
  const snapshotDir = join(fixtureDir, 'snapshots')
  const paperAssetRoot = join(fixtureDir, 'paper-assets')
  const userSpaceRoot = join(fixtureDir, 'user-space')

  const seed = spawnSync('sqlite3', [fixtureDb, 'CREATE TABLE t(x); INSERT INTO t VALUES(1);'], { encoding: 'utf8' })
  assert(seed.status === 0, `fixture sqlite db created for VA6 (${seed.stderr ? seed.stderr.trim() : 'ok'})`)

  const run = spawnSync(
    backupScriptPath,
    ['--dry-run'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: process.env.PATH,
        QUESTION_BANK_DB: fixtureDb,
        USER_DATA_DB: fixtureDb,
        QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetRoot,
        QUESTION_BANK_USER_SPACE_ROOT: userSpaceRoot,
        EQB_SNAPSHOT_DIR: snapshotDir,
      },
    },
  )
  assert(
    run.status === 0,
    `backup-to-r2.sh --dry-run exits 0 against temp fixture (no rclone required)${run.status !== 0 ? ' — stderr: ' + (run.stderr || '').trim() : ''}`,
  )

  const snapPath = join(snapshotDir, 'question-bank.sqlite')
  const snapExists = existsSync(snapPath)
  assert(snapExists, `script wrote a snapshot to EQB_SNAPSHOT_DIR (${snapPath})`)

  if (snapExists) {
    const integrityCheck = spawnSync('sqlite3', [snapPath, 'PRAGMA integrity_check'], { encoding: 'utf8' })
    assert(
      integrityCheck.stdout.trim() === 'ok',
      `snapshot passes PRAGMA integrity_check (got: ${integrityCheck.stdout.trim() || integrityCheck.stderr.trim()})`,
    )
  } else {
    assert(false, 'snapshot passes PRAGMA integrity_check (skipped — snapshot file missing)')
  }
} finally {
  rmSync(fixtureDir, { recursive: true, force: true })
}

// ── Slice 4: pull-run-push.mjs (import transport) ────────────────────────────
section('Slice 4 — pull-run-push.mjs')

const pullRunPushPath = resolve(ROOT, 'scripts/pull-run-push.mjs')

const pullRunPushCheck = spawnSync('node', ['--check', pullRunPushPath], { encoding: 'utf8' })
assert(pullRunPushCheck.status === 0, `pull-run-push.mjs passes node --check${pullRunPushCheck.status !== 0 ? ' — ' + pullRunPushCheck.stderr.trim() : ''}`)

// Abort真触发: feeding a user-data-shaped path must exit non-zero BEFORE any
// transfer; a clean path list must exit 0. This is the MF-2 manifest guard.
const abortRun = spawnSync(
  'node',
  [pullRunPushPath, 'check-manifest', 'data/question-bank.sqlite,data/user-data.sqlite'],
  { encoding: 'utf8' },
)
assert(abortRun.status !== 0, `check-manifest exits non-zero when a user-data-shaped path is present (got status ${abortRun.status})`)

const cleanRun = spawnSync(
  'node',
  [pullRunPushPath, 'check-manifest', 'data/question-bank.sqlite'],
  { encoding: 'utf8' },
)
assert(cleanRun.status === 0, `check-manifest exits 0 for a clean path list (got status ${cleanRun.status}${cleanRun.status !== 0 ? ' — ' + cleanRun.stderr.trim() : ''})`)

// Fake-remote push round-trip: proves (1) user-data.sqlite is never touched,
// (2) the question-bank swap lands via atomic rename (inode changes, no
// leftover *.incoming.* temp file), and (3) EQB_SERVICE_STOP genuinely runs
// BEFORE the swap (it captures the OLD content's sha while it runs) while
// EQB_SERVICE_START runs after.
const va5Dir = mkdtempSync(join(tmpdir(), 'eqb-pull-run-push-verify-'))
try {
  const remoteDir = join(va5Dir, 'fake-remote')
  const localDir = join(va5Dir, 'fake-local')
  const stopLog = join(va5Dir, 'stop-start.log')

  const remoteDataDir = join(remoteDir, 'data')
  const remoteAssetsDir = join(remoteDir, 'app', 'public', 'paper-assets', 'bundle-remote', 'latest')
  const localDataDir = join(localDir, 'data')
  const localAssetsDir = join(localDir, 'app', 'public', 'paper-assets', 'bundle-local', 'latest')
  for (const dir of [remoteDataDir, remoteAssetsDir, localDataDir, localAssetsDir]) {
    execFileSync('mkdir', ['-p', dir], { encoding: 'utf8' })
  }

  const remoteDb = join(remoteDataDir, 'question-bank.sqlite')
  const remoteUserData = join(remoteDataDir, 'user-data.sqlite')
  const localDb = join(localDataDir, 'question-bank.sqlite')

  // Seed: fake-remote question-bank = content A, fake-remote user-data =
  // distinct content, fake-local question-bank = DISTINCT content B.
  const seedRemoteDb = spawnSync('sqlite3', [remoteDb, "CREATE TABLE t(x); INSERT INTO t VALUES('CONTENT-A');"], { encoding: 'utf8' })
  const seedRemoteUserData = spawnSync('sqlite3', [remoteUserData, "CREATE TABLE u(x); INSERT INTO u VALUES('remote-user-data-must-not-move');"], { encoding: 'utf8' })
  const seedLocalDb = spawnSync('sqlite3', [localDb, "CREATE TABLE t(x); INSERT INTO t VALUES('CONTENT-B');"], { encoding: 'utf8' })
  execFileSync('sh', ['-c', `echo remote-asset > ${JSON.stringify(join(remoteAssetsDir, 'remote.json'))}`], { encoding: 'utf8' })
  execFileSync('sh', ['-c', `echo local-asset > ${JSON.stringify(join(localAssetsDir, 'local.json'))}`], { encoding: 'utf8' })
  assert(
    seedRemoteDb.status === 0 && seedRemoteUserData.status === 0 && seedLocalDb.status === 0,
    'VA5 fixture: fake-remote db + fake-remote user-data + fake-local db seeded',
  )

  function sha256Of(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  }

  const recordedUserDataSnapshot = { size: statSync(remoteUserData).size, mtimeMs: statSync(remoteUserData).mtimeMs, sha256: sha256Of(remoteUserData) }
  const recordedQuestionBank = { ino: statSync(remoteDb).ino, sha256A: sha256Of(remoteDb) }
  const contentBSha = sha256Of(localDb)

  // EQB_SERVICE_STOP captures the CURRENT sha of the remote db at the moment
  // it runs (proves stop happens while the db is still OLD content, i.e.
  // BEFORE the swap) and appends a STOP marker; EQB_SERVICE_START appends a
  // START marker.
  const stopCmd = `sh -c "shasum -a 256 ${JSON.stringify(remoteDb)} >> ${JSON.stringify(stopLog)}; echo STOP >> ${JSON.stringify(stopLog)}"`
  const startCmd = `sh -c "echo START >> ${JSON.stringify(stopLog)}"`

  const pushRun = spawnSync(
    'node',
    [pullRunPushPath, 'push'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        EQB_REMOTE: `local:${remoteDir}`,
        EQB_LOCAL_REPO: localDir,
        EQB_SERVICE_STOP: stopCmd,
        EQB_SERVICE_START: startCmd,
      },
    },
  )
  assert(pushRun.status === 0, `push exits 0 against the fake-remote fixture${pushRun.status !== 0 ? ' — stderr: ' + (pushRun.stderr || '').trim() + ' / stdout: ' + (pushRun.stdout || '').trim() : ''}`)

  // (1) fake-remote user-data.sqlite identical (size + mtime + sha256).
  const afterUserDataStat = statSync(remoteUserData)
  const afterUserDataSha = sha256Of(remoteUserData)
  assert(
    afterUserDataStat.size === recordedUserDataSnapshot.size &&
      afterUserDataStat.mtimeMs === recordedUserDataSnapshot.mtimeMs &&
      afterUserDataSha === recordedUserDataSnapshot.sha256,
    'VA5.1: fake-remote user-data.sqlite is byte-for-byte + mtime unchanged (Slice 4 never touches user-data)',
  )

  // (2) fake-remote question-bank.sqlite now has content B's sha (swap landed).
  const afterQuestionBankSha = sha256Of(remoteDb)
  assert(afterQuestionBankSha === contentBSha, 'VA5.2: fake-remote question-bank.sqlite now matches local content B (swap landed)')

  // (3) inode changed (proves rename-replace, not an in-place write).
  const afterQuestionBankIno = statSync(remoteDb).ino
  assert(afterQuestionBankIno !== recordedQuestionBank.ino, `VA5.3: fake-remote question-bank.sqlite inode changed (before ${recordedQuestionBank.ino}, after ${afterQuestionBankIno}) — proves atomic rename, not in-place write`)

  // (4) no leftover *.incoming.* temp file in <rem>/data/.
  const leftoverIncoming = readdirSync(remoteDataDir).filter((f) => f.includes('.incoming.'))
  assert(leftoverIncoming.length === 0, `VA5.4: no leftover *.incoming.* temp file in fake-remote data/ (found: ${leftoverIncoming.join(', ') || 'none'})`)

  // (5) STOP log recorded content A's sha (stop ran before the swap) and a
  // START marker is present.
  const logContents = existsSync(stopLog) ? readFileSync(stopLog, 'utf8') : ''
  const stopSawContentA = logContents.includes(recordedQuestionBank.sha256A)
  const hasStopMarker = /^STOP$/m.test(logContents)
  const hasStartMarker = /^START$/m.test(logContents)
  assert(
    stopSawContentA && hasStopMarker && hasStartMarker,
    `VA5.5: STOP marker ran while remote db still had content A's sha (${recordedQuestionBank.sha256A.slice(0, 12)}…), and a START marker followed (log: ${JSON.stringify(logContents.trim())})`,
  )
} finally {
  rmSync(va5Dir, { recursive: true, force: true })
}

// ── Slice 4: pull round-trip (MF-A — the push test alone left pull unproven) ──
// The plan's Slice-4 验收 called for a pull→push round-trip; the initial VA5
// drove only push, leaving pull's own swap surface (remote .backup, local
// temp→data/ mv, snapshot cleanup, user-data avoidance) with zero assertion.
// Fake-remote pull proving: (1) remote user-data untouched, (2) remote
// question-bank content lands locally, (3) old local db backed up before the
// swap, (4) atomic same-dir rename (inode changes, no leftover *.incoming.*),
// (5) the remote .backup snapshot temp is cleaned up.
const va5PullDir = mkdtempSync(join(tmpdir(), 'eqb-pull-verify-'))
try {
  const remoteDir = join(va5PullDir, 'fake-remote')
  const localDir = join(va5PullDir, 'fake-local')
  const remoteDataDir = join(remoteDir, 'data')
  const remoteAssetsDir = join(remoteDir, 'app', 'public', 'paper-assets', 'bundle-remote', 'latest')
  const localDataDir = join(localDir, 'data')
  const localAssetsDir = join(localDir, 'app', 'public', 'paper-assets', 'bundle-local', 'latest')
  for (const dir of [remoteDataDir, remoteAssetsDir, localDataDir, localAssetsDir]) {
    execFileSync('mkdir', ['-p', dir], { encoding: 'utf8' })
  }

  const remoteDb = join(remoteDataDir, 'question-bank.sqlite')
  const remoteUserData = join(remoteDataDir, 'user-data.sqlite')
  const localDb = join(localDataDir, 'question-bank.sqlite')

  // Seed: fake-remote question-bank = content R, fake-remote user-data =
  // distinct, fake-local question-bank = OLD content L (replaced + backed up).
  const seedRemoteDb = spawnSync('sqlite3', [remoteDb, "CREATE TABLE t(x); INSERT INTO t VALUES('CONTENT-R');"], { encoding: 'utf8' })
  const seedRemoteUserData = spawnSync('sqlite3', [remoteUserData, "CREATE TABLE u(x); INSERT INTO u VALUES('remote-user-data-must-not-move');"], { encoding: 'utf8' })
  const seedLocalDb = spawnSync('sqlite3', [localDb, "CREATE TABLE t(x); INSERT INTO t VALUES('CONTENT-L');"], { encoding: 'utf8' })
  execFileSync('sh', ['-c', `echo remote-asset > ${JSON.stringify(join(remoteAssetsDir, 'remote.json'))}`], { encoding: 'utf8' })
  assert(
    seedRemoteDb.status === 0 && seedRemoteUserData.status === 0 && seedLocalDb.status === 0,
    'VA5-pull fixture: fake-remote db + fake-remote user-data + fake-local db seeded',
  )

  const sha256OfPull = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
  const recordedRemoteUserData = { size: statSync(remoteUserData).size, mtimeMs: statSync(remoteUserData).mtimeMs, sha256: sha256OfPull(remoteUserData) }
  const contentLSha = sha256OfPull(localDb)
  const localDbInoBefore = statSync(localDb).ino

  const pullRun = spawnSync(
    'node',
    [pullRunPushPath, 'pull'],
    { encoding: 'utf8', env: { ...process.env, EQB_REMOTE: `local:${remoteDir}`, EQB_LOCAL_REPO: localDir } },
  )
  assert(pullRun.status === 0, `pull exits 0 against the fake-remote fixture${pullRun.status !== 0 ? ' — stderr: ' + (pullRun.stderr || '').trim() + ' / stdout: ' + (pullRun.stdout || '').trim() : ''}`)

  // (1) remote user-data untouched (size + mtime + sha256).
  const afterRemoteUserData = statSync(remoteUserData)
  assert(
    afterRemoteUserData.size === recordedRemoteUserData.size &&
      afterRemoteUserData.mtimeMs === recordedRemoteUserData.mtimeMs &&
      sha256OfPull(remoteUserData) === recordedRemoteUserData.sha256,
    'VA5-pull.1: remote user-data.sqlite byte-for-byte + mtime unchanged (pull never touches user-data)',
  )

  // (2) local db now carries remote content R (pull landed). Compare the
  // LOGICAL content, not raw bytes: pull lands a sqlite `.backup` snapshot,
  // which is data-identical but not necessarily byte-identical to the source
  // (freelist/page layout can differ) — a raw sha compare would false-fail.
  const localVal = spawnSync('sqlite3', [localDb, 'SELECT x FROM t'], { encoding: 'utf8' }).stdout.trim()
  assert(localVal === 'CONTENT-R', `VA5-pull.2: local question-bank.sqlite now carries remote content R (pull landed; got "${localVal}")`)

  // (3) the old local db (content L) was backed up before the swap.
  const localBaks = readdirSync(localDataDir).filter((f) => /^question-bank\.sqlite\.bak\./.test(f))
  const bakHasContentL = localBaks.some((f) => sha256OfPull(join(localDataDir, f)) === contentLSha)
  assert(bakHasContentL, `VA5-pull.3: old local db backed up before swap (a *.bak.* with content L's sha; found: ${localBaks.join(', ') || 'none'})`)

  // (4) atomic same-dir rename (inode changed) + no leftover *.incoming.* temp.
  const localDbInoAfter = statSync(localDb).ino
  assert(localDbInoAfter !== localDbInoBefore, `VA5-pull.4a: local db inode changed (before ${localDbInoBefore}, after ${localDbInoAfter}) — same-dir rename swap`)
  const leftoverPullIncoming = readdirSync(localDataDir).filter((f) => f.includes('.incoming.'))
  assert(leftoverPullIncoming.length === 0, `VA5-pull.4b: no leftover *.incoming.* in local data/ (found: ${leftoverPullIncoming.join(', ') || 'none'})`)

  // (5) remote .backup snapshot temp cleaned up.
  const leftoverSnapshots = readdirSync(remoteDataDir).filter((f) => f.includes('.snapshot.'))
  assert(leftoverSnapshots.length === 0, `VA5-pull.5: remote .backup snapshot temp cleaned up (found: ${leftoverSnapshots.join(', ') || 'none'})`)
} finally {
  rmSync(va5PullDir, { recursive: true, force: true })
}

summary()
