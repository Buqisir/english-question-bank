const normalize = text => text.normalize('NFKC').replace(/\s+/gu, '')

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
        writing = /^第[三四]部分(?:写作|书面表达)/u.test(text)
        startedWriting ||= writing
        taskType = null
        label = null
        ended = false
        heading = text.replace(/^第[三四]部分(?:写作|书面表达)(?:\([^)]*\))?/u, '')
      }
      if (/^(?:(?:附[:：]?)?听力|录音原文|试题解析|参考答案解析|答案解析|答案详解|参考答案详解|【(?:解题导语|语篇导读|语篇解读)】|Text\d)/iu.test(heading)) {
        writing = false
        taskType = null
        label = null
        ended = true
        terminal = startedWriting
      }
      let task = null
      if ((writing && /^第一节(?:\(|$)/u.test(heading))
        || /^(?:第一节(?:\([^)]*\))?)?(?:应用文(?:写作)?|书面表达)(?:评分细则[:：]?)?$/u.test(heading)
        || /^第[一二]节[:：]?(?:\(?(?:应用文|书面表达))/u.test(heading)) task = 'application'
      if ((writing && /^第二节(?:\(|$)/u.test(heading))
        || /^(?:第二节(?:\([^)]*\))?)?读后续写(?:评分细则[:：]?)?$/u.test(heading)
        || /^第[一二]节[:：]?\(?读后续写/u.test(heading)) task = 'continuation'
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
