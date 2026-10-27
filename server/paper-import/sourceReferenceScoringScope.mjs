import { sourceReferenceWritingLifecycle } from './sourceReferenceWritingTask.mjs'
import { answerGridPairs, answerLineCells } from './objectiveAnswerGrid.mjs'
import { inlineSampleParts } from '../../scripts/import-pipeline/ocr-line-roles.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION, assertSourceReferenceProducerVersion, usesExplicitWritingTitles,
  usesGivenTitleWritingSamples } from './sourceReferenceSemantics.mjs'
import {
  WRITING_PART, WRITING_SECTION, WRITING_SCORING_SECTION, ANSWER_EXPLANATION_START, BARE_APPLICATION_SECTION,
  WRITING_SCORING_OVERVIEW, LISTENING_REFERENCE_START, NON_WRITING_SECTION,
  NUMBERED_APPLICATION_SECTION, NUMBERED_CONTINUATION_SECTION, NUMBERED_ENTRY_LABEL, SCORING_ENTRY_LABEL,
  isExplicitScoringAppendixStart, scoredWritingRubricTask, writingRuleMatchingView, isSourceReferenceExplanationStart,
  BARE_WRITING_SECTION,
  isSourceReferenceSampleLabel, explicitWritingHeading, isReadingAnswerPair,
  continuationThoughtHeading, applicationStanceLabel,
} from './sourceReferenceWritingRules.mjs'

// Preserve the scoring helper's existing alternate part title.
const ALTERNATE_WRITING_PART = /^第[三四]部分[:：]?书面表达/u

// Share the existing complete scoring-label predicate with the objective cutoff.
function isScoringLabel(sourceText, scoringTask) {
  const text = writingRuleMatchingView(sourceText)
  const numberedEntryLabel = NUMBERED_ENTRY_LABEL.test(sourceText.normalize('NFKC').trim())
  return Boolean(scoringTask) || (numberedEntryLabel && /评分/u.test(text))
    || SCORING_ENTRY_LABEL.test(text)
    || /^(?:【|\[)[^】\]]*(?:评分|阅卷|评卷|给分|档次)[^】\]]*(?:】|\])[:：]?$/u.test(text)
}

// Conservative ownership for new scoring figures, replayed by producer and
// admission alike. Only explicit source headings and scoring labels authorize
// capture. A nearby Writing Task or a caller's declared entry is insufficient.
export function sourceReferenceScoringScopes(confirmation, answerIds,
  { onWritingStart, producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION, materialization = { groups: [] } } = {}) {
  assertSourceReferenceProducerVersion(producerVersion)
  const scopes = new Map()
  for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
    let writing = false, taskType = null, label = null, ended = false, terminal = false, startedWriting = false
    let afterListening = false
    const items = document.pages.flatMap((page, index) =>
      page.orderedItems.map(item => ({ ...item, page: page.page ?? index + 1 })))
    items.forEach((item, index) => { item.nextSourceItemId = items[index + 1]?.itemId })
    // Reuse extraction's task recognition, including adjacent/merged sample
    // labels. Existing scoring termination/reopening rules remain authoritative.
    const lifecycle = sourceReferenceWritingLifecycle(items, {
      materialization: usesGivenTitleWritingSamples(producerVersion) ? materialization : { groups: [] },
      answerDocument: { role: materialization.documents?.find(source =>
        source.documentId === document.documentId)?.role ?? 'official_answers' }, producerVersion,
    })
    for (const [index, item] of items.entries()) {
      let appendixTask = null
      if (terminal) {
        if (isExplicitScoringAppendixStart(item.text, items[index + 1]?.text)) {
          terminal = false
          afterListening = false
          ended = false
          appendixTask = scoredWritingRubricTask(item.text, items[index + 1]?.text)
        }
        if (!appendixTask) { scopes.set(item.itemId, null); continue }
      }
      const text = writingRuleMatchingView(item.text)
      // A transcript before the first writing task is ordinary source order.
      // After writing has started, only the explicit rubric appendix can reopen it.
      const firstWritingHeading = afterListening && !startedWriting
        && (WRITING_PART.test(text) || ALTERNATE_WRITING_PART.test(text)
          || WRITING_SECTION.some(([, pattern]) => pattern.test(text))
          || BARE_APPLICATION_SECTION.test(text) || /^读后续写[:：]?$/u.test(text)
          || NUMBERED_APPLICATION_SECTION.test(text) || NUMBERED_CONTINUATION_SECTION.test(text)
          || explicitWritingHeading(item.text, producerVersion)
          || (usesGivenTitleWritingSamples(producerVersion) && lifecycle.taskStarts.has(item.itemId)))
      if (afterListening) {
        appendixTask = scoredWritingRubricTask(item.text, items[index + 1]?.text)
        if (appendixTask) { afterListening = false; ended = false }
      }
      if (afterListening && !firstWritingHeading) {
        // Only the explicit overview + task-rubric pair can leave explanations.
        if (isSourceReferenceExplanationStart(item.text, producerVersion) || ANSWER_EXPLANATION_START.test(text) || /^参考答案解析/u.test(text)) terminal = true
        if (!terminal && WRITING_SCORING_OVERVIEW.test(text)) {
          afterListening = false
          ended = false
        }
        scopes.set(item.itemId, null)
        continue
      }
      if (firstWritingHeading) {
        afterListening = false
        // Objective listening answer rows can precede the first given-title
        // article. The lifecycle's full proof, never an English title alone,
        // establishes that first writing start after those rows.
        if (usesGivenTitleWritingSamples(producerVersion) && lifecycle.taskStarts.has(item.itemId)) ended = false
      }
      let heading = text
      if (NON_WRITING_SECTION.test(heading)) {
        writing = false
        taskType = null
        label = null
        ended = true
        scopes.set(item.itemId, null)
        continue
      }
      if (/^第[一二三四五六]部分/u.test(text)) {
        writing = WRITING_PART.test(text) || ALTERNATE_WRITING_PART.test(text)
        if (writing && !startedWriting) onWritingStart?.(document.documentId, item.itemId)
        startedWriting ||= writing
        taskType = null
        label = null
        ended = false
        heading = text.replace(WRITING_PART, '').replace(ALTERNATE_WRITING_PART, '').replace(/^\([^)]*\)/u, '')
      }
      const completeTranscript = usesExplicitWritingTitles(producerVersion) && lifecycle.listeningStarts.has(item.itemId)
      const readingBoundary = producerVersion === 'ocr-source-references-producer-v22'
        && lifecycle.items.get(item.itemId)?.ended && isReadingAnswerPair(item.text, items[index + 1]?.text)
      if (readingBoundary || isSourceReferenceExplanationStart(item.text, producerVersion) || ANSWER_EXPLANATION_START.test(heading)
        || /^参考答案解析/u.test(heading) || LISTENING_REFERENCE_START.test(heading) || completeTranscript) {
        writing = false
        taskType = null
        label = null
        ended = true
        afterListening = LISTENING_REFERENCE_START.test(heading) || completeTranscript
        terminal = !afterListening && startedWriting
        scopes.set(item.itemId, null)
        continue
      }
      const sharedTask = !ended && !afterListening ? lifecycle.taskStarts.get(item.itemId) : null
      let task = appendixTask || sharedTask || WRITING_SECTION.find(([, pattern]) => pattern.test(heading))?.[0] || null
      const scoringTask = WRITING_SCORING_SECTION.find(([, pattern]) => pattern.test(heading))?.[0]
      task ??= scoringTask
      if (NUMBERED_APPLICATION_SECTION.test(heading)) task = 'application'
      if (BARE_APPLICATION_SECTION.test(heading)) task = 'application'
      if (NUMBERED_CONTINUATION_SECTION.test(heading)) task = 'continuation'
      if ((writing && /^第一节(?:\(|$)/u.test(heading))
        || /^(?:第一节(?:\([^)]*\))?)?(?:应用文(?:写作)?|书面表达)(?:评分细则[:：]?)?$/u.test(heading)) task ??= 'application'
      if ((writing && /^第二节(?:\(|$)/u.test(heading))
        || /^(?:第二节(?:\([^)]*\))?)?读后续写(?:评分细则[:：]?)?$/u.test(heading)) task ??= 'continuation'
      if (task) {
        writing = true
        if (!startedWriting) onWritingStart?.(document.documentId, item.itemId)
        startedWriting = true
        taskType = task
        label = null
        ended = false
      }
      if (/^\([一二三四五六七八九十]+\)样卷[:：]?$/u.test(text)) {
        ended = true
        label = null
      }
      // Share the producer's complete essay-label grammar; Chinese citations
      // such as “范文1中…” remain rubric prose.
      const sampleLabel = isSourceReferenceSampleLabel(item.text, producerVersion)
      const scoringLabel = isScoringLabel(item.text, scoringTask)
      if (!ended && taskType && scoringLabel) label = item
      // A reprinted "写作二" starts the sample between rubric sections, not
      // another scoring paragraph; only the next rubric label restores scoring.
      else if (sampleLabel
        || /^写作[一二](?:范文[:：]?)?$/u.test(text)
        || /^(?:【|\[)/u.test(text)
        || (usesExplicitWritingTitles(producerVersion) && (applicationStanceLabel(item.text, taskType)
          || continuationThoughtHeading(item.text)))) label = null
      // The new contextual sequence and continuation rubric are recognized by
      // the shared capture planner, including their exact label-item identity.
      const state = lifecycle.items.get(item.itemId)
      if (usesExplicitWritingTitles(producerVersion) && !ended && !afterListening
        && state?.kind === 'scoring' && state.labelItemId) {
        label = items.find(candidate => candidate.itemId === state.labelItemId)
      }
      scopes.set(item.itemId, !ended && taskType && label
        ? { taskType, labelItemId: label.itemId, sourceLabel: label.text } : null)
    }
  }
  return scopes
}

// Identity includes the document/page/crop, never just the shared text anchor.
export const sourceReferenceFigureIdentity = figure =>
  digestJson([figure.sourceRegionId, figure.source])

// The visual resolver must already have proved crop/observation closure.
// No heading alone can authorize this new path: consume every confirmed word.
export function sourceReferenceObjectiveFigures(confirmation, answerIds, figures,
  { producerVersion = OCR_SOURCE_REFERENCES_PRODUCER_VERSION, materialization } = {}) {
  const objective = new Set()
  const starts = new Map()
  sourceReferenceScoringScopes(confirmation, answerIds, {
    producerVersion, materialization,
    onWritingStart: (documentId, itemId) => starts.set(documentId, itemId),
  })
  for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
    const items = document.pages.flatMap(page => page.orderedItems)
    const positions = new Map(items.map((item, index) => [item.itemId, index]))
    const start = items.findIndex(item => item.itemId === starts.get(document.documentId)
      || WRITING_SCORING_OVERVIEW.test(writingRuleMatchingView(item.text))
      || isScoringLabel(item.text, WRITING_SCORING_SECTION.some(([, pattern]) => pattern.test(writingRuleMatchingView(item.text))))
      || BARE_WRITING_SECTION.test(item.text.normalize('NFKC').split('\n')[0].trim())
      // Contextual v21 starts come from the lifecycle above; without writing
      // context only the historical inline forms can establish this cutoff.
      || inlineSampleParts(item.text.normalize('NFKC').trim(), { producerVersion }))
    for (const figure of figures.filter(figure => figure.source.documentId === document.documentId)) {
      if (start < 0 || !figure.itemIds.length
        || figure.itemIds.some(id => !positions.has(id) || positions.get(id) >= start)
        || positions.get(figure.afterItem.itemId) >= start) continue
      const selected = figure.itemIds.map(id => items[positions.get(id)])
      const rows = selected.flatMap(item => item.text.split(/\r?\n/u)).map(answerLineCells)
      if (rows.length < 2 || rows.length % 2) continue
      let previous = null, valid = true
      for (let index = 0; index < rows.length; index += 2) {
        const parsed = answerGridPairs(rows[index], rows[index + 1], (number, value) =>
          number >= 1 && number <= 55 && (number <= 20 ? /^[A-C]$/u : number >= 36 && number <= 40 ? /^[A-G]$/u : /^[A-D]$/u).test(value.trim())
            ? value.trim() : null)
        if (!parsed?.pairs || parsed.pairs.some(([number], i) =>
          i === 0 && previous !== null && number !== previous + 1)) { valid = false; break }
        previous = parsed.pairs.at(-1)[0]
      }
      if (valid) objective.add(sourceReferenceFigureIdentity(figure))
    }
  }
  return objective
}
