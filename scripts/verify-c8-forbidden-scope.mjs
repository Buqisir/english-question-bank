#!/usr/bin/env node
// C8 verify: forbidden scope
//
// History: born for the C8-PR-A cut (`docs/cuts/C8-draft-paper-composer/`)
// to (1) fence off unrelated domains that PR's diff must never touch, and
// (2) assert the diff's file set matched a hardcoded C8-PR-A `allowedPrefixes`
// enumeration, plus temporal product-scope checks ("My Space" / answer-version
// export don't exist yet in this PR).
//
// Retired 2026-07-13 (draft-desk-b step5, SW-E — see cr-step1-lite.md): the
// `allowedPrefixes` enumeration and the My-Space/answer-version temporal
// checks are permanently expired. My Space and answer-version export have
// long since shipped as real product features (server/my-space/,
// scripts/verify-c8-my-space-contracts.mjs, verify-user-scope.mjs all exist
// and are green), and every subsequent large cut legitimately touches files
// outside the C8-PR-A file list. Keeping either check made this gate fail red
// on essentially every non-C8-PR-A diff (including pure-docs changes),
// training reviewers to ignore it rather than read it.
//
// What survives: the cross-domain forbidden-prefix fence below. Those
// prefixes/files (papersurface/, reading-analysis/, paper-intelligence/,
// public/reports/, public/paper-assets/, server/print-renderer.mjs, imported
// fixture binaries) protect real architectural boundaries that no
// draft-paper-family cut should cross. That fence is not specific to C8-PR-A
// — it stays live and general-purpose for this and future cuts.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function git(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function baselineRef() {
  try {
    git(['rev-parse', '--verify', 'github/main'])
    return 'github/main'
  } catch {
    return 'main'
  }
}

console.log('C8 verify: forbidden scope')

const changedFiles = [
  ...git(['diff', '--name-only', baselineRef()]).split('\n').filter(Boolean),
  ...git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean),
]
const forbiddenPrefixes = [
  'app/src/shared-ui/papersurface/',
  'shared/papersurface/',
  'app/src/features/reading-analysis/',
  'app/src/features/paper-intelligence/',
  'app/public/reports/',
  'app/public/paper-assets/',
]

for (const prefix of forbiddenPrefixes) {
  assert(`forbidden prefix untouched: ${prefix}`, !changedFiles.some((file) => file.startsWith(prefix)))
}

assert('no imported fixture changes', !changedFiles.some((file) => /app\/public\/.*\.(json|docx|pdf)$/.test(file)))
assert('print renderer file untouched', !changedFiles.includes('server/print-renderer.mjs'))

if (failed > 0) {
  console.error(`\nC8 forbidden scope verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC8 forbidden scope verify passed: ${passed} passed, 0 failed`)
