import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertImportSubmissionReady, importSubmissionIssues } from './lib-import-submit-gate.mjs'
import { loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { prepareNck1AnalyzedPackageReview } from '../../server/paper-import/analyzedPackage.mjs'

const issues = stem => importSubmissionIssues({ materialization: { groups: [{ stem }] } })
test('Chinese numbered entries beginning with Latin acronyms are blocked', () => {
  const found = issues('要点：(1) DIY 活动；(2) BBQ 晚会')
  assert.equal(found[0]?.code, 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING')
  assert.deepEqual(found.flatMap(x => x.matches), ['(1)', '(2)'])
})
test('the complete numbered entry spans acronym and Han inline runs', () => {
  const found = issues({ runs: [{ text: '要点：' }, { text: '(1) DIY ' },
    { text: '活动；' }, { text: '(2) BBQ ' }, { text: '晚会' }] })
  assert.deepEqual(found.flatMap(x => x.matches), ['(1)', '(2)'])
})
test('one entry cannot inherit Han from the next numbered entry or separator', () => {
  for (const text of ['(1) DIY only；(2) BBQ 晚会', '(1) DIY only (2) BBQ 晚会']) {
    assert.deepEqual(issues(text).flatMap(x => x.matches), ['(2)'])
  }
})
test('English quotes stay exempt while Han outside quotes still belongs to its entry', () => {
  assert.deepEqual(issues('请阅读句子 “Include (1) a title.” 并翻译。'), [])
  assert.deepEqual(issues('要点：(1) “DIY” 活动；(2) “Include a title.” 晚会').flatMap(x => x.matches),
    ['(1)', '(2)'])
})

test('English numbered sentences retain their language when words have Chinese glosses', () => {
  for (const stem of [
    '(20) Receive a badge(徽章) after class.',
    '(20) Receive a badge （徽章） after class.',
    '听力材料：(20) Receive a badge (徽章，纪念品) after class.',
    '中文说明。(20) Receive a badge(徽章) after class.',
    { runs: [{ text: '(20) Receive a ' }, { text: 'badge' }, { text: '(徽章) after class.' }] },
  ]) assert.deepEqual(issues(stem), [])
})

test('Chinese instructions remain blocked beside English words with Chinese glosses', () => {
  for (const stem of [
    '要点：(1) 介绍 badge(徽章) 的用途；(2) DIY 活动。',
    { runs: [{ text: '要点：(' }, { text: '1' }, { text: ') 介绍 badge(徽章) 的用途' }] },
    '(1) Receive a badge(徽章) 并介绍它。',
    '(1) Receive a badge(徽章 badge) after class.',
  ]) assert.ok(issues(stem).some(issue => issue.matches.includes('(1)')))
  assert.deepEqual(issues('要点：（1）介绍 badge(徽章) 的用途。'), [])
})

test('nested parentheses cannot hide Han inside an inner English-word gloss', () => {
  for (const stem of [
    '(1) Receive a badge(gloss(徽章)) after class.',
    '(1) Receive a badge（gloss（徽章）） after class.',
    '(1) Receive a badge(gloss（徽章）) after class.',
    { runs: [{ text: '(1) Receive a badge(gloss' }, { text: '(徽章)' }, { text: ') after class.' }] },
  ]) assert.deepEqual(issues(stem).flatMap(issue => issue.matches), ['(1)'])
})

test('gloss eligibility uses original text before masking English quotes', () => {
  for (const stem of [
    '(1) Receive a badge(徽章 "badge") after class.',
    '(1) Receive a badge(徽章 “badge”) after class.',
    '(1) Receive a badge（徽章 「badge」） after class.',
    { runs: [{ text: '(1) Receive a badge(徽章 ' }, { text: '"badge"' }, { text: ') after class.' }] },
  ]) assert.deepEqual(issues(stem).flatMap(issue => issue.matches), ['(1)'])
})

test('push preflight accepts a loaded external listening package without a raw-source sidecar', async t => {
  const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
  process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
  let fixtures
  try { fixtures = await import('../verify-universal-nck1-publish.mjs') }
  finally {
    if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
    else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
  }
  mkdirSync(tmpdir(), { recursive: true })
  const temporary = mkdtempSync(path.join(tmpdir(), 'submit-package-test-'))
  t.after(() => rmSync(temporary, { recursive: true, force: true }))
  const paperId = 'paper-mock-contract-2026-m1'
  const raw = fixtures.makeReviewRoot(temporary, paperId, undefined, { listening: true })
  const packageRoot = path.join(temporary, 'package')
  fixtures.makeExternalAnalyzedPackage(raw.reviewRoot, packageRoot)
  const paperDir = path.join(temporary, 'external-review')
  await prepareNck1AnalyzedPackageReview({ sourcePath: packageRoot, destinationDir: paperDir, expectedPaperId: paperId })
  const loaded = loadNck1ReviewSource(paperDir)
  assert.ok(loaded.analyzedPackage)
  assert.equal(loaded.sourceProvenance.kind, 'external_analyzed_package')
  assert.equal(loaded.materialization.listening.state, 'captured')
  assert.ok(loaded.materialization.listening.transcript.length)
  const sidecar = path.join(paperDir, 'listening-review-v1.json')
  assert.equal(existsSync(sidecar), false)
  assert.deepEqual(assertImportSubmissionReady(paperDir, loaded.materialization, loaded), { status: 'PASS' })

  // Unsupported raw-source sidecars must not be read for external packages.
  writeFileSync(sidecar, '{')
  assert.deepEqual(assertImportSubmissionReady(paperDir, loaded.materialization, loaded), { status: 'PASS' })
  loaded.materialization.groups[0].stem = '要点：(1) 介绍活动'
  assert.throws(() => assertImportSubmissionReady(paperDir, loaded.materialization, loaded),
    { code: 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING' })
})

test('raw-source listening still requires a usable review in push preflight', t => {
  const paperDir = mkdtempSync(path.join(tmpdir(), 'submit-raw-test-'))
  t.after(() => rmSync(paperDir, { recursive: true, force: true }))
  const group = { segmentId: 'listening-text-1', questionNumbers: [1] }
  const materialization = { listening: { state: 'captured', transcript: [group] } }
  const loaded = { materialization }
  assert.throws(() => assertImportSubmissionReady(paperDir, materialization, loaded),
    { code: 'IMPORT_SUBMIT_LISTENING_NOT_USABLE' })
  writeFileSync(path.join(paperDir, 'listening-review-v1.json'),
    JSON.stringify({ groups: [{ ...group, decision: 'usable' }] }))
  assert.deepEqual(assertImportSubmissionReady(paperDir, materialization, loaded), { status: 'PASS' })
})
