// Import-time presentation only. Never apply this to a stored paper title while
// rendering: historical revisions intentionally have no headerTitle.
export function subjectFreeHeaderTitle(paperTitle) {
  if (typeof paperTitle !== 'string') throw new TypeError('paperTitle must be a string')
  const subjectWords = String.raw`英\s*语(?:\s*学\s*科)?(?:\s*试\s*题\s*卷|\s*试\s*题|\s*试\s*卷|\s*练\s*习|\s*真\s*题|\s*样\s*题)?`
  const adjacentGrade = String.raw`高[一二三](?:年级)?\s*`
  // Match the complete parenthesized subject first, so its empty shell cannot
  // survive. Genuine edition notes remain in the trailing text.
  const subject = new RegExp(String.raw`(?:（\s*(${adjacentGrade})?${subjectWords}\s*）|\(\s*(${adjacentGrade})?${subjectWords}\s*\)|${subjectWords})(?=(?:\s*[（(][^()（）]*[)）]|[\p{P}\s])*$)`, 'u')
  const match = subject.exec(paperTitle)
  if (!match) return paperTitle
  const prefix = paperTitle.slice(0, match.index)
  // Parenthesized subject segments have a non-Han opening boundary.
  // Otherwise inspect exactly one character, preserving lexical compounds.
  const beforeSubject = /^[（(]/u.test(match[0]) ? '(' : Array.from(prefix).at(-1)
  if (beforeSubject && /\p{Script=Han}/u.test(beforeSubject)
    && !/[考试测检调模练估断评研卷题末中一二三度年级期赛]/u.test(beforeSubject)) return paperTitle
  // A subject at the end, or immediately before trailing edition notes, is
  // removable. A compound such as 英语教学 / 英语学校 is not a subject suffix.
  // Remove just the adjacent grade after accepting the subject boundary.
  // Do not recheck the shortened prefix: valid names may now end in 协作体 or
  // even an earlier lexical 英语. Other grades elsewhere in the title survive.
  // Captures 1/2 mean the one grade was already consumed inside parentheses.
  const headerPrefix = match[1] || match[2] ? prefix
    : prefix.replace(new RegExp(String.raw`\s*${adjacentGrade}$`, 'u'), '')
  const result = `${headerPrefix.trimEnd()}${paperTitle.slice(match.index + match[0].length).trimStart()}`.trim()
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

// Publication-envelope extension, independent of the historical paper authority.
// Both values enter the existing publication digest; absence adds no bytes.
export function configuredPaperHeader(config) {
  const headerTitle = configuredHeaderTitle(config)
  return headerTitle === undefined ? undefined : {
    sourceTitle: config.provenance.paperName,
    headerTitle,
  }
}

export function validatedPaperHeaderTitle(paperHeader) {
  if (paperHeader === undefined) return undefined
  if (!paperHeader || typeof paperHeader !== 'object' || Array.isArray(paperHeader)
    || Object.keys(paperHeader).sort().join(',') !== 'headerTitle,sourceTitle'
    || typeof paperHeader.sourceTitle !== 'string' || !paperHeader.sourceTitle.trim()
    || typeof paperHeader.headerTitle !== 'string' || !paperHeader.headerTitle.trim()
    || paperHeader.headerTitle !== subjectFreeHeaderTitle(paperHeader.sourceTitle)) {
    throw Object.assign(new Error('Publication paperHeader differs from the subject-free source title'), {
      code: 'PAPER_HEADER_TITLE_INVALID',
    })
  }
  return paperHeader.headerTitle
}
