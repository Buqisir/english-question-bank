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
 * Slice 4 (pull-run-push) adds VA5 here when it lands — see
 * docs/cuts/launch-deploy/plan.md Verification.
 *
 * Behavioral browser QA (LAN-host Caddy topology, relative addressing, SPA
 * deep-link fallback) was run manually at Slice 1/2 acceptance; this script is
 * the durable static/structural regression net around that result.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('launch-deploy verify (Slice 1+2+3)')

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
assert(deploySh.includes('/api/health'), 'deploy.sh smoke-checks /api/health after restart')
assert(/systemctl restart eqb/.test(deploySh), 'deploy.sh restarts the eqb service')
assert(/pnpm -C .*app.* build/.test(deploySh), 'deploy.sh builds the app')
const bashCheck = spawnSync('bash', ['-n', resolve(ROOT, 'scripts/deploy.sh')], { encoding: 'utf8' })
assert(bashCheck.status === 0, `deploy.sh passes bash -n${bashCheck.stderr ? ' — ' + bashCheck.stderr.trim() : ''}`)

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

summary()
