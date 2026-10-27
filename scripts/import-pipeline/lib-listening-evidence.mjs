import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { exactKeys, sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { LISTENING_RULE_EVIDENCE_VERSION, summarizeListeningGroup } from '../../shared/paper-canonical/listeningRuleEvidence.mjs'

const DIAGNOSTICS = 'listening-diagnostics-v1'
const LOCAL_RESULT = 'listening-local-result-v2'
const maxDecoded = 256 * 1024 ** 2
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value)}\n`, { flag: 'wx' })
const fail = detail => { throw new Error(`LISTENING_DIAGNOSTIC_INVALID: ${detail}`) }

export function writeListeningEvidence({ attempt, apple, resolved, input, rawEvidence }) {
  const decoded = Buffer.from(stableStringify({ schemaVersion: DIAGNOSTICS, apple, resolved }))
  if (decoded.length > maxDecoded) fail('decoded budget exceeded')
  const bytes = gzipSync(decoded, { level: 9 })
  const diagnostic = { schemaVersion: DIAGNOSTICS, path: 'diagnostics.json.gz', encoding: 'gzip',
    sha256: sha256(bytes), byteLength: bytes.length, decodedSha256: sha256(decoded), decodedByteLength: decoded.length }
  const destination = path.join(attempt, diagnostic.path)
  if (existsSync(destination)) fail('diagnostic already exists')
  writeFileSync(`${destination}.partial`, bytes, { flag: 'wx' })
  renameSync(`${destination}.partial`, destination)
  const groups = resolved.groups.map(summarizeListeningGroup)
  write(path.join(attempt, 'rule-result.json'), { schemaVersion: LOCAL_RESULT, rule: resolved.rule, groups, diagnostic })
  write(path.join(attempt, 'apple-rule.json'), { schemaVersion: LOCAL_RESULT,
    rule: apple.rule ?? resolved.rule, groups: apple.groups.map(summarizeListeningGroup), diagnostic })
  return { schemaVersion: LISTENING_RULE_EVIDENCE_VERSION, rule: resolved.rule,
    normalization: input.normalization, input, rawEvidence: rawEvidence.filter(file => file.kind === 'asr_window'),
    groups, diagnostic }
}

// This is a local data reader, never first-admission authority. Historical plain
// results stay readable without rewriting their bytes or their Owner fingerprints.
export function loadListeningResult(file, { track = () => {} } = {}) {
  track(file)
  const entry = JSON.parse(readFileSync(file, 'utf8'))
  if (!Object.hasOwn(entry, 'schemaVersion')) {
    if (!Array.isArray(entry.groups)) fail('historical groups missing')
    return entry
  }
  if (entry.schemaVersion !== LOCAL_RESULT) fail('unknown local result version')
  const d = entry.diagnostic
  if (!exactKeys(d, ['schemaVersion', 'path', 'encoding', 'sha256', 'byteLength', 'decodedSha256', 'decodedByteLength'])
    || d.schemaVersion !== DIAGNOSTICS || d.encoding !== 'gzip' || d.path !== 'diagnostics.json.gz'
    || !Number.isSafeInteger(d.decodedByteLength) || d.decodedByteLength <= 0 || d.decodedByteLength > maxDecoded
    || !Number.isSafeInteger(d.byteLength) || d.byteLength <= 0 || d.byteLength > 64 * 1024 ** 2) fail('descriptor')
  const root = realpathSync(path.dirname(file)), full = realpathSync(path.join(root, d.path))
  if (path.dirname(full) !== root) fail('diagnostic escapes attempt')
  track(full)
  const bytes = readFileSync(full)
  if (bytes.length !== d.byteLength || sha256(bytes) !== d.sha256) fail('compressed digest/length')
  const decoded = gunzipSync(bytes, { maxOutputLength: d.decodedByteLength })
  if (decoded.length !== d.decodedByteLength || sha256(decoded) !== d.decodedSha256) fail('decoded digest/length')
  const diagnostic = JSON.parse(decoded)
  if (!exactKeys(diagnostic, ['schemaVersion', 'apple', 'resolved']) || diagnostic.schemaVersion !== DIAGNOSTICS) fail('payload version')
  const result = path.basename(file) === 'apple-rule.json' ? diagnostic.apple : diagnostic.resolved
  if (!Array.isArray(result?.groups)
    || stableStringify(result.groups.map(summarizeListeningGroup)) !== stableStringify(entry.groups)) fail('summary mismatch')
  return result
}
