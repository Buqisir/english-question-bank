import {
  WRITING_PART, WRITING_SECTION, WRITING_SCORING_SECTION, ANSWER_EXPLANATION_START, BARE_APPLICATION_SECTION,
  WRITING_SCORING_OVERVIEW, LISTENING_REFERENCE_START, NON_WRITING_SECTION,
  NUMBERED_APPLICATION_SECTION, NUMBERED_CONTINUATION_SECTION, NUMBERED_ENTRY_LABEL, SCORING_ENTRY_LABEL,
  isExplicitScoringAppendixStart, scoredWritingRubricTask, isWritingVersionLabel, writingRuleMatchingView,
  OBJECTIVE_ANSWER_FIGURE_MARKER,
  BARE_WRITING_SECTION, INLINE_WRITING_SAMPLE, INLINE_WRITING_ANSWER_SAMPLE,
} from './sourceReferenceWritingRules.mjs'

// Preserve the scoring helper's existing alternate part title.
const ALTERNATE_WRITING_PART = /^第[三四]部分[:：]?书面表达/u

// Conservative ownership for new scoring figures, replayed by producer and
// admission alike. Only explicit source headings and scoring labels authorize
// capture. A nearby Writing Task or a caller's declared entry is insufficient.
export function sourceReferenceScoringScopes(confirmation, answerIds, { onWritingStart } = {}) {
  const scopes = new Map()
  for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
    let writing = false, taskType = null, label = null, ended = false, terminal = false, startedWriting = false
    let afterListening = false
    const items = document.pages.flatMap(page => page.orderedItems)
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
          || NUMBERED_APPLICATION_SECTION.test(text) || NUMBERED_CONTINUATION_SECTION.test(text))
      if (afterListening) {
        appendixTask = scoredWritingRubricTask(item.text, items[index + 1]?.text)
        if (appendixTask) { afterListening = false; ended = false }
      }
      if (afterListening && !firstWritingHeading) {
        // Only the explicit overview + task-rubric pair can leave explanations.
        if (ANSWER_EXPLANATION_START.test(text) || /^参考答案解析/u.test(text)) terminal = true
        if (!terminal && WRITING_SCORING_OVERVIEW.test(text)) {
          afterListening = false
          ended = false
        }
        scopes.set(item.itemId, null)
        continue
      }
      if (firstWritingHeading) afterListening = false
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
      if (ANSWER_EXPLANATION_START.test(heading)
        || /^参考答案解析/u.test(heading) || LISTENING_REFERENCE_START.test(heading)) {
        writing = false
        taskType = null
        label = null
        ended = true
        afterListening = LISTENING_REFERENCE_START.test(heading)
        terminal = !afterListening && startedWriting
        scopes.set(item.itemId, null)
        continue
      }
      let task = appendixTask || WRITING_SECTION.find(([, pattern]) => pattern.test(heading))?.[0] || null
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
      // Keep spaces for the shared English sample-label predicate. Source text
      // and sourceLabel remain untouched; matching alone uses NFKC.
      const numberedEntryLabel = NUMBERED_ENTRY_LABEL.test(item.text.normalize('NFKC').trim())
      const scoringLabel = Boolean(scoringTask) || (numberedEntryLabel && /评分/u.test(text))
        || SCORING_ENTRY_LABEL.test(text)
        || /^(?:【|\[)[^】\]]*(?:评分|阅卷|评卷|给分|档次)[^】\]]*(?:】|\])[:：]?$/u.test(text)
      if (!ended && taskType && scoringLabel) label = item
      // A reprinted "写作二" starts the sample between rubric sections, not
      // another scoring paragraph; only the next rubric label restores scoring.
      else if (numberedEntryLabel || isWritingVersionLabel(item.text)
        || /^写作[一二](?:范文[:：]?)?$/u.test(text)
        || /^(?:(?:[一二三四五六七八九十]+、)?(?:参考范文|考场作文|作答示例|参考答案|范文)|(?:(?:A|One)?PossibleVersion)|【|\[)/iu.test(text)) label = null
      scopes.set(item.itemId, !ended && taskType && label
        ? { taskType, labelItemId: label.itemId, sourceLabel: label.text } : null)
    }
  }
  return scopes
}

// Positive source evidence is required so an unconsumed real rubric image
// cannot disappear merely because its writing anchor was lost.
export function sourceReferenceObjectiveFigureAnchors(confirmation, answerIds) {
  const starts = new Map()
  sourceReferenceScoringScopes(confirmation, answerIds, {
    onWritingStart: (documentId, itemId) => starts.set(documentId, itemId),
  })
  const anchors = new Set()
  for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
    const items = document.pages.flatMap(page => page.orderedItems)
    // Scoring can begin before any named task. Its first complete overview
    // or entry label already rules out treating a following A–G image as objective.
    const explicitStart = items.findIndex(item => {
      const heading = writingRuleMatchingView(item.text)
      return item.itemId === starts.get(document.documentId)
        || WRITING_SCORING_OVERVIEW.test(heading) || SCORING_ENTRY_LABEL.test(heading)
    })
    if (explicitStart < 0) continue
    // Earlier bare/combined producer headings also cap this exclusion. When
    // their task context is ambiguous, retain the image rather than discard it.
    const start = items.findIndex((item, index) => {
      const text = item.text.normalize('NFKC').trim()
      return index === explicitStart || BARE_WRITING_SECTION.test(text.split('\n')[0].trim())
        || INLINE_WRITING_SAMPLE.test(text) || INLINE_WRITING_ANSWER_SAMPLE.test(text)
    })
    for (const item of items.slice(0, start)) {
      if (OBJECTIVE_ANSWER_FIGURE_MARKER.test(item.text.trim())) anchors.add(item.itemId)
    }
  }
  return anchors
}
