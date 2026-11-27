import { deepStrictEqual, throws } from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ANALYSIS_PDF_EDITION, productFiles } from '../../server/paper-import/pdfProductSet.mjs'
import { PAPER_PDF_EDITIONS } from '../../shared/paperPdfProducts.mjs'
import { assertLectureAnalysisPdf, draftsForMerge } from './lecture-redo.mjs'

const base = { id: 'rev-12345678-abcd', paperId: 'paper-fixture' }
const requests = [
  { key: 'application', path: 'analysis-application.json' },
  { key: 'reading-a', path: 'analysis-reading-a.json' },
]

function fixture(t) {
  const work = mkdtempSync(path.join(tmpdir(), 'lecture-redo-'))
  t.after(() => rmSync(work, { recursive: true, force: true }))
  mkdirSync(path.join(work, 'drafts'))
  mkdirSync(path.join(work, 'requests'))
  const draftPath = filename => path.join(work, 'drafts', filename)
  const boundPath = key => draftPath(`paper-fixture__12345678__${key}.json`)
  for (const { key } of requests) {
    writeFileSync(path.join(work, 'requests', `${key}.request.json`), JSON.stringify({
      group: key, baseRevisionId: base.id, draftPath: boundPath(key),
      sourceGroup: { groupKey: key, material: { paper: { paperId: base.paperId }, group: { groupId: `group:${key}` } } },
      authoritativeAnswers: { 'question:21': { answer: 'A' } },
    }))
  }
  return { work, draftPath, boundPath }
}

test('default merge stops when any requested draft is missing', t => {
  const { work, boundPath } = fixture(t)
  writeFileSync(boundPath('application'), '{}')
  throws(() => draftsForMerge(work, base, requests), /缺少草稿：paper-fixture__12345678__reading-a\.json/u)
})

test('--only selects the specified output and leaves other drafts unread', t => {
  const { work, boundPath } = fixture(t)
  writeFileSync(boundPath('application'), '{}')
  writeFileSync(boundPath('reading-a'), 'not JSON')
  deepStrictEqual(draftsForMerge(work, base, requests, 'analysis-application.json')
    .map(({ output }) => output), ['analysis-application.json'])
})

test('merge rejects a wrong filename or a conflicting identity in a correctly named draft', t => {
  const { work, draftPath, boundPath } = fixture(t)
  const wrong = draftPath('application.json')
  writeFileSync(wrong, '{}')
  throws(() => draftsForMerge(work, base, requests, 'application'), /草稿文件名/u)
  unlinkSync(wrong)
  for (const [draft, field] of [
    [{ paperId: 'paper-other' }, 'paperId'],
    [{ reviewCard: { groupId: 'group:other' } }, 'groupId'],
    [{ questions: [{ questionId: 'question:88' }] }, 'questionId'],
    [{ baseRevisionId: 'rev-12345678-efgh' }, 'baseRevisionId'],
  ]) {
    writeFileSync(boundPath('application'), JSON.stringify(draft))
    throws(() => draftsForMerge(work, base, requests, 'application'), new RegExp(`请求不一致：application\\.${field}$`, 'u'))
  }
})

test('lecture merge accepts four PDFs for listening-only analysis and requires five for full teaching analysis', () => {
  const standard = productFiles(PAPER_PDF_EDITIONS)
  const withCompanion = productFiles([...PAPER_PDF_EDITIONS, ANALYSIS_PDF_EDITION])
  const listeningOnly = { importProfile: 'public-paper-v1', analysisDigest: `sha256:${'a'.repeat(64)}`,
    analysisSidecars: { 'listening-analysis-v1.json': {} } }
  const full = { ...listeningOnly,
    analysisSidecars: { ...listeningOnly.analysisSidecars, 'reading-choice-analysis-v1.json': {} } }

  assertLectureAnalysisPdf(standard, listeningOnly)
  throws(() => assertLectureAnalysisPdf(standard, full), /缺少解析 PDF/u)
  assertLectureAnalysisPdf(withCompanion, full)
})
