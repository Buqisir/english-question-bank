#!/usr/bin/env node
/**
 * verify-export-flat-questions.mjs — guards the qbank-flat-export-v1 contract.
 *
 * Real paper-assets are gitignored (not in CI), so this builds an inline
 * temp fixture (a minimal paper-asset tree) and runs buildFlatExport against
 * it — testing the flattening logic + the external contract shape, not real data.
 *
 * Asserts:
 *   - SCHEMA_VERSION constant
 *   - a grammarFill group flattens with stable ids + source.sourceFileSha256
 *   - an analyzed blank carries facetKey + facetLabel(中文) + answer + analysis
 *   - group-level facetKeys[] = the covered 考点 set (本周语法点筛篇 key)
 *   - a group WITHOUT analysis → hasAnalysis:false, blank.analysis:null, facetKey:null
 *   - papers without paper-asset.json are skipped, not thrown on
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { buildFlatExport, SCHEMA_VERSION } from './export-flat-questions.mjs'

let passed = 0
let failed = 0
function assert(name, cond, details = '') {
  if (cond) { passed += 1; console.log(`PASS  ${name}`) }
  else { failed += 1; console.error(`FAIL  ${name}${details ? `\n      ${details}` : ''}`) }
}

// ─── Build an inline fixture assets dir ─────────────────────────────────────────
const root = mkdtempSync(path.join(tmpdir(), 'qbank-export-'))
function writePaper(paperId, { withAnalysis }) {
  const dir = path.join(root, paperId, 'versions', 'v1')
  mkdirSync(path.join(dir, 'analyses'), { recursive: true })
  const gid = `group-${paperId}-grammar-fill`
  const qid = `q-${paperId}-056`
  writeFileSync(path.join(dir, 'paper-asset.json'), JSON.stringify({
    schemaVersion: 'paper-asset-v1',
    content: {
      groups: { [gid]: {
        groupId: gid, groupType: 'grammarFill', questionIds: [qid],
        passage: { paragraphs: [{ paragraphId: 'p1', text: 'Eating more fibre, 56._____ fibremaxxing, is a trend.' }] },
      } },
      questions: { [qid]: { questionId: qid, questionNo: 56, groupId: gid, blankId: `blank-${paperId}-056` } },
    },
  }))
  writeFileSync(path.join(dir, 'import-meta.json'), JSON.stringify({
    schemaVersion: 'import-meta-v1', paperId,
    sourceFileSha256: `${paperId}-sha`,
    paper: { year: 2026, region: '测试地区', paperName: '测试卷', sourceType: '模拟题' },
    groups: { [gid]: { difficulty: '中', summary: '测试摘要', tags: ['语法填空'] } },
  }))
  writeFileSync(path.join(dir, 'answer-key.json'), JSON.stringify({
    answers: { [qid]: { questionId: qid, questionNo: 56, answer: 'or' } },
  }))
  if (withAnalysis) {
    writeFileSync(path.join(dir, 'analyses', 'grammar-fill-analysis-v1.json'), JSON.stringify({
      schemaVersion: 'grammar-fill-analysis-v1',
      blanks: { [qid]: {
        blankId: `blank-${paperId}-056`, blankNo: 56, blankType: 'no-hint', hint: null,
        facetKey: 'grammar-fill.no-hint.conjunction.coordinating', answer: 'or', role: null, path: null,
        reason: '并列解释关系，用 or。',
        evidence: [{ type: 'parallel', signalText: 'Eating more fibre', signalSide: 'passage', relation: '...' }],
        teachingNote: '看到别称用 or。',
      } },
    }))
  }
}

try {
  writePaper('paperWithAna', { withAnalysis: true })
  writePaper('paperNoAna', { withAnalysis: false })
  // A junk dir with no paper-asset.json must be skipped, not crash.
  mkdirSync(path.join(root, 'paperEmpty'), { recursive: true })

  assert('SCHEMA_VERSION is qbank-flat-export-v1', SCHEMA_VERSION === 'qbank-flat-export-v1')

  const { groups, skipped } = buildFlatExport(root)
  assert('builds 2 grammarFill groups', groups.length === 2, `got ${groups.length}`)
  assert('empty paper is skipped (no throw)', skipped.some((s) => s.paperId === 'paperEmpty'))

  const withAna = groups.find((g) => g.paperId === 'paperWithAna')
  const noAna = groups.find((g) => g.paperId === 'paperNoAna')

  assert('group shape: id/type/passageText/blanks/facetKeys', !!withAna &&
    withAna.id === 'group-paperWithAna-grammar-fill' && withAna.type === 'grammarFill' &&
    withAna.passageText.includes('56._____') && Array.isArray(withAna.blanks) && Array.isArray(withAna.facetKeys))
  assert('source carries sourceFileSha256 (判重键) + year/region', !!withAna &&
    withAna.source.sourceFileSha256 === 'paperWithAna-sha' && withAna.source.year === 2026 && withAna.source.region === '测试地区')
  assert('group difficulty/summary from import-meta', withAna?.difficulty === '中' && withAna?.summary === '测试摘要')

  const b = withAna?.blanks?.[0]
  assert('analyzed blank: questionId/blankNo/answer', !!b && b.questionId === 'q-paperWithAna-056' && b.blankNo === 56 && b.answer === 'or')
  assert('analyzed blank: facetKey + facetLabel(中文 from registry)', b?.facetKey === 'grammar-fill.no-hint.conjunction.coordinating' && b?.facetLabel === '并列连词')
  assert('analyzed blank: analysis reason/evidence/teachingNote', !!b?.analysis && !!b.analysis.reason && b.analysis.evidence.length === 1 && !!b.analysis.teachingNote)
  assert('group facetKeys = covered 考点 set + hasAnalysis', withAna?.hasAnalysis === true && withAna?.facetKeys.includes('grammar-fill.no-hint.conjunction.coordinating'))

  const nb = noAna?.blanks?.[0]
  assert('no-analysis group: hasAnalysis false, blank.analysis null, facetKey null', noAna?.hasAnalysis === false && nb?.analysis === null && nb?.facetKey === null)
  assert('no-analysis blank still has answer (from answer-key)', nb?.answer === 'or')
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log(`\n${passed} passed, ${failed} failed.`)
if (failed > 0) process.exit(1)
console.log('export-flat-questions contract verify passed.')
