import { WRITING_PART, WRITING_SECTION, ANSWER_EXPLANATION_START } from './sourceReferenceWritingRules.mjs'

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
    for (const page of document.pages) for (const item of page.orderedItems) {
      if (terminal) { scopes.set(item.itemId, null); continue }
      const text = normalize(item.text)
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
        || /^(?:(?:附[:：]?)?听力|录音原文|参考答案解析|Text\d)/iu.test(heading)) {
        writing = false
        taskType = null
        label = null
        ended = true
        terminal = startedWriting
        scopes.set(item.itemId, null)
        continue
      }
      let task = WRITING_SECTION.find(([, pattern]) => pattern.test(heading))?.[0] ?? null
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
      const scoringLabel = /^(?:[一二三四五六七八九十]+、)?评分(?:原则|标准|说明|细则|要求|建议)[:：]?$/u.test(text)
        || /^(?:【|\[)[^】\]]*(?:评分|阅卷|评卷|给分|档次)[^】\]]*(?:】|\])[:：]?$/u.test(text)
      if (!ended && taskType && scoringLabel) label = item
      else if (/^(?:(?:[一二三四五六七八九十]+、)?(?:参考范文|考场作文|参考答案|范文)|(?:(?:A|One)?PossibleVersion)|【|\[)/iu.test(text)) label = null
      scopes.set(item.itemId, !ended && taskType && label
        ? { taskType, labelItemId: label.itemId, sourceLabel: label.text } : null)
    }
  }
  return scopes
}
