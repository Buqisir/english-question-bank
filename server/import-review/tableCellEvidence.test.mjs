import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { makeFixture } from '../../scripts/verify-nck1-source-materialization.mjs'
import { buildNck1CompatibilityPaperAsset } from './revisionProjection.mjs'
import { buildNck1AnalysisProjection, validateNck1StagedAnalysis } from './nck1AnalysisProjection.mjs'
import { enumerateParagraphSummaryTargets } from '../paper-import-ai/paragraphSummaries.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { writeStagedAnalyses } = await import('../../scripts/verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const root = mkdtempSync(path.join(tmpdir(), 'table-cell-evidence-'))
try {
  const materialization = makeFixture({ mixedTable: true })
  const source = materialization.groups.find((group) => group.slotId === 'reading.a')
  const cells = source.blocks.find((block) => block.kind === 'table').rows[0].cells
  for (const cell of cells) cell.content = [{ kind: 'text', text: '$10' }]
  const paragraphTargets = enumerateParagraphSummaryTargets(materialization)
  assert(!paragraphTargets.some((target) => cells.some((cell) => cell.cellId === target.paragraphId)))
  writeStagedAnalyses(root, materialization)
  const paperAsset = buildNck1CompatibilityPaperAsset({
    config: { provenance: { paperName: 'Table fixture', source: 'Verifier', year: 2026 } },
    materialization, sourceAssetVersion: 1,
  })
  const projected = paperAsset.content.groups[source.groupId].passage.paragraphs
  for (const cell of cells) assert.equal(projected.find((p) => p.paragraphId === cell.cellId)?.text, '$10')
  const group = {
    groupId: source.groupId,
    paragraphs: projected.map((p) => ({ id: p.paragraphId, text: p.text })),
    questions: source.questions.map((q) => ({
      id: q.questionId, options: Object.fromEntries(q.options.map((o) => [o.label, o.text])),
      answerKey: paperAsset.answerKey.answers[q.questionId].answer,
    })),
  }
  const analysisPath = path.join(root, 'analysis-reading-a.json')
  const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'))
  const question = analysis.questions[group.questions[0].id]
  const reference = { paragraphId: cells[1].cellId, quote: '$10', role: 'primary' }
  question.optionAnalysis.find((o) => o.status === 'correct').evidence = [reference]
  question.optionAnalysis.find((o) => o.status === 'wrong').trapEvidence = [reference]
  question.locationParaphrases = [{
    targetParagraphId: cells[1].cellId, targetText: '$10', sourceText: 'ten dollars', relation: 'paraphrase',
  }]
  const annotation = analysis.groups[source.groupId].teachingContent.annotations[0]
  annotation.sourceRanges = [{ ...annotation.sourceRanges[0], paragraphId: cells[1].cellId, start: 0, end: 3, quote: '$10' }]
  const request = { group: 'reading-a', sourceGroup: { groupKey: 'reading-a',
    material: { paper: { paperId: materialization.paperId, sourceAssetVersion: 1 }, group } },
  authoritativeAnswers: Object.fromEntries(group.questions.map((q) => [q.id, { questionId: q.id, answer: q.answerKey }])) }
  assert.equal(validateNck1StagedAnalysis(request, analysis).ok, true)
  writeFileSync(analysisPath, JSON.stringify(analysis))
  buildNck1AnalysisProjection({ rootDir: root, materialization, paperAsset, requireTeachingContent: true })
  const forged = structuredClone(analysis)
  forged.questions[group.questions[0].id].optionAnalysis.find((o) => o.status === 'correct').evidence[0].quote = '$11'
  assert.throws(() => validateNck1StagedAnalysis(request, forged), /精确匹配原文/)

  // Execute the actual page-local bridge against two equal-priced DOM cells.
  const page = readFileSync(new URL('../../app/src/features/paper-browse/PaperBrowsePage.tsx', import.meta.url), 'utf8')
  const functionSource = page.slice(page.indexOf('function mountCanonicalReadingEvidenceAnchor('), page.indexOf('\nfunction renderSectionHeadingText('))
  const requireApp = createRequire(new URL('../../app/package.json', import.meta.url))
  const { transpile } = requireApp('typescript')
  const { chromium } = requireApp('playwright')
  const browser = await chromium.launch({ channel: 'chromium', headless: true })
  try {
    const tab = await browser.newPage()
    await tab.setContent('<div class="ps-canonical-reading"><table><tr>'
      + cells.map((cell) => `<td data-canonical-cell-id="${cell.cellId}"><span data-canonical-content-node-id="${cell.cellId}:text">$10</span></td>`).join('')
      + '</tr></table></div>')
    await tab.addScriptTag({ content: transpile(functionSource) })
    const result = await tab.evaluate((cellId) => {
      const card = document.body
      const cleanup = mountCanonicalReadingEvidenceAnchor(card, { evidenceId: 'cell-evidence', kind: 'support', quote: '$10', paragraphId: cellId })
      const selected = card.querySelector('mark').closest('td').dataset.canonicalCellId
      const connector = card.querySelector('mark').dataset.paperBrowseEvidenceLineAnchor
      cleanup()
      const cleaned = !card.querySelector('mark')
      mountCanonicalReadingEvidenceAnchor(card, { evidenceId: 'legacy-evidence', kind: 'trap', quote: '$10' })
      return { selected, connector, cleaned, legacy: card.querySelector('mark').closest('td').dataset.canonicalCellId }
    }, cells[1].cellId)
    assert.deepEqual(result, { selected: cells[1].cellId, connector: 'cell-evidence', cleaned: true, legacy: cells[0].cellId })
  } finally {
    await browser.close()
  }
  console.log('PASS cell evidence: projection, staged/full validation, unchanged summary targets, exact cell highlight/connector anchor, legacy fallback')
} finally {
  rmSync(root, { recursive: true, force: true })
}
