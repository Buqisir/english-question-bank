import {
  WRITING_PART, WRITING_SECTION, WRITING_SCORING_SECTION, ANSWER_EXPLANATION_START, BARE_APPLICATION_SECTION,
  WRITING_SCORING_OVERVIEW, LISTENING_REFERENCE_START,
  NUMBERED_APPLICATION_SECTION, NUMBERED_CONTINUATION_SECTION, NUMBERED_ENTRY_LABEL, SCORING_ENTRY_LABEL,
} from './sourceReferenceWritingRules.mjs'

const normalize = text => text.normalize('NFKC').replace(/\s+/gu, '')
// Preserve the scoring helper's existing alternate part title.
const ALTERNATE_WRITING_PART = /^第[三四]部分[:：]?书面表达/u

// Conservative ownership for new scoring figures, replayed by producer and
// admission alike. Only explicit source headings and scoring labels authorize
// capture. A nearby Writing Task or a caller's declared entry is insufficient.
export function sourceReferenceScoringScopes(confirmation, answerIds) {
  const scopes = new Map()
  for (const document of confirmation.documents.filter(document => answerIds.has(document.documentId))) {
    let writing = false, taskType = null, label = null, ended = false, terminal = false, startedWriting = false
    let afterListening = false
    for (const page of document.pages) for (const item of page.orderedItems) {
      if (terminal) { scopes.set(item.itemId, null); continue }
      const text = normalize(item.text)
      if (afterListening) {
        // An explanation remains terminal, even between a transcript and rubric.
        if (ANSWER_EXPLANATION_START.test(text) || /^参考答案解析/u.test(text)) terminal = true
        if (!terminal && WRITING_SCORING_OVERVIEW.test(text)) {
          afterListening = false
          ended = false
        }
        scopes.set(item.itemId, null)
        continue
      }
      let heading = text
      if (/^第[一二三四五六]部分/u.test(text)) {
        writing = WRITING_PART.test(text) || ALTERNATE_WRITING_PART.test(text)
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
      let task = WRITING_SECTION.find(([, pattern]) => pattern.test(heading))?.[0] ?? null
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
      else if (numberedEntryLabel
        || /^(?:(?:[一二三四五六七八九十]+、)?(?:参考范文|考场作文|作答示例|参考答案|范文)|(?:(?:A|One)?PossibleVersion)|【|\[)/iu.test(text)) label = null
      scopes.set(item.itemId, !ended && taskType && label
        ? { taskType, labelItemId: label.itemId, sourceLabel: label.text } : null)
    }
  }
  return scopes
}
