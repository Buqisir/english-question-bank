#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  planFixedPagePdf,
  renderExplicitFixedPagePdf,
} from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import {
  paginationPlanEdition,
  validatePaperPaginationPlan,
} from '../server/paper-import/paginationPlan.mjs'
import { assertPaperImportPaginationPlan } from '../server/paper-import/storage.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'

const reviewBindings = [
  { slotId: 'reading.a', groupId: 'review-a', familyContractId: 'reading' },
  { slotId: 'reading.b', groupId: 'review-b', familyContractId: 'reading' },
]
const publishedBindings = reviewBindings.map((entry) => ({
  ...entry,
  groupId: entry.groupId.replace('review', 'published'),
}))
const plan = {
  schemaVersion: 'paper-pagination-plan-v1',
  paperId: 'paper-test',
  sourceDigest: `sha256:${'a'.repeat(64)}`,
  candidateDigest: `sha256:${'b'.repeat(64)}`,
  editions: {
    friendly8: {
      targetPages: 8,
      includeListening: false,
      omitCover: false,
      coverGapsPt: [0, 18],
      breakSlotIds: ['reading.b'],
    },
  },
}
const identity = {
  paperId: plan.paperId,
  sourceDigest: plan.sourceDigest,
  candidateDigest: plan.candidateDigest,
  slotBindings: reviewBindings,
  sourceHasListening: false,
}
assert.deepEqual(validatePaperPaginationPlan(plan, identity), plan)
assert.deepEqual(
  paginationPlanEdition(plan, 'friendly8', publishedBindings).plannedBreakGroupIds,
  ['published-b'],
  'canonical slots map Review and publication group identities without assuming equality',
)
for (const changed of [
  { ...plan, candidateDigest: `sha256:${'c'.repeat(64)}` },
  { ...plan, editions: { friendly8: { ...plan.editions.friendly8, breakSlotIds: ['foreign'] } } },
  { ...plan, editions: { friendly8: { ...plan.editions.friendly8, breakSlotIds: ['reading.b', 'reading.b'] } } },
  { ...plan, editions: { friendly10: { ...plan.editions.friendly8, targetPages: 10 } } },
]) assert.throws(() => validatePaperPaginationPlan(changed, identity), /Pagination plan is invalid/)
assert.throws(() => validatePaperPaginationPlan({
  ...plan,
  editions: {
    friendly10: {
      targetPages: 10,
      includeListening: true,
      omitCover: false,
      coverGapsPt: [72, 72],
      breakSlotIds: [],
    },
  },
}, identity), /exactly two listening slots/)
assert.throws(() => validatePaperPaginationPlan({
  ...plan,
  editions: { friendly8: { ...plan.editions.friendly8, coverGapsPt: null } },
}, identity), /cover gap/)

const html = '<html><head></head><body><section data-canonical-group-id="published-a"></section><section data-canonical-group-id="published-b"></section></body></html>'
let renders = 0
const result = await renderExplicitFixedPagePdf(html, {
  ...paginationPlanEdition(plan, 'friendly8', publishedBindings),
  render: async (candidate, options) => {
    renders += 1
    assert.match(candidate, /data-canonical-group-id="published-b" data-pdf-planned-break/)
    assert.equal(typeof options.inspect, 'function')
    return {
      pageCount: 8,
      pdfBytes: Buffer.from('%PDF'),
      paginatedHtml: candidate,
      inspection: publishedBindings.map(({ groupId }) => ({
        id: groupId, type: 'reading', pages: [1], fragments: [], optionBankPages: [],
      })),
    }
  },
})
assert.equal(renders, 1, 'an explicit plan renders exactly once')
assert.equal(result.pageCount, 8)
await assert.rejects(() => renderExplicitFixedPagePdf(html, {
  targetPages: 8,
  plannedBreakGroupIds: [],
  render: async () => ({ pageCount: 9, inspection: [] }),
}), /actually|实际生成/)

renders = 0
const fallback = await planFixedPagePdf(html, {
  targetPages: 8,
  render: async () => {
    renders += 1
    return { pageCount: 8, inspection: [], pdfBytes: Buffer.from('%PDF') }
  },
})
assert.equal(fallback.pageCount, 8)
assert.equal(renders, 1, 'historical no-plan path retains bounded automatic planning')

let automaticHtml
const bankFallback = await planFixedPagePdf(html, {
  targetPages: 10,
  render: async (candidate) => {
    automaticHtml = candidate
    return { pageCount: candidate.includes('data-pdf-option-bank-fallback') ? 10 : 11, inspection: [] }
  },
})
assert.equal(bankFallback.allowSplitOptionBank, true)
await renderExplicitFixedPagePdf(html, {
  ...bankFallback,
  targetPages: 10,
  render: async (candidate) => {
    assert.equal(candidate, automaticHtml, 'saved automatic bank policy replays identical derived HTML')
    return { pageCount: 10, inspection: [] }
  },
})
assert.throws(() => validatePaperPaginationPlan({
  ...plan, editions: { friendly8: { ...plan.editions.friendly8, allowSplitOptionBank: true } },
}, identity), /Pagination plan is invalid/)
for (const listeningCount of [0, 1, 3]) {
  assert.throws(() => validatePaperPaginationPlan({
    ...plan, editions: { friendly10: { targetPages: 10, includeListening: true, omitCover: false,
      coverGapsPt: [72, 72], breakSlotIds: [] } },
  }, { ...identity, slotBindings: [...reviewBindings, ...Array.from({ length: listeningCount }, (_, index) =>
    ({ slotId: `listening-${index}`, groupId: `l${index}`, familyContractId: 'listening' }))] }), /exactly two listening slots/)
}

const directory = mkdtempSync(path.join(tmpdir(), 'pagination-plan-'))
try {
  const paginationPlanBinding = {
    schemaVersion: 'paper-pagination-binding-v1',
    paperId: plan.paperId,
    sourceDigest: plan.sourceDigest,
    canonicalSourceDigest: plan.sourceDigest,
    candidateDigest: plan.candidateDigest,
    planDigest: digestJson(plan),
  }
  const packageData = {
    paperAsset: { paper: { paperId: plan.paperId } },
    paginationPlan: plan,
    paginationPlanBinding,
  }
  writeFileSync(path.join(directory, 'paper-asset.json'), `${JSON.stringify({
    paper: { paperId: plan.paperId, assetVersion: 1 },
  })}\n`)
  writeFileSync(path.join(directory, 'import-meta.json'), `${JSON.stringify({
    paginationPlanBinding: { ...paginationPlanBinding, sourceAssetVersion: 1 },
  })}\n`)
  writeFileSync(path.join(directory, 'pagination-plan.json'), `${JSON.stringify(plan)}\n`)
  assert.match(assertPaperImportPaginationPlan({
    baseDir: directory,
    packageData,
  }), /^sha256:/)
  writeFileSync(path.join(directory, 'pagination-plan.json'), `${JSON.stringify({ ...plan, paperId: 'paper-other' })}\n`)
  assert.throws(() => assertPaperImportPaginationPlan({
    baseDir: directory,
    packageData,
  }), /commitment/)
  writeFileSync(path.join(directory, 'pagination-plan.json'), `${JSON.stringify(plan)}\n`)
  unlinkSync(path.join(directory, 'pagination-plan.json'))
  assert.throws(() => assertPaperImportPaginationPlan({ baseDir: directory, packageData }), /missing/)
  writeFileSync(path.join(directory, 'pagination-plan.json'), `${JSON.stringify(plan)}\n`)
  writeFileSync(path.join(directory, 'import-meta.json'), '{}\n')
  assert.throws(() => assertPaperImportPaginationPlan({ baseDir: directory, packageData }), /no external import-meta binding/)
} finally {
  rmSync(directory, { recursive: true, force: true })
}

console.log('PASS import pagination QA: strict identity/slots, one-render explicit override, exact target, historical auto fallback, publication tamper detection')
