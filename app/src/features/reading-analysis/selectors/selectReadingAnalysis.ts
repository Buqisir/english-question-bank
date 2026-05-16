/**
 * selectReadingAnalysis — pure selector that turns a real
 * `QuestionGroupDetail` (+ optional human-curated sidecar) into the
 * `ReadingAnalysisFixture` shape the V0 view already understands.
 *
 * V0 scope:
 *   - 4-option single-select 阅读理解 questions only.
 *   - Conservative sentence splitter (no NLP dep).
 *   - Sidecar quotes are matched as normalized substrings inside one sentence;
 *     cross-sentence quotes are not supported and are recorded as a warning.
 *   - When a quote can't be located the entry is dropped (and warned about),
 *     never silently morphed into something else.
 *
 * Failure modes return `{ ok: false, reason }` rather than throwing — the
 * demo route uses the reason to fall back to the hardcoded fixture.
 */

import type { QuestionGroupDetail } from '../../../domain/questionBank.ts'
import type {
  EvidenceLink,
  Passage,
  PassageParagraph,
  Question,
  QuestionOption,
  ReadingAnalysisFixture,
  ReadingAnnotation,
} from '../readingAnalysisTypes.ts'

export type ReadingAnnotationSidecarEntry = {
  groupId: string
  questionNo: string
  optionLabel?: 'A' | 'B' | 'C' | 'D'
  kind: 'evidence' | 'trap'
  quote: string
}

export type ReadingAnalysisSidecar = {
  entries: ReadingAnnotationSidecarEntry[]
}

/**
 * Per-entry observation emitted alongside a successful selector run. The
 * report tooling uses this to summarize quote coverage on real groups; the
 * UI is unaffected.
 */
export type ReadingAnalysisQuoteDiagnostic = {
  groupId: string
  questionNo: string
  optionLabel?: 'A' | 'B' | 'C' | 'D'
  kind: 'evidence' | 'trap'
  quote: string
  status: 'hit' | 'miss'
  /**
   * Why a miss happened, or — for hits — a coexistence note. Reasons are a
   * bounded vocabulary picked specifically so a markdown report can group
   * them; selector matching semantics are unchanged.
   */
  reason?: 'not_found' | 'cross_sentence' | 'multiple_matches' | 'same_sentence_multi'
}

export type SelectReadingAnalysisInput = {
  detail: QuestionGroupDetail
  sidecar?: ReadingAnalysisSidecar
  questionNo?: string
}

export type SelectReadingAnalysisFailureReason =
  | 'no-questions'
  | 'question-not-found'
  | 'unsupported-question-type'
  | 'empty-passage'

export type SelectReadingAnalysisResult =
  | {
      ok: true
      fixture: ReadingAnalysisFixture
      warnings: string[]
      quoteDiagnostics: ReadingAnalysisQuoteDiagnostic[]
    }
  | {
      ok: false
      reason: SelectReadingAnalysisFailureReason
    }

export function selectReadingAnalysisFromDetail(
  input: SelectReadingAnalysisInput,
): SelectReadingAnalysisResult {
  const { detail, sidecar, questionNo } = input

  // ── 1. Passage ──────────────────────────────────────────────────────────
  const materialText = detail.passage?.materialText ?? ''
  const passage = derivePassage(detail, materialText)
  if (passage.paragraphs.length === 0) {
    return { ok: false, reason: 'empty-passage' }
  }

  // ── 2. Question selection ───────────────────────────────────────────────
  const questions = Array.isArray(detail.questions) ? detail.questions : []
  if (questions.length === 0) {
    return { ok: false, reason: 'no-questions' }
  }
  const targetQuestionNo = normalizeQuestionNo(questionNo)
  const target =
    targetQuestionNo === ''
      ? questions[0]
      : questions.find((q) => normalizeQuestionNo(q.questionNo) === targetQuestionNo)
  if (!target) {
    return { ok: false, reason: 'question-not-found' }
  }

  // ── 3. Options must be exactly A-D, no missing labels. ──────────────────
  const options = deriveFourOptions(target.options, target.answer)
  if (!options) {
    return { ok: false, reason: 'unsupported-question-type' }
  }

  const question: Question = {
    id: target.id || `question-${target.questionNo || 'unknown'}`,
    stem: target.stem,
    options,
    explanation:
      (target.explanation && target.explanation.trim()) ||
      '该题暂无解析。请结合原文证据自行判断。',
  }

  // ── 4. Sidecar → annotations + links ────────────────────────────────────
  const warnings: string[] = []
  const annotations: ReadingAnnotation[] = []
  const links: EvidenceLink[] = []
  const quoteDiagnostics: ReadingAnalysisQuoteDiagnostic[] = []

  const targetNoNormalized = normalizeQuestionNo(target.questionNo)
  const sidecarEntries = (sidecar?.entries ?? []).filter(
    (e) => normalizeQuestionNo(e.questionNo) === targetNoNormalized,
  )

  // Track annotations by sentenceId+kind so we can record the "same sentence
  // is both evidence and trap" warning the spec asks for.
  const sentenceKindIndex = new Map<string, Set<'evidence' | 'trap'>>()
  // Track annotation count per sentence so the diagnostics can mark the
  // 'same_sentence_multi' coexistence reason on hits.
  const sentenceAnnCount = new Map<string, number>()

  for (let i = 0; i < sidecarEntries.length; i++) {
    const entry = sidecarEntries[i]
    const located = locateQuoteInPassage(passage, entry.quote)
    if (!located) {
      warnings.push(
        `quote-miss: question ${entry.questionNo}${entry.optionLabel ? ` option ${entry.optionLabel}` : ''}: 未在原文单句内找到引文 "${truncateQuote(entry.quote)}"`,
      )
      quoteDiagnostics.push({
        groupId: detail.id,
        questionNo: entry.questionNo,
        optionLabel: entry.optionLabel,
        kind: entry.kind,
        quote: entry.quote,
        status: 'miss',
        reason: classifyMissReason(passage, entry.quote),
      })
      continue
    }

    const annotation: ReadingAnnotation = {
      id: `ann-${entry.kind}-${i + 1}`,
      kind: entry.kind,
      target: {
        id: `anchor-${entry.kind}-${i + 1}`,
        paragraphIndex: located.paragraphIndex,
        sentenceId: located.sentenceId,
        start: 0,
        end: 0,
        quote: entry.quote,
      },
    }
    annotations.push(annotation)

    const seenKinds = sentenceKindIndex.get(located.sentenceId) ?? new Set()
    seenKinds.add(entry.kind)
    sentenceKindIndex.set(located.sentenceId, seenKinds)
    if (seenKinds.size > 1) {
      warnings.push(
        `same-sentence-evidence-and-trap: sentence ${located.sentenceId} 同时被标为 evidence + trap`,
      )
    }
    const prevCount = sentenceAnnCount.get(located.sentenceId) ?? 0
    sentenceAnnCount.set(located.sentenceId, prevCount + 1)

    quoteDiagnostics.push({
      groupId: detail.id,
      questionNo: entry.questionNo,
      optionLabel: entry.optionLabel,
      kind: entry.kind,
      quote: entry.quote,
      status: 'hit',
      // Coexistence note. The reason is *informational* on hits — it does not
      // signal that this entry was rejected.
      reason: prevCount + 1 > 1 ? 'same_sentence_multi' : undefined,
    })

    const link: EvidenceLink = {
      id: `link-${i + 1}`,
      from: entry.optionLabel
        ? { questionId: question.id, optionKey: entry.optionLabel }
        : { questionId: question.id },
      toAnnotationId: annotation.id,
      kind: entry.kind === 'evidence' ? 'support' : 'trap',
    }
    links.push(link)
  }

  return {
    ok: true,
    fixture: { passage, annotations, question, links },
    warnings,
    quoteDiagnostics,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Passage derivation
 * ═════════════════════════════════════════════════════════════════════════ */

function derivePassage(detail: QuestionGroupDetail, materialText: string): Passage {
  const title =
    detail.passage?.title?.trim() ||
    detail.passageTitle?.trim() ||
    detail.title?.trim() ||
    '阅读原文'

  const paragraphs = splitParagraphs(materialText)
  const passageParagraphs: PassageParagraph[] = []
  paragraphs.forEach((paragraphText, pIdx) => {
    const sentences = splitSentences(paragraphText)
      .map((text, sIdx) => ({
        id: `p${pIdx + 1}-s${sIdx + 1}`,
        text,
      }))
      .filter((s) => s.text.length > 0)
    if (sentences.length === 0) return
    passageParagraphs.push({
      id: `p${pIdx + 1}`,
      sentences,
    })
  })

  return {
    id: detail.passage?.id || `passage-${detail.id}`,
    title,
    paragraphs: passageParagraphs,
  }
}

/**
 * Split the raw materialText into paragraphs.
 * Real corpora here use both blank lines AND CJK ideographic spaces (`　　`)
 * as paragraph delimiters, depending on the original DOCX/PDF source.
 */
export function splitParagraphs(text: string): string[] {
  if (!text || !text.trim()) return []
  // Normalize line breaks first.
  const normalized = text.replace(/\r\n?/g, '\n')
  // Split on either:
  //   - one-or-more blank lines, OR
  //   - two-or-more leading full-width spaces (`\u3000\u3000`+) at the start
  //     of a "paragraph" — a common DOCX export style here.
  // The pragmatic split is: collapse `\u3000{2,}` into `\n\n`, then split on
  // \n\n+. We keep single newlines inside a paragraph (rare here, but safe).
  const collapsed = normalized.replace(/[\u3000]{2,}/g, '\n\n')
  return collapsed
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n+/g, ' ').trim())
    .filter((p) => p.length > 0)
}

/**
 * Conservative sentence splitter:
 *  - splits after `.`, `!`, `?` (ASCII) and `。`, `！`, `？` (CJK)
 *  - keeps the terminal punctuation with the preceding sentence
 *  - merges fragments shorter than MIN_SENTENCE_CHARS into the previous one
 *    (handles abbreviations like "Mr." or "U.S." without an NLP lib)
 */
export function splitSentences(paragraph: string): string[] {
  if (!paragraph) return []
  const MIN_SENTENCE_CHARS = 8
  const pieces: string[] = []
  let buf = ''
  for (let i = 0; i < paragraph.length; i++) {
    buf += paragraph[i]
    const ch = paragraph[i]
    if (ch === '.' || ch === '!' || ch === '?' || ch === '。' || ch === '！' || ch === '？') {
      // Look ahead: if next non-space is uppercase / start-of-CJK, end the
      // sentence; otherwise keep buffering. Conservative — don't get clever.
      const next = paragraph[i + 1] ?? ''
      if (next === '' || /\s/.test(next)) {
        pieces.push(buf.trim())
        buf = ''
      }
    }
  }
  if (buf.trim()) pieces.push(buf.trim())

  // Merge tiny fragments back into the previous sentence.
  const merged: string[] = []
  for (const piece of pieces) {
    if (merged.length > 0 && piece.length < MIN_SENTENCE_CHARS) {
      merged[merged.length - 1] = (merged[merged.length - 1] + ' ' + piece).trim()
    } else {
      merged.push(piece)
    }
  }
  return merged
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Question / option derivation
 * ═════════════════════════════════════════════════════════════════════════ */

function deriveFourOptions(
  rawOptions: QuestionGroupDetail['questions'][number]['options'],
  rawAnswer: string,
): QuestionOption[] | null {
  if (!Array.isArray(rawOptions) || rawOptions.length !== 4) return null
  const wanted = ['A', 'B', 'C', 'D'] as const
  const normalized = rawOptions
    .map((o) => ({ ...o, _key: normalizeOptionLabel(o.label) }))
    .filter((o) => o._key !== null) as Array<
    QuestionGroupDetail['questions'][number]['options'][number] & {
      _key: 'A' | 'B' | 'C' | 'D'
    }
  >
  if (normalized.length !== 4) return null
  if (new Set(normalized.map((o) => o._key)).size !== 4) return null
  for (const w of wanted) {
    if (!normalized.some((o) => o._key === w)) return null
  }

  const correctKey = normalizeOptionLabel(rawAnswer)
  const byKey = new Map(normalized.map((o) => [o._key, o]))
  return wanted.map((key) => {
    const opt = byKey.get(key)!
    return {
      key,
      text: opt.content,
      correct: key === correctKey,
      rationale: '',
    }
  })
}

function normalizeOptionLabel(label: string): 'A' | 'B' | 'C' | 'D' | null {
  if (!label) return null
  const upper = label.trim().replace(/[().\s]/g, '').toUpperCase()
  if (upper === 'A' || upper === 'B' || upper === 'C' || upper === 'D') return upper
  return null
}

function normalizeQuestionNo(value: string | undefined | null): string {
  if (value === undefined || value === null) return ''
  return String(value).trim().toLowerCase()
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Quote location
 * ═════════════════════════════════════════════════════════════════════════ */

function locateQuoteInPassage(
  passage: Passage,
  quote: string,
): { paragraphIndex: number; sentenceId: string } | null {
  const needle = normalizeQuote(quote)
  if (!needle) return null
  for (let pIdx = 0; pIdx < passage.paragraphs.length; pIdx++) {
    const para = passage.paragraphs[pIdx]
    for (const s of para.sentences) {
      const hay = normalizeQuote(s.text)
      if (hay.includes(needle)) {
        return { paragraphIndex: pIdx, sentenceId: s.id }
      }
    }
  }
  return null
}

/**
 * Normalize a quote for substring matching:
 *   - trim
 *   - collapse all whitespace (incl. NBSP, CJK ideographic space) to a single ASCII space
 *   - unify curly / straight apostrophes
 *   - unify dashes (-, –, —)
 *   - lowercase
 * Punctuation other than apostrophes/dashes is preserved so that "decline."
 * doesn't suddenly equal "decline?".
 */
export function normalizeQuote(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00A0\u3000\s]+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Classify a quote miss into a coarse, fixed vocabulary so the report can
 * group failures. This is observation-only — selector matching is unchanged.
 *
 *   - cross_sentence : the quote contains an internal sentence terminator,
 *                       suggesting it was authored across two sentences
 *                       (e.g. "...refund. The last day...")
 *   - multiple_matches: the leading half of the quote appears in 2+ sentences
 *                       and is therefore ambiguous to a single-sentence
 *                       includes() match
 *   - not_found       : default — the quote simply isn't there
 */
function classifyMissReason(
  passage: Passage,
  quote: string,
): 'not_found' | 'cross_sentence' | 'multiple_matches' {
  const trimmed = normalizeQuote(quote)
  if (!trimmed) return 'not_found'

  // Cross-sentence: any terminator that has at least one alphabetic/CJK char
  // before AND after counts. Catches "...refund. The last day..." but not
  // trailing "... refund." (single-sentence quote with terminal punctuation).
  if (/[A-Za-z\u4e00-\u9fff][.!?。！？]\s+[A-Za-z\u4e00-\u9fff]/.test(trimmed)) {
    return 'cross_sentence'
  }

  // Multiple matches: take the first ~30 normalized chars of the quote and
  // see if they appear in 2+ distinct sentences. Empty/short quotes skip.
  const probe = trimmed.slice(0, 30)
  if (probe.length >= 8) {
    let sentenceMatches = 0
    for (const para of passage.paragraphs) {
      for (const s of para.sentences) {
        const hay = normalizeQuote(s.text)
        if (hay.includes(probe)) {
          sentenceMatches++
          if (sentenceMatches > 1) return 'multiple_matches'
        }
      }
    }
  }

  return 'not_found'
}

function truncateQuote(value: string, max = 40): string {
  if (value.length <= max) return value
  return value.slice(0, max - 1) + '…'
}
