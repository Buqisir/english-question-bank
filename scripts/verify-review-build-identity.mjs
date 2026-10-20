#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import { makeReviewRelease } from '../test-fixtures/review-compatibility/release.mjs'

const directory = mkdtempSync(path.join(realpathSync(tmpdir()), 'eqb-review-build-'))
let failures = 0
async function check(label, callback) {
  try { await callback(); console.log(`PASS ${label}`) }
  catch (error) { failures++; console.log(`FAIL ${label}: ${error.message}`) }
}
try {
  const release = makeReviewRelease(path.join(directory, 'release'))
  const { computeReviewBuildIdentity, computeReviewBuildIdentityAsync, reviewBuildIdentityProvider } = await import(
    pathToFileURL(path.join(release, 'server/import-review/reviewBuildIdentity.mjs')).href)
  const baseline = computeReviewBuildIdentity()
  await check('bounded identity worker returns the same identity and descriptor measurements', async () => {
    const start = performance.now()
    const threaded = await computeReviewBuildIdentityAsync()
    assert.equal(threaded.targetBuildId, baseline.targetBuildId)
    assert.equal(threaded.metrics.fileCount, baseline.files.length)
    assert.equal(threaded.metrics.inputBytes, baseline.files.reduce((sum, file) => sum + file.byteLength, 0))
    console.log(JSON.stringify({ check: 'review-build-identity', ...baseline.metrics,
      asyncComputeMs: threaded.metrics.computeMs, asyncWallMs: performance.now() - start }))
  })
  const parser = path.join(release, 'scripts/import-pipeline/lib.mjs')
  const original = readFileSync(parser, 'utf8')
  for (const file of [
    'server/paper-import-ai/grammar-fill-facets-v2.json',
    'server/paper-import-ai/grammar-fill-similarity-v1.json',
    'server/paper-import/publisher.mjs',
    'server/answer-renderer.mjs',
    'server/import-review/singlePaperPromotion.mjs',
  ]) {
    await check(`changing only ${file} changes the fingerprint`, () => {
      const absolute = path.join(release, file)
      const bytes = readFileSync(absolute)
      try {
        writeFileSync(absolute, Buffer.concat([bytes, Buffer.from('\n')]))
        assert.notDeepEqual(readFileSync(absolute), bytes)
        assert.notEqual(computeReviewBuildIdentity().targetBuildId, baseline.targetBuildId)
      } finally { writeFileSync(absolute, bytes) }
    })
  }
  await check('real execution graph includes the DOCX parsing pipeline', () => {
    assert(baseline.files.some(file => file.repoRelativePosixPath === 'scripts/import-pipeline/lib.mjs'))
    assert(baseline.files.some(file => file.repoRelativePosixPath === 'scripts/import-pipeline/lib-docx-pair.mjs'))
  })
  await check('changing only pipeline lib.mjs changes the actual release fingerprint', () => {
    try {
      writeFileSync(parser, `${original}\n// fingerprint counterexample\n`)
      assert.notEqual(readFileSync(parser, 'utf8'), original)
      assert.notEqual(computeReviewBuildIdentity().targetBuildId, baseline.targetBuildId)
    } finally { writeFileSync(parser, original) }
  })
  await check('changing only a frontend file leaves the fingerprint unchanged', () => {
    const frontend = path.join(release, 'app/src/fingerprint-only.css')
    writeFileSync(frontend, 'body { color: red }')
    const first = readFileSync(frontend, 'utf8')
    const identity = computeReviewBuildIdentity().targetBuildId
    writeFileSync(frontend, 'body { color: green }')
    assert.notEqual(readFileSync(frontend, 'utf8'), first)
    assert.equal(computeReviewBuildIdentity().targetBuildId, identity)
  })
  await check('a foreign repository root cannot label this executing release', () => {
    const foreign = path.join(directory, 'foreign')
    mkdirSync(path.join(foreign, 'server'), { recursive: true })
    writeFileSync(path.join(foreign, 'server/entry.mjs'), 'export const unrelated = true')
    assert.throws(() => computeReviewBuildIdentity({ repoRoot: foreign }), { code: 'REVIEW_TARGET_ROOT_MISMATCH' })
    assert.throws(() => reviewBuildIdentityProvider({ repoRoot: foreign }), { code: 'REVIEW_TARGET_ROOT_MISMATCH' })
  })
  await check('literal dynamic imports are followed; unresolved dynamic imports fail closed', () => {
    const extra = path.join(release, 'fingerprint-literal.mjs')
    writeFileSync(extra, 'export const literal = 1')
    try {
      writeFileSync(parser, `${original}\nvoid import('../../fingerprint-literal.mjs')\n`)
      const first = computeReviewBuildIdentity()
      assert(first.files.some(file => file.repoRelativePosixPath === 'fingerprint-literal.mjs'))
      writeFileSync(extra, 'export const literal = 2')
      assert.notEqual(computeReviewBuildIdentity().targetBuildId, first.targetBuildId)
      writeFileSync(parser, `${original}\nexport const dynamic = value => import(value)\n`)
      assert.throws(() => computeReviewBuildIdentity(), { code: 'REVIEW_TARGET_IDENTITY_INVALID' })
    } finally { writeFileSync(parser, original) }
  })
  await check('export-from dependencies are followed; a frontend graph edge fails explicitly', () => {
    const extra = path.join(release, 'fingerprint-export.mjs')
    const frontend = path.join(release, 'app/src/fingerprint-frontend.mjs')
    writeFileSync(extra, 'export const reexported = 1')
    writeFileSync(frontend, 'export const frontend = 1')
    try {
      writeFileSync(parser, `${original}\nexport * from '../../fingerprint-export.mjs'\n`)
      const first = computeReviewBuildIdentity().targetBuildId
      writeFileSync(extra, 'export const reexported = 2')
      assert.notEqual(computeReviewBuildIdentity().targetBuildId, first)
      writeFileSync(parser, `${original}\nimport '../../app/src/fingerprint-frontend.mjs'\n`)
      assert.throws(() => computeReviewBuildIdentity(), {
        code: 'REVIEW_TARGET_IDENTITY_INVALID', message: /Undeclared frontend content dependency/,
      })
    } finally { writeFileSync(parser, original) }
  })
  await check('every runtime entry follows repository imports outside the covered directories', () => {
    for (const entry of baseline.graphEntries) {
      const absolute = path.join(release, entry)
      const source = readFileSync(absolute, 'utf8')
      const extra = path.join(release, 'fingerprint-entry-extra.mjs')
      const specifier = path.relative(path.dirname(absolute), extra).split(path.sep).join('/')
      try {
        writeFileSync(extra, 'export const outside = 1')
        writeFileSync(absolute, `${source}\nimport '${specifier}'\n`)
        const first = computeReviewBuildIdentity()
        assert(first.files.some(file => file.repoRelativePosixPath === 'fingerprint-entry-extra.mjs'), entry)
        writeFileSync(extra, 'export const outside = 2')
        assert.notEqual(computeReviewBuildIdentity().targetBuildId, first.targetBuildId, entry)
      } finally { writeFileSync(absolute, source) }
    }
  })
  await check('explicit runtime/test/secret exclusions do not change the fingerprint', () => {
    const before = computeReviewBuildIdentity().targetBuildId
    for (const file of ['server/data/review.sqlite', 'server/uploads/source.json', 'server/logs/audit.json',
      'server/test-fixtures/fixture.json', 'server/.env.local']) {
      const absolute = path.join(release, file)
      mkdirSync(path.dirname(absolute), { recursive: true })
      writeFileSync(absolute, 'synthetic excluded fixture')
    }
    assert.equal(computeReviewBuildIdentity().targetBuildId, before)
  })
  assert.equal(failures, 0, `${failures} identity regression(s)`)
} finally { rmSync(directory, { recursive: true, force: true }) }
