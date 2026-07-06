#!/usr/bin/env node
/**
 * verify-h11a-http-client.mjs
 *
 * Contract: app/src/services/httpClient.ts is the single source of the shared
 * frontend HTTP helpers (apiPath / apiPathNoIpv6 / decodeHeaderValue /
 * errorMessageFromResponse / errorFromResponse); no service keeps a local copy.
 *
 * Addressing (updated by launch-deploy Slice 1 — the H11-A PR1 deferred
 * "two-form merge" landed, owner-acknowledged): both apiPath and apiPathNoIpv6
 * now ALWAYS return the same-origin RELATIVE path in the browser. The old
 * absolute API_ORIGIN (`http://127.0.0.1:8787`) fallback and the
 * ::1-vs-no-::1 host-form fork are gone: in every real topology (dev via Vite
 * proxy, prod via Caddy reverse_proxy) the API is same-origin, so the absolute
 * fallback broke the prod build off localhost. The two exports are kept as
 * behavior-identical wrappers only so historical import sites keep resolving
 * (questionGroups/draftPapers/mySpace import apiPath; paperImport/paperImportAi
 * import apiPathNoIpv6).
 *
 * Two layers:
 *   A. Source-level (readFileSync + regex): each caller re-imports the right
 *      symbol (apiPath vs apiPathNoIpv6) and no local copy of the moved
 *      helpers survives.
 *   B. Runtime invocation smoke: the REAL httpClient.ts is type-stripped to
 *      a temp .mjs, imported, and exercised — apiPath and apiPathNoIpv6 both
 *      return the relative path for every hostname (loopback and remote) and
 *      are identical; API_ORIGIN is no longer exported; decodeHeaderValue
 *      round-trips; errorMessageFromResponse / errorFromResponse map a server
 *      { error } body. node --check + a build cannot catch a call-time
 *      regression here; this layer can.
 *
 * Hermetic: reads only in-repo source, no `git show`, no local-main dependency.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const HTTP_CLIENT = path.join(rootDir, 'app/src/services/httpClient.ts')

let pass = 0
let fail = 0
function assert(condition, message) {
  if (condition) {
    console.log(`  PASS  ${message}`)
    pass++
  } else {
    console.error(`  FAIL  ${message}`)
    fail++
  }
}

function read(rel) {
  return readFileSync(path.join(rootDir, rel), 'utf8')
}

// ---------------------------------------------------------------------------
// Layer A — source-level structure
// ---------------------------------------------------------------------------
console.log('\n==> Layer A: source structure')

const httpClientSrc = readFileSync(HTTP_CLIENT, 'utf8')

assert(
  /export function apiPath\(/.test(httpClientSrc),
  'httpClient.ts exports apiPath',
)
assert(
  /export function apiPathNoIpv6\(/.test(httpClientSrc),
  'httpClient.ts exports apiPathNoIpv6',
)
assert(
  /export function decodeHeaderValue\(/.test(httpClientSrc),
  'httpClient.ts exports decodeHeaderValue',
)
assert(
  /export async function errorMessageFromResponse\(/.test(httpClientSrc),
  'httpClient.ts exports errorMessageFromResponse',
)
assert(
  /export async function errorFromResponse\(/.test(httpClientSrc),
  'httpClient.ts exports errorFromResponse',
)
// httpClient MUST stay leaf-level: no import from a service (no cycle into api/data layers).
assert(
  !/from '\.\/(questionGroups|paperImport|paperImportAi|draftPapers|mySpace)'/.test(httpClientSrc),
  'httpClient.ts does not import from any service module (no cycle)',
)

// Caller host-form matrix: which apiPath symbol each service must import.
const ipv6Callers = [
  'app/src/services/questionGroups.ts',
  'app/src/services/draftPapers.ts',
  'app/src/services/mySpace.ts',
]
const noIpv6Callers = []

for (const rel of [...ipv6Callers, ...noIpv6Callers]) {
  const src = read(rel)
  const base = path.basename(rel)

  // No surviving local copies of the moved helpers.
  assert(
    !/const API_ORIGIN\s*=/.test(src),
    `${base}: no local API_ORIGIN constant`,
  )
  assert(
    !/function apiPath\b/.test(src) && !/function apiPathNoIpv6\b/.test(src),
    `${base}: no local apiPath definition`,
  )
  assert(
    !/function decodeHeaderValue\b/.test(src),
    `${base}: no local decodeHeaderValue definition`,
  )
  assert(
    !/\bfunction (parseError|readError)\b/.test(src),
    `${base}: no local parseError/readError definition`,
  )
  // Imports from the shared module (explicit .ts extension per this repo's
  // moduleResolution: bundler + allowImportingTsExtensions convention).
  assert(
    /from '\.\/httpClient(?:\.ts)?'/.test(src),
    `${base}: imports from ./httpClient`,
  )
}

for (const rel of ipv6Callers) {
  const src = read(rel)
  const base = path.basename(rel)
  // Import-site stability: these historically imported apiPath; keep it so.
  assert(
    /import \{[^}]*\bapiPath\b[^}]*\} from '\.\/httpClient(?:\.ts)?'/.test(src),
    `${base}: imports apiPath`,
  )
  assert(
    !/apiPathNoIpv6/.test(src),
    `${base}: does not use apiPathNoIpv6`,
  )
}

for (const rel of noIpv6Callers) {
  const src = read(rel)
  const base = path.basename(rel)
  // Import-site stability: these historically imported apiPathNoIpv6 (now a
  // behavior-identical wrapper of apiPath); keep the import resolving.
  assert(
    /import \{[^}]*\bapiPathNoIpv6\b[^}]*\} from '\.\/httpClient(?:\.ts)?'/.test(src),
    `${base}: imports apiPathNoIpv6`,
  )
}

// ---------------------------------------------------------------------------
// Layer B — runtime invocation smoke on the REAL httpClient source
// ---------------------------------------------------------------------------
console.log('\n==> Layer B: runtime invocation smoke')

// Minimal, syntax-targeted TypeScript strip for httpClient.ts. The module uses
// only: param type annotations (`x: T`), return-type annotations on the helpers
// (none beyond inferred), and `as { error?: string } | null` casts. Strip those.
function stripTypes(src) {
  return src
    // `as <type expression>` cast up to end of the statement segment.
    .replace(/ as \{ error\?: string \} \| null/g, '')
    // function param annotations: `(path: string)`, `(value: string | null)`,
    // `(response: Response, fallback: string)`.
    .replace(/\(path: string\)/g, '(path)')
    .replace(/\(value: string \| null\)/g, '(value)')
    .replace(/\(response: Response, fallback: string\)/g, '(response, fallback)')
}

const tmp = mkdtempSync(path.join(tmpdir(), 'h11a-'))
const tmpFile = path.join(tmp, 'httpClient.mjs')
let mod
try {
  writeFileSync(tmpFile, stripTypes(httpClientSrc), 'utf8')
  mod = await import(pathToFileURL(tmpFile).href)
} catch (err) {
  console.error(`  FAIL  type-strip + import of httpClient.ts: ${err.message}`)
  fail++
}

function withHostname(hostname, fn) {
  const prev = globalThis.window
  globalThis.window = { location: { hostname } }
  try {
    return fn()
  } finally {
    if (prev === undefined) delete globalThis.window
    else globalThis.window = prev
  }
}

if (mod) {
  const { apiPath, apiPathNoIpv6, decodeHeaderValue, errorMessageFromResponse, errorFromResponse, API_ORIGIN } = mod

  // launch-deploy Slice 1: the absolute API_ORIGIN fallback is removed.
  assert(API_ORIGIN === undefined, 'API_ORIGIN constant removed (same-origin relative addressing)')

  // Both helpers now return the RELATIVE path for EVERY hostname — loopback
  // and remote alike (dev Vite proxy / prod Caddy are both same-origin). The
  // remote-host cases are the regression guard: before Slice 1 they returned
  // an absolute http://127.0.0.1:8787 origin, which broke the deployed site.
  const hosts = ['127.0.0.1', 'localhost', '::1', 'example.com', 'eqbank.cc']
  for (const h of hosts) {
    assert(withHostname(h, () => apiPath('/api/x')) === '/api/x', `apiPath('${h}') is same-origin relative`)
    assert(withHostname(h, () => apiPathNoIpv6('/api/x')) === '/api/x', `apiPathNoIpv6('${h}') is same-origin relative`)
  }

  // The two-form fork is intentionally gone (H11-A PR1 deferred merge landed):
  // apiPath and apiPathNoIpv6 are now identical for every host, including ::1.
  for (const h of ['::1', 'example.com']) {
    assert(
      withHostname(h, () => apiPath('/p')) === withHostname(h, () => apiPathNoIpv6('/p')),
      `apiPath and apiPathNoIpv6 identical on ${h} (two-form merge landed)`,
    )
  }

  // SSR guard: no window -> hand back the path unchanged.
  assert(apiPath('/api/x') === '/api/x', 'apiPath returns path when window is undefined (SSR guard)')

  // decodeHeaderValue.
  assert(decodeHeaderValue(null) === '', 'decodeHeaderValue(null) -> ""')
  assert(
    decodeHeaderValue(encodeURIComponent('文件名.pdf')) === '文件名.pdf',
    'decodeHeaderValue decodes percent-encoding',
  )
  assert(decodeHeaderValue('%E0%A4%A') === '%E0%A4%A', 'decodeHeaderValue returns raw on malformed input')

  // errorMessageFromResponse / errorFromResponse map a server { error } body.
  const okErrBody = {
    ok: false,
    async json() {
      return { error: 'server says no' }
    },
  }
  const noBody = {
    ok: false,
    async json() {
      throw new Error('not json')
    },
  }
  const msgFromBody = await errorMessageFromResponse(okErrBody, 'fallback msg')
  assert(msgFromBody === 'server says no', 'errorMessageFromResponse returns the server error string')
  const msgFromFallback = await errorMessageFromResponse(noBody, 'fallback msg')
  assert(msgFromFallback === 'fallback msg', 'errorMessageFromResponse falls back when body is not JSON')

  const errFromBody = await errorFromResponse(okErrBody, 'fallback msg')
  assert(errFromBody instanceof Error && errFromBody.message === 'server says no', 'errorFromResponse wraps server error in an Error')
  const errFromFallback = await errorFromResponse(noBody, 'fallback msg')
  assert(errFromFallback instanceof Error && errFromFallback.message === 'fallback msg', 'errorFromResponse falls back to the provided message')
}

rmSync(tmp, { recursive: true, force: true })

// ---------------------------------------------------------------------------
console.log(`\nH11-A http-client: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
