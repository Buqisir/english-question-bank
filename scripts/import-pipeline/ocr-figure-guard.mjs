// Local proofreading hints only; none of these declarations enter OCR confirmation.
const VISUAL = '(?:chart|graph|diagram|picture|poster|map|table)'
const CUES = [
  /见下图|如下图|如图|下图|图表|示意图|[（(]\s*见图\s*[）)]/gu,
  new RegExp(`\\b(?:Figure\\s+\\d+|see\\s+the\\s+${VISUAL}\\s+below|the\\s+(?:chart|graph|diagram|flowchart|poster|map)s?\\s+(?:below|above)|according\\s+to\\s+the\\s+(?:chart|graph|diagram|figure|table)|shown\\s+(?:below|in\\s+the\\s+(?:chart|figure)))\\b`, 'giu'),
]
const TRANSCRIPT_MARKER = /^\(?Text\s*\d{1,2}\)?\s*[:：.．]?(?:\s|$)|^听力原文/iu
const TRANSCRIPT_END = /^(?:第[一二三四五六]部分|参考|写作|阅读|语言|[一二三四五六]、)/u

export function figureCues(text) {
  return [...new Set(CUES.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0])))]
}

export function missingFigureHints({ pages, only, noFigures = [] }) {
  const selected = only && new Set(only)
  const hints = []
  const transcript = new Map()
  const hasFigure = (page) => Boolean(page?.draft?.semanticTables?.length)
    || page?.draft?.items?.some((item) => item.figure || item.figureRegion || item.imageOnly === true)
  for (const page of [...pages].sort((a, b) =>
    a.documentId.localeCompare(b.documentId) || a.page - b.page)) {
    let inTranscript = transcript.get(page.documentId) || false
    const body = []
    for (const item of page.draft?.items || []) {
      const text = typeof item.text === 'string' ? item.text : ''
      if (['official_answers', 'question_and_answers', 'listening_transcript'].includes(page.role)) {
        if (TRANSCRIPT_MARKER.test(text)) inTranscript = true
        else if (TRANSCRIPT_END.test(text)) inTranscript = false
      }
      if (!inTranscript && page.role !== 'listening_transcript') body.push(text)
    }
    transcript.set(page.documentId, inTranscript)
    if (selected && !selected.has(page.key)) continue
    const cues = figureCues(body.join('\n'))
    if (!cues.length) continue
    const next = pages.find((candidate) =>
      candidate.documentId === page.documentId && candidate.page === page.page + 1)
    const exempt = noFigures.some((entry) => entry.page === page.key
      && entry.kind === 'no_figure' && typeof entry.reason === 'string' && entry.reason.trim())
    hints.push({ page: page.key, cues, missing: !hasFigure(page) && !hasFigure(next) && !exempt })
  }
  return hints
}

export function missingFigureMessage(hint) {
  return `${hint.page}：文字提到图形「${hint.cues.join('」「')}」，本页及紧邻下一页均无 figure 或 figureRegion。`
    + '对照整页图补 figure 和 figureRegion；若原页确实无图，在该页 source-flags 的 noFigures 写明 kind: "no_figure" 及 reason（理由）。'
}
