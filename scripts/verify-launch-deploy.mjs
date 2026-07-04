/**
 * launch-deploy cut verify — Slice 1 (prod same-origin addressing) +
 * Slice 2 (deploy scaffolding: Caddy topology, systemd unit, .nvmrc, deploy.sh).
 *
 * Regression gate for the launch-critical fix: the frontend must never again
 * ship an absolute `http://127.0.0.1:8787` API origin (which broke the prod
 * build off localhost), and the Caddy reverse-proxy / SPA-fallback topology
 * must stay structurally correct.
 *
 * Slices 3 (R2 backup) and 4 (pull-run-push) add VA5/VA6 here when they land —
 * see docs/cuts/launch-deploy/plan.md Verification.
 *
 * Behavioral browser QA (LAN-host Caddy topology, relative addressing, SPA
 * deep-link fallback) was run manually at Slice 1/2 acceptance; this script is
 * the durable static/structural regression net around that result.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const ROOT = repoRootFrom(import.meta.url)
const { assert, section, summary } = createVerifier('launch-deploy verify (Slice 1+2)')

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

summary()
