// Shared pure replay of the bounded adjacent-page scoring-cell transformation.
// Offline content/review binding only; no reviewer authentication or approval.
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { sourceReferenceUnionRegion } from './sourceReferenceWritingTask.mjs'
import { resolveConfirmedNck1OcrEvidence } from './nck1OcrSourceEvidence.mjs'
import { sourceReferenceScoringScopes } from './sourceReferenceScoringScope.mjs'
import { buildSourceReferences } from '../../scripts/import-pipeline/ocr-proofread.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION, usesCellContinuation } from './sourceReferenceSemantics.mjs'
import { assertSourceReferences } from './sourceReferences.mjs'

export const CELL_CONTINUATION_RULE = 'scoring-last-cell-adjacent-page-v1'
// Normalized-page edge drift only. The inter-column midpoint remains a hard
// boundary, even when the text on the second page has a slightly different inset.
const COLUMN_EDGE_TOLERANCE = .025

const fail = message => {
  throw Object.assign(new Error(`Scoring cell continuation: ${message}`),
    { code: 'SOURCE_REFERENCES_CELL_CONTINUATION_INVALID' })
}
const equal = (a, b) => digestJson(a) === digestJson(b)

// Rebuild the base table from the confirmation itself.  Never trust cell IDs,
// text or regions merely because they appear in the generated sidecar.
export function replayConfirmedScoringTable({ document, confirmationPage, evidencePage, table }) {
  if (document.role !== 'official_answers' || document.mediaType !== 'application/pdf') {
    fail('a separate official answers PDF is required')
  }
  if (evidencePage.page !== confirmationPage.page) fail('base evidence page changed')
  const visuals = confirmationPage.visualClassifications.filter(visual =>
    visual.classification === 'semantic_table'
    && `source-${visual.regionId.replace(/:/gu, '-')}` === table.tableId)
  if (visuals.length !== 1) fail('base table must match one confirmed semantic table')
  const visual = visuals[0]
  const items = new Map(confirmationPage.orderedItems.map(item => [item.itemId, item]))
  const observations = new Map(evidencePage.observations.map(item => [item.observationId, item]))
  const rows = visual.rows.map((row, r) => row.cells.map((ids, c) => {
    const selected = ids.map(id => items.get(id))
    if (!selected.length || selected.some(item => !item || !item.observationIds.length)) {
      fail('table cell items or observations are missing')
    }
    const boxes = selected.flatMap(item => item.observationIds.map(id => observations.get(id)))
    if (boxes.some(box => !box)) fail('table observation is missing')
    return {
      cellId: `source-${visual.regionId.replace(/:/gu, '-')}-r${r}-c${c}`,
      text: selected.map(item => item.text).join('\n'),
      source: { documentSha256: document.sha256, locator: {
        kind: 'page_region', documentId: document.documentId, page: confirmationPage.page,
        region: sourceReferenceUnionRegion(boxes),
      } },
    }
  }))
  if (!rows.length || rows.some(row => row.length !== rows[0].length)
    || table.rows.length !== rows.length || table.rows.some((row, r) => row.length !== rows[r].length)) {
    fail('base table shape changed')
  }
  return { visual, rows }
}

// The continuation consists of a prefix of the first surviving source items.
// The caller must additionally prove the selected prefix is one complete
// paragraph, validate OCR closure, writing/entry ownership, global consumption,
// and the offline review subject before using this result.
export function replayAdjacentPageItems({ document, basePage, page, evidencePage, itemIds }) {
  if (document.role !== 'official_answers' || document.mediaType !== 'application/pdf'
    || page.page !== basePage.page + 1 || evidencePage.page !== page.page) {
    fail('continuation must use the immediately following page of the same official answers PDF')
  }
  if (!Array.isArray(itemIds) || !itemIds.length || new Set(itemIds).size !== itemIds.length) {
    fail('continuation item IDs must be nonempty and unique')
  }
  const furniture = new Set(page.furnitureObservationIds)
  const selected = page.orderedItems.filter(item => !item.observationIds.length
    || !item.observationIds.every(id => furniture.has(id))).slice(0, itemIds.length)
  if (!equal(selected.map(item => item.itemId), itemIds)) fail('continuation must begin at the first surviving item')
  const firstIndex = page.orderedItems.indexOf(selected[0])
  if (!equal(page.orderedItems.slice(firstIndex, firstIndex + itemIds.length).map(item => item.itemId), itemIds)) {
    fail('continuation items must be consecutive')
  }
  const reserved = new Set(page.visualClassifications.flatMap(visual =>
    visual.classification === 'semantic_table' ? visual.rows.flatMap(row => row.cells.flat()) : []))
  if (selected.some(item => !item.observationIds.length || item.observationIds.some(id => furniture.has(id))
    || reserved.has(item.itemId))) fail('continuation items cannot be furniture or table members')
  const observations = new Map(evidencePage.observations.map(item => [item.observationId, item]))
  const ids = selected.flatMap(item => item.observationIds)
  if (new Set(ids).size !== ids.length) fail('continuation observations are repeated')
  const boxes = ids.map(id => observations.get(id))
  if (boxes.some(box => !box)) fail('continuation observation is missing')
  return {
    itemIds: [...itemIds],
    observationIds: ids,
    observations: boxes.map(box => ({ observationId: box.observationId, region: box.region })),
    source: { documentSha256: document.sha256, locator: {
      kind: 'page_region', documentId: document.documentId, page: page.page,
      region: sourceReferenceUnionRegion(boxes),
    } },
    text: selected.map(item => item.text).join('\n'),
  }
}

const inside = (outer, inner) => inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6
  && inner.x + inner.width <= outer.x + outer.width + 1e-6
  && inner.y + inner.height <= outer.y + outer.height + 1e-6
const overlaps = (a, b) => a.x < b.x + b.width - 1e-6 && a.x + a.width > b.x + 1e-6
  && a.y < b.y + b.height - 1e-6 && a.y + a.height > b.y + 1e-6
const withoutReview = relation => {
  const { review: _review, ...subject } = relation
  return subject
}

export function sourceReferenceCellContinuations(sidecar) {
  return sidecar?.groups?.flatMap(group => ['essays', 'scoring'].flatMap(kind =>
    group[kind].entries.flatMap(entry => (entry.blocks ?? []).flatMap(table =>
      table.kind === 'table' ? table.rows.flatMap(row => row.flatMap(cell =>
        cell.adjacentPageContinuation ? [{ group, kind, entry, table, cell,
          relation: cell.adjacentPageContinuation }] : [])) : [])))) ?? []
}

function closure({ materialization, sourceInput, sidecar, producerVersion = sidecar?.producerVersion ?? OCR_SOURCE_REFERENCES_PRODUCER_VERSION }) {
  const ocr = sourceInput?.ocrSourceBytes
  if (!ocr?.evidenceBytes || !ocr?.confirmationBytes) fail('exact OCR bytes are required')
  const evidence = JSON.parse(Buffer.from(ocr.evidenceBytes).toString('utf8'))
  const confirmation = JSON.parse(Buffer.from(ocr.confirmationBytes).toString('utf8'))
  const documents = materialization.documents.map(document => ({ ...document,
    bytes: sourceInput.documents.find(source => source.documentId === document.documentId)?.bytes }))
  if (documents.some(doc => !doc.bytes || sha256(doc.bytes) !== doc.sha256)) fail('source PDF bytes changed')
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId: materialization.paperId, documents, evidence, confirmation })
  if (resolved.issues.length) fail(`OCR closure invalid: ${resolved.issues[0].message}`)
  const answers = documents.filter(doc => ['official_answers', 'question_and_answers'].includes(doc.role))
  if (answers.length !== 1 || answers[0].role !== 'official_answers'
    || answers[0].mediaType !== 'application/pdf') fail('one separate official answer PDF required')
  const document = answers[0]
  const cp = confirmation.documents.find(doc => doc.documentId === document.documentId).pages
  const ep = evidence.documents.find(doc => doc.documentId === document.documentId).pages
  if (resolved.referenceFigures?.length || cp.some(page => page.visualClassifications.some(v => v.classification === 'content_media'))) {
    fail('images cannot be combined with scoring cell continuation')
  }
  const scopes = sourceReferenceScoringScopes(confirmation, new Set([document.documentId]),
    { producerVersion, materialization })
  return { evidence, confirmation, document, cp, ep, scopes }
}

// A selector proposes an attachment, never OCR text or table membership. The
// unchanged producer supplies the full paragraph boundary; this replay removes
// exactly that paragraph and preserves every other block/entry in source order.
// The producer's recursive call has no selectors and therefore cannot recurse.
export function prepareSourceReferenceCellContinuations(input, selectors, baseline = null) {
  const { materialization, sourceInput, sourceDigest, candidateDigest } = input
  const producerVersion = input.producerVersion ?? input.sidecar?.producerVersion ?? OCR_SOURCE_REFERENCES_PRODUCER_VERSION
  if (!usesCellContinuation(producerVersion)) fail('v25/v26 producer required')
  if (!Array.isArray(selectors) || !selectors.length) fail('nonempty selectors required')
  const ctx = closure(input)
  const { evidence, confirmation, document, cp, ep, scopes } = ctx
  const capture = baseline ?? buildSourceReferences(materialization, evidence, confirmation,
    { sourceDocuments: sourceInput.documents, producerVersion, sourceInput, sourceDigest, candidateDigest })
  if (capture.figureExclusions?.length || input.sidecar?.figureExclusions
    || input.sidecar?.wholeDocumentWritingAbsence) fail('exclusions/absence cannot be combined with cell continuation')
  const sidecar = { schemaVersion: 'source-references-v6', producerVersion,
    ...(capture.alternateAnswerScope ? { alternateAnswerScope: capture.alternateAnswerScope } : {}),
    paperId: materialization.paperId, sourceDigest, candidateDigest,
    materializationDigest: digestJson(materialization), groups: structuredClone(capture.groups) }
  if (!sourceDigest || !candidateDigest) fail('exact source/candidate binding required')
  const requests = [], used = new Set()
  for (const selector of selectors) {
    if (!equal(Object.keys(selector).sort(), ['groupId', 'referenceId', 'tableId', 'cellId',
      'documentId', 'page', 'itemIds', 'authorSessionId'].sort())) fail('unknown or missing selector fields')
    const { groupId, referenceId, tableId, cellId, documentId, page, itemIds, authorSessionId } = selector
    if (typeof authorSessionId !== 'string' || !authorSessionId.trim() || authorSessionId.length > 256) fail('author session required')
    const group = sidecar.groups.find(group => group.groupId === groupId)
    const entry = group?.scoring.entries.find(entry => entry.referenceId === referenceId)
    const table = entry?.blocks?.find(block => block.kind === 'table' && block.tableId === tableId)
    const cell = table?.rows.at(-1)?.at(-1)
    if (!cell || cell.cellId !== cellId || cell.adjacentPageContinuation || documentId !== document.documentId
      || cell.source.locator.documentId !== documentId || cell.source.locator.page + 1 !== page) fail('target must be an uncontinued final row/final cell on the preceding page')
    const basePage = cp.find(p => p.page === page - 1), nextPage = cp.find(p => p.page === page)
    const baseProof = ep.find(p => p.page === page - 1), nextProof = ep.find(p => p.page === page)
    if (!basePage || !nextPage || !baseProof || !nextProof) fail('adjacent source pages missing')
    const base = replayConfirmedScoringTable({ document, confirmationPage: basePage, evidencePage: baseProof, table })
    if (!equal(table.rows, base.rows)) fail('base table/cell identity, geometry or text changed')
    const baseIds = base.visual.rows.flatMap(row => row.cells.flat())
    const survivingBase = basePage.orderedItems.filter(item => !item.observationIds.length
      || !item.observationIds.every(id => basePage.furnitureObservationIds.includes(id)))
    if (survivingBase.at(-1)?.itemId !== baseIds.at(-1)) fail('base table must end the preceding page')
    const fragment = replayAdjacentPageItems({ document, basePage, page: nextPage, evidencePage: nextProof, itemIds })
    const index = entry.blocks.indexOf(table)
    const paragraph = entry.blocks[index + 1]?.paragraph
    if (!paragraph || paragraph.role !== 'body' || paragraph.continuationSources
      || paragraph.source.locator.page !== page || paragraph.source.locator.documentId !== documentId) fail('continuation must be the complete first scoring paragraph immediately after the table')
    const nextObs = new Map(nextProof.observations.map(obs => [obs.observationId, obs]))
    const paragraphItems = nextPage.orderedItems.filter(item => item.observationIds.length
      && item.observationIds.every(id => inside(paragraph.source.locator.region, nextObs.get(id).region)))
    if (!equal(paragraphItems.map(item => item.itemId), itemIds)
      || !equal(paragraph.source, fragment.source)) fail('continuation omits or adds paragraph items/geometry')
    const labelItems = cp.flatMap(p => p.orderedItems.map(item => ({ item, page: p.page }))).filter(({ item, page }) =>
      page === entry.labelSource?.locator.page && item.text === entry.sourceLabel
      && item.observationIds.every(id => inside(entry.labelSource.locator.region,
        ep.find(p => p.page === page).observations.find(obs => obs.observationId === id).region)))
    if (labelItems.length !== 1) fail('exact scoring entry label required')
    for (const id of [...baseIds, ...itemIds]) {
      const scope = scopes.get(id)
      if (!scope || scope.taskType !== group.taskType || scope.labelItemId !== labelItems[0].item.itemId) {
        fail('base and continuation must belong to the same Writing Task and scoring entry')
      }
      if (used.has(id)) fail('source items cannot be consumed twice or chained')
      used.add(id)
    }
    const region = fragment.source.locator.region
    const columns = base.rows[0].map((_, c) => base.rows.map(row => row[c].source.locator.region))
    const lastColumn = columns.at(-1)
    const left = Math.min(...lastColumn.map(r => r.x))
    const right = Math.max(...lastColumn.map(r => r.x + r.width))
    const otherRight = Math.max(0, ...columns.slice(0, -1).flat().map(r => r.x + r.width))
    if (columns.length < 2 || otherRight >= left || region.x < (otherRight + left) / 2
      || region.x < left - COLUMN_EDGE_TOLERANCE || region.x + region.width > right + COLUMN_EDGE_TOLERANCE) fail('continuation column attribution is ambiguous or crosses columns')
    for (const visual of nextPage.visualClassifications) {
      const box = nextProof.regions.find(r => r.regionId === visual.regionId)?.region
      if (box && overlaps(box, region)) fail('continuation overlaps an existing visual/table region')
    }
    const before = structuredClone(cell), afterText = `${cell.text}\n${fragment.text}`
    const pages = [baseProof, nextProof].map(p => ({ documentId, page: p.page, rasterSha256: p.raster.sha256 }))
    const relation = { ruleVersion: CELL_CONTINUATION_RULE, authorSessionId,
      sourceSetDigest: evidence.sourceSetDigest, evidenceSha256: sha256(sourceInput.ocrSourceBytes.evidenceBytes),
      confirmationSha256: sha256(sourceInput.ocrSourceBytes.confirmationBytes),
      baseItemIds: base.visual.rows.at(-1).cells.at(-1), fragment, pages,
      transformation: { ruleVersion: CELL_CONTINUATION_RULE,
        target: { groupId, referenceId, tableId, cellId }, before,
        after: { cellId, text: afterText, source: cell.source },
        inputItemIds: [...base.visual.rows.at(-1).cells.at(-1), ...itemIds] },
      review: null }
    cell.text = afterText
    cell.adjacentPageContinuation = relation
    entry.blocks.splice(index + 1, 1)
    requests.push({ selector, relation, baseTable: { kind: 'table', tableId, rows: base.rows } })
  }
  if (!equal(sourceReferenceCellContinuations(sidecar).map(({ cell }) => cell.cellId),
    requests.map(({ selector }) => selector.cellId))) fail('selectors must follow source-reference order')
  // Subject closes over all post-transform groups, including consumption and
  // block order, but excludes every review to avoid self-referential digests.
  const subjectGroups = structuredClone(sidecar.groups)
  for (const { cell } of sourceReferenceCellContinuations({ groups: subjectGroups })) {
    cell.adjacentPageContinuation = withoutReview(cell.adjacentPageContinuation)
  }
  return { sidecar, requests: requests.map(({ selector, relation, baseTable }) => {
    const subject = { producerVersion: sidecar.producerVersion, ruleVersion: CELL_CONTINUATION_RULE,
      paperId: sidecar.paperId, sourceDigest, candidateDigest, materializationDigest: sidecar.materializationDigest,
      target: relation.transformation.target, baseTable, relation: withoutReview(relation), groups: subjectGroups }
    return { selector, subject, subjectDigest: digestJson(subject), review: null }
  }) }
}

// The offline record binds content; sessions are audit strings, not identities,
// signatures, server receipts, Owner approval or proof that human QA happened.
export function replaySourceReferenceCellContinuations(input, { requireReview = true } = {}) {
  const { sidecar } = input
  const relations = sourceReferenceCellContinuations(sidecar)
  if (!relations.length) {
    if (sidecar?.schemaVersion === 'source-references-v6') fail('v6 requires a cell continuation')
    // Trigger from the confirmed PDF, never from removable sidecar fields or
    // its layout version. Historical sealed producers retain their own rules.
    if (usesCellContinuation(sidecar?.producerVersion)) {
      const { materialization, sourceInput } = input
      const ocr = sourceInput?.ocrSourceBytes
      // Analyzed packages have members/JSON pointers, not native PDF documents;
      // admission already validates their exact package binding above this replay.
      const answerIds = new Set((materialization.documents ?? []).filter(document =>
        ['official_answers', 'question_and_answers'].includes(document.role)
        && document.mediaType === 'application/pdf').map(document => document.documentId))
      const confirmation = ocr?.confirmationBytes
        ? JSON.parse(Buffer.from(ocr.confirmationBytes).toString('utf8')) : null
      const hasConfirmedTable = confirmation?.documents.some(document => answerIds.has(document.documentId)
        && document.pages.some(page => page.visualClassifications.some(visual => visual.classification === 'semantic_table')))
      if (hasConfirmedTable) {
        if (!ocr.evidenceBytes) fail('confirmed PDF tables require exact OCR evidence')
        const evidence = JSON.parse(Buffer.from(ocr.evidenceBytes).toString('utf8'))
        const documents = materialization.documents.map(document => ({ ...document,
          bytes: sourceInput.documents.find(source => source.documentId === document.documentId)?.bytes }))
        if (documents.some(document => !document.bytes || sha256(document.bytes) !== document.sha256)) fail('source PDF bytes changed')
        const resolved = resolveConfirmedNck1OcrEvidence({ paperId: materialization.paperId, documents, evidence, confirmation })
        if (resolved.issues.length) fail(`OCR closure invalid: ${resolved.issues[0].message}`)
        const baseline = buildSourceReferences(materialization, evidence, confirmation,
          { sourceDocuments: sourceInput.documents, figureExclusions: sidecar.figureExclusions ?? [],
            producerVersion: sidecar.producerVersion, sourceInput, sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest })
        if (!equal(sidecar.groups, baseline.groups)) fail('confirmed PDF table text, sources or whole-sidecar consumption changed')
      }
    }
    return []
  }
  if (sidecar.schemaVersion !== 'source-references-v6'
    || !usesCellContinuation(sidecar.producerVersion)) fail('v6 with v25/v26 producer required')
  if (requireReview) assertSourceReferences({ ...input, sourceDocuments: input.sourceInput?.documents })
  const selectors = relations.map(({ group, kind, entry, table, cell, relation }) => {
    if (kind !== 'scoring') fail('only scoring tables support this relation')
    return { groupId: group.groupId, referenceId: entry.referenceId, tableId: table.tableId, cellId: cell.cellId,
      documentId: relation.fragment.source.locator.documentId, page: relation.fragment.source.locator.page,
      itemIds: relation.fragment.itemIds, authorSessionId: relation.authorSessionId }
  })
  const prepared = prepareSourceReferenceCellContinuations(input, selectors)
  const expected = prepared.sidecar
  const actual = structuredClone(sidecar)
  for (const { cell } of sourceReferenceCellContinuations(actual)) cell.adjacentPageContinuation.review = null
  if (!equal(actual, expected)) fail('source, target, text, geometry, closure or whole-sidecar consumption changed')
  for (const [index, { relation }] of relations.entries()) {
    const request = prepared.requests[index], review = relation.review
    if (requireReview && (!review || review.reviewedBy !== 'import_agent' || review.verdict !== 'confirmed_continuation'
      || !review.reviewerSessionId?.trim() || review.reviewerSessionId === relation.authorSessionId
      || review.reviewedSubjectDigest !== request.subjectDigest
      || review.pages?.length !== 2 || review.pages.some((page, i) => !page.finding?.trim()
        || !equal({ documentId: page.documentId, page: page.page, rasterSha256: page.rasterSha256 }, relation.pages[i])))) {
      fail('independent source-page review is missing, incomplete or stale')
    }
  }
  return prepared.requests
}

// Rebuild, never rebind an old review. Drift leaves a new pending proposal.
export function refreshSourceReferenceCellContinuations(input, retained) {
  const relations = sourceReferenceCellContinuations(retained)
  const selectors = relations.map(({ group, entry, table, cell, relation }) => ({
    groupId: group.groupId, referenceId: entry.referenceId, tableId: table.tableId, cellId: cell.cellId,
    documentId: relation.fragment.source.locator.documentId, page: relation.fragment.source.locator.page,
    itemIds: relation.fragment.itemIds, authorSessionId: relation.authorSessionId,
  }))
  const prepared = prepareSourceReferenceCellContinuations(input, selectors)
  for (const [index, { relation }] of sourceReferenceCellContinuations(prepared.sidecar).entries()) {
    const previous = relations[index].relation.review
    if (previous?.reviewedSubjectDigest === prepared.requests[index].subjectDigest) relation.review = structuredClone(previous)
  }
  let pending = false
  try { replaySourceReferenceCellContinuations({ ...input, sidecar: prepared.sidecar }) } catch { pending = true }
  return { ...prepared, pending }
}
