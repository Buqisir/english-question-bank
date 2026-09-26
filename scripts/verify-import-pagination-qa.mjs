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
const longPlan = { ...plan, schemaVersion: 'paper-pagination-plan-v2', editions: {
  long10: { targetPages: 10, includeListening: false, omitCover: false,
    coverGapsPt: [72, 72], breakSlotIds: [] },
} }
assert.deepEqual(validatePaperPaginationPlan(longPlan, identity), longPlan)
assert.throws(() => validatePaperPaginationPlan({ ...longPlan, schemaVersion: 'paper-pagination-plan-v1' }, identity),
  /requires paper-pagination-plan-v2/)
assert.throws(() => validatePaperPaginationPlan({ ...longPlan, editions: { long10: {
  ...longPlan.editions.long10, includeListening: true,
} } }, identity), /target\/listening policy/)
for (const forbidden of [
  { answerBoxHeightsMm: { application: 24 } },
  { allowSplitOptionBank: true },
]) assert.throws(() => validatePaperPaginationPlan({
  ...longPlan, editions: { long10: { ...longPlan.editions.long10, ...forbidden } },
}, identity), /cannot compress writing space|cannot split the option bank/)
const listeningBindings = [
  ...reviewBindings,
  { slotId: 'listening.one', groupId: 'l1', familyContractId: 'listening' },
  { slotId: 'listening.two', groupId: 'l2', familyContractId: 'listening' },
]
const longListening = { ...longPlan, editions: { long12: {
  ...longPlan.editions.long10, targetPages: 12, includeListening: true,
} } }
assert.deepEqual(validatePaperPaginationPlan(longListening, {
  ...identity, slotBindings: listeningBindings,
}), longListening)
assert.throws(() => validatePaperPaginationPlan(longListening, identity), /exactly two listening slots/)
const adaptivePlan = { ...plan, editions: { friendly8: {
  ...plan.editions.friendly8, answerBoxHeightsMm: { application: 31, continuation: 44 },
} } }
assert.deepEqual(validatePaperPaginationPlan(adaptivePlan, identity), adaptivePlan)
assert.deepEqual(paginationPlanEdition(adaptivePlan, 'friendly8', publishedBindings).answerBoxHeightsMm,
  { application: 31, continuation: 44 })
for (const answerBoxHeightsMm of [null, {}, { application: 23 }, { application: 66 },
  { continuation: 39 }, { continuation: 58 }, { application: 30.5 }, { unknown: 30 }, { constructor: 30 }]) {
  assert.throws(() => validatePaperPaginationPlan({ ...plan, editions: { friendly8: {
    ...plan.editions.friendly8, answerBoxHeightsMm,
  } } }, identity), /answerBoxHeightsMm/)
}
// Automatic eight-page plans retain notices even for a listening source;
// old externally bound omit-cover plans remain replayable without mutation.
for (const sourceHasListening of [false, true]) {
  for (const coverGapsPt of [[72, 72], [54, 72], [54, 54], [18, 36], [0, 18], [-25.5, 18]]) {
    const retained = { ...plan, editions: { friendly8: { ...plan.editions.friendly8, coverGapsPt } } }
    assert.deepEqual(validatePaperPaginationPlan(retained, { ...identity, sourceHasListening }), retained)
  }
}
const legacyCover = { ...plan, editions: { friendly8: { ...plan.editions.friendly8, omitCover: true, coverGapsPt: null } } }
assert.deepEqual(validatePaperPaginationPlan(legacyCover, { ...identity, sourceHasListening: true }), legacyCover)
assert.throws(() => validatePaperPaginationPlan(legacyCover, identity), /cover policy/)
for (const coverGapsPt of [[-1, 18], [-25.6, 18], [-25.5, 0], [0, 0], [18, 35], [73, 72]]) {
  assert.throws(() => validatePaperPaginationPlan({ ...plan, editions: { friendly8: { ...plan.editions.friendly8, coverGapsPt } } }, identity), /cover gap/)
}
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
const longReplay = await renderExplicitFixedPagePdf(html, {
  ...paginationPlanEdition(longPlan, 'long10', publishedBindings),
  render: async () => ({ pageCount: 9, inspection: [{ id: 'application', pages: [9],
    applicationPresent: true, applicationPromptPage: 9, applicationAnswerPage: 9 }] }),
})
assert.equal(longReplay.pageCount, 9, 'long plan replays an honest under-cap page count')
await assert.rejects(() => renderExplicitFixedPagePdf(html, {
  ...paginationPlanEdition(longPlan, 'long10', publishedBindings),
  render: async () => ({ pageCount: 10, inspection: [{ id: 'application', pages: [9, 10],
    applicationPresent: true, applicationPromptPage: 9, applicationAnswerPage: 10 }] }),
}), /完整题面与作答框未处于同一页/)
await assert.rejects(() => renderExplicitFixedPagePdf(html, {
  ...paginationPlanEdition(longPlan, 'long10', publishedBindings),
  render: async () => ({ pageCount: 9, inspection: [{ id: 'application', pages: [7, 8],
    applicationPresent: true, applicationPromptPage: 8, applicationPromptPages: [7, 8],
    applicationAnswerPage: 8, applicationAnswerPages: [8] }] }),
}), /完整题面与作答框未处于同一页/)
await assert.rejects(() => renderExplicitFixedPagePdf(html, {
  ...paginationPlanEdition(longPlan, 'long10', publishedBindings),
  render: async () => ({ pageCount: 11, inspection: [] }),
}), /超过 10 页上限/)
await assert.rejects(() => renderExplicitFixedPagePdf(html, {
  ...paginationPlanEdition(longPlan, 'long10', publishedBindings),
  answerBoxHeightsMm: { application: 24 },
  render: async () => { throw new Error('must not render a compressed long paper') },
}), /不能压缩写作答题框/)
await assert.rejects(() => renderExplicitFixedPagePdf(html, {
  ...paginationPlanEdition(longPlan, 'long10', publishedBindings),
  render: async () => ({ pageCount: 9, inspection: [
    { id: 'seven', pages: [5, 6], optionBankPages: [5, 6] },
  ] }),
}), /选项库跨页/)
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

for (const targetPages of [8, 10]) {
  let automaticHtml
  const bankFallback = await planFixedPagePdf(html, {
    targetPages,
    render: async (candidate) => {
      automaticHtml = candidate
      return { pageCount: candidate.includes('data-pdf-option-bank-fallback') ? targetPages : targetPages + 1, inspection: [] }
    },
  })
  assert.equal(bankFallback.allowSplitOptionBank, true)
  await renderExplicitFixedPagePdf(html, {
    ...bankFallback,
    targetPages,
    render: async (candidate) => {
      assert.equal(candidate, automaticHtml, 'saved automatic bank policy replays identical derived HTML')
      return { pageCount: targetPages, inspection: [] }
    },
  })
}
const splitBankPlan = {
  ...plan, editions: { friendly8: { ...plan.editions.friendly8, allowSplitOptionBank: true } },
}
assert.deepEqual(validatePaperPaginationPlan(splitBankPlan, identity), splitBankPlan)
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
  const longBinding = { ...paginationPlanBinding, planDigest: digestJson(longPlan) }
  writeFileSync(path.join(directory, 'import-meta.json'), `${JSON.stringify({
    paginationPlanBinding: { ...longBinding, sourceAssetVersion: 1 },
  })}\n`)
  writeFileSync(path.join(directory, 'pagination-plan.json'), `${JSON.stringify(longPlan)}\n`)
  assert.equal(assertPaperImportPaginationPlan({ baseDir: directory, packageData: {
    ...packageData, paginationPlan: longPlan, paginationPlanBinding: longBinding,
  } }), longBinding.planDigest, 'v2 long-paper bytes retain the Review/publication commitment')
  writeFileSync(path.join(directory, 'import-meta.json'), `${JSON.stringify({
    paginationPlanBinding: { ...paginationPlanBinding, sourceAssetVersion: 1 },
  })}\n`)
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
