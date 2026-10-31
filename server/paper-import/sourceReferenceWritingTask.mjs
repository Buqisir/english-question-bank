// Pure task recognition shared by extraction and independent admission.
// The lifecycle owns partitioning and reference-capture transitions. Consumers
// assemble output or project scopes; neither reinterprets lifecycle boundaries.
import { resolveOcrContentVisual } from './nck1OcrContentVisuals.mjs'
import { sourceReferenceScoringScopes } from './sourceReferenceScoringScope.mjs'
import { computeLineFacts } from '../../scripts/import-pipeline/ocr-line-facts.mjs'
import { createWritingScope, createReferenceCapture } from '../../scripts/import-pipeline/ocr-section-state.mjs'
import { isExplicitScoringAppendixStart, scoredWritingRubricTask, writingRuleMatchingView, SOURCE_REFERENCE_ANSWER_ROLES,
  explicitWritingHeading, applicationStanceLabel, continuationScoringLabel, continuationThoughtHeading,
  applicationScoringPoint, verifiedParenthesizedEnglish, isCompleteWritingTranscriptHeading,
  isWritingTranscriptTitle, isSourceReferenceExplanationStart, isReadingAnswerPair,
  isSourceTitleTranscriptCandidate, isTaskLocalSampleOmission, isAnnotatedScoringLabel } from './sourceReferenceWritingRules.mjs'
import { matchesLineRole, firstLineRole, inlineSampleParts, bareSectionNumber,
  writingSectionText } from '../../scripts/import-pipeline/ocr-line-roles.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION, assertSourceReferenceProducerVersion, usesExplicitWritingTitles, usesTitleAbbreviation,
  usesGivenTitleWritingSamples, usesComposedWritingLabels, usesV23WritingCapabilities, usesAlternateAnswerScope } from './sourceReferenceSemantics.mjs'
import { wholeDocumentAbsenceSubject } from './sourceReferenceWholeDocumentAbsence.mjs'
import { resolveAlternateAnswerScope } from './sourceReferenceAlternateAnswerScope.mjs'
import { nck1ReferenceOcrSourceDocuments } from './nck1OcrSourceEvidence.mjs'
import { validateWritingRoleDeclarations, resolveWritingRoleDeclarations, roleDeclarationError } from './sourceReferenceRoleDeclarations.mjs'

// Bind nested task/letter and capture role lookups to the same source semantics.
function sourceReferenceLineRoles(producerVersion) {
  return {
    matchesLineRole: (id, facts, context = {}) => matchesLineRole(id, facts, { ...context, producerVersion }),
    firstLineRole: (phase, facts, context = {}) => firstLineRole(phase, facts, { ...context, producerVersion }),
  }
}

// OCR can keep a bare or named section on the writing-part heading's item.
export function writingSectionAfterPart(text, producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION) {
  const { matchesLineRole, firstLineRole } = sourceReferenceLineRoles(producerVersion)
  const normalized = String(text).normalize('NFKC')
  if (!matchesLineRole('writing.part', computeLineFacts({ text: normalized }))) return null
  const rest = normalized.replace(/^第[三四]部分\s*[:：]?\s*写作\s*(?:\([^)]*\))?/u, '').trim()
  const number = bareSectionNumber(rest)
  return number ? (number === '一' ? 'application' : 'continuation')
    : firstLineRole('writing-section', computeLineFacts({ text: rest }))?.value || null
}

// A standalone key can omit both the writing-part heading and sample label.
// Admit only a complete letter immediately after its final objective answer;
// never borrow a closing/signature across another section, prompt or transcript.
function completeApplicationLetter(lines, index, lastQuestion, factsFor, producerVersion) {
  if (!lastQuestion || bareSectionNumber(factsFor(lines[index]).nfkc) !== '一') return false
  const previous = lines[index - 1] && factsFor(lines[index - 1])
  if (!previous || !/^\d+\s*[.．、]\s*[A-Za-z]/u.test(previous.text) || previous.hasHan) return false
  const answers = [...previous.text.matchAll(/(?:^|\s)(\d+)\s*[.．、]\s*/gu)]
  if (Number(answers.at(-1)?.[1]) !== lastQuestion) return false
  return completeSourceLetter(lines, index + 1, factsFor, producerVersion)
}

// An answer-first article has no letter scaffold. Its exact source-given title,
// adjacent final objective answer and bounded continuous body jointly establish
// ownership. A matching title alone never opens writing or reopens explanations.
function completeGivenTitleArticle(lines, index, lastQuestion, givenTitle, factsFor, producerVersion) {
  const title = lines[index], previous = lines[index - 1]
  if (!lastQuestion || !givenTitle || !previous || title.page !== previous.page
    || factsFor(title).trimmed !== givenTitle.trim()) return false
  const answer = factsFor(previous).trimmed
  if (!/^(?:[1-9]\d*\s*[.．、]?\s*[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)?\s*[;；]?\s*)+$/u.test(answer)) return false
  const numbers = [...answer.matchAll(/(?:^|[;；]\s*)([1-9]\d*)\s*[.．、]?\s*/gu)].map(match => Number(match[1]))
  if (numbers.at(-1) !== lastQuestion || numbers.some((number, i) => i && number <= numbers[i - 1])) return false
  const { matchesLineRole, firstLineRole } = sourceReferenceLineRoles(producerVersion)
  let end = null
  for (const line of lines.slice(index + 1)) {
    const facts = factsFor(line)
    const boundary = explicitWritingHeading(line.text, producerVersion)?.taskType === 'continuation'
      || matchesLineRole('writing.explanations', facts, { sectionCount: 1 })
      || firstLineRole('listening-boundary', facts)
    if (boundary) return end && /[.!?]["”'’]?\s*$/u.test(end.text) ? { end } : false
    if (line.page !== title.page || line.figure || line.table || facts.hasHan || !facts.startsEnglishOrQuote
      || firstLineRole('writing-section', facts) || firstLineRole('entry-label', facts)
      || matchesLineRole('writing.part-boundary', facts) || matchesLineRole('writing.continuation-prompt', facts)
      || matchesLineRole('paragraph.salutation', facts) || matchesLineRole('paragraph.numbered', facts)
      || matchesLineRole('transcript.speaker', facts) || matchesLineRole('writing.student-script', facts)) return false
    end = line
  }
  return false
}

export function completeSourceLetter(lines, index, factsFor, producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION) {
  const { matchesLineRole, firstLineRole } = sourceReferenceLineRoles(producerVersion)
  const salutation = lines[index] && factsFor(lines[index])
  if (!salutation || !matchesLineRole('paragraph.salutation', salutation)) return false
  const boundary = line => {
    const facts = factsFor(line)
    return line.figure || line.table || bareSectionNumber(facts.nfkc)
      || firstLineRole('writing-section', facts) || firstLineRole('scoring-section', facts)
      || firstLineRole('entry-label', facts) || matchesLineRole('writing.part-boundary', facts)
      || matchesLineRole('writing.explanations', facts, { sectionCount: 1 })
      || matchesLineRole('writing.continuation-prompt', facts)
      || matchesLineRole('paragraph.numbered', facts) || matchesLineRole('transcript.speaker', facts)
      || matchesLineRole('writing.student-script', facts) || /^\d+\s*[.．、)]/u.test(facts.trimmed)
  }
  let body = ''
  for (let i = index + 1; i < lines.length; i++) {
    const line = lines[i]
    if (boundary(line)) return false
    const facts = factsFor(line)
    if (matchesLineRole('paragraph.closing', facts)) {
      const signature = lines[i + 1]
      const complete = /[.!?]["”']?\s*$/u.test(body) && Boolean(signature)
        && !boundary(signature)
        && /^\p{Lu}[\p{Script=Latin}’'-]*\.?(?:\s+\p{Lu}[\p{Script=Latin}’'-]*\.?){0,3}$/u.test(factsFor(signature).trimmed)
        && (!lines[i + 2] || Boolean(boundary(lines[i + 2])))
      return complete ? { end: signature } : null
    }
    // A date can wrap onto its own OCR line ("May" / "30th.").
    const wrappedDate = body && /^(?:[1-9]|[12]\d|3[01])(?:st|nd|rd|th)\b/iu.test(facts.trimmed)
    if (facts.hasHan || (!facts.startsEnglishOrQuote && !wrappedDate)
      || matchesLineRole('paragraph.salutation', facts)) return false
    body += ` ${facts.text}`
  }
  return false
}

// Recognition priority is the producer's: contextual bare section, otherwise
// a complete named/numbered task; a task rubric takes priority over both.
// Lifecycle boundaries, scoring-appendix reopening and output assembly remain
// with the caller. A writing-part heading alone does not establish a task.
export function sourceReferenceWritingTaskHeading(lines, lineIndex, {
  inWriting = false, sectionCount = 0, lastObjectiveQuestion = 0, applicationGivenTitle = null,
  answerRole = 'official_answers', factsFor = computeLineFacts,
  producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
} = {}) {
  const { matchesLineRole, firstLineRole } = sourceReferenceLineRoles(producerVersion)
  const line = lines[lineIndex]
  const facts = factsFor(line)
  const inlineSample = inlineSampleParts(facts.text, { producerVersion, inWriting })
  const [heading, ...rest] = inlineSample || facts.text.split('\n')
  const sectionText = writingSectionText(facts, heading, rest, inWriting)
  const mergedText = rest.length === 1 ? rest[0].trim() : null
  const mergedLabel = mergedText && matchesLineRole('entry.sample-label', computeLineFacts({ text: mergedText })) ? mergedText : null
  const unlabeledApplicationLetter = answerRole === 'official_answers' && !sectionCount && !inWriting
    && completeApplicationLetter(lines, lineIndex, lastObjectiveQuestion, factsFor, producerVersion)
  const givenTitleArticle = usesGivenTitleWritingSamples(producerVersion) && answerRole === 'official_answers'
    && !sectionCount && !inWriting
    && completeGivenTitleArticle(lines, lineIndex, lastObjectiveQuestion, applicationGivenTitle, factsFor, producerVersion)
  const bare = (inWriting || mergedLabel || unlabeledApplicationLetter || (lines[lineIndex + 1]
    && matchesLineRole('entry.sample-label', factsFor(lines[lineIndex + 1]))))
    && bareSectionNumber((mergedLabel ? heading : sectionText).normalize('NFKC'))
  const started = givenTitleArticle ? 'application' : bare ? (bare === '一' ? 'application' : 'continuation')
    : firstLineRole('writing-section', facts)?.value
  const scoringSection = firstLineRole('scoring-section', facts)?.value
  return { bare, started, scoringSection, mergedLabel, unlabeledApplicationLetter, givenTitleArticle,
    explicitHeading: explicitWritingHeading(facts.text, producerVersion) }
}

export function sourceReferenceLastObjectiveQuestion(materialization) {
  return Math.max(0, ...(materialization.groups ?? [])
    .flatMap(group => group.writingTask ? [] : (group.questions || []).map(question => question.sourceNumber))
    .filter(Number.isInteger))
}


const round = value => Number(value.toFixed(6))
export function sourceReferenceUnionRegion(observations) {
  const left = Math.min(...observations.map((item) => item.region.x))
  const top = Math.min(...observations.map((item) => item.region.y))
  const right = Math.max(...observations.map((item) => item.region.x + item.region.width))
  const bottom = Math.max(...observations.map((item) => item.region.y + item.region.height))
  return { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) }
}

const unionRegion = sourceReferenceUnionRegion

function scopeError(message) {
  throw Object.assign(new Error(message), { code: 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID' })
}

function applicationLetterReferenceLines(section, factsFor, producerVersion, roleDeclarations) {
  const { matchesLineRole, firstLineRole } = sourceReferenceLineRoles(producerVersion)
  const declared = line => line.itemId && roleDeclarations?.byItemId.get(line.itemId)
  const declaredLabel = line => declared(line)
    && ['section-heading', 'sample-heading', 'scoring-heading', 'commentary'].includes(declared(line).role)
  const sampleEnd = section.letterEnd || section.articleEnd
  if (!sampleEnd) return section.lines
  const selected = []
  let afterLetter = false
  let inScoring = false
  for (const [index, line] of section.lines.entries()) {
    if (line.repeatedTaskBoundary) {
      afterLetter = false
      inScoring = false
      selected.push(line)
      continue
    }
    if (afterLetter) {
      if (line.figure || line.table) {
        if (!inScoring) {
          if (section.repeatedTask && section.lines.slice(index + 1).some(item => item.repeatedTaskBoundary)) {
            scopeError('Unresolved content before repeated writing section')
          }
          break
        }
      } else {
        const facts = factsFor(line)
        const label = firstLineRole('entry-label', facts) || declaredLabel(line)
        if (declared(line)?.role === 'scoring-heading' || (label && firstLineRole('entry-kind', facts)?.value === 'scoring')) {
          inScoring = true
        } else if (!inScoring || label
          || matchesLineRole('writing.part-boundary', facts)
          || matchesLineRole('writing.explanations', facts, { sectionCount: 1 })
          || matchesLineRole('writing.continuation-prompt', facts)
          || matchesLineRole('paragraph.numbered', facts)
          || matchesLineRole('transcript.speaker', facts)
          || matchesLineRole('writing.student-script', facts)
          // Preserve numbered Chinese scoring points using their existing role.
          || (/^\d+\s*[.．、)]/u.test(facts.trimmed) && !matchesLineRole('writing.commentary', facts))) {
          if (section.repeatedTask && section.lines.slice(index + 1).some(item => item.repeatedTaskBoundary)) {
            scopeError('Unresolved content before repeated writing section')
          }
          break
        }
      }
    }
    selected.push(line)
    if (line === sampleEnd) afterLetter = true
  }
  return selected
}

// A bare "(1)" can also be prose or a rubric point. Only a consecutive
// application-sample sequence with the same inset English title supplies
// enough evidence to treat those numbers as labels. Keep the source spelling.
function numberedApplicationSamples(lines, factsFor) {
  const candidates = []
  for (const [index, line] of lines.entries()) {
    if (line.figure || line.table) continue
    const number = /^\(([1-9]\d?)\)$/u.exec(factsFor(line).nfkc)
    const title = lines[index + 1], body = lines[index + 2]
    if (!number || !title || !body || title.figure || title.table || body.figure || body.table) continue
    const titleFacts = factsFor(title), bodyFacts = factsFor(body)
    if (titleFacts.hasHan || !titleFacts.startsUpperOrQuote || /[.!?:：]$/u.test(titleFacts.trimmed)
      || !bodyFacts.startsEnglishOrQuote || bodyFacts.hasHan
      || !(title.left > body.left && title.right < body.right)) continue
    candidates.push({ line, title, number: Number(number[1]) })
  }
  if (candidates.length < 2 || candidates.some((item, index) =>
    item.number !== index + 1 || item.title.text !== candidates[0].title.text)) return new Map()
  return new Map(candidates.map(({ line, title }) => [line, title]))
}

// Choice grids may omit labels. Short English answers require both labels in
// every pair, and cannot mix with choice letters within or across answer rows.
function isObjectiveAnswerGrid(rows) {
  if (rows.length < 2 || rows.length % 2 !== 0
    || !rows[0].length || rows.some(row => row.length !== rows[0].length)) return false
  const choice = /^[A-G]$/u
  const shortAnswer = /^[A-Za-z'’-]+(?: [A-Za-z'’-]+){0,2}(?:\/[A-Za-z'’-]+(?: [A-Za-z'’-]+){0,2})*$/u
  let previous = 0, answerKind = null
  for (let index = 0; index < rows.length; index += 2) {
    const numberLabel = /^(?:题号|序号)$/u.test(rows[index][0])
    const answerLabel = rows[index + 1][0] === '答案'
    const numbers = numberLabel ? rows[index].slice(1) : rows[index]
    const answers = answerLabel ? rows[index + 1].slice(1) : rows[index + 1]
    if (!numbers.length || numbers.length !== answers.length) return false
    const kind = answers.every(answer => choice.test(answer)) ? 'choice'
      : numberLabel && answerLabel && answers.every(answer => !choice.test(answer) && shortAnswer.test(answer))
        ? 'words' : null
    if (!kind || (answerKind && answerKind !== kind)) return false
    answerKind = kind
    for (const number of numbers) {
      if (!/^[1-9]\d*$/u.test(number) || Number(number) <= previous) return false
      previous = Number(number)
    }
  }
  return true
}

// Pure source-item preparation, including confirmed tables, figures and furniture.
export function prepareSourceReferenceWritingItems(materialization, evidence, confirmation,
  { paperName = materialization.paperName, producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION, referenceSourceDocuments, onScopeError,
    writingRoleDeclarations } = {}) {
  assertSourceReferenceProducerVersion(producerVersion)
  const { matchesLineRole, firstLineRole } = sourceReferenceLineRoles(producerVersion)
  const roleDeclarations = resolveWritingRoleDeclarations(
    validateWritingRoleDeclarations(writingRoleDeclarations, { materialization, confirmation }))
  const sourceDocuments = usesAlternateAnswerScope(producerVersion)
    ? nck1ReferenceOcrSourceDocuments(materialization.documents, confirmation, referenceSourceDocuments) : materialization.documents
  const answerDocuments = sourceDocuments.filter((document) =>
    SOURCE_REFERENCE_ANSWER_ROLES.includes(document.role))
  if (answerDocuments.length !== 1) scopeError('Expected exactly one answer-bearing document')
  const [answerDocument] = answerDocuments
  const alternateAnswerScope = resolveAlternateAnswerScope(materialization, confirmation, { producerVersion, evidence })
  const documentSha256 = answerDocument.sha256
  const evidencePages = evidence?.documents.find((document) => document.documentId === answerDocument.documentId)?.pages || []
  const pages = confirmation.documents.find((document) => document.documentId === answerDocument.documentId).pages
    .map((page, index) => page.page ? page : { ...page, page: index + 1 })
  const originalItems = pages.flatMap(page => page.orderedItems)
  const nextItemIds = new Map(originalItems.map((item, index) => [item.itemId, originalItems[index + 1]?.itemId]))
  const lines = []
  const review = []
  const sourceOrder = new WeakMap()
  const lineFacts = new WeakMap()
  const referenceFigures = []
  const scoringScopes = sourceReferenceScoringScopes(confirmation, new Set([answerDocument.documentId]),
    { producerVersion, materialization, onScopeError, roleDeclarations })
  const factsFor = line => {
    if (!lineFacts.has(line)) lineFacts.set(line, computeLineFacts(line))
    return lineFacts.get(line)
  }
  for (const page of pages) {
    const evidencePage = evidencePages[page.page - 1] || { observations: [], regions: [] }
    const observations = new Map(evidencePage.observations.map((item) => [item.observationId, item]))
    const pictureItems = new Set()
    for (const visual of page.visualClassifications || []) {
      if (visual.classification !== 'content_media') continue
      const resolved = resolveOcrContentVisual({ paperId: materialization.paperId, document: answerDocument,
        page: { ...page, observations: evidencePage.observations }, visual,
        region: evidencePage.regions.find(region => region.regionId === visual.regionId), claimedItems: pictureItems })
      if (!resolved.referenceFigure) throw new Error('Reference figures require a separate official_answers PDF')
      referenceFigures.push(resolved.referenceFigure)
      resolved.itemIds.forEach(id => pictureItems.add(id))
    }
    const tableStarts = new Map()
    const tableItems = new Set()
    const items = new Map(page.orderedItems.map(item => [item.itemId, item]))
    for (const visual of page.visualClassifications || []) {
      if (visual.classification !== 'semantic_table') continue
      const ids = visual.rows.flatMap(row => row.cells.flat())
      ids.forEach(id => tableItems.add(id))
      tableStarts.set(ids[0], {
        kind: 'table', tableId: `source-${visual.regionId.replace(/:/gu, '-')}`,
        rows: visual.rows.map((row, r) => row.cells.map((cell, c) => {
          const selected = cell.map(id => items.get(id))
          return {
            cellId: `source-${visual.regionId.replace(/:/gu, '-')}-r${r}-c${c}`,
            text: selected.map(item => item.text).join('\n'),
            source: { documentSha256, locator: { kind: 'page_region', documentId: answerDocument.documentId,
              page: page.page, region: unionRegion(selected.flatMap(item =>
                (item.observationIds || []).map(id => observations.get(id)))) } },
          }
        })),
      })
    }
    for (const item of page.orderedItems) {
      if (pictureItems.has(item.itemId)) continue
      if (tableItems.has(item.itemId) && !tableStarts.has(item.itemId)) continue
      const boxes = (item.observationIds || []).map((id) => observations.get(id))
      const line = { documentId: answerDocument.documentId, itemId: item.itemId, nextSourceItemId: nextItemIds.get(item.itemId), page: page.page, text: item.text, boxes,
        ...(tableStarts.has(item.itemId) ? { table: tableStarts.get(item.itemId) } : {}) }
      const facts = factsFor(line)
      line.left = facts.left
      line.right = facts.right
      sourceOrder.set(line, lines.length)
      lines.push(line)
      // Only scoring uses ordered figure blocks. The confirmed item sequence,
      // not visualClassifications array order or page coordinates, determines
      // placement. A table contributes its exact final confirmed item boundary.
      const tableVisual = tableStarts.has(item.itemId)
        ? page.visualClassifications.find(visual => visual.classification === 'semantic_table'
          && visual.rows[0].cells[0][0] === item.itemId) : null
      const boundary = tableVisual ? tableVisual.rows.at(-1).cells.at(-1).at(-1) : item.itemId
      const followingFigures = referenceFigures.filter(figure => figure.source.page === page.page
        && figure.afterItem.itemId === boundary && scoringScopes.get(boundary))
      if (followingFigures.length > 1) throw new Error('Scoring figures sharing one anchor lack a confirmed source-object order')
      for (const figure of followingFigures) {
        lines.push({ figure, page: page.page, text: '', boxes: [] })
      }
    }
  }
  // A reprint can use the original question document's cover title rather
  // than the answer book's abbreviated title. Match exact confirmed title
  // lines in this paper's first pages; reuse the existing furniture role.
  const firstPageTitles = new Set()
  for (const document of confirmation.documents) {
    const first = document.pages[0]
    const proof = evidence?.documents.find(item => item.documentId === document.documentId)?.pages[first.page - 1]
    if (!proof) continue
    const observations = new Map(proof.observations.map(item => [item.observationId, item]))
    for (const item of first.orderedItems) {
      const facts = computeLineFacts({ text: item.text,
        boxes: (item.observationIds || []).map(id => observations.get(id)) })
      if (facts.region?.y < .12 && matchesLineRole('furniture.repeated-title', facts, { repeated: true })) {
        firstPageTitles.add(writingRuleMatchingView(item.text))
      }
    }
  }
  const fullTitles = [...firstPageTitles, ...(paperName ? [writingRuleMatchingView(paperName)] : [])]
  const titleFurniture = new WeakSet()
  for (const [index, line] of lines.entries()) {
    if (line.figure || line.table || line.page === 1 || !firstPageTitles.has(writingRuleMatchingView(line.text))) continue
    const facts = factsFor(line)
    if (!(facts.region?.y < .12) || !matchesLineRole('furniture.repeated-title', facts, { repeated: true })) continue
    titleFurniture.add(line)
    const header = [line]
    // A subtitle needs independent full-title evidence, not the keyword from
    // the already matched title authorizing arbitrary text beneath it.
    for (const next of lines.slice(index + 1)) {
      if (next.page !== line.page || next.figure || next.table) break
      const nextFacts = factsFor(next)
      if (nextFacts.left < facts.left || nextFacts.right > facts.right || nextFacts.region.y < facts.region.y) break
      // Keep the existing title-block height cap when selecting a possible
      // subtitle; only the independent full title authorizes its exclusion.
      if (nextFacts.region.y + nextFacts.region.height - facts.region.y > .06) break
      const candidate = writingRuleMatchingView([...header, next].map(item => item.text).join(''))
      if (firstLineRole('entry-label', nextFacts) || /^第[一二三四五六七八九十\d]+档|^(?:零分|不得分)/u.test(nextFacts.nfkc)
        || !fullTitles.some(title => title.startsWith(candidate))) {
        review.push({ itemId: next.itemId, issue: 'unproven title subtitle retained for review' })
        break
      }
      titleFurniture.add(next)
      header.push(next)
    }
  }
  const edgeTexts = new Map()
  for (const line of lines) {
    if (line.figure) continue
    const facts = factsFor(line)
    if (!facts.atEdge) continue
    const text = facts.edgeText
    if (!edgeTexts.has(text)) edgeTexts.set(text, new Set())
    edgeTexts.get(text).add(line.page)
  }
  return { materialization, answerDocument, documentSha256, pages, lines, review, producerVersion, alternateAnswerScope,
    sourceOrder, factsFor, referenceFigures, scoringScopes, titleFurniture, edgeTexts, roleDeclarations }
}

// The single ownership lifecycle used by extraction and admission. Inputs are
// ordered source items and their pure role/furniture context; output states
// refer to final sections, including replacement/reuse and task-local capture.
export function sourceReferenceWritingLifecycle(lines, {
  materialization, answerDocument, factsFor = computeLineFacts, scoringScopes = new Map(),
  titleFurniture = new WeakSet(), edgeTexts = new Map(), review: sourceReview = [],
  producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION,
  alternateAnswerScope = null, onScopeError = null,
  roleDeclarations = resolveWritingRoleDeclarations(),
  tableItemIds = new Set(),
} = {}) {
  assertSourceReferenceProducerVersion(producerVersion)
  const { matchesLineRole, firstLineRole } = sourceReferenceLineRoles(producerVersion)
  const review = [...sourceReview]
  const furniture = new WeakSet()
  const items = new Map(lines.filter(line => line.itemId).map(line => [line.itemId,
    { task: null, capturing: false, ended: false, kind: null, action: 'outside' }]))
  const sections = new Map()
  // Capture can replace a merged heading's item state with an entry state.
  // Keep task starts independent so consumers never infer switches from entries.
  const taskStarts = new Map()
  const listeningStarts = new Set()
  const scope = createWritingScope(sections)
  let afterListening = false, scoringAppendix = false, afterExplanations = false, articleBlocked = false
  let strictTranscriptClosure = false
  const appendLine = line => {
    if (strictTranscriptClosure && scoringAppendix) {
      scope.current.scoringOnlyLines ??= new WeakSet()
      scope.current.scoringOnlyLines.add(line)
    }
    scope.current.lines.push(line)
  }
  const lastObjectiveQuestion = sourceReferenceLastObjectiveQuestion(materialization)
  const titles = (materialization.groups ?? []).filter(group => group.writingTask?.taskType === 'application')
    .flatMap(group => group.writingTask.givenSkeleton ?? []).filter(item => item.role === 'title')
  const applicationGivenTitle = titles.length === 1 ? titles[0].text : null
  const alternateStart = alternateAnswerScope
    ? lines.findIndex(line => line.itemId === alternateAnswerScope.startInclusiveItemId) : -1
  const alternateEnd = alternateAnswerScope
    ? lines.findIndex(line => line.itemId === alternateAnswerScope.endExclusiveItemId) : -1
  if (alternateAnswerScope && (alternateStart < 0 || alternateEnd <= alternateStart)) scopeError('Alternate source boundary was consumed')
  for (const [lineIndex, line] of lines.entries()) {
    if (alternateStart >= 0 && lineIndex >= alternateStart && lineIndex < alternateEnd) {
      if (lineIndex === alternateStart) {
        const tasks = (materialization.groups ?? []).filter(group => group.writingTask)
        if (tasks.length !== 2 || new Set(tasks.map(group => group.writingTask.taskType)).size !== 2
          || !['application', 'continuation'].every(task => {
            const section = sections.get(task)
            if (!section) return false
            const { steps } = planReferenceCapture(section, factsFor, producerVersion, scoringScopes, materialization)
            return steps.some(step => step.state.capturing && step.action === 'body')
              && steps.some(step => step.state.kind === 'scoring' && ['body', 'table', 'figure'].includes(step.action))
          })) scopeError('Alternate range requires both complete main samples and scoring before its title')
        scope.enterPart(false)
        afterListening = scoringAppendix = afterExplanations = false
      }
      if (line.itemId) items.set(line.itemId, { task: null, capturing: false, ended: false, kind: null, action: 'alternate' })
      continue
    }
    // A source-derived v26 partition requires all main writing before the
    // alternate title. Inspect the entire transcript remainder before ended,
    // furniture or ordinary appendix rules can hide/reopen later ownership.
    if (alternateAnswerScope && usesAlternateAnswerScope(producerVersion) && lineIndex > alternateEnd) {
      const facts = factsFor(line)
      const heading = sourceReferenceWritingTaskHeading(lines, lineIndex, {
        inWriting: true, sectionCount: sections.size, lastObjectiveQuestion, applicationGivenTitle,
        answerRole: answerDocument.role, factsFor, producerVersion,
      })
      if (heading.started || heading.scoringSection || matchesLineRole('writing.part', facts)
        || firstLineRole('scoring-overview', facts) || matchesLineRole('entry.sample-label', facts)
        || (firstLineRole('entry-label', facts) && firstLineRole('entry-kind', facts)?.value === 'scoring')) {
        scopeError('Alternate range cannot precede later writing or scoring')
      }
    }
    // Check new complete titles before ended/furniture shortcuts. The raw item
    // link prevents a consumed visual or skipped header from lending adjacency.
    const adjacent = lines[lineIndex + 1]
    const rawAdjacent = adjacent && !line.figure && !line.table && !adjacent.figure && !adjacent.table
      && line.nextSourceItemId === adjacent.itemId && line.documentId === adjacent.documentId
    const samePageRawAdjacent = rawAdjacent && line.page === adjacent.page
    if (isSourceTitleTranscriptCandidate(line.text, producerVersion)) {
      if (!samePageRawAdjacent || !/^\(?Text\s*1\)?\s*[:：.．]?$/iu.test(adjacent.text.normalize('NFKC').trim())) {
        scopeError(`Transcript title requires the next confirmed same-page Text 1: ${line.itemId}`)
      }
      strictTranscriptClosure ||= sections.size > 0 || scope.inWriting
      scope.enterPart(false)
      listeningStarts.add(line.itemId)
      afterListening = true
      scoringAppendix = false
      continue
    }
    if (isTaskLocalSampleOmission(line.text, producerVersion) && (!scope.current || scope.ended)) {
      scopeError(`Source sample omission requires an established current task: ${line.itemId}`)
    }
    if (isAnnotatedScoringLabel(line.text, producerVersion) && (!scope.current || scope.ended)) {
      scopeError(`Annotated scoring label requires an established current task: ${line.itemId}`)
    }
    // Once a new title closes existing writing, only a proven adjacent rubric
    // pair may reopen it. This guard survives bare Text 1 and scope.end().
    if (strictTranscriptClosure && !line.figure && !line.table) {
      const facts = factsFor(line)
      const heading = sourceReferenceWritingTaskHeading(lines, lineIndex, {
        inWriting: scope.inWriting, sectionCount: sections.size, lastObjectiveQuestion,
        answerRole: answerDocument.role, factsFor, producerVersion,
      })
      if ((afterListening || scope.ended || scoringAppendix)
        && rawAdjacent && isExplicitScoringAppendixStart(line.text, adjacent.text)) {
        scope.enterPart(false)
        const task = scoredWritingRubricTask(line.text, adjacent.text)
        if (task) scope.startTask(task, { reuse: true })
        afterListening = afterExplanations = false
        scoringAppendix = true
        continue
      }
      // Inspect original stance labels before listening skips or scoring-scope
      // filters can hide them; enterPart(false) has cleared the current task.
      const essayStart = (heading.started && !heading.scoringSection)
        || matchesLineRole('writing.part', facts) || heading.explicitHeading?.sample
        || matchesLineRole('entry.sample-label', facts)
        || applicationStanceLabel(line.text, sections.get('application')?.taskType
          ?? materialization.groups?.find(group => group.writingTask?.taskType === 'application')?.writingTask.taskType)
        || isTaskLocalSampleOmission(line.text, producerVersion)
      const incompleteRubric = (afterListening || scope.ended)
        && (heading.scoringSection || firstLineRole('scoring-overview', facts)
          || (firstLineRole('entry-label', facts) && firstLineRole('entry-kind', facts)?.value === 'scoring'))
      if (essayStart || incompleteRubric) scopeError(`Writing cannot reopen after a closed transcript boundary: ${line.itemId}`)
      if (afterListening) continue
    }
    articleBlocked ||= isSourceReferenceExplanationStart(line.text, producerVersion)
    if (usesExplicitWritingTitles(producerVersion)
      && /^备选试题参考答案[:：]?$/u.test(line.text.normalize('NFKC').trim())) {
      scopeError('Unresolved alternate writing tasks after 备选试题参考答案; main tasks cannot own alternate references')
    }
    if (scope.ended) {
      if (line.itemId) items.set(line.itemId, { task: null, capturing: false, ended: true, kind: null, action: 'ended' })
      if (!afterExplanations && !alternateAnswerScope && !strictTranscriptClosure) {
        for (const remaining of lines.slice(lineIndex + 1)) if (remaining.itemId) {
          items.set(remaining.itemId, { task: null, capturing: false, ended: true, kind: null, action: 'ended' })
        }
        break
      }
      if (isExplicitScoringAppendixStart(line.text, lines[lineIndex + 1]?.text)) {
        scope.enterPart(false)
        const task = scoredWritingRubricTask(line.text, lines[lineIndex + 1]?.text)
        if (task) scope.startTask(task, { reuse: true })
        afterExplanations = false
        afterListening = false
        scoringAppendix = true
        review.push({ itemId: line.itemId, issue: 'explicit rubric appendix reopens scoring after answer explanations' })
      }
      continue
    }
    // An exam specification appendix describes question coverage, not writing
    // scoring. Its explicit column header ends reference capture, including
    // continuation tables on later pages. Keep every source word/table intact.
    const header = line.table ? line.table.rows[0].map(cell => cell.text).join('') : line.text
    if (/^题号题型分值考查的主要内容及知识点难度$/u.test(header.replace(/\s+/gu, ''))) {
      scope.end()
      if (line.itemId) items.set(line.itemId, { task: null, capturing: false, ended: true, kind: null, action: 'ended' })
      review.push({ itemId: line.itemId, issue: 'exam specification appendix ends the writing-reference scope' })
      for (const excluded of lines.slice(lineIndex).filter(item => item.table)) {
        review.push({ itemId: excluded.itemId, tableId: excluded.table.tableId,
          issue: 'exam specification table excluded from writing references; retained in source evidence' })
      }
      continue
    }
    if (line.figure) {
      if (!scope.current) throw new Error('Scoring figure has no explicit writing-task scope')
      appendLine(line)
      continue
    }
    if (line.table) {
      const rows = line.table.rows.map(row => row.map(cell => cell.text.trim()))
      if (isObjectiveAnswerGrid(rows)) {
        review.push({ itemId: line.itemId, tableId: line.table.tableId,
          issue: 'objective answer table excluded from writing references; retained in source evidence' })
        continue
      }
      if (!scope.current) scopeError(`Source table ${line.table.tableId} has no writing-task scope`)
      appendLine(line)
      continue
    }
    const facts = factsFor(line)
    // A declared commentary/non-writing line belongs to its named task rather
    // than ending the whole scope; it is appended and paused by the planner.
    const inlineDeclared = line.itemId ? roleDeclarations.byItemId.get(line.itemId) : null
    if (inlineDeclared && ['commentary', 'not-writing'].includes(inlineDeclared.role)) {
      if (!scope.current || scope.current.taskType !== (inlineDeclared.taskType ?? scope.current.taskType)) {
        throw roleDeclarationError(`Declared ${inlineDeclared.role} ${line.itemId} has no active ${inlineDeclared.taskType ?? 'writing'} section`)
      }
      appendLine(line)
      continue
    }
    const next = lines[lineIndex + 1]
    const readingPairCandidate = usesTitleAbbreviation(producerVersion) && scope.current
      && next && !next.figure && !next.table && line.nextSourceItemId === next.itemId
      && isReadingAnswerPair(line.text, next.text)
    const priorStep = readingPairCandidate
      ? planReferenceCapture(scope.current, factsFor, producerVersion, scoringScopes, materialization, roleDeclarations).steps.at(-1) : null
    const readingPair = priorStep?.state.capturing === true && priorStep.action === 'body'
    if (readingPair || matchesLineRole('writing.explanations', facts, { sectionCount: sections.size })) {
      scope.end()
      items.set(line.itemId, { task: null, capturing: false, ended: true, kind: null, action: 'ended' })
      afterExplanations = true
      review.push({ itemId: line.itemId, issue: 'answer explanations end the writing-reference scope' })
      continue
    }
    if (titleFurniture.has(line) || firstLineRole('furniture', facts, { repeated: edgeTexts.get(facts.edgeText)?.size > 1 })) {
      furniture.add(line)
      review.push({ itemId: line.itemId, issue: 'answer-book page furniture excluded from writing references' })
      continue
    }
    const appendixTask = afterListening && scoredWritingRubricTask(line.text, lines[lineIndex + 1]?.text)
    if (afterListening && (firstLineRole('scoring-overview', facts) || appendixTask)) {
      scope.enterPart(false)
      if (appendixTask) scope.startTask(appendixTask, { reuse: true })
      afterListening = false
      scoringAppendix = true
      if (appendixTask) review.push({ itemId: line.itemId,
        issue: 'exact scored writing section and adjacent rubric label reopen scoring after listening' })
      continue
    }
    const nextRealLine = isWritingTranscriptTitle(line.text, producerVersion)
      ? lines.slice(lineIndex + 1).find(next => !titleFurniture.has(next)
        && !firstLineRole('furniture', factsFor(next), { repeated: edgeTexts.get(factsFor(next).edgeText)?.size > 1 })) : null
    if (firstLineRole('listening-boundary', facts)
      || isCompleteWritingTranscriptHeading(line.text, nextRealLine?.text, producerVersion)) {
      scope.enterPart(false)
      listeningStarts.add(line.itemId)
      afterListening = true
      scoringAppendix = false
      continue
    }
    // A heading can share its OCR item with a sample label. Some answer books
    // omit the writing-part heading entirely; require an adjacent sample label
    // or the tightly bounded standalone-key letter before opening writing.
    const { bare, started: recognizedStart, scoringSection: recognizedScoring, mergedLabel, unlabeledApplicationLetter, givenTitleArticle, explicitHeading } = sourceReferenceWritingTaskHeading(lines, lineIndex, {
      inWriting: scope.inWriting, sectionCount: sections.size, lastObjectiveQuestion,
      applicationGivenTitle: articleBlocked ? null : applicationGivenTitle,
      answerRole: answerDocument.role, factsFor, producerVersion,
    })
    // Agent-declared item roles are authoritative transitions, not new regexes.
    // A declared sample/section heading both names its task and opens its body;
    // a declared scoring heading selects the rubric lane for the same task.
    const declared = line.itemId ? roleDeclarations.byItemId.get(line.itemId) : null
    if (declared?.role === 'scoring-heading' && declared.taskType) {
      // A declared rubric heading joins its task's existing section rather than
      // starting a new sample; reuse preserves any already captured essays.
      const reuse = sections.has(declared.taskType)
      scope.startTask(declared.taskType, { reuse })
      taskStarts.set(line.itemId, declared.taskType)
      items.set(line.itemId, { task: declared.taskType, capturing: false, ended: false, kind: null, action: 'task' })
      const next = lines[lineIndex + 1]
      if (!next || !firstLineRole('entry-label', factsFor(next))) appendLine(line)
      continue
    }
    if (recognizedScoring) {
      scope.startTask(recognizedScoring, { reuse: true })
      taskStarts.set(line.itemId, recognizedScoring)
      items.set(line.itemId, { task: recognizedScoring, capturing: false, ended: false, kind: null, action: 'task' })
      // This task heading also labels its rubric. A following explicit entry
      // label owns the body instead; avoid manufacturing an empty parent entry.
      const next = lines[lineIndex + 1]
      if (!next || !firstLineRole('entry-label', factsFor(next))) appendLine(line)
      continue
    }
    const declaredStart = declared && (declared.role === 'section-heading' || declared.role === 'sample-heading')
      ? declared.taskType : null
    const declaredSample = declared?.role === 'sample-heading'
    const started = declaredStart ?? recognizedStart
    if (started) {
      // A later empty reprint immediately before listening supplies no new
      // sample and cannot erase an already proven given-title article.
      if (usesGivenTitleWritingSamples(producerVersion) && explicitHeading?.sample
        && sections.get(started)?.articleEnd && lines[lineIndex + 1]
        && firstLineRole('listening-boundary', factsFor(lines[lineIndex + 1]))) {
        review.push({ itemId: line.itemId, issue: 'empty repeated sample heading before listening retains the proven article' })
        continue
      }
      // v21 never replaces an existing nonempty task. Repeated headings need
      // fresh entry ownership before further content can be captured.
      const prior = sections.get(started)
      const repeatedTask = usesComposedWritingLabels(producerVersion) && !scoringAppendix && prior
        && (prior.bareEstablished || prior.lines.length > 0 || prior.letterEnd || prior.articleEnd)
      if (repeatedTask && prior.genericOverview && prior.lines.length && !prior.explicitSample
        && !prior.lines.some(existing => !existing.figure && !existing.table
          && matchesLineRole('entry.sample-label', factsFor(existing)))) {
        scopeError('Unresolved writing overview before repeated task')
      }
      scope.startTask(started, { reuse: scoringAppendix || repeatedTask })
      if (usesComposedWritingLabels(producerVersion) && !repeatedTask && !scoringAppendix) {
        scope.current.genericOverview = /^书面表达\s*[:：]?$/u.test(line.text.trim())
      }
      if (usesComposedWritingLabels(producerVersion) && (bare || declaredStart)) scope.current.bareEstablished = true
      if (repeatedTask) {
        scope.current.repeatedTask = true
        scope.current.lines.push({ ...line, itemId: null, repeatedTaskBoundary: true,
          needsLabel: !mergedLabel && !explicitHeading?.sample && !declaredSample })
      }
      taskStarts.set(line.itemId, started)
      items.set(line.itemId, { task: started, capturing: false, ended: false, kind: null, action: 'task' })
      if (unlabeledApplicationLetter) scope.current.letterEnd = unlabeledApplicationLetter.end
      if (givenTitleArticle) {
        scope.current.articleEnd = givenTitleArticle.end
        scope.current.articleTitle = line
        appendLine(line)
      }
      if (bare && mergedLabel) scope.current.lines.push({ ...line, text: mergedLabel })
      if (explicitHeading?.sample || declaredSample) {
        scope.current.explicitSample = true
        appendLine(line)
      }
      if (explicitHeading?.omission) {
        scope.current.explicitOmission = true
        scope.omit()
      }
      continue
    }
    // An explicit omission belongs to the active section, or to both tasks
    // when the key omits the entire writing part. Never invent a model answer.
    if (matchesLineRole('writing.omission', facts, { inWriting: scope.inWriting, current: scope.current })) {
      // Retain task-local absence declarations for the reference capture pass:
      // they can explicitly resolve a preceding reprinted prompt.
      if (scope.current) {
        appendLine(line)
        if (isTaskLocalSampleOmission(line.text, producerVersion)) scope.current.explicitOmission = true
      }
      scope.omit()
      review.push({ itemId: line.itemId, issue: 'source explicitly supplies no writing sample (not_supplied)' })
      continue
    }
    if (firstLineRole('part-boundary', facts)) {
      // NCK1's fourth part may be confirmed simply as "第四部分 / （略）".
      // Require that exact adjacent omission; a missing heading/sample alone
      // must still fail closed, and earlier omitted parts are not writing.
      const omittedWritingPart = matchesLineRole('writing.bare-fourth-part', facts)
        && lines[lineIndex + 1] && matchesLineRole('writing.omission', factsFor(lines[lineIndex + 1]), { inWriting: true })
      const trailingTask = writingSectionAfterPart(line.text, producerVersion)
      const previous = sections.get(trailingTask)
      if (usesComposedWritingLabels(producerVersion) && previous
        && (previous.lines.length || previous.letterEnd || previous.articleEnd)) {
        scopeError('Unresolved repeated writing task on part heading')
      }
      scope.enterPart(matchesLineRole('writing.part', facts) || omittedWritingPart, trailingTask)
    } else if (scope.current && (!scoringAppendix || scoringScopes.get(line.itemId))) appendLine(line)
  }
  for (const section of sections.values()) {
    try {
      Object.assign(section, planReferenceCapture(section, factsFor, producerVersion, scoringScopes, materialization, roleDeclarations, tableItemIds))
    } catch (error) {
      // Soft-reference degradation: callers may collect a section failure and
      // degrade only that task's essays/scoring instead of blocking the paper.
      // Without a callback the behavior stays fail-closed.
      if (!onScopeError || producerVersion !== OCR_SOURCE_REFERENCES_PRODUCER_VERSION
        || error?.code !== 'SOURCE_REFERENCE_WRITING_SCOPE_INVALID') throw error
      section.captureError = error
      section.sectionLines = section.sectionLines ?? applicationLetterReferenceLines(section, factsFor, producerVersion, roleDeclarations)
      section.steps = section.steps ?? []
      onScopeError({ taskType: section.taskType, error, section })
    }
    for (const step of section.steps) if (step.line.itemId) {
      if (section.repeatedTask) step.state.repeatedTask = true
      items.set(step.line.itemId, step.state)
    }
  }
  return { sections, items, taskStarts, listeningStarts, furniture, review }
}

// Reference-capture policy belongs here, never in either consumer. Steps are
// assembly instructions; their states also describe independent source ownership.
function planReferenceCapture(section, factsFor, producerVersion, scoringScopes, materialization, roleDeclarations = resolveWritingRoleDeclarations(), tableItemIds = new Set()) {
  const { matchesLineRole, firstLineRole } = sourceReferenceLineRoles(producerVersion)
  const sectionLines = applicationLetterReferenceLines(section, factsFor, producerVersion, roleDeclarations)
  const taskType = section.taskType
  const explicitTitles = usesExplicitWritingTitles(producerVersion)
  // A declared heading is this section's own entry boundary even when its text
  // pattern is not in the closed grammar; conflict checks happen below, not
  // by widening the regex surface.
  const declaredInSection = new Map()
  for (const [itemId, declaration] of roleDeclarations.byItemId) {
    if (declaration.taskType === taskType || declaration.role === 'not-writing') declaredInSection.set(itemId, declaration)
  }
  const foreignDeclarations = [...roleDeclarations.byItemId.values()].filter(declaration =>
    declaration.taskType && declaration.taskType !== taskType
    && sectionLines.some(line => line.itemId === declaration.itemId))
  if (foreignDeclarations.length) {
    throw roleDeclarationError(`Declared ${foreignDeclarations[0].taskType} heading ${foreignDeclarations[0].itemId} fell inside the ${taskType} section`)
  }
  // All four numbered source headings must occur once, in source order, in
  // this application task. The later headings retain their inline body bytes
  // as ordinary scoring paragraphs instead of losing text at the colon.
  const scoringPoints = explicitTitles && taskType === 'application'
    ? sectionLines.filter(line => applicationScoringPoint(line.text)) : []
  if (scoringPoints.length && (scoringPoints.length !== 4
    || scoringPoints.some((line, index) => applicationScoringPoint(line.text) !== index + 1))) {
    scopeError('Unresolved application scoring sequence: require ordered 内容要点 / 语言 / 阅卷原则 / 阅卷标准')
  }
  const numberedSamples = taskType === 'application' ? numberedApplicationSamples(sectionLines, factsFor) : new Map()
  const sampleTitles = new Set(numberedSamples.values())
  if (section.articleTitle) sampleTitles.add(section.articleTitle)
  if (explicitTitles && taskType === 'application') for (const [index, line] of sectionLines.entries()) {
    if (!applicationStanceLabel(line.text, taskType)) continue
    const title = sectionLines[index + 1], body = sectionLines[index + 2]
    if (title && body && !factsFor(title).hasHan && factsFor(title).startsUpperOrQuote
      && !/[.!:：]$/u.test(factsFor(title).trimmed)
      && title.left > body.left && title.right < body.right) sampleTitles.add(title)
  }
  const capture = createReferenceCapture()
  const steps = []
  const continuationTasks = (materialization.groups || []).filter(group => group.writingTask?.taskType === 'continuation')
  const starters = continuationTasks.length === 1 ? continuationTasks[0].writingTask.starters : null
  const normalized = text => String(text).normalize('NFKC').replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"')
    .replace(/\s+/gu, ' ').trim()
  const given = Array.isArray(starters) && starters.length === 2
    ? starters.map((text, index) => normalized(text).replace(new RegExp(`^Paragraph\\s*${index + 1}\\s*[:：]\\s*`, 'iu'), ''))
    : []
  const startsWithGiven = (line, starter) => normalized(line.text).startsWith(starter)
    && (!normalized(line.text).slice(starter.length) || /^\s/u.test(normalized(line.text).slice(starter.length)))
  const nonNarrative = text => /(?:\bparagraph\s*[12]\s*[:：]|\b(?:write|continue)\s+(?:about|at least|no more than|the story|your story|two paragraphs)\b|\b(?:please\s+write|your (?:answer|continuation|story) should|word count|words in total)\b|第[一二12]段|注意|词数|字数)/iu.test(text)
    || /(?:^|[.!?]\s+)(?:please\s+)?(?:write|continue|use|include|ensure|make sure|do not)\b/iu.test(text.trim())
    || /(?:_\s*){3,}|(?:^|\s)(?:[\-–—]\s*){3,}/u.test(text)
  // Require a complete extra sentence, not just the two supplied openers,
  // labels, writing instructions or empty answer lines.
  const hasNarrativeSentence = text => {
    const sentences = normalized(text).match(/[^.!?]+[.!?]+|[^.!?]+$/gu) || []
    // A suspect sentence cannot become output merely because another sentence
    // in the same candidate paragraph happens to be narrative.
    return !sentences.some(nonNarrative) && sentences.some(sentence =>
      /\b[A-Za-z]+(?:['’-][A-Za-z]+)*\s+(?:[A-Za-z]+(?:['’-][A-Za-z]+)*\b[\s,;:'"()\-–—]*)+[^.!?]*[.!?]/u.test(sentence))
  }
  // Only open an unlabeled sample when the first given starts immediately
  // after the prompt, and the second follows continuous prose in source order.
  const confirmedUnlabeled = promptIndex => {
    if (!usesV23WritingCapabilities(producerVersion) || given.length !== 2
      || given.some(s => !s || !/[.!?]$/u.test(s)) || given[0] === given[1]) return null
    const first = sectionLines[promptIndex + 1]
    if (!first || !startsWithGiven(first, given[0])) return null
    const body = [normalized(first.text).slice(given[0].length).trim(), '']
    let paragraph = 0
    for (const line of sectionLines.slice(promptIndex + 2)) {
      const facts = factsFor(line)
      if (line.figure || line.table || line.repeatedTaskBoundary
        || firstLineRole('entry-label', facts) || firstLineRole('writing-section', facts)
        || firstLineRole('scoring-section', facts) || matchesLineRole('writing.part-boundary', facts)
        || matchesLineRole('writing.continuation-prompt', facts)
        || /^(?:英语)?听力(?:部分)?录音稿$/u.test(facts.nfkc.trim())
        || matchesLineRole('writing.student-script', facts) || matchesLineRole('writing.omission', facts, { inWriting: true, taskType })) {
        if (paragraph === 1) break
        return null
      }
      if (facts.hasHan || !facts.startsEnglishOrQuote) return null
      if (startsWithGiven(line, given[1])) {
        if (paragraph || !hasNarrativeSentence(body[0])) return null
        paragraph = 1
        body[1] = normalized(line.text).slice(given[1].length).trim()
        continue
      }
      if (startsWithGiven(line, given[0])) return null
      body[paragraph] += ` ${normalized(line.text)}`
    }
    return paragraph === 1 && hasNarrativeSentence(body[1]) ? first : null
  }
  const inferredStarts = new Set(sectionLines.flatMap((line, index) =>
    taskType === 'continuation' && matchesLineRole('writing.continuation-prompt', factsFor(line))
      ? [confirmedUnlabeled(index)].filter(Boolean) : []))
  let awaitingSourceLabel = false, hasEntry = false, labelItemId = null, explanationPause = false, englishBodyAnchor = false
  let repeatedNeedsLabel = false
  for (const [lineIndex, line] of sectionLines.entries()) {
    const step = { line, action: 'ended', reviews: [], resetEntry: false }
    const emit = action => {
      step.action = action
      step.state = { task: taskType, capturing: (action === 'body' || action === 'entry') && capture.kind === 'essays',
        ended: capture.ended, kind: capture.kind, action, labelItemId }
      steps.push(step)
    }
    const pause = (reason, until = explicitTitles ? 'the next explicit source entry label or verified English gloss' : 'the next label or English line') => {
      hasEntry = false
      labelItemId = null
      capture.pause()
      step.reviews.push({ itemId: line.itemId, issue: `${reason}; skipped until ${until}` })
      emit('pause')
    }
    if (line.repeatedTaskBoundary) {
      if (capture.ended) scopeError('Repeated writing section follows a terminated reference range')
      repeatedNeedsLabel = line.needsLabel
      step.resetEntry = true
      hasEntry = false
      labelItemId = null
      emit('task')
      continue
    }
    if (repeatedNeedsLabel && (line.figure || line.table
      || !(firstLineRole('entry-label', factsFor(line)) || declaredInSection.has(line.itemId)))) {
      scopeError(`Repeated writing section requires an explicit entry label: ${line.itemId}`)
    }
    if (repeatedNeedsLabel) repeatedNeedsLabel = false
    if (capture.ended) { emit('ended'); continue }
    if (line.figure) { emit('figure'); continue }
    if (line.table) {
      // A reused appendix entry cannot lend its rubric to a later unscoped
      // table. Confirmed source ownership must independently name this task.
      if (explicitTitles && capture.kind === 'scoring'
        && scoringScopes.get(line.itemId)?.taskType !== taskType) {
        scopeError(`Source table ${line.table.tableId} has no writing-task scope`)
      }
      emit('table')
      continue
    }
    const facts = factsFor(line)
    if (section.scoringOnlyLines?.has(line)
      && (matchesLineRole('entry.sample-label', facts)
        || explicitWritingHeading(line.text, producerVersion)?.sample
        || applicationStanceLabel(line.text, taskType)
        || completeSourceLetter(sectionLines, lineIndex, factsFor, producerVersion))) {
      scopeError(`Scoring-only appendix cannot reopen source essays: ${line.itemId}`)
    }
    if (awaitingSourceLabel && inferredStarts.has(line)) {
      awaitingSourceLabel = false
      capture.start('essays')
      hasEntry = false
      labelItemId = null
    }
    // Two complete letters can be printed without intervening version labels.
    // A new salutation requires the preceding closing/signature AND a complete
    // bounded new letter; an English line alone never creates this boundary.
    if (explicitTitles && taskType === 'application' && hasEntry && capture.kind === 'essays'
      && lineIndex >= 2 && matchesLineRole('paragraph.salutation', facts)
      && matchesLineRole('paragraph.closing', factsFor(sectionLines[lineIndex - 2]))
      && /^\p{Lu}[\p{Script=Latin}’'-]*\.?(?:\s+\p{Lu}[\p{Script=Latin}’'-]*\.?){0,3}$/u.test(sectionLines[lineIndex - 1].text.trim())
      && completeSourceLetter(sectionLines, lineIndex, factsFor, producerVersion)) {
      hasEntry = false
      labelItemId = null
      step.resetEntry = true
    }
    const taskSample = explicitWritingHeading(line.text, producerVersion)?.sample
    const stanceSample = explicitTitles && applicationStanceLabel(line.text, taskType)
    const continuationScoring = explicitTitles && continuationScoringLabel(line.text, taskType)
    if (explicitTitles && /^范文[一二三四五六七八九十\d]+\s*[:：].+/u.test(facts.trimmed) && !stanceSample) {
      scopeError(`Unresolved source sample title: ${line.itemId}`)
    }
    if (explicitTitles && continuationThoughtHeading(line.text)) {
      pause('explicit continuation explanation', 'the next explicit source entry label')
      explanationPause = true
      continue
    }
    if (taskType === 'application' && capture.kind === 'scoring'
      && completeSourceLetter(sectionLines, lineIndex, factsFor, producerVersion)) {
      hasEntry = false
      labelItemId = null
      capture.start('essays')
      step.resetEntry = true
    }
    if (taskType === 'continuation' && capture.kind !== 'scoring'
      && matchesLineRole('writing.continuation-prompt', facts)) {
      pause('reprinted continuation question prompt', 'the next explicit source entry label')
      awaitingSourceLabel = true
      continue
    }
    if (matchesLineRole('writing.student-script', facts)) {
      capture.end()
      step.reviews.push({ itemId: line.itemId, issue: 'student-script column ends this writing section’s reference capture' })
      emit('ended')
      continue
    }
    const declaredEntry = declaredInSection.get(line.itemId)
    const numberedSample = capture.kind !== 'scoring' && numberedSamples.has(line)
    // Confirmed table cells reached by the scope view are layout rows inside
    // their entry; only a declared label can retitle them, and only outside a
    // table do the closed grammars create a new entry boundary.
    const tableCell = tableItemIds.has(line.itemId)
    if (declaredEntry && ['commentary', 'not-writing'].includes(declaredEntry.role)) {
      pause(`declared ${declaredEntry.role} "${line.text.slice(0, 12)}" is neither a source sample nor scoring`)
      explanationPause = explicitTitles
      continue
    }
    if ((!tableCell || declaredEntry) && (firstLineRole('entry-label', facts) || numberedSample || taskSample || stanceSample
      || continuationScoring || line === scoringPoints[0] || declaredEntry)) {
      const kind = continuationScoring || line === scoringPoints[0] ? 'scoring'
        : declaredEntry?.role === 'scoring-heading' ? 'scoring'
          : numberedSample || taskSample || stanceSample || declaredEntry?.role === 'sample-heading' ? 'essays'
            : declaredEntry?.role === 'section-heading' ? (capture.kind === 'scoring' ? 'scoring' : 'essays')
              : firstLineRole('entry-kind', facts)?.value || null
      if (!kind) {
        // These existing whole teaching headings explicitly identify analysis.
        // Every other unknown bracketed range needs source clarification.
        if (explicitTitles && !/^【(?:审题重点|谋篇布局)】[:：]?$/u.test(facts.trimmed)) {
          scopeError(`Unresolved writing reference title: ${line.itemId}`)
        }
        pause(`commentary "${line.text}" is neither a source sample nor scoring`)
        explanationPause = explicitTitles
        continue
      }
      capture.start(kind)
      explanationPause = false
      englishBodyAnchor = false
      if (kind === 'essays') awaitingSourceLabel = false
      hasEntry = true
      labelItemId = line.itemId
      emit('entry')
      continue
    }
    if (matchesLineRole('writing.omission', facts, { inWriting: true, taskType })) {
      awaitingSourceLabel = false
      emit('omission')
      continue
    }
    if (awaitingSourceLabel && capture.kind !== 'scoring') { emit('awaiting-label'); continue }
    if (matchesLineRole('writing.commentary', facts, { entryKind: capture.kind, skipping: capture.paused })) {
      if (explicitTitles && (capture.kind === 'essays' || (capture.paused && !explanationPause))
        && /^[（(]/u.test(facts.trimmed)
        && facts.hasHan && /\p{Script=Latin}/u.test(facts.text)) {
        scopeError(`Unresolved mixed-language source sample text: ${line.itemId}`)
      }
      if (!capture.paused) {
        pause(`Chinese commentary "${line.text.slice(0, 12)}…" follows the sample`)
        explanationPause = explicitTitles && !(englishBodyAnchor
          && /^[（(]\p{Script=Han}[^（）()\r\n]*[）)]$/u.test(facts.trimmed)
          && !/^[（(][一二三四五六七八九十]+[）)]/u.test(facts.trimmed))
      }
      else emit('commentary')
      continue
    }
    if (capture.paused && explicitTitles && (explanationPause || !verifiedParenthesizedEnglish(line.text))) {
      emit('commentary')
      continue
    }
    if (matchesLineRole('writing.skipped-fragment', facts, { skipping: capture.paused })) { emit('fragment'); continue }
    if (section.scoringOnlyLines?.has(line) && capture.kind !== 'scoring') {
      scopeError(`Scoring-only appendix requires an explicit rubric entry: ${line.itemId}`)
    }
    capture.resume()
    step.openEntry = !hasEntry
    if (!hasEntry) { hasEntry = true; labelItemId = null }
    englishBodyAnchor ||= !facts.hasHan && facts.startsEnglishOrQuote
    emit('body')
  }
  if (explicitTitles) {
    // A task owns its initial range even without a separate sample label.
    // Validate in source order: a later entry cannot erase unresolved content.
    let sourceBody = false, explanation = false
    for (const [index, step] of steps.entries()) {
      if (step.action === 'entry' || step.action === 'omission') {
        sourceBody = false
        explanation = false
      }
      if (step.action === 'body' && step.state.capturing) sourceBody = true
      if (step.action === 'table' || step.action === 'figure') {
        if (!explanation && step.state.kind !== 'scoring') {
          scopeError(`Unresolved writing task visual ownership: ${step.line.itemId}`)
        }
        continue
      }
      const facts = factsFor(step.line)
      // A whole numbered example heading immediately followed by its source
      // label is label scaffolding, not an unclassified content range.
      if (step.action === 'pause' && /^\([一二三四五六七八九十]+\)作答示例[:：]?$/u.test(facts.nfkc)
        && steps[index + 1]?.action === 'entry' && steps[index + 1].state.kind === 'essays') continue
      if (step.action === 'pause' && (['commentary', 'not-writing'].includes(declaredInSection.get(step.line.itemId)?.role)
        || continuationThoughtHeading(step.line.text)
        || /^【(?:审题重点|谋篇布局)】[:：]?$/u.test(facts.trimmed)
        || /^(?:\d+\s*[.、]|\([一二三四五六七八九十]+\))\s*(?:故事概述|续写方向|考查目标与写作情境)[:：]?$/u.test(facts.nfkc)
        || matchesLineRole('writing.continuation-prompt', facts))) explanation = true
      const unknownMixed = /^[（(]/u.test(facts.trimmed) && facts.hasHan
        && /\p{Script=Latin}/u.test(facts.text) && !verifiedParenthesizedEnglish(step.line.text)
      if (!explanation && step.state.kind !== 'scoring'
        && ['pause', 'commentary', 'fragment'].includes(step.action) && facts.trimmed
        && (!sourceBody || unknownMixed)) {
        scopeError(`Unresolved nonempty writing task range: ${step.line.itemId}`)
      }
    }
  }
  if (explicitTitles && section.explicitOmission && steps.some(step => step.state.capturing && step.action === 'body')) {
    scopeError('Explicit 范文略 conflicts with captured source sample text')
  }
  // A declared sample start is a hard commitment: silently degrading it to
  // not_supplied would lose an official essay the agent explicitly marked.
  for (const [itemId, declaration] of declaredInSection) {
    if (declaration.role !== 'sample-heading') continue
    const step = steps.find(candidate => candidate.line.itemId === itemId)
    const captured = steps.some(candidate => candidate.action === 'body' && candidate.state.capturing
      && candidate.state.kind === 'essays' && candidate.state.labelItemId === itemId)
    if (!step || !captured) {
      throw roleDeclarationError(`Declared sample-heading ${itemId} captured no essay body`)
    }
  }
  if (explicitTitles && section.explicitSample && !steps.some(step => step.state.capturing && step.action === 'body')) {
    scopeError('Explicit source sample heading has an empty/unresolved sample range')
  }
  if (explicitTitles && steps.some(step => step.action === 'entry'
    && applicationStanceLabel(step.line.text, taskType)
    && !steps.some(body => body.action === 'body' && body.state.capturing && body.state.labelItemId === step.line.itemId))) {
    scopeError('Explicit source stance sample has an empty/unresolved sample range')
  }
  return { sectionLines, sampleTitles, steps, awaitingSourceLabel }
}

// Thin projections of the same lifecycle, not another admission state machine.
// Lightweight role fixtures can omit geometry; real admission supplies the
// sealed evidence and therefore uses exactly the producer's visual/furniture view.
export function sourceReferenceEssayTaskStates(confirmation, answerIds, materialization, evidence, options) {
  const states = new Map()
  const sourceDocuments = usesAlternateAnswerScope(options?.producerVersion ?? OCR_SOURCE_REFERENCES_PRODUCER_VERSION)
    ? nck1ReferenceOcrSourceDocuments(materialization.documents, confirmation, options?.referenceSourceDocuments) : materialization.documents
  const documents = sourceDocuments.filter(document => answerIds.has(document.documentId))
  const taskTypes = new Set()
  const degradedTasks = new Set()
  // Mirror the producer's soft degradation: a section whose capture planning
  // fails marks its task degraded rather than aborting the lifecycle.
  const onScopeError = info => degradedTasks.add(info.taskType)
  for (const document of documents) {
    const source = prepareSourceReferenceWritingItems({ ...materialization, documents: [document] }, evidence, confirmation,
      { ...options, onScopeError })
    const lifecycle = sourceReferenceWritingLifecycle(source.lines, { ...source, onScopeError })
    for (const taskType of lifecycle.sections.keys()) taskTypes.add(taskType)
    for (const [taskType, section] of lifecycle.sections) {
      if (section.captureError) degradedTasks.add(taskType)
    }
    for (const [itemId, state] of lifecycle.items) states.set(itemId, state)
  }
  if (documents.length && usesExplicitWritingTitles(options?.producerVersion ?? OCR_SOURCE_REFERENCES_PRODUCER_VERSION)) {
    const missing = (materialization.groups ?? []).filter(group =>
      group.writingTask && !taskTypes.has(group.writingTask.taskType) && !degradedTasks.has(group.writingTask.taskType))
    if (missing.length && options?.sidecar?.wholeDocumentWritingAbsence) {
      wholeDocumentAbsenceSubject({ sidecar: options.sidecar, materialization, sourceInput: options.sourceInput,
        sourceDigest: options.sourceDigest, candidateDigest: options.candidateDigest })
      return states
    }
    for (const group of materialization.groups ?? []) {
      if (group.writingTask && !taskTypes.has(group.writingTask.taskType)
        && !degradedTasks.has(group.writingTask.taskType)) {
        // Current producer: a wholly unrecognized task degrades like a failed
        // section; historical authorities keep the hard failure.
        if ((options?.producerVersion ?? OCR_SOURCE_REFERENCES_PRODUCER_VERSION) === OCR_SOURCE_REFERENCES_PRODUCER_VERSION) continue
        scopeError(`No answer-document section found for ${group.writingTask.taskType}`)
      }
    }
  }
  return states
}
