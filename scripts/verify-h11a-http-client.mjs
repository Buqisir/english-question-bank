#!/usr/bin/env node
/**
 * verify-h11a-http-client.mjs
 *
 * H11-A PR1 contract: the duplicated apiPath/API_ORIGIN host-resolution,
 * decodeHeaderValue, and fetch error-body extraction across
 * app/src/services/*.ts are collapsed into app/src/services/httpClient.ts
 * WITHOUT changing any caller's behavior.
 *
 * The behavior-sensitive invariant this guards: the host forms must stay
 * VERBATIM. questionGroups / draftPapers / mySpace historically resolved
 * `::1` (IPv6 loopback) as local; paperImport / paperImportAi did NOT. The
 * `::1` unification is a SEPARATE owner-acknowledged PR — this PR must keep
 * both forms distinct.
 *
 * Two layers:
 *   A. Source-level (readFileSync + regex): each caller re-imports the right
 *      symbol (apiPath vs apiPathNoIpv6) and no local copy of the moved
 *      helpers survives.
 *   B. Runtime invocation smoke: the REAL httpClient.ts is type-stripped to
 *      a temp .mjs, imported, and exercised — apiPath includes ::1,
 *      apiPathNoIpv6 does NOT, both fall back to API_ORIGIN for remote hosts,
 *      decodeHeaderValue round-trips, and errorMessageFromResponse /
 *      errorFromResponse map a server { error } body. node --check + a build
 *      cannot catch a call-time regression here; this layer can.
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
const noIpv6Callers = [
  'app/src/services/paperImport.ts',
  'app/src/services/paperImportAi.ts',
]

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
  // Must import the ::1-inclusive apiPath (not the No-Ipv6 variant).
  assert(
    /import \{[^}]*\bapiPath\b[^}]*\} from '\.\/httpClient(?:\.ts)?'/.test(src),
    `${base}: imports ::1-inclusive apiPath`,
  )
  assert(
    !/apiPathNoIpv6/.test(src),
    `${base}: does NOT use apiPathNoIpv6 (keeps ::1 behavior)`,
  )
}

for (const rel of noIpv6Callers) {
  const src = read(rel)
  const base = path.basename(rel)
  // Must import the 2-element (no-::1) variant — aliased to apiPath at call sites.
  assert(
    /import \{[^}]*\bapiPathNoIpv6\b[^}]*\} from '\.\/httpClient(?:\.ts)?'/.test(src),
    `${base}: imports apiPathNoIpv6 (2-element host form, no ::1)`,
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

  assert(API_ORIGIN === 'http://127.0.0.1:8787', 'API_ORIGIN is the loopback origin')

  // apiPath (::1-inclusive): all three loopback forms stay path-relative.
  for (const h of ['127.0.0.1', 'localhost', '::1']) {
    assert(
      withHostname(h, () => apiPath('/api/x')) === '/api/x',
      `apiPath treats ${h} as local (path-relative)`,
    )
  }
  assert(
    withHostname('example.com', () => apiPath('/api/x')) === `${API_ORIGIN}/api/x`,
    'apiPath prefixes API_ORIGIN for a remote host',
  )

  // apiPathNoIpv6: 127.0.0.1 + localhost local, but ::1 is REMOTE (verbatim
  // old paperImport/paperImportAi behavior — the divergence this PR preserves).
  for (const h of ['127.0.0.1', 'localhost']) {
    assert(
      withHostname(h, () => apiPathNoIpv6('/api/x')) === '/api/x',
      `apiPathNoIpv6 treats ${h} as local (path-relative)`,
    )
  }
  assert(
    withHostname('::1', () => apiPathNoIpv6('/api/x')) === `${API_ORIGIN}/api/x`,
    'apiPathNoIpv6 does NOT treat ::1 as local (preserves no-::1 fork)',
  )
  assert(
    withHostname('example.com', () => apiPathNoIpv6('/api/x')) === `${API_ORIGIN}/api/x`,
    'apiPathNoIpv6 prefixes API_ORIGIN for a remote host',
  )

  // The two forms genuinely differ exactly on ::1 (proves we did not unify).
  assert(
    withHostname('::1', () => apiPath('/p')) !== withHostname('::1', () => apiPathNoIpv6('/p')),
    'apiPath and apiPathNoIpv6 diverge on ::1 (fork intact)',
  )

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
