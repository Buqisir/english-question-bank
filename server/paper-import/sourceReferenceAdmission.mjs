import { sourceReferenceScoringScopes, sourceReferenceObjectiveFigureAnchors } from './sourceReferenceScoringScope.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { assertSourceReferences, sourceReferenceBlocks, sourceReferenceFigures,
  SOURCE_REFERENCE_REGION_TOLERANCE } from './sourceReferences.mjs'
import { resolveConfirmedNck1OcrEvidence } from './nck1OcrSourceEvidence.mjs'
import { assertSourceReferenceFigureReplay } from './sourceReferenceImages.mjs'
import { BARE_APPLICATION_SECTION, WRITING_SECTION, LISTENING_REFERENCE_START,
  NON_WRITING_SECTION, isSourceReferenceSampleLabel, SOURCE_REFERENCE_ANSWER_ROLES } from './sourceReferenceWritingRules.mjs'

function reject(message) {
  throw Object.assign(new Error(message), { code: 'SOURCE_REFERENCES_FIGURE_COVERAGE_INVALID' })
}

const normalize = text => text.replace(/\s+/gu, ' ').trim()
const joinedText = text => text.normalize('NFKC').replace(/-\s+/gu, '-').replace(/\s+/gu, '')
const paragraphSources = paragraph => [paragraph.source, ...(paragraph.continuationSources ?? [])]
const samePagePair = (sources, index) => index > 0
  && sources[index].locator.kind === 'page_region' && sources[index - 1].locator.kind === 'page_region'
  && sources[index].locator.page === sources[index - 1].locator.page
const hasSamePageContinuation = paragraph => {
  const sources = paragraphSources(paragraph)
  return sources.some((_, index) => samePagePair(sources, index))
}

// Only explicit confirmed NCK1 writing headings establish task ownership.
// Missing/ambiguous scopes fail closed rather than borrowing the nearest task.
function writingScopes(confirmation, answerIds) {
  const scopes = new Map()
  for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
    let writing = false, task = null
    for (const page of document.pages) for (const item of page.orderedItems) {
      const text = item.text.normalize('NFKC').replace(/\s+/gu, '')
      if (/^第[一二三四五六]部分/u.test(text)) {
        writing = /^第[三四]部分(?:写作|书面表达)/u.test(text)
        task = null
      }
      const heading = text.replace(/^第[三四]部分(?:写作|书面表达)(?:\([^)]*\))?/u, '')
      if (LISTENING_REFERENCE_START.test(heading) || NON_WRITING_SECTION.test(heading)
        || /^(?:试题解析|参考答案解析)/u.test(heading)) {
        writing = false
        task = null
      }
      // A standalone application task also opens writing, as in the producer
      // and scoring scope, so a following bare 第二节 can own continuation.
      if (BARE_APPLICATION_SECTION.test(heading)) writing = true
      if ((writing && /^第一节(?:\(|$)/u.test(heading))
        || BARE_APPLICATION_SECTION.test(heading) || WRITING_SECTION[0][1].test(heading)
        || /^(?:第一节(?:\([^)]*\))?)?(?:应用文写作|书面表达)$/u.test(heading)) task = 'application'
      if ((writing && /^第二节(?:\(|$)/u.test(heading))
        || WRITING_SECTION[1][1].test(heading)
        || /^(?:第二节(?:\([^)]*\))?)?读后续写$/u.test(heading)) task = 'continuation'
      scopes.set(item.itemId, task)
    }
  }
  return scopes
}

// A task heading, an explicit sample label and its immediate English text
// independently disprove absence. Do not infer a sample from rubric prose or
// a label followed by "略"/nothing. This check also runs for books without images.
function assertLabeledSamplesPresent(sidecar, confirmation, answerIds) {
  const scopes = writingScopes(confirmation, answerIds)
  const sampleLabel = /^(?:参考范文|考场作文|作答示例|范文|(?:(?:A|One)\s+)?Possible\s+Versions?)\s*[:：]?$/iu
  for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
    let pending = null
    for (const page of document.pages) for (const item of page.orderedItems) {
      const task = scopes.get(item.itemId)
      const text = item.text.normalize('NFKC').trim()
      if (LISTENING_REFERENCE_START.test(text)) {
        pending = null
        continue
      }
      if (pending && pending === task && !sampleLabel.test(text)
        && /[A-Za-z]/u.test(text) && !/\p{Script=Han}/u.test(text)) {
        const essays = sidecar?.groups.find(group => group.taskType === task)?.essays
        if (essays?.state !== 'captured' || !essays.entries.length) {
          throw Object.assign(new Error('Confirmed labeled writing sample cannot be declared not_supplied'),
            { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
        }
      }
      pending = task && sampleLabel.test(text) ? task : null
    }
  }
}
function containsSource(source, inner) {
  const outer = source?.locator
  if (outer?.kind !== 'page_region' || outer.documentId !== inner.documentId || outer.page !== inner.page) return false
  const a = outer.region, b = inner.region
  return b.x >= a.x - SOURCE_REFERENCE_REGION_TOLERANCE && b.y >= a.y - SOURCE_REFERENCE_REGION_TOLERANCE
    && b.x + b.width <= a.x + a.width + SOURCE_REFERENCE_REGION_TOLERANCE
    && b.y + b.height <= a.y + a.height + SOURCE_REFERENCE_REGION_TOLERANCE
}

function survivingConfirmedText(confirmation, evidence, referenceFigures) {
  const pictureItems = new Set(referenceFigures.flatMap(reference => reference.itemIds))
  const evidenceDocuments = new Map(evidence.documents.map(document => [document.documentId, document]))
  return new Map(confirmation.documents.map(document => {
    const pages = new Map(evidenceDocuments.get(document.documentId).pages.map(page => [page.page, page]))
    return [document.documentId, document.pages.flatMap(page => {
      const observations = new Map(pages.get(page.page).observations.map(item => [item.observationId, item]))
      return page.orderedItems.filter(item => !pictureItems.has(item.itemId)).map(item => {
        const boxes = item.observationIds.map(id => observations.get(id).region)
        const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y))
        return { itemId: item.itemId, text: item.text, sourceIndex: { kind: 'page_region', documentId: document.documentId,
          page: page.page, region: { x, y,
            width: Math.max(...boxes.map(box => box.x + box.width)) - x,
            height: Math.max(...boxes.map(box => box.y + box.height)) - y } } }
      })
    })]
  }))
}

// Acceptance/finalize boundary. This always uses exact input bytes, and has no
// bypass flag. Published consumers use the separate integrity validator and
// SQLite's approved sidecar-byte commitment; they never recrop during export.
export function assertSourceReferenceAdmission({
  sidecar, materialization, sourceDigest, candidateDigest, sourceInput,
}) {
  if (sidecar) assertSourceReferences({ sidecar, materialization, sourceDigest, candidateDigest,
    sourceDocuments: sourceInput.documents, sourceInput })
  const figures = sourceReferenceFigures(sidecar)
  const continued = sidecar?.groups.flatMap(group => ['essays', 'scoring'].flatMap(kind =>
    group[kind].entries.flatMap(entry => sourceReferenceBlocks(entry)
      .filter(block => block.kind === 'paragraph').map(block => block.paragraph))))
    .some(hasSamePageContinuation)
  const ocr = sourceInput.ocrSourceBytes
  if (!ocr) {
    if (figures.length) reject('Reference figures require sealed OCR confirmation and writing-scope anchors')
    if (continued) reject('Same-page continuation requires sealed confirmation source order and ownership')
    return
  }
  const confirmation = JSON.parse(Buffer.from(ocr.confirmationBytes).toString('utf8'))
  const answerIds = new Set(materialization.documents.filter(document => SOURCE_REFERENCE_ANSWER_ROLES.includes(document.role))
    .map(document => document.documentId))
  assertLabeledSamplesPresent(sidecar, confirmation, answerIds)
  const hasReferenceVisual = confirmation.documents.some(document => answerIds.has(document.documentId)
    && document.pages.some(page => page.visualClassifications.some(visual => visual.classification === 'content_media')))
  if (!hasReferenceVisual && !figures.length && !continued) return
  if ((hasReferenceVisual || figures.length)
    && (!sidecar || !['source-references-v3', 'source-references-v4'].includes(sidecar.schemaVersion))) {
    reject('Confirmed official-answer content figures require a complete source-references-v3/v4 sidecar; v1/v2 cannot omit them')
  }
  const documents = materialization.documents.map(document => ({ ...document,
    bytes: sourceInput.documents.find(source => source.documentId === document.documentId)?.bytes }))
  const evidence = JSON.parse(Buffer.from(ocr.evidenceBytes).toString('utf8'))
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId: materialization.paperId, documents,
    evidence, confirmation })
  if (resolved.issues.length) reject(`Invalid sealed OCR confirmation: ${resolved.issues[0].message}`)
  const allExpected = resolved.referenceFigures ?? []
  const objectiveAnchors = sourceReferenceObjectiveFigureAnchors(confirmation, answerIds)
  const expected = allExpected.filter(reference => !objectiveAnchors.has(reference.afterItem.itemId)
    || figures.some(({ figure }) => reference.sourceRegionId === figure.sourceRegionId
      && digestJson(reference.source) === digestJson(figure.source.locator)))
  if (expected.length !== figures.length) reject('All confirmed official-answer content figures must match sidecar figures one-to-one')
  // Layout resolution moves table items out of paragraphs. Index validated
  // confirmation text before layout, excluding only picture-consumed identities.
  const confirmedTexts = survivingConfirmedText(confirmation, evidence, allExpected)
  const paragraphs = sidecar.groups.flatMap(group => group.essays.entries.flatMap(entry =>
    entry.paragraphs.map(paragraph => ({ group, entry, paragraph }))))
  const illustratedDocuments = new Set(allExpected.map(reference => reference.source.documentId))
  const scopes = writingScopes(confirmation, answerIds)
  const scoringScopes = sourceReferenceScoringScopes(confirmation, answerIds)
  const pictureItems = new Set(allExpected.flatMap(reference => reference.itemIds))
  const sourceOrder = new Map(), sourceOwners = new Map()
  for (const document of confirmation.documents) {
    let previousTask = null, essayLabel = null, index = 0
    for (const page of document.pages) for (const item of page.orderedItems) {
      // Confirmation furniture and the resolver's picture-consumed identities
      // are the only permitted gaps. No geometric or text-value exclusions.
      if (pictureItems.has(item.itemId)
        || (item.observationIds.length && item.observationIds.every(id => page.furnitureObservationIds.includes(id)))) continue
      sourceOrder.set(item.itemId, { documentId: document.documentId, index: index++ })
      const taskType = scopes.get(item.itemId)
      if (taskType !== previousTask) essayLabel = null
      previousTask = taskType
      const scoring = scoringScopes.get(item.itemId)
      if (scoring) {
        essayLabel = null
        sourceOwners.set(item.itemId, { kind: 'scoring', ...scoring })
      } else if (taskType) {
        if (isSourceReferenceSampleLabel(item.text)) essayLabel = item.itemId
        sourceOwners.set(item.itemId, { kind: 'essays', taskType, labelItemId: essayLabel })
      }
    }
  }
  const texts = sidecar.groups.flatMap(group => ['essays', 'scoring'].flatMap(kind =>
    group[kind].entries.flatMap(entry => [
      ...(entry.sourceLabel === null ? [] : [{ text: entry.sourceLabel, source: entry.labelSource }]),
      ...sourceReferenceBlocks(entry).flatMap(block => block.kind === 'paragraph'
        ? [block.paragraph] : block.kind === 'table' ? block.rows.flat() : []),
    ].map(text => ({ ...text, group, kind, entry })))))
  for (const text of texts) {
    const sources = [text.source, ...(text.continuationSources ?? [])]
    if (!hasSamePageContinuation(text)
      && !sources.some(source => illustratedDocuments.has(source.locator.documentId))) continue
    // The resolver has already consumed exactly the selected image itemIds and
    // observationIds. Replay the surviving items, never remove words by value.
    const fragments = sources.map(source =>
      (confirmedTexts.get(source.locator.documentId) ?? [])
        .filter(item => containsSource(source, item.sourceIndex)))
    const surviving = fragments.flat()
    if (fragments.some(fragment => !fragment.length) || new Set(surviving).size !== surviving.length
      || joinedText(surviving.map(item => item.text).join(' ')) !== joinedText(text.text)) {
      reject('Reference text must replay surviving confirmed OCR items; image observations cannot reappear as prose, labels or table cells')
    }
    if (hasSamePageContinuation(text)) {
      const labelItemId = sourceOwners.get(surviving[0].itemId)?.labelItemId
      const labels = text.entry.labelSource
        ? (confirmedTexts.get(text.entry.labelSource.locator.documentId) ?? [])
          .filter(item => containsSource(text.entry.labelSource, item.sourceIndex)).map(item => item.itemId) : []
      let previous = null
      for (const item of surviving) {
        const position = sourceOrder.get(item.itemId), owner = sourceOwners.get(item.itemId)
        if (!position || !owner || owner.taskType !== text.group.taskType || owner.kind !== text.kind
          || owner.labelItemId !== labelItemId
          || (text.entry.labelSource && !labels.includes(owner.labelItemId))
          || (previous && (position.documentId !== previous.documentId || position.index !== previous.index + 1))) {
          reject('Same-page continuation must prove adjacent source order and the same task/entry ownership')
        }
        previous = position
      }
    }
  }
  const sourceItems = source => (confirmedTexts.get(source?.locator.documentId) ?? [])
    .filter(item => containsSource(source, item.sourceIndex))
  const boundaryItems = block => block.kind === 'paragraph'
    ? [block.paragraph.source, ...(block.paragraph.continuationSources ?? [])].flatMap(sourceItems)
    : block.kind === 'table' ? block.rows.flat().flatMap(cell => sourceItems(cell.source)) : []

  const seen = new Set(), figureReferences = new Map()
  for (const { figure } of figures) {
    const matches = expected.filter(reference => reference.sourceRegionId === figure.sourceRegionId
      && digestJson(reference.source) === digestJson(figure.source.locator))
    if (matches.length !== 1 || seen.has(matches[0])) reject('Missing, extra, duplicated or substituted source figure region')
    const reference = matches[0]
    seen.add(reference)
    figureReferences.set(figure, reference)
  }
  if (sidecar.schemaVersion === 'source-references-v4') {
    // Local paragraph→figure adjacency alone permits swapping intact pairs.
    // Index the sealed page/item sequence, including picture-consumed items.
    const positions = new Map(confirmation.documents.flatMap(document =>
      document.pages.flatMap(page => page.orderedItems).map((item, index) =>
        [item.itemId, { documentId: document.documentId, index }])))
    for (const group of sidecar.groups) for (const entry of group.scoring.entries) {
      let documentId = entry.labelSource?.locator.documentId
      let previousEnd = -1
      const range = items => {
        const selected = items.map(item => positions.get(item.itemId))
        documentId ??= selected[0]?.documentId
        if (!selected.length || selected.some(position => !position || position.documentId !== documentId)) {
          reject('Scoring blocks require confirmed source order in one answer document')
        }
        return { start: Math.min(...selected.map(position => position.index)),
          end: Math.max(...selected.map(position => position.index)) }
      }
      if (entry.labelSource) previousEnd = range(sourceItems(entry.labelSource)).end
      for (const block of sourceReferenceBlocks(entry)) {
        let current
        if (block.kind === 'figure') {
          const reference = figureReferences.get(block)
          // Empty pictures occupy the gap after their proven anchor; pictures
          // containing OCR items also reserve their entire consumed range.
          const anchor = range([reference.afterItem])
          current = { start: anchor.end + .5, end: reference.itemIds.length
            ? range(reference.itemIds.map(itemId => ({ itemId }))).end : anchor.end + .5 }
        } else current = range(boundaryItems(block))
        if (current.start <= previousEnd) {
          reject('Scoring blocks must follow confirmed source order without overlapping source ranges')
        }
        previousEnd = current.end
      }
    }
  }
  for (const { figure, entry, group, kind } of figures) {
    const reference = figureReferences.get(figure)
    const scoringScope = scoringScopes.get(reference.afterItem.itemId)
    if (kind === 'scoring') {
      const labels = sourceItems(entry.labelSource).filter(item => normalize(item.text) === normalize(entry.sourceLabel ?? ''))
      if (!scoringScope || scoringScope.taskType !== group.taskType
        || labels.length !== 1 || labels[0].itemId !== scoringScope.labelItemId) {
        reject('Scoring figure requires its exact confirmed scoring label and Writing Task')
      }
      const blocks = sourceReferenceBlocks(entry)
      const index = blocks.indexOf(figure)
      const previous = index === 0 ? labels : boundaryItems(blocks[index - 1])
      if (!previous.length || previous.at(-1).itemId !== reference.afterItem.itemId) {
        reject('Scoring figure must follow the exact label, paragraph or final table boundary in source order')
      }
      assertSourceReferenceFigureReplay({ figure,
        document: documents.find(document => document.documentId === figure.source.locator.documentId) })
      continue
    }
    if (sidecar.schemaVersion === 'source-references-v4' && scoringScope) {
      reject('Confirmed scoring figures cannot be reassigned to essays')
    }
    if (scopes.get(reference.afterItem.itemId) !== group.taskType) {
      reject('Figure anchor requires an explicit confirmed source writing scope matching its Writing Task')
    }
    // An exact surviving item proves the paragraph and entry. Task ownership
    // comes from the confirmed headings, not the sidecar's declared grouping.
    const anchors = paragraphs.filter(item =>
      [item.paragraph.source, ...(item.paragraph.continuationSources ?? [])]
        .some(source => containsSource(source, reference.afterItem.source))
      && normalize(item.paragraph.text).endsWith(normalize(reference.afterItem.text)))
    if (anchors.length !== 1 || anchors[0].entry !== entry || anchors[0].group !== group
      || anchors[0].paragraph.paragraphId !== figure.afterParagraphId) {
      reject('Figure has no exact unique surviving paragraph in its Writing Task and essay; cross-entry and before-first placement are unsupported')
    }
    assertSourceReferenceFigureReplay({ figure,
      document: documents.find(document => document.documentId === figure.source.locator.documentId) })
  }
}
