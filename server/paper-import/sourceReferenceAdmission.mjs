import { sourceReferenceScoringScopes, sourceReferenceObjectiveFigures, sourceReferenceFigureIdentity } from './sourceReferenceScoringScope.mjs'
import { sourceReferenceExplanationFigures } from './sourceReferenceFigureExclusions.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { assertSourceReferences, sourceReferenceBlocks, sourceReferenceFigures,
  SOURCE_REFERENCE_REGION_TOLERANCE, parseSourceReferencesBytes } from './sourceReferences.mjs'
import { resolveConfirmedNck1OcrEvidence } from './nck1OcrSourceEvidence.mjs'
import { assertSourceReferenceFigureReplay } from './sourceReferenceImages.mjs'
import { SOURCE_REFERENCE_ANSWER_ROLES } from './sourceReferenceWritingRules.mjs'
import { sourceReferenceEssayTaskStates, sourceReferenceWritingTaskHeading } from './sourceReferenceWritingTask.mjs'
import { wholeDocumentAbsenceSubject } from './sourceReferenceWholeDocumentAbsence.mjs'
import { sourceReferenceProducerVersion, OCR_SOURCE_REFERENCES_PRODUCER_VERSION, LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
  assertSourceReferenceProducerVersion, usesExplicitWritingTitles } from './sourceReferenceSemantics.mjs'

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

// A task heading, an explicit sample label and its immediate English text
// independently disprove absence. Do not infer a sample from rubric prose or
// a label followed by "略"/nothing. This check also runs for books without images.
function assertLabeledSamplesPresent(sidecar, confirmation, answerIds, writingStates, producerVersion) {
  const sampleLabel = /^(?:参考范文|考场作文|作答示例|范文|(?:(?:A|One)\s+)?Possible\s+Versions?)\s*[:：]?$/iu
  for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
    const items = document.pages.flatMap(page => page.orderedItems)
    for (const [index, item] of items.entries()) {
      const state = writingStates.get(item.itemId)
      const previous = items[index - 1]
      const text = item.text.normalize('NFKC').trim()
      const explicitBody = usesExplicitWritingTitles(producerVersion) && state?.action === 'body'
        && (state.capturing || state.kind === 'scoring')
      if (explicitBody || (state?.capturing && previous && state.labelItemId === previous.itemId
        && sampleLabel.test(previous.text.normalize('NFKC').trim())
        && !sampleLabel.test(text) && /[A-Za-z]/u.test(text) && !/\p{Script=Han}/u.test(text))) {
        const kind = explicitBody ? state.kind : 'essays'
        const section = sidecar?.groups.find(group => group.taskType === state.task)?.[kind]
        if (section?.state !== 'captured' || !section.entries.length) {
          throw Object.assign(new Error('Confirmed writing reference body cannot be declared not_supplied'),
            { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
        }
      }
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
export function assertSourceReferenceAdmission(input) {
  return assertSourceReferenceContent(input, sourceReferenceProducerVersion(input.sidecar))
}

// Replay only: receipt must come from an already persisted/validated revision,
// never from a new draft, request options or a digest computed at first finalize.
// Parse the exact committed bytes here; do not accept a separately supplied
// sidecar object whose semantics could disagree with the verified byte stream.
export function assertSealedSourceReferenceReplay({ sourceReferencesBytes, receipt, ...input }) {
  const bytes = sourceReferencesBytes instanceof Uint8Array ? Buffer.from(sourceReferencesBytes) : null
  if (!bytes || !receipt?.revisionId || !/^sha256:[a-f0-9]{64}$/u.test(receipt.bundleDigest || '')
    || !/^sha256:[a-f0-9]{64}$/u.test(receipt.sourceReferencesDigest || '')
    || sha256(bytes) !== receipt.sourceReferencesDigest
    || receipt.paperId !== input.materialization.paperId
    || receipt.sourceDigest !== input.sourceDigest || receipt.candidateDigest !== input.candidateDigest) {
    throw Object.assign(new Error('Historical references differ from the trusted sealed revision receipt'),
      { code: 'SOURCE_REFERENCES_SEALED_DIGEST_INVALID' })
  }
  const sidecar = parseSourceReferencesBytes(bytes)
  const legacy = (!Object.hasOwn(sidecar, 'producerVersion')
    || sidecar.producerVersion === LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION)
    && /^source-references-v[1-5]$/u.test(sidecar.schemaVersion)
  const producerVersion = legacy ? LEGACY_OCR_SOURCE_REFERENCES_PRODUCER_VERSION
    : assertSourceReferenceProducerVersion(sidecar.producerVersion)
  return assertSourceReferenceContent({ ...input, sidecar }, producerVersion)
}

function assertSourceReferenceContent({
  sidecar, materialization, sourceDigest, candidateDigest, sourceInput,
}, producerVersion) {
  if (sidecar) assertSourceReferences({ sidecar, materialization, sourceDigest, candidateDigest,
    sourceDocuments: sourceInput.documents, sourceInput })
  if (sidecar?.wholeDocumentWritingAbsence) {
    wholeDocumentAbsenceSubject({ sidecar, materialization, sourceInput, sourceDigest, candidateDigest })
    const ocr = sourceInput.ocrSourceBytes
    const confirmation = JSON.parse(Buffer.from(ocr.confirmationBytes).toString('utf8'))
    const evidence = JSON.parse(Buffer.from(ocr.evidenceBytes).toString('utf8'))
    const answerIds = new Set(materialization.documents.filter(document => SOURCE_REFERENCE_ANSWER_ROLES.includes(document.role))
      .map(document => document.documentId))
    sourceReferenceEssayTaskStates(confirmation, answerIds, materialization, evidence,
      { producerVersion, sidecar, sourceInput, sourceDigest, candidateDigest })
    return
  }
  const figures = sourceReferenceFigures(sidecar)
  const continued = sidecar?.groups.flatMap(group => ['essays', 'scoring'].flatMap(kind =>
    group[kind].entries.flatMap(entry => sourceReferenceBlocks(entry)
      .filter(block => block.kind === 'paragraph').map(block => block.paragraph))))
    .some(hasSamePageContinuation)
  const ocr = sourceInput.ocrSourceBytes
  if (!ocr) {
    if (producerVersion === OCR_SOURCE_REFERENCES_PRODUCER_VERSION && sidecar?.groups?.length === 2
      && sidecar.groups.every(group => ['essays', 'scoring'].every(kind => group[kind].state === 'not_supplied'))
      && materialization.documents?.some(document => document.role === 'official_answers' && document.mediaType === 'application/pdf')) {
      reject('Whole-document PDF absence requires complete OCR evidence and confirmation')
    }
    if (sidecar?.figureExclusions?.length) reject('Explanation figure exclusions require sealed OCR evidence')
    if (figures.length) reject('Reference figures require sealed OCR confirmation and writing-scope anchors')
    if (continued) reject('Same-page continuation requires sealed confirmation source order and ownership')
    return
  }
  const confirmation = JSON.parse(Buffer.from(ocr.confirmationBytes).toString('utf8'))
  const answerIds = new Set(materialization.documents.filter(document => SOURCE_REFERENCE_ANSWER_ROLES.includes(document.role))
    .map(document => document.documentId))
  const evidence = ocr.evidenceBytes ? JSON.parse(Buffer.from(ocr.evidenceBytes).toString('utf8')) : undefined
  const writingStates = sourceReferenceEssayTaskStates(confirmation, answerIds, materialization, evidence, { producerVersion })
  assertLabeledSamplesPresent(sidecar, confirmation, answerIds, writingStates, producerVersion)
  // Repeated task headings must not let a sidecar omit one of the preserved
  // samples. Bind each captured source body to its own entry and label.
  if (sidecar && [...writingStates.values()].some(state => state.repeatedTask && state.capturing && state.action === 'body')) {
    if (!evidence) throw Object.assign(new Error('Repeated writing task requires OCR evidence'),
      { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
    const normalizedConfirmation = { documents: confirmation.documents.filter(document => answerIds.has(document.documentId))
      .map(document => ({ ...document, pages: document.pages.map((page, index) =>
        ({ ...page, page: page.page ?? index + 1 })) })) }
    const normalizedEvidence = { documents: evidence.documents.map(document => ({ ...document,
      pages: document.pages.map((page, index) => ({ ...page, page: page.page ?? index + 1 })) })) }
    const confirmed = survivingConfirmedText(normalizedConfirmation, normalizedEvidence, [])
    for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
      const items = confirmed.get(document.documentId)
      const byId = new Map(items.map(item => [item.itemId, item]))
      for (const item of items) {
        const state = writingStates.get(item.itemId)
        if (!state?.repeatedTask || !state.capturing || state.action !== 'body') continue
        const label = state.labelItemId && byId.get(state.labelItemId)
        const entries = sidecar.groups.find(group => group.taskType === state.task)?.essays.entries ?? []
        const covered = entries.some(entry =>
          (!state.labelItemId || (label && entry.labelSource && containsSource(entry.labelSource, label.sourceIndex)))
          && sourceReferenceBlocks(entry).some(block => block.kind === 'paragraph'
            && paragraphSources(block.paragraph).some(source => containsSource(source, item.sourceIndex))))
        if (!covered) throw Object.assign(new Error('Repeated writing task omits a confirmed sample body'),
          { code: 'SOURCE_REFERENCES_ESSAY_COVERAGE_INVALID' })
      }
    }
  }
  const hasReferenceVisual = confirmation.documents.some(document => answerIds.has(document.documentId)
    && document.pages.some(page => page.visualClassifications.some(visual => visual.classification === 'content_media')))
  if (!hasReferenceVisual && !figures.length && !continued && !sidecar?.figureExclusions?.length) return
  if ((hasReferenceVisual || figures.length)
    && (!sidecar || !['source-references-v3', 'source-references-v4', 'source-references-v5'].includes(sidecar.schemaVersion))) {
    reject('Confirmed official-answer content figures require a complete source-references-v3/v4 sidecar; v1/v2 cannot omit them')
  }
  const documents = materialization.documents.map(document => ({ ...document,
    bytes: sourceInput.documents.find(source => source.documentId === document.documentId)?.bytes }))
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId: materialization.paperId, documents,
    evidence, confirmation })
  if (resolved.issues.length) reject(`Invalid sealed OCR confirmation: ${resolved.issues[0].message}`)
  const allExpected = resolved.referenceFigures ?? []
  const explanationFigures = sourceReferenceExplanationFigures(materialization, evidence, confirmation, allExpected,
    sidecar?.figureExclusions ?? [], { producerVersion })
  if (figures.some(({ figure }) => allExpected.some(reference =>
    explanationFigures.has(sourceReferenceFigureIdentity(reference)) && reference.sourceRegionId === figure.sourceRegionId))) {
    reject('An excluded explanation figure cannot also appear in writing references')
  }
  const objectiveFigures = sourceReferenceObjectiveFigures(confirmation, answerIds, allExpected, { producerVersion, materialization })
  const expected = allExpected.filter(reference => !explanationFigures.has(sourceReferenceFigureIdentity(reference))
    && (!objectiveFigures.has(sourceReferenceFigureIdentity(reference))
    || figures.some(({ figure }) => reference.sourceRegionId === figure.sourceRegionId
      && digestJson(reference.source) === digestJson(figure.source.locator))))
  if (expected.length !== figures.length) reject('All confirmed official-answer content figures must match sidecar figures one-to-one')
  // Layout resolution moves table items out of paragraphs. Index validated
  // confirmation text before layout, excluding only picture-consumed identities.
  const confirmedTexts = survivingConfirmedText(confirmation, evidence, allExpected)
  const paragraphs = sidecar.groups.flatMap(group => group.essays.entries.flatMap(entry =>
    entry.paragraphs.map(paragraph => ({ group, entry, paragraph }))))
  const illustratedDocuments = new Set(allExpected.map(reference => reference.source.documentId))
  const scoringScopes = sourceReferenceScoringScopes(confirmation, answerIds, { producerVersion, materialization })
  const pictureItems = new Set(allExpected.flatMap(reference => reference.itemIds))
  const sourceOrder = new Map(), sourceOwners = new Map()
  for (const document of confirmation.documents) {
    let index = 0
    for (const page of document.pages) for (const item of page.orderedItems) {
      // Confirmation furniture and the resolver's picture-consumed identities
      // are the only permitted gaps. No geometric or text-value exclusions.
      if (pictureItems.has(item.itemId)
        || (item.observationIds.length && item.observationIds.every(id => page.furnitureObservationIds.includes(id)))) continue
      sourceOrder.set(item.itemId, { documentId: document.documentId, index: index++ })
      const writing = writingStates.get(item.itemId)
      const scoring = scoringScopes.get(item.itemId)
      // A complete unlabeled letter may resume essays after a rubric. The
      // actual shared capture state owns it even if a raw scoring label is open.
      if (writing?.capturing) {
        sourceOwners.set(item.itemId, { kind: 'essays', taskType: writing.task, labelItemId: writing.labelItemId })
      } else if (scoring) {
        sourceOwners.set(item.itemId, { kind: 'scoring', ...scoring })
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
    // The shared lifecycle projects a merged bare heading/sample item to its
    // sample label. Permit that exact projection only for the essay label owned
    // by this item/task; prose and scoring still replay the complete item.
    const owner = surviving.length === 1 && writingStates.get(surviving[0].itemId)
    const merged = text.kind === 'essays' && text.source === text.entry.labelSource
      && owner?.capturing && owner.labelItemId === surviving[0].itemId
      && owner.task === text.group.taskType
      ? sourceReferenceWritingTaskHeading(surviving, 0, { producerVersion, inWriting: true }) : null
    const replayText = merged?.bare && merged.started === owner.task && merged.mergedLabel
      ? merged.mergedLabel : surviving.map(item => item.text).join(' ')
    if (fragments.some(fragment => !fragment.length) || new Set(surviving).size !== surviving.length
      || joinedText(replayText) !== joinedText(text.text)) {
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
  if (['source-references-v4', 'source-references-v5'].includes(sidecar.schemaVersion)) {
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
    if (['source-references-v4', 'source-references-v5'].includes(sidecar.schemaVersion) && scoringScope) {
      reject('Confirmed scoring figures cannot be reassigned to essays')
    }
    const writingState = writingStates.get(reference.afterItem.itemId)
    if (writingState?.capturing !== true || writingState.task !== group.taskType) {
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
