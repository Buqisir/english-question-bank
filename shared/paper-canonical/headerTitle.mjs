// Import-time presentation only. Never apply this to a stored paper title while
// rendering: historical revisions intentionally have no headerTitle.
export function subjectFreeHeaderTitle(paperTitle) {
  if (typeof paperTitle !== 'string') throw new TypeError('paperTitle must be a string')
  const subject = /英\s*语(?:\s*学\s*科\s*试\s*题\s*卷|\s*试\s*题\s*卷|\s*试\s*题|\s*试\s*卷)?(?=(?:\s*[（(][^()（）]*[)）])*\s*[\p{P}\s]*$)/u
  const match = subject.exec(paperTitle)
  if (!match) return paperTitle
  const prefix = paperTitle.slice(0, match.index)
  // Bare 英语 needs an exam-name boundary. Do not turn a compound such as
  // 商务英语 or 专业英语 into a different name.
  if (/^英\s*语$/u.test(match[0]) && prefix.trim()
    && !/(?:考试|检测|测试|测评|联考|统考|模拟|试卷|[）)\s:：·—-])$/u.test(prefix)) return paperTitle
  // A subject at the end, or immediately before trailing edition notes, is
  // removable. A compound such as 英语教学 / 英语学校 is not a subject suffix.
  const result = `${prefix.trimEnd()}${paperTitle.slice(match.index + match[0].length).trimStart()}`.trim()
  return /[\p{L}\p{N}]/u.test(result) ? result : paperTitle
}

// The explicit value is sealed in the import config and projected unchanged.
// Reject arbitrary renaming; the original title remains source metadata.
export function configuredHeaderTitle(config) {
  if (config?.headerTitle === undefined) return undefined
  const expected = subjectFreeHeaderTitle(config?.provenance?.paperName)
  if (typeof config.headerTitle !== 'string' || !config.headerTitle.trim()
    || config.headerTitle !== expected) {
    throw Object.assign(new Error('headerTitle must match the subject-free source paper name'), {
      code: 'PAPER_HEADER_TITLE_INVALID',
    })
  }
  return config.headerTitle
}
