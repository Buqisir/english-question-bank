/**
 * Print Renderer — generates semantic HTML + CSS for Vivliostyle PDF.
 * Input: renderer-neutral Print contract
 * (title, versionType, printStyle, items, blocks, questionNumberStart).
 * Output: complete HTML string ready for Vivliostyle or browser print.
 *
 * 刀⑤ render-fidelity Chunk B: page margins / line-height / font stacks now
 * consume `shared/papersurface/tokens.mjs` (the single typography-primitive
 * source shared with the screen PaperSurface / writing page — Chunk A).
 * The `@page` box model, footer page-number, and blank/writing-box mm
 * values are page-layer concepts specific to the print face and are NOT
 * added to `tokens.mjs` (out of scope there — see that file's header).
 *
 * Blank-marker styling reuses `shared/papersurface/blankPattern.mjs`
 * (`paperBlankPattern`, the SAME pattern the screen PaperSurface uses) —
 * per PA F2, NOT I15's `grammarFillBlankPattern` (that one matches
 * `NN._____`, which does not appear in stored paper-asset text; stored
 * grammar-fill blanks use the `__NN__` form, same family as cloze /
 * 七选五).
 *
 * figure-render cut (fig-token P0): covers ALL THREE print/A4 surfaces in
 * one place (plan.md render-face #3) — export print HTML/PDF, 工作台 A4
 * 预览, and 草稿卷预览 all wrap THIS module's output (`draftPaperPreviewHtml.
 * ts` / `DraftPaperWorkbench.tsx` only pretty-print + paginate it, no token
 * logic of their own). `buildPrintHtml` takes two new OPTIONAL, defaulted
 * params — `paperAssetsDir` and `imageMode` — so every existing caller that
 * omits them keeps byte-identical output (no figures/manifest.json lookup
 * happens at all unless a caller opts in). Line-granular marker replacement
 * (never substring) via the shared `resolveFigureMarker` — same rule
 * `paperAssetSurfaceAdapter.ts` enforces, so Screen and Print/PDF cannot
 * drift on which unit counts as "this line IS a figure".
 *
 * heading-fidelity cut (刀⑤ SW-B 销账, docs/cuts/heading-fidelity/plan.md):
 * `.section-header` 拆 part/section 两态 (headingKind.mjs 单源判定,
 * Screen 与 Print/PDF 共用) — 10.5pt 一律不放大, 部标题黑体加粗顶格 /
 * 节标题宋体常规并按 Owner-gold 与部标题共用 body-left;
 * h1 卷名 → 20pt (标准唯一放大项).
 */

import path from 'node:path'
import { paperSurfaceTokens } from '../shared/papersurface/tokens.mjs'
import { paperBlankPattern } from '../shared/papersurface/blankPattern.mjs'
import {
  grammarFillBlankRulingForRhythm,
  paperBlankRuling,
} from '../shared/papersurface/blankRuling.mjs'
import { headingKind } from '../shared/papersurface/headingKind.mjs'
import { resolveFigureMarker } from '../shared/figures/resolveFigureMarker.mjs'
import {
  abcdLayoutRules,
  translateAbcdPlanToPointPlacement,
} from '../shared/paper-canonical/abcdLayout.mjs'
import {
  applicationWritingNoticeLines,
  continuationStarterDisplayText,
} from '../shared/paper-canonical/applicationWritingDisplay.mjs'
import {
  readingPassageLetterGeometryForLetter,
  readingPassageLetterTypography,
} from '../shared/paper-canonical/readingPassageLetter.mjs'
import { sevenChoicesRhythm } from '../shared/paper-canonical/sevenChoicesRhythm.mjs'
import { clozeRhythm } from '../shared/paper-canonical/clozeRhythm.mjs'
import {
  grammarFillRhythm,
  grammarFillRhythmForPaperAuthority,
} from '../shared/paper-canonical/grammarFillRhythm.mjs'
import {
  paperTypographyRuntime,
  sectionHeadingRuntime,
  sectionHeadingTextRuns,
} from '../shared/paper-canonical/sectionHeadingContract.mjs'
import { applicationWritingRhythm } from '../shared/paper-canonical/applicationWritingRhythm.mjs'
import { continuationWritingRhythm } from '../shared/paper-canonical/continuationWritingRhythm.mjs'
import {
  hasGrammarFillPublicGeometryFixtureAuthority,
  resolveGrammarFillPublicGeometryFixture,
} from '../shared/paper-canonical/grammarFillPublicGeometryFixtures.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import {
  canonicalWritingChromeOwnsRenderedDocument,
  projectCanonicalConsumerGroup,
  projectCanonicalWritingChrome,
  selectedFamilyContractIdForGroup,
  selectConsumerGroupMode,
} from '../shared/paper-canonical/consumerProjection.mjs'
import {
  assertCanonicalConsumptionVisibleStructure,
} from '../shared/paper-canonical/visibleStructure.mjs'
import {
  canonicalSourceConsumptionForGroup,
} from './paper-canonical/consumerRuntime.mjs'
import { resolveGroupFigures } from './figures/paperFigures.mjs'

function renderSectionHeadingText(text) {
  return sectionHeadingTextRuns(text)
    .map((run) => run.kind === 'numeric'
      ? `<span data-canonical-section-heading-numeric-run="">${escapeHtml(run.text)}</span>`
      : escapeHtml(run.text))
    .join('')
}

function partToFirstSectionMarginTopPt({ printPdf = false } = {}) {
  const geometry = paperTypographyRuntime.partToFirstSectionGeometry
  const fontSizePt = sectionHeadingRuntime.printPdf.fontSizePt
  const visibleGlyphHeightRatio = printPdf
    ? geometry.visibleGlyphHeightToFontSizeRatio.printPdf
    : geometry.visibleGlyphHeightToFontSizeRatio.screen
  const glyphOverhangPt = printPdf
    ? 0
    : (geometry.visibleGlyphHeightToFontSizeRatio.screen - 1) * fontSizePt
  const numericBaselineCompensationPt = printPdf
    ? (
      sectionHeadingRuntime.printPdf.numericRunBaselineShiftEm
      - geometry.printPdfNumericRunBaselineCalibrationEm
    ) * fontSizePt
    : 0
  return Math.max(
    0,
    geometry.visibleGlyphBottomStepRatio * visibleGlyphHeightRatio * fontSizePt
      - sectionHeadingRuntime.printPdf.lineHeightPt
      - glyphOverhangPt
      + numericBaselineCompensationPt,
  )
}

const groupTypeLabels = {
  reading: '阅读理解',
  cloze: '完形填空',
  seven_choices: '七选五',
  grammar_cloze: '语法填空',
  writing: '写作',
  continuation: '读后续写',
  listening: '听力',
  other: '其他',
}

// draft-numbering-style (docs/cuts/draft-numbering-style/plan.md): the three
// group types whose passage text carries literal in-text blank markers
// (`__41__` / `_____36_____` / `__56__`, matched by `paperBlankPattern`)
// that must stay numerically in lockstep with the small-question list below
// them. `reading` / `writing` never carry these markers in real data
// (verified empirically against all 174 non-target-type groups in
// data/question-bank.sqlite, 2026-07-10 — zero paperBlankPattern matches),
// so the hard consistency assertion below is scoped to only these three.
const BLANK_BEARING_GROUP_TYPES = new Set(['cloze', 'grammar_cloze', 'seven_choices'])

// draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判): 大题头改数字
// 「n、」为汉字「n、」(一、二、三…), 避免与小题阿拉伯号同型撞层级 —
// 中文试卷惯例。 一~二十够用 (真实草稿卷大题数远小于 20); 超出该表回退
// 阿拉伯数字并在此注释存档, 不做通用中文数字算法 (YAGNI — 没有真实卷子
// 会有 20+ 个大题).
const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
function chineseNumeral(n) {
  if (!Number.isInteger(n) || n < 1) return String(n)
  if (n <= 10) return n === 10 ? '十' : CHINESE_DIGITS[n]
  if (n < 20) return `十${CHINESE_DIGITS[n - 10]}`
  if (n === 20) return '二十'
  return String(n) // fallback: no real paper has 20+ 大题 (see comment above)
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isShortOptions(options) {
  if (!options || options.length === 0) return false
  return options.every((o) => String(o.content || '').length <= 20)
}

// paper-import publisher.mjs writes a metadata stub into questions.note
// (`paperId=...; assetVersion=...`) for every imported question — it is not
// a real explanation. Restart cut ③: hide it so print never shows raw
// tracking metadata as if it were teacher analysis.
function isMetaStub(text) {
  return /^paperId=.*assetVersion=/.test(String(text || ''))
}

/**
 * Renders one passage line, escaping prose text and replacing every
 * `paperBlankPattern` match (`__41__` / `_____36_____` / `__56__`) with a
 * styled underline + centered-number span — standard §6.
 *
 * Escape order matters (PA F2): only the PROSE slices around a match are
 * HTML-escaped; the blank's own markup is injected separately so the
 * underscore/space delimiters are never mangled by `escapeHtml`.
 *
 * `seven_choices` gets the longer (≈4.6em) underline; cloze / grammar_cloze
 * get the shorter (≈3.3em) underline (standard §6, 3+3 vs 2+2 whitespace
 * calibration).
 *
 * draft-numbering-style (owner 拍板 v2, 2026-07-10 二轮改判): the DISPLAYED
 * number is no longer the literal captured marker (`match[1]`, e.g. "41")
 * — it is the WHOLE-PAPER-continuous small-question number, assigned
 * strictly by ORDER OF APPEARANCE within the passage via `blankCounter`
 * (a `{ next }` ref the caller seeds to that group's FIRST continuous
 * question number and threads through every line of that one passage —
 * never reset per line, since a blank can be the Nth in the group
 * regardless of which line it lands on). This is deliberately NOT a lookup
 * keyed by the original marker value: order-of-appearance is the only
 * signal that stays correct even if the source text has skipped/out-of-
 * order literal numbers (plan.md: "顺序即真相"). Format matches the
 * small-question list format exactly: plain `n`, no parens — v2 supersedes
 * the round-1 `(n)` form (owner QA: bracket read as visually odd against a
 * real exam's plain blank number, and per-group reset caused multiple
 * `(1)`s on one paper).
 */
function renderPassageLineWithBlanks(line, groupType, blankCounter) {
  const text = String(line ?? '')
  paperBlankPattern.lastIndex = 0
  if (!paperBlankPattern.test(text)) return escapeHtml(text)
  paperBlankPattern.lastIndex = 0

  const blankWidthClass = groupType === 'seven_choices' ? 'print-blank--seven' : 'print-blank--short'
  let out = ''
  let cursor = 0
  let match
  while ((match = paperBlankPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      out += escapeHtml(text.slice(cursor, match.index))
    }
    const localNum = blankCounter.next++
    out += `<span class="print-blank ${blankWidthClass}"><span class="print-blank-num">${localNum}</span></span>`
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) {
    out += escapeHtml(text.slice(cursor))
  }
  return out
}

function renderCanonicalParagraph(canonicalGroup, paragraph, displayNumberByQuestionId) {
  const blankWidthClass =
    canonicalGroup.groupType === 'sevenChoices'
      ? 'print-blank--seven'
      : 'print-blank--short'
  return paragraph.nodes.map((node) => {
    if (node.type === 'text') return escapeHtml(node.text)
    const displayNumber = displayNumberByQuestionId.get(node.questionId)
    if (displayNumber === undefined) {
      throw new Error(
        `Canonical Print HTML blank references missing question ${node.questionId}`,
      )
    }
    const isGrammarFill = canonicalGroup.groupType === 'grammarFill'
    const hint = node.hint
      ? `<span class="print-blank-hint"${isGrammarFill ? ' data-canonical-grammar-fill-rhythm-role="prompt_text"' : ''}>(${escapeHtml(node.hint)})</span>`
      : ''
    const pairAttrs = canonicalGroup.groupType === 'sevenChoices'
      ? ` data-canonical-pair="${escapeHtml(`${node.questionId}:${node.blankId}`)}" data-canonical-question-id="${escapeHtml(node.questionId)}" data-canonical-blank-id="${escapeHtml(node.blankId)}" data-canonical-seven-choices-rhythm-role="inline_blank_marker"`
      : canonicalGroup.groupType === 'cloze'
        ? ` data-canonical-pair="${escapeHtml(`${node.questionId}:${node.blankId}`)}" data-canonical-question-id="${escapeHtml(node.questionId)}" data-canonical-blank-id="${escapeHtml(node.blankId)}" data-canonical-cloze-rhythm-role="inline_blank_marker"`
        : isGrammarFill
          ? ` data-canonical-pair="${escapeHtml(`${node.questionId}:${node.blankId}`)}" data-canonical-question-id="${escapeHtml(node.questionId)}" data-canonical-blank-id="${escapeHtml(node.blankId)}" data-canonical-grammar-fill-rhythm-role="inline_blank_marker" data-canonical-grammar-fill-unit=""`
          : ''
    return `<span class="print-blank-unit"${pairAttrs}><span class="print-blank ${blankWidthClass}"><span class="print-blank-num">${displayNumber}</span></span>${hint}</span>`
  }).join('')
}

function canonicalSevenChoicesPassageRole(paragraph) {
  if (paragraph.role === 'title') return 'passage_title'
  if (paragraph.role === 'subtitle') return 'passage_subtitle'
  return 'passage_body_line'
}

function canonicalGroupMatchesPrintDetail(canonicalGroup, detail) {
  const expectedGroupType =
    canonicalGroup.groupType === 'grammarFill'
      ? 'grammar_cloze'
      : canonicalGroup.groupType === 'sevenChoices'
        ? 'seven_choices'
        : canonicalGroup.groupType === 'continuation'
          ? 'writing'
      : canonicalGroup.groupType
  return (
    detail.groupType === expectedGroupType
    && canonicalGroup.questions.length === detail.questions.length
    && canonicalGroup.questions.every(
      (question, index) => question.questionId === detail.questions[index]?.id,
    )
  )
}

function canonicalFamilyForPrintDetail(detail, selectedFamilyContractId) {
  if (detail.groupType === 'cloze') return 'cloze'
  if (['grammarFill', 'grammar_cloze'].includes(detail.groupType)) {
    return 'grammar-fill'
  }
  if (['sevenChoices', 'seven_choices'].includes(detail.groupType)) {
    return 'seven-choices'
  }
  if (detail.groupType === 'reading') return 'reading'
  if (
    ['writing', 'continuation'].includes(detail.groupType)
    && ['application-writing', 'continuation-writing'].includes(
      selectedFamilyContractId,
    )
  ) return selectedFamilyContractId
  return null
}

function requiresCanonicalPrintConsumption(detail) {
  return [
    'cloze',
    'grammarFill',
    'grammar_cloze',
    'sevenChoices',
    'seven_choices',
    'reading',
    'writing',
    'continuation',
  ].includes(detail?.groupType)
}

function rejectCanonicalPrint(message) {
  const error = new Error(message)
  error.code = 'CANONICAL_CONSUMPTION_REJECTED'
  throw error
}

function rejectCanonicalGrammarFill(message) {
  const error = new Error(message)
  error.code = 'CANONICAL_CONSUMPTION_REJECTED'
  throw error
}

function assertCanonicalGrammarFillSourceBinding({
  canonicalConsumption,
  grammarFillChrome,
  items,
  teacher,
}) {
  const selection = canonicalConsumption?.selections?.find(
    (candidate) =>
      candidate.familyContractId === 'grammar-fill'
      && candidate.mode === 'canonical',
  )
  if (!selection) return
  const groupId = grammarFillRhythm.publicArtifactOracle.grammarFill.groupId
  if (!items.some((candidate) => candidate.detail.id === groupId)) return
  const sourceConsumption = canonicalSourceConsumptionForGroup(
    canonicalConsumption,
    groupId,
  )
  const rhythm = grammarFillRhythmForPaperAuthority({
    paperId: sourceConsumption.paperId,
    manifestVersion: sourceConsumption.authorityRef?.manifestVersion,
  })
  const oracle = rhythm.publicArtifactOracle
  const sourceSelection = sourceConsumption?.selections?.find(
    (candidate) =>
      candidate.familyContractId === 'grammar-fill'
      && candidate.mode === 'canonical',
  )
  const requiresBinding =
    Number(sourceConsumption.authorityRef?.manifestVersion) >= 20
    && sourceConsumption.paperId === oracle.paperId
    && sourceSelection?.groupIds.includes(oracle.grammarFill.groupId)
  const binding = grammarFillChrome?.sourceBinding
  if (!binding) {
    if (requiresBinding) {
      rejectCanonicalGrammarFill(
        'Canonical Grammar Fill public artifact source binding is unavailable',
      )
    }
    return
  }
  if (
    binding.paperId !== oracle.paperId
    || binding.sourceAssetVersion !== sourceConsumption.sourceAssetVersion
    || binding.sourceDigests?.paperAsset
      !== `sha256:${oracle.sourceBindings.paperAsset.sha256}`
    || binding.groupId !== groupId
    || sourceSelection?.groupIds.length !== 1
    || sourceSelection.groupIds[0] !== groupId
  ) {
    rejectCanonicalGrammarFill(
      'Canonical Grammar Fill public artifact identity disagrees',
    )
  }
  const occurrence = sourceSelection.projectedOccurrences?.find(
    (candidate) => candidate.groupId === groupId,
  )
  const occurrenceDigest = sourceSelection.projectedOccurrenceDigests?.find(
    (candidate) => candidate.groupId === groupId,
  )?.digest
  const expectedOccurrenceDigest = binding.proofVariantId
    ? oracle.adversarialProjectedOccurrenceDigests[binding.proofVariantId]
    : oracle.expectedProjectedOccurrenceDigest
  if (
    !occurrence
    || typeof expectedOccurrenceDigest !== 'string'
    || occurrenceDigest !== expectedOccurrenceDigest
    || occurrenceDigest !== binding.projectedOccurrenceDigest
    || digestJson(occurrence) !== occurrenceDigest
  ) {
    rejectCanonicalGrammarFill(
      'Canonical Grammar Fill projected source occurrence disagrees',
    )
  }
  if (
    binding.geometry?.blankWidthEm
      !== rhythm.blankGeometry.widthEm
    || binding.geometry?.promptGapEm
      !== rhythm.promptGeometry.gapEm
    || binding.geometry?.promptAttachment
      !== rhythm.promptGeometry.attachment
  ) {
    rejectCanonicalGrammarFill(
      'Canonical Grammar Fill prompt or blank geometry authority disagrees',
    )
  }
  const canonicalGroup = projectCanonicalConsumerGroup({
    consumption: sourceConsumption,
    familyContractId: 'grammar-fill',
    groupId,
  })
  const projectedBlankRows = canonicalGroup.paragraphs.flatMap(
    (paragraph) => paragraph.nodes
      .filter((node) => node.type === 'blank')
      .map((node) => ({
        questionId: node.questionId,
        blankId: node.blankId,
        prompt: node.hint ?? null,
      })),
  )
  const supplements = binding.questionSupplements
  if (
    !Array.isArray(supplements)
    || supplements.length !== oracle.grammarFill.questionIds.length
    || JSON.stringify(projectedBlankRows)
      !== JSON.stringify(supplements.map((row) => ({
        questionId: row.questionId,
        blankId: row.blankId,
        prompt: row.prompt ?? null,
      })))
  ) {
    rejectCanonicalGrammarFill(
      'Canonical Grammar Fill Question/Blank/Prompt source order disagrees',
    )
  }
  const item = items.find((candidate) => candidate.detail.id === groupId)
  if (
    !item
    || item.detail.questions.length !== supplements.length
    || item.detail.questions.some((question, index) => {
      const expected = supplements[index]
      return (
        question.id !== expected.questionId
        || question.answer !== expected.answer
        || (
          teacher
          && Object.hasOwn(expected, 'explanation')
          && (
            typeof expected.explanation !== 'string'
            || question.explanation !== expected.explanation
          )
        )
      )
    })
  ) {
    rejectCanonicalGrammarFill(
      `Canonical Grammar Fill ${teacher ? 'Teacher' : 'Student'} supplements disagree with source-bound answers or analysis`,
    )
  }
}

function grammarFillRenderMappingForConsumption({ consumption, items }) {
  const selection = consumption?.selections?.find(
    (candidate) =>
      candidate.familyContractId === 'grammar-fill'
      && candidate.mode === 'canonical',
  )
  const groupIds = selection?.groupIds.filter((groupId) =>
    items.some((item) => item.detail.id === groupId),
  ) || []
  if (groupIds.length === 0) {
    return { rhythm: grammarFillRhythm, ruling: paperBlankRuling.cloze }
  }
  const mappings = groupIds.map((groupId) => {
    const source = canonicalSourceConsumptionForGroup(consumption, groupId)
    const rhythm = grammarFillRhythmForPaperAuthority({
      paperId: source.paperId,
      manifestVersion: source.authorityRef?.manifestVersion,
    })
    const requiresBoundRule = source.paperId === 'paper-2026-i'
      && Number(source.authorityRef?.manifestVersion) >= 43
    const ruling = requiresBoundRule
      ? grammarFillBlankRulingForRhythm(rhythm)
      : paperBlankRuling.cloze
    const renderKey = JSON.stringify({
      blankWidthEm: rhythm.blankGeometry.widthEm,
      promptGapEm: rhythm.promptGeometry.gapEm,
      numberAlignment: ruling.numberAlignment,
      printLineWidthPt: ruling.printLineWidthPt,
      ruleVerticalAlignment: ruling.ruleVerticalAlignment,
      screenLineWidthPx: ruling.screenLineWidthPx,
      whiteSpace: ruling.whiteSpace,
    })
    return { rhythm, ruling, renderKey }
  })
  if (mappings.some(({ renderKey }) => renderKey !== mappings[0].renderKey)) {
    rejectCanonicalGrammarFill(
      'Mixed-source Grammar Fill renderer mappings are incompatible',
    )
  }
  return mappings[0]
}

function renderCanonicalSharedBank(canonicalGroup, {
  heading = null,
  followingSectionId,
  teacher = false,
} = {}) {
  if (!canonicalGroup.optionBank) return ''
  const { bankId, options } = canonicalGroup.optionBank
  const isSevenChoices = canonicalGroup.groupType === 'sevenChoices'
  const headingHtml = heading && isSevenChoices
    ? `<div class="canonical-option-bank-heading" data-canonical-seven-choices-rhythm-role="bank_heading">${escapeHtml(heading)}</div>`
    : ''
  const optionHtml = options.map((option, index) => {
    const rhythmAttrs = isSevenChoices
      ? ' data-canonical-seven-choices-rhythm-role="bank_option_line"'
      : ''
    const transitionAttrs =
      isSevenChoices
      && !teacher
      && index === options.length - 1
      && followingSectionId
        ? ` data-canonical-seven-choices-before-section="${escapeHtml(followingSectionId)}"`
        : ''
    return `<li class="canonical-option-bank-item" data-canonical-option-id="${escapeHtml(option.optionId)}"${rhythmAttrs}${transitionAttrs}><span class="canonical-option-bank-label">${escapeHtml(option.label)}.</span><span class="canonical-option-bank-text">${escapeHtml(option.text)}</span></li>`
  }).join('')
  return `<div class="canonical-option-bank-region" data-canonical-bank-heading-state="${headingHtml ? 'present' : 'absent'}">${headingHtml}<ol class="canonical-option-bank" data-canonical-bank-id="${escapeHtml(bankId)}" data-canonical-semantic-signature="${escapeHtml(canonicalGroup.semanticSignature)}" data-canonical-occurrence-signature="${escapeHtml(canonicalGroup.occurrenceSignature)}">${optionHtml}</ol></div>`
}

function canonicalMediaPresentationAttributes(media) {
  const presentation = media?.presentation
  if (!presentation) return ''
  return ` data-canonical-media-alignment="${presentation.alignment}" data-canonical-media-spacing-before="${presentation.spacingBefore}" data-canonical-media-spacing-after="${presentation.spacingAfter}" style="--canonical-media-width-ratio:${presentation.widthRatio}"`
}

function renderCanonicalInlineNodes(nodes) {
  return nodes.map((node) => {
    if (node.kind === 'media_ref') {
      const src = `data:${node.mediaArtifact.mimeType};base64,${node.mediaArtifact.encodedBytes}`
      return `<img class="canonical-reading-table-media" data-canonical-content-node-id="${escapeHtml(node.nodeId)}" data-canonical-media-id="${escapeHtml(node.mediaId)}"${canonicalMediaPresentationAttributes(node.media)} src="${escapeHtml(src)}" alt="${escapeHtml(node.alt)}">`
    }
    return `<span data-canonical-content-node-id="${escapeHtml(node.nodeId)}">${escapeHtml(node.text)}</span>`
  }).join('')
}

function renderContinuationStarterInlineNodes(nodes, starterIndex) {
  let firstText = true
  return nodes.map((node) => {
    if (node.kind === 'media_ref') return renderCanonicalInlineNodes([node])
    const text = firstText
      ? continuationStarterDisplayText(node.text, starterIndex)
      : node.text
    firstText = false
    return `<span data-canonical-content-node-id="${escapeHtml(node.nodeId)}">${escapeHtml(text)}</span>`
  }).join('')
}

const PRINT_PAGE_CONTENT_HEIGHT_PT = (297 - 21 - 24) * (72 / 25.4)

export function estimateFramedColumnsMinHeightPt(block) {
  const lineHeightPt = readingPassageLetterTypography.lineHeightPt
  return Math.max(...(block.columns || []).map((column) =>
    (column.blocks || []).reduce((height, child) => {
      if (child?.kind === 'paragraph') return height + lineHeightPt
      if (child?.kind === 'table') {
        return height + ((child.rows || []).length * lineHeightPt)
      }
      return height + lineHeightPt
    }, 0)))
}

export function assertFramedColumnsFitsPrintPage(block) {
  const minHeightPt = estimateFramedColumnsMinHeightPt(block)
  if (minHeightPt > PRINT_PAGE_CONTENT_HEIGHT_PT) {
    const error = new Error(
      `framed_columns ${block.nodeId} exceeds one print page`,
    )
    error.code = 'CANONICAL_FRAMED_COLUMNS_EXCEEDS_PAGE'
    throw error
  }
}

function renderCanonicalReadingParagraph(block, { columnHeading = false } = {}) {
  const tag = !columnHeading && block.role === 'title' ? 'h3' : 'p'
  const className = columnHeading
    ? 'canonical-reading-column-heading'
    : `canonical-reading-${block.role}`
  const rhythmRole =
    block.role === 'title'
      ? 'passage_title'
      : block.role === 'subtitle'
        ? 'passage_subtitle'
        : 'passage_body_line'
  const headingAttr = columnHeading ? ' data-canonical-column-heading=""' : ''
  return `<${tag} class="${className}" data-canonical-block-id="${escapeHtml(block.nodeId)}" data-canonical-block-kind="paragraph" data-canonical-reading-role="${block.role}" data-canonical-reading-rhythm-role="${rhythmRole}"${headingAttr}>${renderCanonicalInlineNodes(block.inlines)}</${tag}>`
}

function renderCanonicalReadingTable(block) {
  return `<table class="canonical-reading-table" data-canonical-block-id="${escapeHtml(block.nodeId)}" data-canonical-block-kind="table" data-canonical-reading-rhythm-role="native_table_line" data-canonical-table-columns="${block.columnCount}"><tbody>${block.rows.map((row) => `<tr data-canonical-row-id="${escapeHtml(row.rowId)}">${row.cells.map((cell) => `<td colspan="${cell.columnSpan}" rowspan="${cell.rowSpan}" data-canonical-cell-id="${escapeHtml(cell.cellId)}" data-canonical-column-start="${cell.columnStart}">${renderCanonicalInlineNodes(cell.inlines)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

function renderCanonicalReadingColumnChild(block, columnHeadingId) {
  if (block.kind === 'paragraph') {
    return renderCanonicalReadingParagraph(block, {
      columnHeading: columnHeadingId === block.nodeId,
    })
  }
  if (block.kind === 'table') return renderCanonicalReadingTable(block)
  rejectCanonicalPrint(
    `Canonical Reading framed_columns child ${block?.kind || 'unknown'} is not representable`,
  )
}

function renderCanonicalReadingBlock(block) {
  if (block.kind === 'paragraph') return renderCanonicalReadingParagraph(block)
  if (block.kind === 'table') return renderCanonicalReadingTable(block)
  if (block.kind === 'framed_columns') {
    assertFramedColumnsFitsPrintPage(block)
    return `<div class="canonical-reading-framed-columns" data-canonical-block-id="${escapeHtml(block.nodeId)}" data-canonical-block-kind="framed_columns" data-canonical-column-count="${block.columnCount}">${block.columns.map((column) => `<div class="canonical-reading-framed-column" data-canonical-column-id="${escapeHtml(column.columnId)}">${column.blocks.map((child) => renderCanonicalReadingColumnChild(child, column.columnHeading)).join('')}</div>`).join('')}</div>`
  }
  if (block.kind === 'figure') {
    const src = `data:${block.mediaArtifact.mimeType};base64,${block.mediaArtifact.encodedBytes}`
    const caption = block.caption
      ? `<figcaption>${renderCanonicalInlineNodes(block.captionInlines)}</figcaption>`
      : ''
    return `<figure class="canonical-reading-figure" data-canonical-block-id="${escapeHtml(block.nodeId)}" data-canonical-block-kind="figure" data-canonical-media-id="${escapeHtml(block.mediaId)}"${canonicalMediaPresentationAttributes(block.media)}><img src="${escapeHtml(src)}" alt=""${canonicalMediaPresentationAttributes(block.media)}>${caption}</figure>`
  }
  rejectCanonicalPrint(
    `Canonical Reading block ${block?.kind || 'unknown'} is not representable`,
  )
}

function renderCanonicalReadingBlocks(canonicalGroup) {
  const precedingGeometry =
    readingPassageLetterGeometryForLetter(
      canonicalGroup.passageLetter,
      'print_pdf',
    )
  const beforeAdjustment = precedingGeometry.pdfBeforeAdjustmentPt
  if (beforeAdjustment === null) {
    throw Object.assign(
      new Error(
        `Missing Print/PDF Reading predecessor geometry for ${canonicalGroup.groupId}`,
      ),
      { code: 'CANONICAL_READING_COMPANION_REJECTED' },
    )
  }
  const beforeStyle = beforeAdjustment < 0
    ? `margin-top:${beforeAdjustment}pt`
    : `padding-top:${beforeAdjustment}pt`
  return `<div class="canonical-reading-start"><div class="canonical-reading-passage-letter" data-canonical-passage-letter="${escapeHtml(canonicalGroup.passageLetter)}" data-canonical-reading-rhythm-role="passage_letter" data-canonical-reading-preceding-kind="${precedingGeometry.precedingKind}" style="${beforeStyle}">${escapeHtml(canonicalGroup.passageLetter)}</div></div><div class="canonical-reading" data-canonical-reading-semantic-signature="${escapeHtml(canonicalGroup.semanticSignature)}">${canonicalGroup.blocks.map((block) => renderCanonicalReadingBlock(block)).join('')}</div>`
}

function renderCanonicalWritingChrome(
  chrome,
  className,
  family,
  previousFamilyBoundary = null,
) {
  return [
    ...(chrome.part
      ? [{ instruction: chrome.part, role: 'part_heading' }]
      : []),
    ...(chrome.section
      ? [{ instruction: chrome.section, role: 'section_heading' }]
      : []),
    ...chrome.instructions.map((instruction) => ({
      instruction,
      role: 'instruction',
    })),
  ].map(({ instruction, role }) => {
    const applicationRhythmRole =
      family === 'application'
        ? role
        : family === 'continuation'
          ? role === 'section_heading'
            ? 'continuation_section'
            : role === 'instruction'
              ? 'continuation_prompt'
              : null
          : null
    const rhythmAttr = applicationRhythmRole
      ? ` data-canonical-application-writing-rhythm-role="${applicationRhythmRole}"`
      : ''
    const continuationRhythmAttr = family === 'continuation'
      ? ` data-canonical-continuation-writing-rhythm-role="${role}"`
      : ''
    const previousFamilyAttrs =
      family === 'application'
      && role === 'part_heading'
      && previousFamilyBoundary
        ? ` data-canonical-grammar-fill-rhythm-role="next_section" data-canonical-grammar-fill-section-id="${escapeHtml(previousFamilyBoundary.sectionId)}" data-canonical-grammar-fill-following-for="${escapeHtml(previousFamilyBoundary.groupId)}"`
        : ''
    const partFirstSectionAttrs =
      role === 'section_heading' && chrome.part
        ? ' data-canonical-part-first-section=""'
        : ''
    const content = role === 'part_heading' || role === 'section_heading'
      ? renderSectionHeadingText(instruction.text)
      : escapeHtml(instruction.text)
    return `<p class="${className} ${className}--${role}" data-canonical-instruction-id="${escapeHtml(instruction.instructionId)}" data-canonical-writing-chrome-role="${role}"${rhythmAttr}${continuationRhythmAttr}${previousFamilyAttrs}${partFirstSectionAttrs}>${content}</p>`
  }).join('')
}

function renderCanonicalOpaqueWriting(
  canonicalGroup,
  writingChrome,
  family,
  previousFamilyBoundary = null,
) {
  const application = family === 'application'
  const chrome = renderCanonicalWritingChrome(
    writingChrome,
    application ? 'canonical-application-instruction' : 'canonical-continuation-instruction',
    family,
    previousFamilyBoundary,
  )
  const sourceBlocks = canonicalGroup.sourceStarterLinesInResponse
    ? canonicalGroup.sourceBlocks.filter(
        (block) => !canonicalGroup.sourceStarterBlockRefs.includes(block.nodeId),
      )
    : canonicalGroup.sourceBlocks
  const source = [
    ...sourceBlocks.map((block) =>
      `<p data-canonical-block-id="${escapeHtml(block.nodeId)}" data-canonical-legacy-opaque-source-block="">${renderCanonicalInlineNodes(block.inlines)}</p>`),
    ...(
      application
        ? (canonicalGroup.sourceOwnedInstructions || []).map((instruction) => {
            const noticeLines = applicationWritingNoticeLines(instruction.text)
            const content = noticeLines
              ? noticeLines.map((line) => `<span class="canonical-application-notice-line canonical-application-notice-line--${line.kind}" data-canonical-application-notice-line="${line.kind}">${escapeHtml(line.text)}</span>`).join('')
              : escapeHtml(instruction.text)
            return `<p data-canonical-source-block-index="${instruction.sourceBlockIndex}" data-canonical-application-writing-rhythm-role="${noticeLines ? 'notice_line' : 'prompt_line'}"${noticeLines ? ' data-canonical-application-notice=""' : ''}>${content}</p>`
          })
        : []
    ),
  ].join('')
  const response = canonicalGroup.answerRegion
  const geometry = application
    ? applicationWritingRhythm.responseGeometry
    : continuationWritingRhythm.responseGeometry
  const familyClass = application
    ? 'canonical-application-writing'
    : 'canonical-continuation-writing'
  const responseClass = application
    ? 'canonical-application-response'
    : 'canonical-continuation-response'
  const starters = application || !canonicalGroup.sourceStarterLinesInResponse
    ? ''
    : canonicalGroup.sourceStarterBlockRefs.map((contentRef, index) => {
        const block = canonicalGroup.sourceBlocks.find(
          (candidate) => candidate.nodeId === contentRef,
        )
        if (!block) {
          throw new Error(
            `Canonical Continuation Writing starter ${contentRef} is absent from source blocks`,
          )
        }
        return `<div class="writing-continuation-row"><p class="writing-starter-line" data-canonical-starter-id="${escapeHtml(contentRef)}" data-canonical-block-id="${escapeHtml(contentRef)}" data-canonical-continuation-writing-rhythm-role="starter_${index + 1}">${renderContinuationStarterInlineNodes(block.inlines, index)}</p><span class="writing-continuation-writable-area" data-canonical-continuation-writing-rhythm-role="writable_after_starter_${index + 1}"></span></div>`
      }).join('')
  return `<div class="${familyClass} canonical-legacy-opaque-writing" data-canonical-writing-mode="legacy_opaque" data-canonical-writing-semantic-signature="${escapeHtml(canonicalGroup.semanticSignature)}" data-canonical-writing-occurrence-signature="${escapeHtml(canonicalGroup.occurrenceSignature)}" data-canonical-word-count-target="${canonicalGroup.wordCountTarget}" data-canonical-word-count-certainty="${escapeHtml(canonicalGroup.wordCountTargetCertainty)}" data-canonical-word-count-scope="${escapeHtml(canonicalGroup.wordCountScope)}">${application ? chrome : `<div class="canonical-continuation-chrome">${chrome}</div>`}<div class="passage canonical-legacy-opaque-source">${source}</div><div class="writing-answer-box ${responseClass} canonical-legacy-opaque-response" data-canonical-legacy-opaque-response="" data-canonical-response-ownership="${escapeHtml(response.ownership)}" data-canonical-answer-region-ref="${escapeHtml(response.answerRegionRef)}" data-canonical-response-slot-id="${escapeHtml(response.responseSlotId)}" style="width:${geometry.widthMm}mm;height:${geometry.heightMm}mm;">${starters}</div></div>`
}

function renderCanonicalApplicationWriting(
  canonicalGroup,
  writingChrome,
  previousFamilyBoundary,
) {
  if (canonicalGroup.writingMode === 'legacy_opaque') {
    return renderCanonicalOpaqueWriting(
      canonicalGroup,
      writingChrome,
      'application',
      previousFamilyBoundary,
    )
  }
  const renderGivenParts = (parts, position) => parts.map((part) =>
    `<p class="canonical-application-given canonical-application-given--${position}" data-canonical-given-part-id="${escapeHtml(part.givenPartId)}" data-canonical-given-role="${escapeHtml(part.role)}" data-canonical-given-placement="${escapeHtml(part.placement)}" data-canonical-application-writing-rhythm-role="${part.role === 'title' ? 'given_title' : position === 'bottom' ? 'given_closing' : 'given_addressee'}">${renderCanonicalInlineNodes(part.inlines)}</p>`).join('')
  const prompt = canonicalGroup.promptBlocks.map((block) => {
    const noticeLines = block.inlines.length === 1
      ? applicationWritingNoticeLines(block.inlines[0].text)
      : null
    const content = noticeLines
      ? `<span data-canonical-content-node-id="${escapeHtml(block.inlines[0].nodeId)}">${noticeLines.map((line) => `<span class="canonical-application-notice-line canonical-application-notice-line--${line.kind}" data-canonical-application-notice-line="${line.kind}">${escapeHtml(line.text)}</span>`).join('')}</span>`
      : renderCanonicalInlineNodes(block.inlines)
    return `<p data-canonical-block-id="${escapeHtml(block.nodeId)}" data-canonical-application-writing-rhythm-role="${noticeLines ? 'notice_line' : 'prompt_line'}"${noticeLines ? ' data-canonical-application-notice=""' : ''}>${content}</p>`
  }).join('')
  const response = canonicalGroup.answerRegion
  const chrome = renderCanonicalWritingChrome(
    writingChrome,
    'canonical-application-instruction',
    'application',
    previousFamilyBoundary,
  )
  return `<div class="canonical-application-writing" data-canonical-application-semantic-signature="${escapeHtml(canonicalGroup.semanticSignature)}" data-canonical-application-occurrence-signature="${escapeHtml(canonicalGroup.occurrenceSignature)}">${chrome}<div class="passage canonical-application-prompt">${prompt}</div><div class="writing-answer-box canonical-application-response" data-canonical-application-writing-rhythm-role="response_box" data-canonical-answer-region-ref="${escapeHtml(response.answerRegionRef)}" data-canonical-response-slot-id="${escapeHtml(response.responseSlotId)}" style="width:${applicationWritingRhythm.responseGeometry.widthMm}mm;height:${applicationWritingRhythm.responseGeometry.heightMm}mm;"><div class="canonical-application-given-top">${renderGivenParts(response.givenTop, 'top')}</div><div class="canonical-application-given-bottom">${renderGivenParts(response.givenBottom, 'bottom')}</div></div></div>`
}

function renderCanonicalContinuationWriting(canonicalGroup, writingChrome) {
  if (canonicalGroup.writingMode === 'legacy_opaque') {
    return renderCanonicalOpaqueWriting(canonicalGroup, writingChrome, 'continuation')
  }
  const chrome = renderCanonicalWritingChrome(
    writingChrome,
    'canonical-continuation-instruction',
    'continuation',
  )
  const material = canonicalGroup.materialBlocks.map((block) =>
    `<p data-canonical-block-id="${escapeHtml(block.nodeId)}" data-canonical-continuation-writing-rhythm-role="material_paragraph">${renderCanonicalInlineNodes(block.inlines)}</p>`).join('')
  const response = canonicalGroup.answerRegion
  const starters = response.starterLines.map((starter, index) =>
    `<div class="writing-continuation-row"><p class="writing-starter-line" data-canonical-starter-id="${escapeHtml(starter.starterId)}" data-canonical-block-id="${escapeHtml(starter.contentRef)}" data-canonical-continuation-writing-rhythm-role="starter_${index + 1}">${renderContinuationStarterInlineNodes(starter.inlines, index)}</p><span class="writing-continuation-writable-area" data-canonical-continuation-writing-rhythm-role="writable_after_starter_${index + 1}"></span></div>`).join('')
  return `<div class="canonical-continuation-writing" data-canonical-writing-semantic-signature="${escapeHtml(canonicalGroup.semanticSignature)}" data-canonical-writing-occurrence-signature="${escapeHtml(canonicalGroup.occurrenceSignature)}" data-canonical-word-count-scope="${escapeHtml(canonicalGroup.wordCountRuling.countScope)}" data-canonical-word-count-target="${canonicalGroup.wordCountRuling.target}"><div class="canonical-continuation-chrome">${chrome}</div><div class="passage canonical-continuation-material">${material}</div><div class="writing-answer-box canonical-continuation-response" data-canonical-continuation-writing-rhythm-role="response_box" data-canonical-answer-region-ref="${escapeHtml(response.answerRegionRef)}" data-canonical-response-slot-id="${escapeHtml(response.responseSlotId)}" style="width:${continuationWritingRhythm.responseGeometry.widthMm}mm;height:${continuationWritingRhythm.responseGeometry.heightMm}mm;">${starters}</div></div>`
}

function renderCanonicalQuestionOptions(
  question,
  preserveInlineIdentity = false,
  readingTail = null,
) {
  const placement = translateAbcdPlanToPointPlacement(question.layoutPlan)
  const attrs = ` data-canonical-placement-signature="${escapeHtml(placement.placementSignature)}" data-canonical-placement-mode="${placement.mode}" data-canonical-column-starts-pt="${placement.columnStartsPt.join(',')}" data-canonical-question-stem-start-pt="${placement.questionStemStartPt}" style="width:${placement.rowWidthPt}pt;margin-left:${placement.questionStemStartPt}pt;grid-template-columns:${placement.columnWidthsPt.map((width) => `${width}pt`).join(' ')}"`
  return `<div class="canonical-options canonical-options--${placement.mode}"${attrs}>${question.options.map((option, index) => {
    const physical = placement.placements[index]
    const continuation = physical.continuationStartPt
    const style = continuation === null
      ? ''
      : ` style="padding-left:${continuation}pt;text-indent:-${continuation}pt"`
    const content = preserveInlineIdentity && Array.isArray(option.content)
      ? renderCanonicalInlineNodes(option.content)
      : escapeHtml(option.text)
    const isTailOption =
      readingTail
      && readingTail.isLastQuestion
      && index === question.options.length - 1
    const rhythmAttrs = preserveInlineIdentity
      ? ' data-canonical-reading-rhythm-role="option_line"'
      : ''
    const tailAttrs = isTailOption
      ? ` data-canonical-reading-anchor-for="${escapeHtml(readingTail.targetId)}" data-canonical-reading-predecessor-question-id="${escapeHtml(question.questionId)}" data-canonical-reading-predecessor-option-id="${escapeHtml(option.optionId)}"${readingTail.successorGroupId ? ` data-canonical-reading-preceding-kind="prior_question_tail"${readingTail.visiblePredecessorOnOption ? ` data-canonical-reading-preceding-for="${escapeHtml(readingTail.successorGroupId)}"` : ''}` : readingTail.visiblePredecessorOnOption ? ` data-canonical-reading-before-section="${escapeHtml(readingTail.followingSectionId)}"` : ''}`
      : ''
    return `<span data-canonical-option-id="${escapeHtml(option.optionId)}"${rhythmAttrs}${tailAttrs} data-canonical-start-pt="${physical.startPt}"${continuation === null ? '' : ` data-canonical-continuation-start-pt="${continuation}"`}${style}><span>${escapeHtml(option.label)}.</span> ${content}</span>`
  }).join('')}</div>`
}

function cssBackgroundForBlankRuling(ruling) {
  if (
    ruling.lineStyle !== 'single-thin'
    || ruling.ruleVerticalAlignment !== 'blank-bottom'
  ) {
    throw new Error(`Unsupported paper blank line style ${ruling.lineStyle}`)
  }
  return `linear-gradient(#000, #000) bottom / 100% ${ruling.printLineWidthPt}pt no-repeat`
}

/** standard §8: 写作题组 (应用文 / 读后续写) get a bordered blank answer box. */
function isWritingGroupType(groupType) {
  return groupType === 'writing' || groupType === 'continuation'
}

// figure-render cut — exam-paper-format-standards §1: 版心宽 = A4(210mm) -
// 24mm*2 页边距 = 162mm. Figures never exceed the passage's own content
// width, so a plain `max-width: 100%` on `.print-figure img` (§ below in
// the <style> block) already caps at 162mm — this constant exists only so
// the number is named once, matching PaperSurface.css's identical citation.
const PRINT_FIGURE_PLACEHOLDER_TEXT = '〔表格：见原卷〕'

/**
 * Resolves a figure's `<img>` src for the print/PDF/A4-preview HTML.
 *
 * TWO consumers share `buildPrintHtml`'s output and need DIFFERENT
 * strategies for the SAME figure file:
 *   - 'web' (default): the browser-rendered surfaces (print-preview page,
 *     工作台 A4 预览, 草稿卷预览 — all served through the app's own origin,
 *     which already exposes `/paper-assets/**` as a static route). A
 *     root-relative path resolves correctly regardless of whether the HTML
 *     is injected via `srcDoc` (which inherits the parent document's
 *     origin) or fetched directly.
 *   - 'file': the Vivliostyle-CLI PDF path (`exportPrintPdf` /
 *     `exportDraftPaperPdf`) writes this HTML to a scratch tempdir and
 *     converts it OFFLINE with headless Chromium. An absolute
 *     `file://<real path>` URL does NOT work here — Chromium's default
 *     file:// security policy blocks a file:// page from loading a
 *     resource OUTSIDE its own directory (browser-QA finding: the PDF
 *     rendered a broken-image icon, not the table). The fix is the
 *     standard workaround: emit a bare RELATIVE filename as `src`, and
 *     have the caller physically copy the real PNG into the SAME tempdir
 *     as the HTML before invoking Vivliostyle (same-directory file://
 *     resource loading is unrestricted) — see `images`, the out-parameter
 *     this function populates with `{ relativeName, absoluteSourcePath }`
 *     so the caller knows what to copy where.
 */
function figureImageSrc({ paperAssetsDir, baseDir, file }, imageMode, images) {
  const absolutePath = path.join(baseDir, 'figures', file)
  if (imageMode === 'file') {
    const relativeName = `fig-${images.length + 1}${path.extname(file) || '.png'}`
    images.push({ relativeName, absoluteSourcePath: absolutePath })
    return relativeName
  }
  const relativeFromRoot = path.relative(paperAssetsDir, absolutePath).split(path.sep).join('/')
  return `/paper-assets/${relativeFromRoot}`
}

/**
 * Renders ONE Print/PDF passage line (`\n`-split — plan.md
 * 行为规则 1). `figuresInfo` is null when the caller omitted
 * `paperAssetsDir` (default, byte-identical to pre-cut output) or when this
 * group isn't paper-asset sourced / its paper has no manifest — in every
 * one of those cases `resolveFigureMarker` is never even called, so a
 * non-figure line renders through the EXACT unchanged `<p>` + blanks path.
 *
 * caption is operational metadata (manifest note: "source paper.pdf p.4")
 * — never rendered on this or any student/试卷 surface (plan.md rule 2 /
 * PA SW-4).
 */
function renderPassageLine(line, groupType, figuresInfo, imageMode, images, blankCounter) {
  const resolved = figuresInfo ? resolveFigureMarker(line, figuresInfo.figures) : null
  if (resolved?.kind === 'figure') {
    const src = figureImageSrc(
      { paperAssetsDir: figuresInfo.paperAssetsDir, baseDir: figuresInfo.baseDir, file: resolved.figure.file },
      imageMode,
      images,
    )
    return `<figure class="print-figure"><img src="${escapeHtml(src)}" alt="${escapeHtml(resolved.figure.figureId)}"></figure>`
  }
  if (resolved?.kind === 'placeholder') {
    return `<p class="print-figure-placeholder">${escapeHtml(PRINT_FIGURE_PLACEHOLDER_TEXT)}</p>`
  }
  return `<p>${renderPassageLineWithBlanks(line, groupType, blankCounter)}</p>`
}

/**
 * 应用文 vs 读后续写 sizing (standard §8: 144×65mm vs 145×57mm). The
 * paper-asset schema stores both task types under the single `writing`
 * groupType (only the legacy DB-only `continuation` groupType is already
 * distinct) — distinguish by title text, which import publishes verbatim
 * from the writing task title ("应用文写作" / "读后续写").
 */
function isContinuationWriting(detail) {
  if (detail.groupType === 'continuation') return true
  return /续写/.test(String(detail.title || detail.passage?.title || ''))
}

// writing-box-starters (owner 拍板 2026-07-16, Locked Decision 2): a
// continuation box with a valid `detail.writingTask.continuationStarters`
// (>=2 entries) prints each of the first two starter sentences at its
// paragraph's own starting position — first hugging the box's top inner
// lining, second at the box's 50% height mark — verbatim, no "Paragraph N:"
// prefix (real-paper form; stored data for known assets carries none, but
// this never adds one regardless). Missing/short starters (or an
// application box, which never carries starters) fall through to the
// pre-cut empty box unchanged.
function renderWritingAnswerBox(detail) {
  const continuation = isContinuationWriting(detail)
  const widthMm = continuation ? 145 : 144
  const heightMm = continuation ? 57 : 65
  const starters = continuation ? detail.writingTask?.continuationStarters : null
  const starterLines =
    Array.isArray(starters) && starters.length >= 2
      ? [starters[0], starters[1]]
          .map((text, i) => `<p class="writing-starter-line writing-starter-line--${i + 1}">${escapeHtml(text)}</p>`)
          .join('')
      : ''
  return `<div class="writing-answer-box" style="width:${widthMm}mm;height:${heightMm}mm;">${starterLines}</div>`
}

export function buildPrintHtml({
  title,
  versionType,
  printStyle,
  items,
  blocks,
  questionNumberStart,
  // figure-render cut — all optional, all default to pre-cut behavior
  // (see the module header comment + renderPassageLine's doc comment).
  // `images` is an OUT-PARAMETER populated ONLY in imageMode:'file' — the
  // caller must
  // copy each entry's file into the SAME directory as the written HTML
  // before invoking Vivliostyle (same-directory file:// resource loading
  // is unrestricted; cross-directory is not — see figureImageSrc's doc
  // comment for the browser-QA finding that drove this design).
  paperAssetsDir = null,
  imageMode = 'web',
  images = [],
  normalizationDiagnostics = [],
  canonicalConsumption = null,
  sevenChoicesBankHeading = null,
  grammarFillChrome = null,
  grammarFillGeometryVariantId = null,
  grammarFillGeometrySurface = null,
}) {
  if (
    Array.isArray(canonicalConsumption?.visibleStructure)
    || (
      canonicalConsumption?.composition?.kind !== 'draft-paper'
      && Number(canonicalConsumption?.authorityRef?.manifestVersion) >= 30
    )
  ) {
    assertCanonicalConsumptionVisibleStructure(canonicalConsumption)
  }
  // draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判): small-question
  // numbering in the `blocks`-array path is WHOLE-PAPER continuous again
  // (round-1's per-group reset to `(1)` is retired — owner QA verdict B).
  // `startNum` seeds it, same as pre-round1 draft-depassage-letter form.
  const startNum = Number.isInteger(questionNumberStart) && questionNumberStart >= 1 ? questionNumberStart : 1
  const isExam = printStyle === 'exam'
  const isTeacher = versionType === 'teacher'
  const hasCanonicalGrammarFill = canonicalConsumption?.selections?.some(
    (selection) => selection.familyContractId === 'grammar-fill'
      && selection.mode === 'canonical'
      && selection.groupIds.some((groupId) => items.some((item) => item.detail.id === groupId)),
  )
  const grammarFillRenderMapping = hasCanonicalGrammarFill
    ? grammarFillRenderMappingForConsumption({
        consumption: canonicalConsumption,
        items,
      })
    : { rhythm: grammarFillRhythm, ruling: paperBlankRuling.cloze }
  const activeGrammarFillRhythm = grammarFillRenderMapping.rhythm
  const sharedInlineBlankRuling = grammarFillRenderMapping.ruling
  if (
    (grammarFillGeometryVariantId == null)
      !== (grammarFillGeometrySurface == null)
  ) {
    const error = new Error(
      'Canonical Grammar Fill geometry fixture requires variant and surface',
    )
    error.code = 'CANONICAL_GRAMMAR_FILL_GEOMETRY_FIXTURE_REJECTED'
    throw error
  }
  const hasBoundGrammarFillFixtureAuthority =
    hasGrammarFillPublicGeometryFixtureAuthority(
      canonicalConsumption,
      grammarFillGeometrySurface,
    )
  if (
    grammarFillGeometryVariantId == null
    || hasBoundGrammarFillFixtureAuthority
  ) {
    assertCanonicalGrammarFillSourceBinding({
      canonicalConsumption,
      grammarFillChrome,
      items,
      teacher: isTeacher,
    })
  }
  const grammarFillGeometryFixture =
    resolveGrammarFillPublicGeometryFixture(
      grammarFillGeometryVariantId,
      grammarFillGeometrySurface,
      canonicalConsumption,
    )
  const grammarFillGeometryFixtureCss =
    grammarFillGeometryFixture == null
      ? ''
      : [
          ...grammarFillGeometryFixture.paragraphWidths.map(
            ({ paragraphId, usableWidthEm }) =>
              `[data-canonical-group-id="${grammarFillGeometryFixture.groupId}"] `
              + `[data-canonical-paragraph-id="${paragraphId}"] {`
              + `width:${usableWidthEm}em!important;`
              + `max-width:${usableWidthEm}em!important;}`,
          ),
          ...(grammarFillGeometryFixture.pageBreakBeforeQuestionId
            ? [
                `[data-canonical-question-id="${grammarFillGeometryFixture.pageBreakBeforeQuestionId}"] {`
                + 'break-before:page!important;'
                + 'page-break-before:always!important;}',
              ]
            : []),
        ].join('\n')
  const itemByGroupId = new Map(items.map((item) => [item.detail.id, item]))
  const renderedGroupIds = Array.isArray(blocks) && blocks.length > 0
    ? blocks
      .filter((block) => block.type === 'question_group')
      .map((block) => block.questionGroupId)
    : items.map((item) => item.detail.id)
  const canonicalReadingSelection = canonicalConsumption?.selections?.find(
    (selection) =>
      selection.familyContractId === 'reading'
      && selection.mode === 'canonical',
  )
  const canonicalReadingGroupIds = canonicalReadingSelection
    ? canonicalReadingSelection.groupIds.filter((groupId) =>
        renderedGroupIds.includes(groupId))
    : []
  const nextReadingGroupIdByPredecessorGroupId = new Map(
    canonicalReadingGroupIds.slice(0, -1).map((groupId, index) => [
      groupId,
      canonicalReadingGroupIds[index + 1],
    ]),
  )
  const firstReadingGroupBlockIndex = Array.isArray(blocks)
    ? blocks.findIndex(
        (block) =>
          block.type === 'question_group'
          && block.questionGroupId === canonicalReadingGroupIds[0],
      )
    : -1
  const lastReadingGroupBlockIndex = Array.isArray(blocks)
    ? blocks.findLastIndex(
        (block) =>
          block.type === 'question_group'
          && block.questionGroupId
            === canonicalReadingGroupIds[canonicalReadingGroupIds.length - 1],
      )
    : -1
  const followingReadingSectionBlockIndex =
    Array.isArray(blocks) && lastReadingGroupBlockIndex >= 0
      ? blocks.findIndex(
          (block, index) =>
            index > lastReadingGroupBlockIndex
            && block.type === 'section_header'
            && block.title,
        )
      : -1
  const followingReadingSectionId =
    followingReadingSectionBlockIndex >= 0
      ? `print-section-${followingReadingSectionBlockIndex}`
      : undefined
  const canonicalSevenChoicesSelection = canonicalConsumption?.selections?.find(
    (selection) =>
      selection.familyContractId === 'seven-choices'
      && selection.mode === 'canonical',
  )
  if (canonicalSevenChoicesSelection) {
    for (const groupId of canonicalSevenChoicesSelection.groupIds) {
      const renderedCount = renderedGroupIds.filter(
        (renderedGroupId) => renderedGroupId === groupId,
      ).length
      const suppliedByItems = items.some(
        (item) => item.detail.id === groupId,
      )
      if (renderedCount > 1 || (suppliedByItems && renderedCount !== 1)) {
        const error = new Error(
          `Canonical Seven Choices Group must occur exactly once when supplied: ${groupId}`,
        )
        error.code = 'CANONICAL_CONSUMPTION_REJECTED'
        throw error
      }
    }
  }
  const canonicalSevenChoicesGroupIds = canonicalSevenChoicesSelection
    ? canonicalSevenChoicesSelection.groupIds.filter((groupId) =>
        renderedGroupIds.includes(groupId))
    : []
  const firstSevenChoicesGroupBlockIndex = Array.isArray(blocks)
    ? blocks.findIndex(
        (block) =>
          block.type === 'question_group'
          && block.questionGroupId === canonicalSevenChoicesGroupIds[0],
      )
    : -1
  const lastSevenChoicesGroupBlockIndex = Array.isArray(blocks)
    ? blocks.findLastIndex(
        (block) =>
          block.type === 'question_group'
          && block.questionGroupId
            === canonicalSevenChoicesGroupIds[
              canonicalSevenChoicesGroupIds.length - 1
            ],
      )
    : -1
  const followingSevenChoicesSectionBlockIndex =
    Array.isArray(blocks) && lastSevenChoicesGroupBlockIndex >= 0
      ? blocks.findIndex(
          (block, index) =>
            index > lastSevenChoicesGroupBlockIndex
            && block.type === 'section_header'
            && block.title,
        )
      : -1
  const followingSevenChoicesSectionId =
    followingSevenChoicesSectionBlockIndex >= 0
      ? `print-section-${followingSevenChoicesSectionBlockIndex}`
      : undefined
  let firstSevenChoicesPredecessorBlockIndex = -1
  let sevenChoicesChromeStartBlockIndex = firstSevenChoicesGroupBlockIndex
  if (firstSevenChoicesGroupBlockIndex >= 0) {
    for (
      let index = firstSevenChoicesGroupBlockIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const block = blocks[index]
      if (block.type === 'section_header' || block.type === 'instruction') {
        if (firstSevenChoicesPredecessorBlockIndex < 0) {
          firstSevenChoicesPredecessorBlockIndex = index
        }
        sevenChoicesChromeStartBlockIndex = index
        continue
      }
      if (block.type === 'page_break') continue
      break
    }
  }
  const isSevenChoicesChromeBlock = (blockIndex) =>
    blockIndex >= sevenChoicesChromeStartBlockIndex
    && blockIndex < firstSevenChoicesGroupBlockIndex
  const canonicalClozeSelection = canonicalConsumption?.selections?.find(
    (selection) =>
      selection.familyContractId === 'cloze'
      && selection.mode === 'canonical',
  )
  if (canonicalClozeSelection) {
    for (const groupId of canonicalClozeSelection.groupIds) {
      const renderedCount = renderedGroupIds.filter(
        (renderedGroupId) => renderedGroupId === groupId,
      ).length
      const suppliedByItems = items.some(
        (item) => item.detail.id === groupId,
      )
      if (renderedCount > 1 || (suppliedByItems && renderedCount !== 1)) {
        const error = new Error(
          `Canonical Cloze Group must occur exactly once when supplied: ${groupId}`,
        )
        error.code = 'CANONICAL_CONSUMPTION_REJECTED'
        throw error
      }
    }
  }
  const canonicalClozeGroupIds = canonicalClozeSelection
    ? canonicalClozeSelection.groupIds.filter((groupId) =>
        renderedGroupIds.includes(groupId))
    : []
  const firstClozeGroupBlockIndex = Array.isArray(blocks)
    ? blocks.findIndex(
        (block) =>
          block.type === 'question_group'
          && block.questionGroupId === canonicalClozeGroupIds[0],
      )
    : -1
  const lastClozeGroupBlockIndex = Array.isArray(blocks)
    ? blocks.findLastIndex(
        (block) =>
          block.type === 'question_group'
          && block.questionGroupId
            === canonicalClozeGroupIds[canonicalClozeGroupIds.length - 1],
      )
    : -1
  const followingClozeSectionBlockIndex =
    Array.isArray(blocks) && lastClozeGroupBlockIndex >= 0
      ? blocks.findIndex(
          (block, index) =>
            index > lastClozeGroupBlockIndex
            && block.type === 'section_header'
            && block.title,
        )
      : -1
  const followingClozeSectionId =
    followingClozeSectionBlockIndex >= 0
      ? blocks[followingClozeSectionBlockIndex]?.sectionId
        || blocks[followingClozeSectionBlockIndex]?.partId
        || `print-section-${followingClozeSectionBlockIndex}`
      : undefined
  const followingClozeGroupId =
    canonicalConsumption?.selections?.find(
      (selection) =>
        selection.familyContractId === 'grammar-fill'
        && selection.mode === 'canonical',
    )?.groupIds.find((groupId) => renderedGroupIds.includes(groupId))
  let firstClozePredecessorBlockIndex = -1
  let clozeChromeStartBlockIndex = firstClozeGroupBlockIndex
  if (firstClozeGroupBlockIndex >= 0) {
    for (
      let index = firstClozeGroupBlockIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const block = blocks[index]
      if (block.type === 'section_header' || block.type === 'instruction') {
        if (firstClozePredecessorBlockIndex < 0) {
          firstClozePredecessorBlockIndex = index
        }
        clozeChromeStartBlockIndex = index
        continue
      }
      if (block.type === 'page_break') continue
      break
    }
  }
  const isClozeChromeBlock = (blockIndex) =>
    blockIndex >= clozeChromeStartBlockIndex
    && blockIndex < firstClozeGroupBlockIndex
  const canonicalGrammarFillSelection =
    canonicalConsumption?.selections?.find(
      (selection) =>
        selection.familyContractId === 'grammar-fill'
        && selection.mode === 'canonical',
    )
  if (canonicalGrammarFillSelection) {
    for (const groupId of canonicalGrammarFillSelection.groupIds) {
      const renderedCount = renderedGroupIds.filter(
        (renderedGroupId) => renderedGroupId === groupId,
      ).length
      const suppliedByItems = items.some(
        (item) => item.detail.id === groupId,
      )
      if (renderedCount > 1 || (suppliedByItems && renderedCount !== 1)) {
        const error = new Error(
          `Canonical Grammar Fill Group must occur exactly once when supplied: ${groupId}`,
        )
        error.code = 'CANONICAL_CONSUMPTION_REJECTED'
        throw error
      }
    }
  }
  const canonicalGrammarFillGroupIds = canonicalGrammarFillSelection
    ? canonicalGrammarFillSelection.groupIds.filter((groupId) =>
        renderedGroupIds.includes(groupId))
    : []
  const canonicalApplicationGroupIds =
    canonicalConsumption?.selections?.find(
      (selection) =>
        selection.familyContractId === 'application-writing'
        && selection.mode === 'canonical',
    )?.groupIds.filter((groupId) => renderedGroupIds.includes(groupId))
      || []
  const canonicalContinuationGroupIds =
    canonicalConsumption?.selections?.find(
      (selection) =>
        selection.familyContractId === 'continuation-writing'
        && selection.mode === 'canonical',
    )?.groupIds.filter((groupId) => renderedGroupIds.includes(groupId))
      || []
  const canonicalWritingChromeBlockIndexes = new Set()
  if (Array.isArray(blocks)) {
    for (
      const groupId of [
        ...canonicalApplicationGroupIds,
        ...canonicalContinuationGroupIds,
      ]
    ) {
      const groupBlockIndex = blocks.findIndex(
        (block) =>
          block.type === 'question_group'
          && block.questionGroupId === groupId,
      )
      for (let index = groupBlockIndex - 1; index >= 0; index -= 1) {
        const block = blocks[index]
        if (block.type === 'section_header' || block.type === 'instruction') {
          canonicalWritingChromeBlockIndexes.add(index)
          continue
        }
        if (block.type === 'page_break') continue
        break
      }
    }
  }
  const firstGrammarFillGroupBlockIndex = Array.isArray(blocks)
    ? blocks.findIndex(
        (block) =>
          block.type === 'question_group'
          && block.questionGroupId === canonicalGrammarFillGroupIds[0],
      )
    : -1
  const lastGrammarFillGroupBlockIndex = Array.isArray(blocks)
    ? blocks.findLastIndex(
        (block) =>
          block.type === 'question_group'
          && block.questionGroupId
            === canonicalGrammarFillGroupIds[
              canonicalGrammarFillGroupIds.length - 1
            ],
      )
    : -1
  const followingGrammarFillSectionBlockIndex =
    Array.isArray(blocks) && lastGrammarFillGroupBlockIndex >= 0
      ? blocks.findIndex(
          (block, index) =>
            index > lastGrammarFillGroupBlockIndex
            && block.type === 'section_header'
            && block.title,
        )
      : -1
  const followingGrammarFillSectionId =
    followingGrammarFillSectionBlockIndex >= 0
      ? blocks[followingGrammarFillSectionBlockIndex]?.sectionId
        || blocks[followingGrammarFillSectionBlockIndex]?.partId
        || `print-section-${followingGrammarFillSectionBlockIndex}`
      : undefined
  let firstGrammarFillPredecessorBlockIndex = -1
  let grammarFillChromeStartBlockIndex = firstGrammarFillGroupBlockIndex
  if (firstGrammarFillGroupBlockIndex >= 0) {
    for (
      let index = firstGrammarFillGroupBlockIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const block = blocks[index]
      if (block.type === 'section_header' || block.type === 'instruction') {
        if (firstGrammarFillPredecessorBlockIndex < 0) {
          firstGrammarFillPredecessorBlockIndex = index
        }
        grammarFillChromeStartBlockIndex = index
        continue
      }
      if (block.type === 'page_break') continue
      if (block.type === 'question_group') break
      break
    }
  }
  const isGrammarFillChromeBlock = (blockIndex) =>
    blockIndex >= grammarFillChromeStartBlockIndex
    && blockIndex < firstGrammarFillGroupBlockIndex
  let firstReadingPredecessorBlockIndex = -1
  let readingChromeStartBlockIndex = firstReadingGroupBlockIndex
  if (firstReadingGroupBlockIndex >= 0) {
    for (
      let index = firstReadingGroupBlockIndex - 1;
      index >= 0;
      index -= 1
    ) {
      const block = blocks[index]
      if (block.type === 'section_header' || block.type === 'instruction') {
        if (firstReadingPredecessorBlockIndex < 0) {
          firstReadingPredecessorBlockIndex = index
        }
        readingChromeStartBlockIndex = index
        continue
      }
      if (block.type === 'page_break') continue
      if (block.type === 'question_group') break
      break
    }
  }
  const isReadingChromeBlock = (blockIndex) =>
    blockIndex >= readingChromeStartBlockIndex
    && blockIndex < firstReadingGroupBlockIndex
  const canonicalWritingChromeOwnsDocument =
    canonicalConsumption !== null
    && canonicalConsumption?.composition?.kind !== 'draft-paper'
    && canonicalWritingChromeOwnsRenderedDocument({
      consumption: canonicalConsumption,
      renderedGroupIds,
    })

  // figure-render cut: per-call cache so a multi-group paper doesn't
  // rescan paperAssetsDir once per passage LINE — resolveGroupFigures does
  // a directory scan, so it's memoized per groupId for the life of this
  // one buildPrintHtml call (never persisted across calls/requests).
  const figuresCache = new Map()
  function getFiguresInfo(groupId) {
    if (!paperAssetsDir) return null
    if (!figuresCache.has(groupId)) {
      const resolved = resolveGroupFigures(paperAssetsDir, groupId)
      figuresCache.set(groupId, resolved ? { ...resolved, paperAssetsDir } : null)
    }
    return figuresCache.get(groupId)
  }

  function getCanonicalGroup(groupId, detail) {
    if (canonicalConsumption) {
      const sourceConsumption = canonicalSourceConsumptionForGroup(
        canonicalConsumption,
        groupId,
      )
      const selectedFamilyContractId =
        selectedFamilyContractIdForGroup({
          consumption: sourceConsumption,
          groupId,
        })
      const familyContractId = canonicalFamilyForPrintDetail(
        detail,
        selectedFamilyContractId,
      )
      if (!familyContractId) {
        if (requiresCanonicalPrintConsumption(detail)) {
          rejectCanonicalPrint(
            `Canonical Print consumption does not select ${groupId}`,
          )
        }
        return null
      }
      const selection = selectConsumerGroupMode({
        consumption: sourceConsumption,
        familyContractId,
        groupId,
      })
      const canonicalGroup = projectCanonicalConsumerGroup({
        consumption: sourceConsumption,
        familyContractId,
        groupId,
      })
      if (!canonicalGroupMatchesPrintDetail(canonicalGroup, detail)) {
        const error = new Error(`Canonical Print input does not match ${groupId}`)
        error.code = 'CANONICAL_CONSUMPTION_REJECTED'
        throw error
      }
      return {
        status: 'ready',
        group: canonicalGroup,
        diagnostic: {
          status: 'ready',
          source: 'whole-paper-consumption',
          paperId: sourceConsumption.paperId,
          groupId,
        },
      }
    }
    return null
  }

  const sections = []

  function renderOptions(options, groupType) {
    if (!options || options.length === 0) return ''
    if (groupType === 'cloze') {
      return `<p class="options-inline">${options.map((o) => `<span>${escapeHtml(o.label)}. ${escapeHtml(o.content)}</span>`).join('')}</p>`
    }
    if (isShortOptions(options) && options.length === 4) {
      return `<div class="options-grid">${options.map((o) => `<span>${escapeHtml(o.label)}. ${escapeHtml(o.content)}</span>`).join('')}</div>`
    }
    return `<div class="options-list">${options.map((o) => `<p>${escapeHtml(o.label)}. ${escapeHtml(o.content)}</p>`).join('')}</div>`
  }

  if (Array.isArray(blocks) && blocks.length > 0) {
    let questionNum = startNum
    let groupNum = 0
    for (const [blockIndex, block] of blocks.entries()) {
      if (block.type === 'section_header' && block.title) {
        if (canonicalWritingChromeBlockIndexes.has(blockIndex)) continue
        // Profile v10 owns every visible heading string. Renderers only add
        // medium-specific geometry and rhythm metadata.
        const visibleTitle = block.title
        const kind = headingKind(visibleTitle)
        const headingId =
          block.sectionId || block.partId || `print-section-${blockIndex}`
        const rhythmRole =
          blockIndex === followingReadingSectionBlockIndex
            ? 'next_section'
            : isReadingChromeBlock(blockIndex) && kind === 'part'
              ? 'part_title'
              : isReadingChromeBlock(blockIndex) ? 'subsection' : null
        const rhythmRoleAttr = rhythmRole
          ? ` data-canonical-reading-rhythm-role="${rhythmRole}"`
          : ''
        const readingPredecessorAttrs =
          blockIndex === firstReadingPredecessorBlockIndex
            ? ` data-canonical-reading-preceding-for="${escapeHtml(canonicalReadingGroupIds[0])}" data-canonical-reading-preceding-kind="reading_heading" data-canonical-reading-anchor-id="print-section-${blockIndex}"`
            : ''
        const readingFollowingAttrs =
          blockIndex === followingReadingSectionBlockIndex
            ? ` data-canonical-reading-section-id="${escapeHtml(followingReadingSectionId)}" data-canonical-reading-following-for="${escapeHtml(canonicalReadingGroupIds.at(-1))}"`
            : ''
        const sevenChoicesRhythmRole =
          blockIndex === followingSevenChoicesSectionBlockIndex
            ? 'next_section'
            : isSevenChoicesChromeBlock(blockIndex) && kind === 'part'
              ? 'part_title'
              : isSevenChoicesChromeBlock(blockIndex)
                ? 'subsection'
                : null
        const sevenChoicesRhythmAttrs = sevenChoicesRhythmRole
          ? ` data-canonical-seven-choices-rhythm-role="${sevenChoicesRhythmRole}"${isSevenChoicesChromeBlock(blockIndex) ? ' data-canonical-seven-choices-chrome=""' : ''}`
          : ''
        const sevenChoicesPredecessorAttrs =
          blockIndex === firstSevenChoicesPredecessorBlockIndex
            ? ` data-canonical-seven-choices-preceding-for="${escapeHtml(canonicalSevenChoicesGroupIds[0])}"`
            : ''
        const sevenChoicesBoundaryAttrs =
          blockIndex === followingReadingSectionBlockIndex
          && isSevenChoicesChromeBlock(blockIndex)
            ? ` data-canonical-seven-choices-reading-boundary-group-id="${escapeHtml(canonicalReadingGroupIds.at(-1))}"`
            : ''
        const sevenChoicesFollowingAttrs =
          blockIndex === followingSevenChoicesSectionBlockIndex
            ? ` data-canonical-seven-choices-section-id="${escapeHtml(followingSevenChoicesSectionId)}" data-canonical-seven-choices-following-for="${escapeHtml(canonicalSevenChoicesGroupIds.at(-1))}"`
            : ''
        const clozeRhythmRole =
          blockIndex === followingClozeSectionBlockIndex
            ? 'next_section'
            : isClozeChromeBlock(blockIndex) && kind === 'part'
              ? 'part_title'
              : isClozeChromeBlock(blockIndex)
                ? 'subsection'
                : null
        const clozeRhythmAttrs = clozeRhythmRole
          ? ` data-canonical-cloze-rhythm-role="${clozeRhythmRole}"${isClozeChromeBlock(blockIndex) ? ' data-canonical-cloze-chrome=""' : ''}`
          : ''
        const clozePredecessorAttrs =
          blockIndex === firstClozePredecessorBlockIndex
            ? ` data-canonical-cloze-preceding-for="${escapeHtml(canonicalClozeGroupIds[0])}" data-canonical-cloze-previous-family-group-id="${escapeHtml(canonicalSevenChoicesGroupIds.at(-1) || '')}"`
            : ''
        const clozeFollowingAttrs =
          blockIndex === followingClozeSectionBlockIndex
            ? ` data-canonical-cloze-section-id="${escapeHtml(followingClozeSectionId)}"${followingClozeGroupId ? ` data-canonical-cloze-following-group-id="${escapeHtml(followingClozeGroupId)}"` : ''} data-canonical-cloze-following-for="${escapeHtml(canonicalClozeGroupIds.at(-1))}"`
            : ''
        const grammarFillRhythmRole =
          blockIndex === followingGrammarFillSectionBlockIndex
            ? 'next_section'
            : isGrammarFillChromeBlock(blockIndex)
              ? 'subsection'
              : null
        const grammarFillRhythmAttrs = grammarFillRhythmRole
          ? ` data-canonical-grammar-fill-rhythm-role="${grammarFillRhythmRole}"${isGrammarFillChromeBlock(blockIndex) ? ' data-canonical-grammar-fill-chrome=""' : ''}`
          : ''
        const grammarFillPartContextAttrs =
          clozeRhythmRole === 'part_title'
          && canonicalGrammarFillGroupIds.length > 0
            ? ' data-canonical-grammar-fill-rhythm-role="part_context"'
            : ''
        const grammarFillPredecessorAttrs =
          blockIndex === firstGrammarFillPredecessorBlockIndex
            ? ` data-canonical-grammar-fill-preceding-for="${escapeHtml(canonicalGrammarFillGroupIds[0])}" data-canonical-grammar-fill-previous-family-group-id="${escapeHtml(canonicalClozeGroupIds.at(-1) || '')}"`
            : ''
        const grammarFillFollowingAttrs =
          blockIndex === followingGrammarFillSectionBlockIndex
            ? ` data-canonical-grammar-fill-section-id="${escapeHtml(followingGrammarFillSectionId)}" data-canonical-grammar-fill-following-for="${escapeHtml(canonicalGrammarFillGroupIds.at(-1))}"`
            : ''
        const partFirstSectionAttrs =
          kind === 'section'
          && blocks[blockIndex - 1]?.type === 'section_header'
          && headingKind(blocks[blockIndex - 1].title) === 'part'
            ? ' data-canonical-part-first-section=""'
            : ''
        sections.push(`<h2 class="section-header section-header--${kind}" id="${escapeHtml(headingId)}"${rhythmRoleAttr}${readingPredecessorAttrs}${readingFollowingAttrs}${sevenChoicesRhythmAttrs}${sevenChoicesPredecessorAttrs}${sevenChoicesBoundaryAttrs}${sevenChoicesFollowingAttrs}${clozeRhythmAttrs}${clozePredecessorAttrs}${clozeFollowingAttrs}${grammarFillRhythmAttrs}${grammarFillPartContextAttrs}${grammarFillPredecessorAttrs}${grammarFillFollowingAttrs}${partFirstSectionAttrs}>${renderSectionHeadingText(visibleTitle)}</h2>`)
      } else if (
        block.type === 'instruction'
        && block.text
        && !canonicalWritingChromeBlockIndexes.has(blockIndex)
        && (
          isReadingChromeBlock(blockIndex)
          || isSevenChoicesChromeBlock(blockIndex)
          || isClozeChromeBlock(blockIndex)
          || isGrammarFillChromeBlock(blockIndex)
        )
      ) {
        const readingPredecessorAttrs =
          blockIndex === firstReadingPredecessorBlockIndex
            ? ` data-canonical-reading-preceding-for="${escapeHtml(canonicalReadingGroupIds[0])}" data-canonical-reading-preceding-kind="reading_heading" data-canonical-reading-anchor-id="${escapeHtml(block.instructionId || `print-instruction-${blockIndex}`)}"`
            : ''
        const readingRhythmAttrs = isReadingChromeBlock(blockIndex)
          ? ' data-canonical-reading-rhythm-role="meta_instruction"'
          : ''
        const sevenChoicesRhythmAttrs = isSevenChoicesChromeBlock(blockIndex)
          ? ' data-canonical-seven-choices-rhythm-role="meta_instruction" data-canonical-seven-choices-chrome=""'
          : ''
        const sevenChoicesPredecessorAttrs =
          blockIndex === firstSevenChoicesPredecessorBlockIndex
            ? ` data-canonical-seven-choices-preceding-for="${escapeHtml(canonicalSevenChoicesGroupIds[0])}"`
            : ''
        const clozeRhythmAttrs = isClozeChromeBlock(blockIndex)
          ? ' data-canonical-cloze-rhythm-role="meta_instruction" data-canonical-cloze-chrome=""'
          : ''
        const clozePredecessorAttrs =
          blockIndex === firstClozePredecessorBlockIndex
            ? ` data-canonical-cloze-preceding-for="${escapeHtml(canonicalClozeGroupIds[0])}" data-canonical-cloze-previous-family-group-id="${escapeHtml(canonicalSevenChoicesGroupIds.at(-1) || '')}"`
            : ''
        const grammarFillRhythmAttrs = isGrammarFillChromeBlock(blockIndex)
          ? ' data-canonical-grammar-fill-rhythm-role="meta_instruction" data-canonical-grammar-fill-chrome=""'
          : ''
        const grammarFillPredecessorAttrs =
          blockIndex === firstGrammarFillPredecessorBlockIndex
            ? ` data-canonical-grammar-fill-preceding-for="${escapeHtml(canonicalGrammarFillGroupIds[0])}" data-canonical-grammar-fill-previous-family-group-id="${escapeHtml(canonicalClozeGroupIds.at(-1) || '')}"`
            : ''
        sections.push(`<p class="reading-meta-instruction"${readingRhythmAttrs}${readingPredecessorAttrs}${sevenChoicesRhythmAttrs}${sevenChoicesPredecessorAttrs}${clozeRhythmAttrs}${clozePredecessorAttrs}${grammarFillRhythmAttrs}${grammarFillPredecessorAttrs}>${escapeHtml(block.text)}</p>`)
      } else if (block.type === 'page_break') {
        sections.push('<div class="page-break"></div>')
      } else if (block.type === 'question_group' && block.questionGroupId) {
        const item = itemByGroupId.get(block.questionGroupId)
        if (!item) continue
        const { detail } = item
        const canonicalResolution = getCanonicalGroup(
          block.questionGroupId,
          detail,
        )
        let canonicalGroup =
          canonicalResolution?.status === 'ready'
            ? canonicalResolution.group
            : null
        if (
          canonicalGroup
          && !canonicalGroupMatchesPrintDetail(canonicalGroup, detail)
        ) {
          if (canonicalConsumption) {
            const error = new Error(
              `Canonical Print input does not match ${block.questionGroupId}`,
            )
            error.code = 'CANONICAL_CONSUMPTION_REJECTED'
            throw error
          }
          normalizationDiagnostics.push({
            status: 'legacy',
            source: 'legacy',
            paperId: canonicalResolution.diagnostic.paperId,
            groupId: block.questionGroupId,
            reason: 'canonical_print_input_mismatch',
          })
          canonicalGroup = null
        } else if (canonicalResolution?.diagnostic) {
          normalizationDiagnostics.push(canonicalResolution.diagnostic)
        }
        const score = Number.isFinite(Number(block.score)) ? Number(block.score) : item.score
        const passage = (detail.passage.materialText || detail.passage.summary || '').trim()

        // draft-depassage-letter (docs/cuts/draft-depassage-letter/plan.md):
        // retires the paper-passage-letter cut's A-D letter derivation —
        // 草稿卷是练习单非仿真卷, A/B/C/D 是源卷结构属性不该带走。取而代之
        // 渲染大题号徽标+题型标签, 跨 section_header 不重置。
        // draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判): 大题号
        // 由阿拉伯数字改汉字, 避免与全卷连续的小题阿拉伯号同型撞层级。
        groupNum += 1
        const hasBlockScore = Number.isFinite(Number(block.score))
        const groupHeaderScoreSuffix = hasBlockScore ? `（每题 ${score} 分）` : ''
        const groupHeaderLabel = groupTypeLabels[detail.groupType] || detail.groupType
        const canonicalWritingChrome =
          canonicalGroup
          && ['writing', 'continuation'].includes(canonicalGroup.groupType)
            ? projectCanonicalWritingChrome({
                consumption: canonicalSourceConsumptionForGroup(
                  canonicalConsumption,
                  canonicalGroup.groupId,
                ),
                groupId: canonicalGroup.groupId,
                renderedGroupIds,
              })
            : null

        const collapsedSevenChoicesBoundaryAttr =
          canonicalGroup?.groupType === 'sevenChoices'
          && canonicalGroup.groupId === canonicalSevenChoicesGroupIds[0]
          && firstSevenChoicesPredecessorBlockIndex < 0
          && canonicalReadingGroupIds.length > 0
            ? ` data-canonical-seven-choices-reading-boundary-group-id="${escapeHtml(canonicalReadingGroupIds.at(-1))}"`
            : ''
        const collapsedClozeBoundaryAttr =
          canonicalGroup?.groupType === 'cloze'
          && canonicalGroup.groupId === canonicalClozeGroupIds[0]
          && firstClozePredecessorBlockIndex < 0
            ? ` data-canonical-cloze-previous-family-group-id="${escapeHtml(canonicalSevenChoicesGroupIds.at(-1) || '')}"`
            : ''
        const collapsedGrammarFillBoundaryAttr =
          canonicalGroup?.groupType === 'grammarFill'
          && canonicalGroup.groupId === canonicalGrammarFillGroupIds[0]
          && firstGrammarFillPredecessorBlockIndex < 0
            ? ` data-canonical-grammar-fill-previous-family-group-id="${escapeHtml(canonicalClozeGroupIds.at(-1) || '')}"`
            : ''
        let groupHtml = canonicalGroup
          ? `<section class="question-group" data-canonical-group-id="${escapeHtml(canonicalGroup.groupId)}" data-canonical-group-type="${escapeHtml(canonicalGroup.groupType)}" data-canonical-semantic-signature="${escapeHtml(canonicalGroup.semanticSignature)}"${canonicalGroup.occurrenceSignature ? ` data-canonical-occurrence-signature="${escapeHtml(canonicalGroup.occurrenceSignature)}"` : ''}${collapsedSevenChoicesBoundaryAttr}${collapsedClozeBoundaryAttr}${collapsedGrammarFillBoundaryAttr}>`
          : '<section class="question-group">'

        let groupLeadHtml = ''
        if (
          !canonicalWritingChrome
          && canonicalGroup?.groupType !== 'reading'
          && canonicalGroup?.groupType !== 'sevenChoices'
          && canonicalGroup?.groupType !== 'cloze'
          && canonicalGroup?.groupType !== 'grammarFill'
        ) {
          groupLeadHtml += `<div class="group-header">${chineseNumeral(groupNum)}、${escapeHtml(groupHeaderLabel)}${escapeHtml(groupHeaderScoreSuffix)}</div>`
        }

        if (
          !isExam
          && canonicalGroup?.groupType !== 'reading'
          && canonicalGroup?.groupType !== 'sevenChoices'
          && canonicalGroup?.groupType !== 'cloze'
          && canonicalGroup?.groupType !== 'grammarFill'
        ) {
          groupLeadHtml += `<div class="group-meta"><strong>${escapeHtml(detail.title)}</strong> · ${groupTypeLabels[detail.groupType] || detail.groupType} · 每题 ${score} 分</div>`
        }

        // draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判):
        // small-question numbering is whole-paper continuous (`questionNum`,
        // declared outside this per-group block, never reset). `blankCounter`
        // is seeded to THIS group's first continuous number so every in-text
        // blank marker found in the passage below gets the SAME number as
        // the corresponding small-question list entry — see
        // `renderPassageLineWithBlanks`'s doc comment.
        const blankCounter = { next: questionNum }

        if (canonicalGroup) {
          if (canonicalGroup.groupType === 'reading') {
            groupHtml += renderCanonicalReadingBlocks(canonicalGroup)
          } else if (canonicalGroup.groupType === 'writing') {
            groupHtml += groupLeadHtml
            groupHtml += renderCanonicalApplicationWriting(
              canonicalGroup,
              canonicalWritingChrome,
              canonicalGroup.groupId === canonicalApplicationGroupIds[0]
              && canonicalGrammarFillGroupIds.length > 0
                ? {
                    groupId: canonicalGrammarFillGroupIds.at(-1),
                    sectionId: followingGrammarFillSectionId
                      || canonicalWritingChrome.part.instructionId,
                  }
                : null,
            )
          } else if (canonicalGroup.groupType === 'continuation') {
            groupHtml += groupLeadHtml
            groupHtml += renderCanonicalContinuationWriting(
              canonicalGroup,
              canonicalWritingChrome,
            )
          } else {
            groupHtml += groupLeadHtml
            const displayNumberByQuestionId = new Map(
              canonicalGroup.questions.map((question) => [
                question.questionId,
                question.questionNo,
              ]),
            )
            groupHtml += `<div class="passage">${canonicalGroup.paragraphs
              .map(
                (paragraph) =>
                  `<p data-canonical-paragraph-id="${escapeHtml(paragraph.paragraphId)}"${canonicalGroup.groupType === 'sevenChoices' ? ` data-canonical-seven-choices-rhythm-role="${canonicalSevenChoicesPassageRole(paragraph)}"` : canonicalGroup.groupType === 'cloze' ? ' data-canonical-cloze-rhythm-role="passage_body_line"' : canonicalGroup.groupType === 'grammarFill' ? ' data-canonical-grammar-fill-rhythm-role="passage_body_line"' : ''}>${renderCanonicalParagraph(
                    canonicalGroup,
                    paragraph,
                    displayNumberByQuestionId,
                  )}</p>`,
              )
              .join('')}</div>`
            groupHtml += renderCanonicalSharedBank(canonicalGroup, {
              heading:
                canonicalGroup.groupType === 'sevenChoices'
                  ? sevenChoicesBankHeading
                  : null,
              followingSectionId:
                canonicalGroup.groupType === 'sevenChoices'
                  ? followingSevenChoicesSectionId
                  : undefined,
              teacher: isTeacher,
            })
          }
        } else if (passage) {
          groupHtml += groupLeadHtml
          const figuresInfo = getFiguresInfo(block.questionGroupId)
          groupHtml += `<div class="passage">${passage.split(/\n/).map((line) => renderPassageLine(line, detail.groupType, figuresInfo, imageMode, images, blankCounter)).join('')}</div>`
        } else {
          groupHtml += groupLeadHtml
        }

        // Hard consistency assertion (plan.md 连带硬需求): the count of
        // in-text blank markers found in this group's passage MUST equal
        // the count of small questions in the group — otherwise the number
        // shown in-text and the number shown in the question list would not
        // refer to the same blank, and a student could not match them up.
        // Fail LOUD (throw, aborting the whole export) rather than emit a
        // silently-misaligned paper — plan.md: "宁可导出红也不出对不上的卷子".
        // Scoped to the three blank-bearing group types only (reading /
        // writing never carry these markers — see BLANK_BEARING_GROUP_TYPES).
        // v2: base is `questionNum` (this group's first continuous number,
        // captured BEFORE the assertion — blankCounter was seeded to it),
        // not the round-1 constant `1`.
        if (!canonicalGroup && BLANK_BEARING_GROUP_TYPES.has(detail.groupType)) {
          const blanksFound = blankCounter.next - questionNum
          if (blanksFound !== detail.questions.length) {
            throw new Error(
              `draft-numbering-style: in-text blank count (${blanksFound}) does not match question count `
              + `(${detail.questions.length}) for question_group "${block.questionGroupId}" (${detail.groupType}) `
              + `— refusing to render a paper where the passage blanks and the question list would not line up. `
              + `Likely cause: source materialText has extra/missing paperBlankPattern-shaped markers (stray `
              + `numbers, OCR noise, or an unsupported blank format like "NN._____") — check the source text for `
              + `this group.`,
            )
          }
        }

        if (
          isWritingGroupType(detail.groupType)
          && !['writing', 'continuation'].includes(canonicalGroup?.groupType)
        ) {
          groupHtml += renderWritingAnswerBox(detail)
        }

        const canonicalQuestionById = canonicalGroup
          ? new Map(canonicalGroup.questions.map((question) => [question.questionId, question]))
          : null
        const readingSuccessorGroupId =
          canonicalGroup?.groupType === 'reading'
            ? nextReadingGroupIdByPredecessorGroupId.get(
                canonicalGroup.groupId,
              )
            : undefined
        const readingFollowingSectionId =
          canonicalGroup?.groupType === 'reading'
          && canonicalGroup.groupId === canonicalReadingGroupIds.at(-1)
            ? followingReadingSectionId
            : undefined
        const lastReadingQuestionId =
          canonicalGroup?.groupType === 'reading'
            ? canonicalGroup.questions.at(-1)?.questionId
            : undefined
        const isCanonicalSevenChoices =
          canonicalGroup?.groupType === 'sevenChoices'
          && canonicalSevenChoicesGroupIds.includes(canonicalGroup.groupId)
        const lastSevenChoicesQuestionId = isCanonicalSevenChoices
          ? canonicalGroup.questions.at(-1)?.questionId
          : undefined
        const isCanonicalCloze =
          canonicalGroup?.groupType === 'cloze'
          && canonicalClozeGroupIds.includes(canonicalGroup.groupId)
        const lastClozeQuestionId = isCanonicalCloze
          ? canonicalGroup.questions.at(-1)?.questionId
          : undefined
        const isCanonicalGrammarFill =
          canonicalGroup?.groupType === 'grammarFill'
          && canonicalGrammarFillGroupIds.includes(canonicalGroup.groupId)
        const lastGrammarFillQuestionId = isCanonicalGrammarFill
          ? canonicalGroup.questions.at(-1)?.questionId
          : undefined
        for (const question of detail.questions) {
          const canonicalQuestion = canonicalQuestionById?.get(question.id)
          const printQuestion = canonicalQuestion
            ? {
                ...question,
                stem: canonicalQuestion.stem ?? '',
                ...(canonicalGroup.groupType === 'reading'
                  ? { stemContent: canonicalQuestion.stemContent }
                  : {}),
                options: canonicalQuestion.options.map((option) => ({
                  optionId: option.optionId,
                  label: option.label,
                  content: option.text,
                  ...(canonicalGroup.groupType === 'reading'
                    ? { canonicalContent: option.content }
                    : {}),
                })),
                canonicalPlacement: canonicalQuestion.layoutPlan
                  ? translateAbcdPlanToPointPlacement(
                      canonicalQuestion.layoutPlan,
                    )
                  : null,
                answer: canonicalQuestion.correctOptionId
                  ? canonicalQuestion.options.find(
                      (option) =>
                        option.optionId === canonicalQuestion.correctOptionId,
                    )?.label || ''
                  : question.answer,
              }
            : question
          const stemText = String(printQuestion.stem || '').trim()
          const hasOptions = Array.isArray(printQuestion.options) && printQuestion.options.length > 0
          const displayQuestionNo = canonicalQuestion
            ? canonicalQuestion.questionNo
            : questionNum
          const canonicalQuestionAttrs = canonicalQuestion
            ? ` data-canonical-question-id="${escapeHtml(canonicalQuestion.questionId)}"${canonicalGroup?.groupType === 'reading' ? ' data-canonical-reading-rhythm-role="question_block"' : isCanonicalCloze ? ' data-canonical-cloze-rhythm-role="choice_row"' : ''}${canonicalQuestion.questionId === lastReadingQuestionId && readingSuccessorGroupId ? ` data-canonical-reading-last-question-for="${escapeHtml(readingSuccessorGroupId)}"` : ''}${canonicalQuestion.questionId === lastReadingQuestionId && readingFollowingSectionId ? ` data-canonical-reading-last-question-before-section="${escapeHtml(readingFollowingSectionId)}"` : ''}${isCanonicalCloze && canonicalQuestion.questionId === lastClozeQuestionId && followingClozeSectionId ? ` data-canonical-cloze-before-section="${escapeHtml(followingClozeSectionId)}"` : ''}${isCanonicalGrammarFill && canonicalQuestion.questionId === lastGrammarFillQuestionId && followingGrammarFillSectionId ? ` data-canonical-grammar-fill-before-section="${escapeHtml(followingGrammarFillSectionId)}"` : ''}${isTeacher ? ` data-canonical-correct-option-id="${escapeHtml(canonicalQuestion.correctOptionId || '')}"` : ''}`
            : ''
          // 空题干:挖空题号已在文中(语法填空/完形/七选五)。有选项则题号与选项同行
          // (真卷完形形态);无选项且非教师版则整行不出(语法填空文后无内容)。
          const suppressCanonicalSevenChoicesStem =
            isCanonicalSevenChoices
            && isTeacher
            && !stemText
            && !hasOptions
          const suppressCanonicalGrammarFillStem =
            isCanonicalGrammarFill
            && isTeacher
            && !stemText
            && !hasOptions
          if (!stemText && !hasOptions && !isTeacher) {
            questionNum += 1
            continue
          }
          if (
            suppressCanonicalSevenChoicesStem
            || suppressCanonicalGrammarFillStem
          ) {
            const tailClass = suppressCanonicalSevenChoicesStem
              ? 'question--canonical-seven-choices-tail'
              : 'question--canonical-grammar-fill-tail'
            groupHtml += `<div class="question ${tailClass}"${canonicalQuestionAttrs}>`
          } else if (!stemText && hasOptions) {
            // 真卷完形形态:题号与选项同一行「41. A. xxx B. xxx C. xxx D. xxx」
            const placement = printQuestion.canonicalPlacement
            const clozeChoiceMapping =
              isCanonicalCloze
                ? clozeRhythm.horizontalChoiceGeometry.rendererMapping
                : null
            const placementAttrs = placement
              ? ` data-canonical-placement-signature="${escapeHtml(placement.placementSignature)}" data-canonical-placement-mode="${placement.mode}" data-canonical-column-starts-pt="${(clozeChoiceMapping?.columnStartsPt || placement.columnStartsPt).join(',')}"${clozeChoiceMapping ? ` data-canonical-cloze-geometry-authority="${digestJson(clozeChoiceMapping)}"` : ''} style="width:${clozeChoiceMapping ? clozeChoiceMapping.rowWidthPt - clozeChoiceMapping.questionLabelWidthPt : placement.rowWidthPt}pt;grid-template-columns:${(clozeChoiceMapping?.columnWidthsPt || placement.columnWidthsPt).map((width) => `${width}pt`).join(' ')}"`
              : ''
            const renderedOptions = printQuestion.options.map((o, index) => {
              if (!o.canonicalContent) {
                return `<span><span${isCanonicalCloze ? ' data-canonical-cloze-rhythm-role="choice_label"' : ''}>${escapeHtml(o.label)}.</span> <span${isCanonicalCloze ? ' data-canonical-cloze-rhythm-role="choice_text"' : ''}>${escapeHtml(o.content)}</span></span>`
              }
              const physical = placement?.placements[index]
              const canonicalStart =
                clozeChoiceMapping?.columnStartsPt[index]
                ?? physical?.startPt
              const continuation = physical?.continuationStartPt
              const style =
                isCanonicalCloze
                || continuation === null
                || continuation === undefined
                ? ''
                : ` style="padding-left:${continuation}pt;text-indent:-${continuation}pt"`
              const identityAttrs = canonicalQuestion
                ? ` data-canonical-option-id="${escapeHtml(o.optionId)}"${canonicalStart === undefined ? '' : ` data-canonical-start-pt="${canonicalStart}"`}${physical && continuation !== null ? ` data-canonical-continuation-start-pt="${continuation}"` : ''}`
                : ''
              const content = renderCanonicalInlineNodes(o.canonicalContent)
              return `<span${identityAttrs}${style}><span${isCanonicalCloze ? ' data-canonical-cloze-rhythm-role="choice_label"' : ''}>${escapeHtml(o.label)}.</span> <span${isCanonicalCloze ? ' data-canonical-cloze-rhythm-role="choice_text"' : ''}>${content}</span></span>`
            }).join('')
            groupHtml += `<div class="question"${canonicalQuestionAttrs}><p class="options-inline options-inline--numbered${placement ? ' options-inline--canonical' : ''}"><span class="qnum">${displayQuestionNo}.</span>${placement ? `<span class="canonical-options canonical-options--${placement.mode}"${placementAttrs}>${renderedOptions}</span>` : renderedOptions}</p>`
          } else {
            const renderedStem = canonicalQuestion
              ? (
                  Array.isArray(printQuestion.stemContent)
                    ? renderCanonicalInlineNodes(printQuestion.stemContent)
                    : escapeHtml(printQuestion.stem)
                )
              : escapeHtml(printQuestion.stem)
            const stemPlacement = canonicalQuestion?.layoutPlan
              ? translateAbcdPlanToPointPlacement(
                  canonicalQuestion.layoutPlan,
                )
              : null
            const stemAttrs = stemPlacement
              ? ` data-canonical-question-stem-start-pt="${stemPlacement.questionStemStartPt}" style="grid-template-columns:${stemPlacement.questionStemStartPt}pt minmax(0,1fr)"`
              : ''
            groupHtml += `<div class="question"${canonicalQuestionAttrs}><p class="stem${stemPlacement ? ' stem--canonical' : ''}"${canonicalGroup?.groupType === 'reading' ? ' data-canonical-reading-rhythm-role="question_stem_line"' : ''}${stemAttrs}><span class="qnum">${displayQuestionNo}.</span>${stemPlacement ? `<span class="canonical-stem-text">${renderedStem}</span>` : ` ${renderedStem}`}</p>`
            groupHtml += canonicalQuestion?.layoutPlan
              ? renderCanonicalQuestionOptions(
                  canonicalQuestion,
                  canonicalGroup.groupType === 'reading',
                  canonicalGroup.groupType === 'reading'
                    && (readingSuccessorGroupId || readingFollowingSectionId)
                    ? {
                        isLastQuestion:
                          canonicalQuestion.questionId
                            === lastReadingQuestionId,
                        targetId:
                          readingSuccessorGroupId
                          || readingFollowingSectionId,
                        successorGroupId: readingSuccessorGroupId,
                        followingSectionId: readingFollowingSectionId,
                        visiblePredecessorOnOption: !isTeacher,
                      }
                    : null,
                )
              : renderOptions(printQuestion.options, detail.groupType)
          }
          if (isTeacher) {
            const isReadingTransitionTail =
              canonicalGroup?.groupType === 'reading'
              && canonicalQuestion?.questionId === lastReadingQuestionId
              && (readingSuccessorGroupId || readingFollowingSectionId)
            const rawExplanation = question.explanation || question.note || ''
            const explanation = isMetaStub(rawExplanation) ? '' : rawExplanation
            const answerTransitionAttrs =
              isReadingTransitionTail && !explanation
                ? ` data-canonical-reading-predecessor-question-id="${escapeHtml(canonicalQuestion.questionId)}" data-canonical-reading-predecessor-option-id="${escapeHtml(canonicalQuestion.options.at(-1)?.optionId || '')}"${readingSuccessorGroupId ? ` data-canonical-reading-preceding-for="${escapeHtml(readingSuccessorGroupId)}" data-canonical-reading-preceding-kind="prior_question_tail"` : ` data-canonical-reading-before-section="${escapeHtml(readingFollowingSectionId)}"`}`
                : ''
            const answerRhythmAttrs =
              canonicalGroup?.groupType === 'reading'
                ? ' data-canonical-reading-rhythm-role="answer_line"'
                : isCanonicalSevenChoices
                  ? ' data-canonical-seven-choices-rhythm-role="answer_line"'
                  : isCanonicalCloze
                    ? ' data-canonical-cloze-rhythm-role="answer_line"'
                    : isCanonicalGrammarFill
                      ? ' data-canonical-grammar-fill-rhythm-role="answer_line"'
                      : ''
            const sevenChoicesAnswerTransitionAttrs =
              isCanonicalSevenChoices
              && canonicalQuestion?.questionId === lastSevenChoicesQuestionId
              && followingSevenChoicesSectionId
              && !explanation
                ? ` data-canonical-seven-choices-before-section="${escapeHtml(followingSevenChoicesSectionId)}"`
                : ''
            const clozeAnswerTransitionAttrs =
              isCanonicalCloze
              && canonicalQuestion?.questionId === lastClozeQuestionId
              && followingClozeSectionId
              && !explanation
                ? ` data-canonical-cloze-before-section="${escapeHtml(followingClozeSectionId)}"`
                : ''
            const grammarFillAnswerTransitionAttrs =
              isCanonicalGrammarFill
              && canonicalQuestion?.questionId === lastGrammarFillQuestionId
              && followingGrammarFillSectionId
              && !explanation
                ? ` data-canonical-grammar-fill-before-section="${escapeHtml(followingGrammarFillSectionId)}"`
                : ''
            groupHtml += `<div class="answer"><p${answerRhythmAttrs}${answerTransitionAttrs}${sevenChoicesAnswerTransitionAttrs}${clozeAnswerTransitionAttrs}${grammarFillAnswerTransitionAttrs}><strong>【答案】</strong>${escapeHtml(printQuestion.answer || '待补')}</p>`
            if (explanation) {
              const explanationTransitionAttrs =
                isReadingTransitionTail
                  ? ` data-canonical-reading-predecessor-question-id="${escapeHtml(canonicalQuestion.questionId)}" data-canonical-reading-predecessor-option-id="${escapeHtml(canonicalQuestion.options.at(-1)?.optionId || '')}"${readingSuccessorGroupId ? ` data-canonical-reading-preceding-for="${escapeHtml(readingSuccessorGroupId)}" data-canonical-reading-preceding-kind="prior_question_tail"` : ` data-canonical-reading-before-section="${escapeHtml(readingFollowingSectionId)}"`}`
                  : ''
              const explanationRhythmAttrs =
                canonicalGroup?.groupType === 'reading'
                  ? ' data-canonical-reading-rhythm-role="explanation_line"'
                  : isCanonicalSevenChoices
                    ? ' data-canonical-seven-choices-rhythm-role="explanation_line"'
                    : isCanonicalCloze
                      ? ' data-canonical-cloze-rhythm-role="explanation_line"'
                      : isCanonicalGrammarFill
                        ? ' data-canonical-grammar-fill-rhythm-role="explanation_line"'
                        : ''
              const sevenChoicesExplanationTransitionAttrs =
                isCanonicalSevenChoices
                && canonicalQuestion?.questionId
                  === lastSevenChoicesQuestionId
                && followingSevenChoicesSectionId
                  ? ` data-canonical-seven-choices-before-section="${escapeHtml(followingSevenChoicesSectionId)}"`
                  : ''
              const clozeExplanationTransitionAttrs =
                isCanonicalCloze
                && canonicalQuestion?.questionId === lastClozeQuestionId
                && followingClozeSectionId
                  ? ` data-canonical-cloze-before-section="${escapeHtml(followingClozeSectionId)}"`
                  : ''
              const grammarFillExplanationTransitionAttrs =
                isCanonicalGrammarFill
                && canonicalQuestion?.questionId === lastGrammarFillQuestionId
                && followingGrammarFillSectionId
                  ? ` data-canonical-grammar-fill-before-section="${escapeHtml(followingGrammarFillSectionId)}"`
                  : ''
              groupHtml += `<p class="explanation"${explanationRhythmAttrs}${explanationTransitionAttrs}${sevenChoicesExplanationTransitionAttrs}${clozeExplanationTransitionAttrs}${grammarFillExplanationTransitionAttrs}><strong>【解析】</strong>${escapeHtml(explanation)}</p>`
            }
            groupHtml += '</div>'
          }
          groupHtml += '</div>'
          questionNum++
        }

        groupHtml += '</section>'
        sections.push(groupHtml)
      }
    }
  } else {
    // Legacy: render by items. draft-depassage-letter cut: never had
    // passage-letter rendering (nothing to retire) and is not given the new
    // .group-header 大题头 — every current export caller (paperExportPayload.ts
    // buildPrintPayload always sends a non-empty `blocks`
    // array (usePaperDraft.ts invariant 2: every basket item has exactly one
    // question_group block), so this branch has no real product consumer.
    // Left mechanically unchanged; recorded as fact per plan.md step 2.
    let questionNum = startNum
    for (const item of items) {
      const { detail } = item
      const passage = (detail.passage.materialText || detail.passage.summary || '').trim()
      let groupHtml = '<section class="question-group">'
      if (passage) {
        const figuresInfo = getFiguresInfo(detail.id)
        groupHtml += `<div class="passage">${passage.split(/\n/).map((line) => renderPassageLine(line, detail.groupType, figuresInfo, imageMode, images)).join('')}</div>`
      }
      if (isWritingGroupType(detail.groupType)) {
        groupHtml += renderWritingAnswerBox(detail)
      }
      for (const question of detail.questions) {
        groupHtml += `<div class="question"><p class="stem"><span class="qnum">${questionNum}.</span> ${escapeHtml(question.stem)}</p>`
        groupHtml += renderOptions(question.options, detail.groupType)
        if (isTeacher) {
          groupHtml += `<div class="answer"><p><strong>【答案】</strong>${escapeHtml(question.answer || '待补')}</p></div>`
        }
        groupHtml += '</div>'
        questionNum++
      }
      groupHtml += '</section>'
      sections.push(groupHtml)
    }
  }

  const versionLabel = isTeacher ? '（教师版 含答案解析）' : ''
  const densityClass = isExam ? 'exam' : 'handout'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title || '英语试题')}</title>
<style>
/* 刀⑤ render-fidelity Chunk B — standard §1: 左右 24mm / 上 ≈21mm.
   Bottom margin is 24mm (not standard-mandated directly). Chromium's margin
   box places the 9pt footer literal ≈17.5mm from the physical bottom when the
   bottom-center content is top-aligned with 4.1mm top padding. */
@page {
  size: A4;
  margin: 21mm 24mm 24mm 24mm;

  @bottom-center {
    content: "${paperTypographyRuntime.footerContract.prefix}" counter(page) "${paperTypographyRuntime.footerContract.pageSuffix}" counter(pages) "${paperTypographyRuntime.footerContract.totalSuffix}";
    font-family: ${paperSurfaceTokens.paperFontStack};
    font-size: ${
      sectionHeadingRuntime.printPdf.fontSizePt
      * paperTypographyRuntime.footerContract.fontSizeRelativeToBody
    }pt;
    color: #000;
    vertical-align: top;
    padding-top: 4.1mm;
  }
}

body {
  font-family: ${paperSurfaceTokens.paperFontStack};
  font-size: 10.5pt;
  /* standard §3: the shared Owner-gold runtime fixes the Print/PDF
     baseline at 18pt for 10.5pt body and section-heading text. */
  line-height: ${
    sectionHeadingRuntime.printPdf.lineHeightPt
    / sectionHeadingRuntime.printPdf.fontSizePt
  };
  color: #000;
  margin: 0;
  padding: 0;
}

.paper-header {
  text-align: center;
  margin-bottom: 1.5em;
}

.paper-header h1 {
  font-family: ${paperSurfaceTokens.paperFontStackHeading};
  /* heading-fidelity cut (标准 §2): 卷名「英语」20pt — the standard's
     ONLY size-up heading; every other heading tier stays 10.5pt. */
  font-size: 20pt;
  font-weight: bold;
  margin: 0 0 0.3em;
}

.paper-header .version-label {
  font-size: 11pt;
  color: #555;
}

/* heading-fidelity cut (标准 §2/§4, Locked Decision 2): 部/节共用
   base rule (spacing / break behavior), 字重字体缩进按 --part / --section
   两态拆分 (headingKind.mjs 单源判定) — 层级靠字重与缩进区分, 两态一律
   10.5pt, 不放大字号 (12pt 旧值退场). */
.section-header {
  font-size: ${sectionHeadingRuntime.printPdf.fontSizePt}pt;
  margin: 1.2em 0 0.6em;
}

.section-header--part {
  font-family: ${paperSurfaceTokens.paperFontStackHeading};
  font-weight: bold;
  text-indent: ${sectionHeadingRuntime.printPdf.partHeadingIndentEm}em;
  padding-left: 0;
}

.section-header--section {
  font-family: ${sectionHeadingRuntime.printPdf.fontStack};
  font-weight: ${paperTypographyRuntime.visibleWeight.sectionHeading};
  text-indent: ${sectionHeadingRuntime.printPdf.sectionHeadingIndentEm}em;
  padding-left: 0;
  white-space: nowrap;
}

[data-canonical-section-heading-numeric-run] {
  position: relative;
  top: ${sectionHeadingRuntime.printPdf.numericRunBaselineShiftEm}em;
}

.section-header[data-canonical-seven-choices-chrome] {
  margin-bottom: ${sevenChoicesRhythm.visibleGeometryAdjustments.printPdf.singleChromeMarginBottomPt}pt;
}

.section-header[data-canonical-seven-choices-chrome]:has(
  + [data-canonical-seven-choices-chrome]
) {
  margin-bottom: ${sevenChoicesRhythm.visibleGeometryAdjustments.printPdf.adjacentChromeMarginBottomEm}em;
}

.section-header[data-canonical-reading-rhythm-role="part_title"] {
  margin-bottom: 0;
}

.section-header[data-canonical-reading-rhythm-role="part_title"]
  + .section-header[data-canonical-reading-rhythm-role="subsection"] {
  margin-top: ${partToFirstSectionMarginTopPt()}pt;
}

.page-break {
  break-before: page;
}

.question-group {
  margin-bottom: 1em;
}

.question-group[data-canonical-group-type="reading"] {
  margin-bottom: 0;
}

.question-group[data-canonical-group-type="sevenChoices"] {
  margin-bottom: 0;
}

.question-group[data-canonical-group-type="cloze"] {
  margin-bottom: 0;
}

.question-group[data-canonical-group-type="grammarFill"] {
  margin-bottom: 0;
}

.section-header[data-canonical-cloze-chrome] {
  margin-top: 0;
  margin-bottom: 0;
  line-height: ${clozeRhythm.targets.printPdf.baselineStepPt}pt;
}

.section-header[data-canonical-cloze-rhythm-role="part_title"] {
  margin-top: ${clozeRhythm.targets.printPdf.baselineStepPt}pt;
}

.section-header--part + .section-header--section {
  margin-top: ${partToFirstSectionMarginTopPt()}pt;
}

.reading-meta-instruction[data-canonical-cloze-chrome] {
  margin-top: 0;
  margin-bottom: ${clozeRhythm.targets.printPdf.baselineStepPt / 2}pt;
  line-height: ${clozeRhythm.targets.printPdf.baselineStepPt}pt;
}

.section-header[data-canonical-cloze-rhythm-role="next_section"] {
  margin-top: ${clozeRhythm.targets.printPdf.baselineStepPt}pt;
  margin-bottom: 0;
  line-height: ${clozeRhythm.targets.printPdf.baselineStepPt}pt;
}

.section-header[data-canonical-grammar-fill-chrome] {
  margin-top: 0;
  margin-bottom: 0;
  line-height: ${grammarFillRhythm.rendererMapping.printPdf.baselineStepPt}pt;
}

.section-header[
  data-canonical-grammar-fill-chrome
][data-canonical-cloze-rhythm-role="next_section"] {
  margin-top: ${clozeRhythm.targets.printPdf.baselineStepPt}pt;
}

.reading-meta-instruction[data-canonical-grammar-fill-chrome] {
  margin-top: 0;
  margin-bottom: ${grammarFillRhythm.rendererMapping.printPdf.instructionMarginBottomPt}pt;
  line-height: ${grammarFillRhythm.rendererMapping.printPdf.baselineStepPt}pt;
}

.section-header[data-canonical-grammar-fill-rhythm-role="next_section"] {
  margin-top: ${grammarFillRhythm.rendererMapping.printPdf.followingSectionMarginTopPt}pt;
  margin-bottom: 0;
  line-height: ${grammarFillRhythm.rendererMapping.printPdf.baselineStepPt}pt;
}

.group-meta {
  font-size: 9pt;
  color: #666;
  margin-bottom: 0.5em;
  border-bottom: 1px solid #ddd;
  padding-bottom: 0.3em;
}

/* draft-depassage-letter cut (owner 拍板 2026-07-09): 大题号徽标+题型标签
   ("N、题型（每题 N 分）") — 练习单气质, 比 .group-meta 更醒目 (它是主标,
   group-meta 是源卷归属附注)。heading-fidelity cut: .section-header 的两
   态 (part/section) 均归 10.5pt 后, .group-header 11pt 不再是"半字号区分"
   的下位关系 — 它是 .group-header 自家不属于本刀账上的既有值 (Locked
   Decision 4), 与 .section-header 现值无字号级差含义, 仅历史注记留存。 */
.group-header {
  font-family: ${paperSurfaceTokens.paperFontStackHeading};
  font-size: 11pt;
  font-weight: bold;
  margin: 0.6em 0 0.4em;
}

.group-header[data-canonical-reading-preceding-for] {
  break-after: avoid;
}

.canonical-reading-start {
  break-inside: avoid;
  break-after: avoid;
}

.passage {
  margin: 0.5em 0;
  text-indent: ${sectionHeadingRuntime.printPdf.passageFirstLineIndentEm}em;
}

.passage p {
  margin: 0 0 0.3em;
  text-indent: ${sectionHeadingRuntime.printPdf.passageFirstLineIndentEm}em;
}

.question-group[data-canonical-group-type="sevenChoices"] .passage {
  margin: 0;
}

.question-group[data-canonical-group-type="sevenChoices"] .passage p {
  margin: 0;
  line-height: ${sevenChoicesRhythm.targets.printPdf.baselineStepPt}pt;
}

.question-group[data-canonical-group-type="sevenChoices"] .passage p[
  data-canonical-seven-choices-rhythm-role="passage_title"
],
.question-group[data-canonical-group-type="sevenChoices"] .passage p[
  data-canonical-seven-choices-rhythm-role="passage_subtitle"
] {
  font-weight: bold;
  text-indent: 0;
}

.question-group[data-canonical-group-type="sevenChoices"] .passage p[
  data-canonical-seven-choices-rhythm-role="passage_title"
] {
  text-align: center;
}

.question-group[data-canonical-group-type="cloze"] .passage {
  margin: 0;
}

.question-group[data-canonical-group-type="cloze"] .passage p {
  margin: 0;
  line-height: ${clozeRhythm.targets.printPdf.baselineStepPt}pt;
}

.question-group[data-canonical-group-type="grammarFill"] .passage {
  margin: 0;
}

.question-group[data-canonical-group-type="grammarFill"] .passage p {
  margin: 0;
  line-height: ${grammarFillRhythm.targets.printPdf.baselineStepPt}pt;
}

/* figure-render cut — SW-2: figures never exceed the passage's own
   content width (already ≤162mm/版心, exam-paper-format-standards §1 —
   page margins already cap it, this is just belt-and-suspenders), and
   never split across a page break (§3b 阅读原子不跨页). */
.print-figure {
  margin: 0.5em 0;
  text-align: center;
  text-indent: 0;
  break-inside: avoid;
}

.print-figure img {
  max-width: 100%;
  height: auto;
}

.print-figure-placeholder {
  text-align: center;
  text-indent: 0;
  color: #555;
  border: 1px dashed #999;
  padding: 0.6em 0;
  margin: 0.5em 0 0.3em;
  break-inside: avoid;
}

.question {
  margin: 0.6em 0;
}

.stem {
  margin: 0 0 0.2em;
  text-indent: 0;
}

.stem--canonical {
  display: grid;
}

.qnum {
  font-weight: bold;
}

.question-group[data-canonical-group-type="reading"] .qnum,
.question-group[data-canonical-group-type="reading"] .canonical-options > span {
  font-weight: ${paperTypographyRuntime.visibleWeight.optionText};
}

.question-group[data-canonical-group-type="cloze"] .qnum,
.question-group[data-canonical-group-type="cloze"] [data-canonical-cloze-rhythm-role="choice_label"],
.question-group[data-canonical-group-type="cloze"] [data-canonical-cloze-rhythm-role="choice_text"] {
  font-weight: ${clozeRhythm.horizontalChoiceGeometry.rendererMapping.visibleWeight};
}

.options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 2em;
  margin: 0.2em 0 0.2em 2em;
}

.options-grid span {
  display: block;
}

.options-list {
  margin: 0.2em 0 0.2em 2em;
}

.options-list p {
  margin: 0.1em 0;
}

.canonical-option-bank {
  list-style: none;
  margin: 0.4em 0 0.6em 2em;
  padding: 0;
}

.canonical-option-bank-item {
  margin: 0.1em 0;
  break-inside: avoid;
}

.canonical-option-bank-region[data-canonical-bank-heading-state] {
  font-size: 10.5pt;
  line-height: ${sevenChoicesRhythm.targets.printPdf.baselineStepPt}pt;
}

.canonical-option-bank-region[data-canonical-bank-heading-state] .canonical-option-bank {
  margin: 0 0 0 ${sevenChoicesRhythm.horizontalBankGeometry.rendererMapping.printPdf.bankInsetEm}em;
}

.canonical-option-bank-region[data-canonical-bank-heading-state="absent"] .canonical-option-bank {
  padding-top: ${sevenChoicesRhythm.targets.printPdf.baselineStepPt}pt;
}

.canonical-option-bank-heading {
  margin: 0 0 0 ${sevenChoicesRhythm.horizontalBankGeometry.rendererMapping.printPdf.bankInsetEm}em;
  line-height: ${sevenChoicesRhythm.targets.printPdf.baselineStepPt}pt;
  break-after: avoid;
}

.canonical-option-bank-item[data-canonical-seven-choices-rhythm-role="bank_option_line"] {
  display: flex;
  align-items: baseline;
  gap: ${sevenChoicesRhythm.horizontalBankGeometry.rendererMapping.printPdf.labelTextGapEm}em;
  margin: 0;
  line-height: ${sevenChoicesRhythm.targets.printPdf.baselineStepPt}pt;
  break-inside: avoid;
}

.canonical-option-bank-label {
  flex: 0 0 auto;
}

.canonical-option-bank-text {
  min-width: 0;
}

.canonical-reading-body,
.canonical-reading-subtitle,
.canonical-reading-title {
  margin: 0;
  font-size: ${readingPassageLetterTypography.fontSizePt}pt;
  line-height: ${readingPassageLetterTypography.lineHeightPt}pt;
}

.canonical-reading-passage-letter {
  margin: ${readingPassageLetterTypography.marginBeforePt}pt 0 ${readingPassageLetterTypography.marginAfterPt}pt;
  padding: 0;
  font-size: ${readingPassageLetterTypography.fontSizePt}pt;
  line-height: ${readingPassageLetterTypography.lineHeightPt}pt;
  font-weight: ${readingPassageLetterTypography.fontWeight};
  text-align: center;
  break-after: avoid;
}

.canonical-reading-body {
  text-indent: ${sectionHeadingRuntime.printPdf.passageFirstLineIndentEm}em;
}

.canonical-reading-subtitle,
.canonical-reading-title {
  font-weight: bold;
}

.canonical-reading-title {
  text-align: center;
}

.canonical-reading {
  container-type: inline-size;
}

.canonical-reading-table {
  width: 100%;
  margin: 0;
  border-collapse: collapse;
  table-layout: fixed;
  break-inside: avoid;
}

.canonical-reading-table td {
  padding: 0 4pt;
  border: 0.5pt solid #000;
  vertical-align: top;
}

.canonical-reading-table-media {
  display: inline-block;
  max-width: 100%;
  max-height: 4em;
  width: min(100%, calc(var(--canonical-media-width-ratio) * 100cqw));
  height: auto;
  object-fit: contain;
  vertical-align: middle;
}

.canonical-reading-table-media[data-canonical-media-alignment="center"],
.canonical-reading-table-media[data-canonical-media-alignment="right"] {
  display: block;
}

.canonical-reading-table-media[data-canonical-media-alignment="center"] {
  margin-inline: auto;
}

.canonical-reading-table-media[data-canonical-media-alignment="right"] {
  margin-left: auto;
}

.canonical-reading-table td[rowspan]:not([rowspan="1"]) .canonical-reading-table-media {
  max-height: 22em;
}

.canonical-reading-figure {
  margin: 0;
  text-align: center;
  break-inside: avoid;
}

.canonical-reading-figure[data-canonical-media-alignment="left"] {
  text-align: left;
}

.canonical-reading-figure[data-canonical-media-alignment="right"] {
  text-align: right;
}

.canonical-reading-figure[data-canonical-media-spacing-before="compact"] {
  margin-top: 3pt;
}

.canonical-reading-figure[data-canonical-media-spacing-before="normal"] {
  margin-top: 6pt;
}

.canonical-reading-figure[data-canonical-media-spacing-after="compact"] {
  margin-bottom: 3pt;
}

.canonical-reading-figure[data-canonical-media-spacing-after="normal"] {
  margin-bottom: 6pt;
}

.canonical-reading-figure img {
  max-width: 100%;
  width: min(100%, calc(var(--canonical-media-width-ratio) * 100cqw));
  height: auto;
}

.canonical-reading-figure figcaption {
  color: #555;
  font-size: 9pt;
}

/* 阅读细线框：共享约定，不为单卷改。权威 exam-paper-format-standards.md §3c */
.canonical-reading-framed-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6pt;
  margin: 6pt 0;
  width: 100%;
  box-sizing: border-box;
  break-inside: avoid;
  page-break-inside: avoid;
}

.canonical-reading-framed-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  box-sizing: border-box;
  padding: 4pt 6pt;
  border: 0.5pt solid #000;
}

.canonical-reading-framed-column .canonical-reading-table {
  width: max-content;
  max-width: 92%;
  margin-top: 7pt;
  margin-bottom: 0;
  align-self: center;
  table-layout: auto;
}

.canonical-reading-framed-column .canonical-reading-table td {
  border: 0;
  padding: 3pt 0;
  line-height: 16pt;
  vertical-align: baseline;
  white-space: nowrap;
}

.canonical-reading-framed-column .canonical-reading-table td:first-child {
  padding-right: 12pt;
}

.canonical-reading-framed-column .canonical-reading-table + .canonical-reading-body {
  margin-top: 9pt;
}

.canonical-reading-column-heading {
  margin: 0 0 4pt;
  font-size: ${readingPassageLetterTypography.fontSizePt}pt;
  line-height: ${readingPassageLetterTypography.lineHeightPt}pt;
  font-weight: bold;
  text-align: center;
  text-indent: 0;
}


.options-inline {
  margin: 0.2em 0 0.2em 2em;
}

.options-inline span {
  margin-right: 2em;
}

.options-inline--numbered .qnum {
  margin-right: 0.6em;
}

.question-group[data-canonical-group-type="cloze"]
  .options-inline--numbered
  .qnum {
  margin-right: 0;
}

.canonical-options {
  display: inline-grid;
  width: 438.2pt;
  vertical-align: top;
}

.question > .canonical-options {
  margin: 0.2em 0 0.2em 2em;
}

.question-group[data-canonical-group-type="reading"] .canonical-reading + .question {
  margin-top: 0;
  padding-top: 18pt;
}

.question-group[data-canonical-group-type="reading"] .question,
.question-group[data-canonical-group-type="reading"] .stem,
.question-group[data-canonical-group-type="reading"] .question > .canonical-options,
.question-group[data-canonical-group-type="reading"] .answer,
.question-group[data-canonical-group-type="reading"] .answer p {
  margin-top: 0;
  margin-bottom: 0;
}

.question-group[data-canonical-group-type="reading"] .answer,
.question-group[data-canonical-group-type="reading"] .question > .canonical-options {
  margin-left: ${abcdLayoutRules.questionStemAndOuterOptionBlockStartTwip / 20}pt;
}

.question-group[data-canonical-group-type="reading"] .answer {
  font-size: 10.5pt;
}

.reading-meta-instruction {
  margin: -5.4pt 0 6.75pt;
  line-height: ${paperSurfaceTokens.paperLineHeight};
  text-indent: ${sectionHeadingRuntime.printPdf.groupInstructionFirstLineIndentEm}em;
  font-weight: ${paperTypographyRuntime.visibleWeight.instruction};
}

.reading-meta-instruction[data-canonical-seven-choices-rhythm-role="meta_instruction"] {
  margin: -6.3pt 0 4.5pt;
}

@media print {
  .reading-meta-instruction[data-canonical-seven-choices-rhythm-role="meta_instruction"] {
    padding-top: 1.5pt;
  }
}

.section-header[data-canonical-reading-following-for] {
  margin-top: 16.875pt;
}

.section-header[data-canonical-seven-choices-following-for] {
  margin-top: ${sevenChoicesRhythm.targets.printPdf.baselineStepPt}pt;
}

.question-group[data-canonical-group-type="sevenChoices"] .question,
.question-group[data-canonical-group-type="sevenChoices"] .answer,
.question-group[data-canonical-group-type="sevenChoices"] .answer p {
  margin-top: 0;
  margin-bottom: 0;
}

.question-group[data-canonical-group-type="sevenChoices"] .answer {
  margin-left: 21pt;
  font-size: 10.5pt;
  line-height: ${sevenChoicesRhythm.targets.printPdf.baselineStepPt}pt;
}

.question-group[data-canonical-group-type="cloze"] .passage + .question {
  padding-top: ${clozeRhythm.targets.printPdf.baselineStepPt}pt;
}

.question-group[data-canonical-group-type="cloze"] .question,
.question-group[data-canonical-group-type="cloze"] .options-inline,
.question-group[data-canonical-group-type="cloze"] .answer,
.question-group[data-canonical-group-type="cloze"] .answer p {
  margin-top: 0;
  margin-bottom: 0;
  line-height: ${clozeRhythm.targets.printPdf.baselineStepPt}pt;
}

.question-group[data-canonical-group-type="cloze"] .answer {
  margin-left: ${clozeRhythm.horizontalChoiceGeometry.rendererMapping.questionLabelWidthPt}pt;
  font-size: 10.5pt;
}

.question-group[data-canonical-group-type="cloze"] .canonical-options > span {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: ${clozeRhythm.horizontalChoiceGeometry.rendererMapping.labelToTextGapEm}em;
  align-items: baseline;
  margin-right: 0;
  white-space: normal;
  break-inside: avoid;
}

.question-group[data-canonical-group-type="cloze"] [data-canonical-cloze-rhythm-role="choice_label"],
.question-group[data-canonical-group-type="cloze"] [data-canonical-cloze-rhythm-role="choice_text"] {
  min-width: 0;
  margin-right: 0;
}

.question-group[data-canonical-group-type="cloze"] [data-canonical-cloze-rhythm-role="choice_label"] {
  white-space: nowrap;
}

.question-group[data-canonical-group-type="grammarFill"] .question,
.question-group[data-canonical-group-type="grammarFill"] .answer,
.question-group[data-canonical-group-type="grammarFill"] .answer p {
  margin: 0;
  line-height: ${grammarFillRhythm.targets.printPdf.baselineStepPt}pt;
}

.question-group[data-canonical-group-type="grammarFill"] .answer {
  font-size: 10.5pt;
}

.options-inline--canonical {
  display: grid;
  grid-template-columns: 21pt 438.2pt;
  margin-left: 0;
  width: 459.2pt;
}

.question-group[data-canonical-group-type="cloze"] .options-inline--canonical {
  grid-template-columns:
    ${clozeRhythm.horizontalChoiceGeometry.rendererMapping.questionLabelWidthPt}pt
    ${clozeRhythm.horizontalChoiceGeometry.rendererMapping.rowWidthPt - clozeRhythm.horizontalChoiceGeometry.rendererMapping.questionLabelWidthPt}pt;
  width: ${clozeRhythm.horizontalChoiceGeometry.rendererMapping.rowWidthPt}pt;
}

.options-inline--canonical > .canonical-options {
  margin-right: 0;
}

.canonical-options--four_columns {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  white-space: nowrap;
}

.canonical-options--two_by_two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  white-space: nowrap;
}

.canonical-options--one_column {
  grid-template-columns: 1fr;
}

.canonical-options--one_column > span {
  display: block;
}

/* standard §3b 分页纪律(owner 2026-07-08):段落可跨页;单个小题不拆;
   标题不落页尾;写作框整框不拆。 */
.question {
  break-inside: avoid;
}

.question[data-canonical-reading-last-question-for] {
  break-after: avoid;
}

.section-header,
.group-meta,
.group-header {
  break-after: avoid;
}

.answer {
  margin: 0.2em 0 0.2em 2em;
  font-size: 9.5pt;
  color: #333;
}

.answer p {
  margin: 0.1em 0;
}

.explanation {
  color: #555;
}

/* standard §6 — 挖空: 定长下划线 + 题号居中于线上, 线不得跨行断开.
   七选五 ≈4.6em (10.5pt 下 ≈48pt/17mm); 完形/语法填空 ≈3.3em (≈35pt/12mm). */
.print-blank-unit {
  white-space: ${sharedInlineBlankRuling.whiteSpace};
}

.print-blank-unit[data-canonical-grammar-fill-unit] {
  display: inline-grid;
  grid-template-columns: ${activeGrammarFillRhythm.blankGeometry.widthEm}em max-content;
  column-gap: ${activeGrammarFillRhythm.promptGeometry.gapEm}em;
  align-items: baseline;
  break-inside: avoid;
  text-align: left;
  text-indent: 0;
  vertical-align: baseline;
}

.print-blank-unit[data-canonical-grammar-fill-unit] > :where(.print-blank) {
  margin-left: 0;
  margin-right: 0;
}

.print-blank-unit[data-canonical-grammar-fill-unit] > :where(.print-blank-hint) {
  display: block;
  justify-self: start;
  margin-left: 0;
  text-align: left;
  text-indent: 0;
}

.print-blank {
  display: inline-block;
  white-space: ${sharedInlineBlankRuling.whiteSpace};
  background: ${cssBackgroundForBlankRuling(sharedInlineBlankRuling)};
  text-align: ${sharedInlineBlankRuling.numberAlignment};
  line-height: 1.05;
  vertical-align: baseline;
  margin: 0 0.15em;
  /* inline-block 会继承段落首行缩进并作用于自身首行，把题号推出横线（owner QA 实测撞字），必须归零 */
  text-indent: 0;
}

.print-blank--short { width: ${clozeRhythm.blankGeometry.widthEm}em; }
.print-blank--seven { width: ${paperBlankRuling.sevenChoices.width}; }

.print-blank-num {
  display: inline-block;
  line-height: 1.05;
}

${grammarFillGeometryFixtureCss}

/* standard §8 — 写作答题区: 应用文/读后续写各一个细边框素框, 框内无横线/提示行.
   writing-box-starters (owner 拍板 2026-07-16): 读后续写框内印两句段首语,
   各在自己段落的起笔位置(第一句贴框顶内衬, 第二句在框高 50% 处), position:
   relative 承载子行的 absolute 定位; 应用文框维持空框(无 starter 子元素时
   与刀前字节一致)。 */
.writing-answer-box {
  --writing-box-rule: 0.5pt;
  border: 0;
  background:
    linear-gradient(#000, #000) top / 100% var(--writing-box-rule) no-repeat,
    linear-gradient(#000, #000) bottom / 100% var(--writing-box-rule) no-repeat,
    linear-gradient(#000, #000) left / var(--writing-box-rule) 100% no-repeat,
    linear-gradient(#000, #000) right / var(--writing-box-rule) 100% no-repeat;
  margin: 1em auto 0;
  position: relative;
}

.canonical-application-response {
  --writing-box-rule: ${applicationWritingRhythm.responseGeometry.printBorderPt}pt;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: ${applicationWritingRhythm.responseGeometry.paddingMm}mm;
  margin-top: ${applicationWritingRhythm.rendererMapping.printPdf.responseMarginTopPt}pt;
  break-inside: avoid;
  page-break-inside: avoid;
}

[data-canonical-writing-chrome-role] {
  font-size: 10.5pt;
  line-height: ${paperSurfaceTokens.paperLineHeight};
  break-after: avoid;
}

[data-canonical-writing-chrome-role="part_heading"] {
  margin: 0;
  font-family: ${paperSurfaceTokens.paperFontStackWritingPart};
  font-weight: 700;
}

[data-canonical-writing-chrome-role="part_heading"]
  + [data-canonical-writing-chrome-role="section_heading"] {
  margin-top: ${partToFirstSectionMarginTopPt()}pt;
}

[data-canonical-writing-chrome-role="section_heading"] {
  margin: 0 0 9pt;
  margin-left: ${sectionHeadingRuntime.printPdf.sectionHeadingIndentEm}em;
  font-family: ${sectionHeadingRuntime.printPdf.fontStack};
  font-size: ${sectionHeadingRuntime.printPdf.fontSizePt}pt;
  line-height: ${sectionHeadingRuntime.printPdf.lineHeightPt}pt;
  font-weight: ${paperTypographyRuntime.visibleWeight.sectionHeading};
  white-space: nowrap;
}

[data-canonical-writing-chrome-role="part_heading"]
  + [data-canonical-writing-chrome-role="section_heading"] {
  margin-top: ${partToFirstSectionMarginTopPt()}pt;
}

@media print {
  .section-header[data-canonical-part-first-section],
  [data-canonical-writing-chrome-role="section_heading"][
    data-canonical-part-first-section
  ] {
    margin-top: ${partToFirstSectionMarginTopPt({ printPdf: true })}pt;
  }
}

[data-canonical-writing-chrome-role="instruction"] {
  margin: 0 0 9pt;
  white-space: pre-line;
  text-indent: ${sectionHeadingRuntime.printPdf.groupInstructionFirstLineIndentEm}em;
  font-weight: ${paperTypographyRuntime.visibleWeight.instruction};
}

.canonical-continuation-response {
  box-sizing: border-box;
  width: ${continuationWritingRhythm.responseGeometry.widthMm}mm;
  height: ${continuationWritingRhythm.responseGeometry.heightMm}mm;
  --writing-box-rule: ${continuationWritingRhythm.responseGeometry.printBorderPt}pt;
  margin-top: ${continuationWritingRhythm.rendererMapping.printPdf.responseMarginTopPt}pt;
  padding: ${continuationWritingRhythm.rendererMapping.printPdf.responsePaddingPt}pt;
  position: relative;
}

.canonical-application-given p,
.canonical-application-given {
  margin: 0;
}

.canonical-application-given[data-canonical-given-role="title"] {
  text-align: center;
}

.canonical-application-given-bottom {
  margin-top: auto;
  text-align: right;
}

.canonical-application-prompt p[data-canonical-application-notice] {
  margin-top: ${applicationWritingRhythm.rendererMapping.printPdf.noticeMarginTopPt}pt;
  text-align: left;
  text-indent: 0;
}

.canonical-application-notice-line {
  display: block;
  width: fit-content;
}

.canonical-application-notice-line--instruction {
  margin-left: 2em;
}

.canonical-application-prompt p {
  margin-bottom: ${applicationWritingRhythm.rendererMapping.printPdf.promptParagraphGapPt}pt;
}

.canonical-application-prompt {
  margin-top: ${applicationWritingRhythm.rendererMapping.printPdf.sectionToPromptGapPt}pt;
}

.canonical-application-instruction--part_heading,
.canonical-application-instruction--section_heading {
  margin-bottom: ${applicationWritingRhythm.rendererMapping.printPdf.pageBlockGapPt}pt;
}

.canonical-application-instruction--part_heading[data-canonical-grammar-fill-following-for] {
  margin-top: ${grammarFillRhythm.rendererMapping.printPdf.followingSectionMarginTopPt}pt;
}

.canonical-continuation-chrome {
  break-inside: avoid;
  page-break-inside: avoid;
}

.canonical-continuation-instruction--section_heading {
  margin-bottom: ${continuationWritingRhythm.rendererMapping.printPdf.sectionToInstructionGapPt}pt;
}

.canonical-continuation-instruction--instruction {
  margin-bottom: 0;
}

.canonical-continuation-material {
  margin-top: ${continuationWritingRhythm.rendererMapping.printPdf.instructionToMaterialGapPt}pt;
}

${isTeacher ? `
.question-group[data-canonical-group-type="continuation"] {
  break-before: page;
}
` : ''}

.writing-starter-line {
  margin: 0 ${continuationWritingRhythm.starterGeometry.trailingInsetEm}em 0 ${continuationWritingRhythm.starterGeometry.firstLineIndentEm}em;
  overflow-wrap: anywhere;
  text-indent: 0;
}

.canonical-continuation-response {
  display: grid;
  grid-template-rows: ${continuationWritingRhythm.starterGeometry.secondRowStartRatio * 100}% minmax(0, 1fr);
}

.writing-continuation-row {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding-top: ${continuationWritingRhythm.starterGeometry.rowTopInsetEm}em;
  box-sizing: border-box;
}

.writing-continuation-writable-area {
  display: block;
  min-height: 0;
  flex: 1;
}

/* Exam density: tighter */
.exam .passage p { margin-bottom: 0.2em; }
.exam .question { margin: 0.4em 0; }
.exam .group-meta { display: none; }

/* Handout density: more spacing */
.handout .passage p { margin-bottom: 0.4em; }
.handout .question { margin: 0.8em 0; }

.exam .question-group[data-canonical-group-type="reading"] .question,
.handout .question-group[data-canonical-group-type="reading"] .question {
  margin: 0;
}

.exam .question-group[data-canonical-group-type="reading"] .canonical-reading + .question,
.handout .question-group[data-canonical-group-type="reading"] .canonical-reading + .question {
  margin-top: 0;
}
</style>
</head>
<body class="${densityClass}">
${canonicalWritingChromeOwnsDocument ? '' : `
<div class="paper-header">
  <h1>${escapeHtml(title || '英语试题')}</h1>
  ${versionLabel ? `<p class="version-label">${escapeHtml(versionLabel)}</p>` : ''}
</div>`}
${sections.join('\n')}
</body>
</html>`
}
