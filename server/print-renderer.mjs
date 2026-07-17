/**
 * Print Renderer — generates semantic HTML + CSS for Vivliostyle PDF.
 * Input: same shape as exportDocx (title, versionType, printStyle, items, blocks, questionNumberStart).
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
 * `paperAssetSurfaceAdapter.ts` and `docxRenderer.mjs` enforce, so the three
 * surfaces can never drift on which unit counts as "this line IS a figure".
 *
 * heading-fidelity cut (刀⑤ SW-B 销账, docs/cuts/heading-fidelity/plan.md):
 * `.section-header` 拆 part/section 两态 (headingKind.mjs 单源判定, shared
 * with docxRenderer.mjs) — 10.5pt 一律不放大, 部标题黑体加粗顶格 / 节标题
 * 宋体常规缩进 2 字符; h1 卷名 → 20pt (标准唯一放大项).
 */

import path from 'node:path'
import { paperSurfaceTokens } from '../shared/papersurface/tokens.mjs'
import { paperBlankPattern } from '../shared/papersurface/blankPattern.mjs'
import { headingKind } from '../shared/papersurface/headingKind.mjs'
import { resolveFigureMarker } from '../shared/figures/resolveFigureMarker.mjs'
import { resolveGroupFigures } from './figures/paperFigures.mjs'

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
 * Renders ONE passage line (print/docx grain is line, `\n`-split — plan.md
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
  // `images` is an OUT-PARAMETER (like docxRenderer.mjs's identically-
  // named param) populated ONLY in imageMode:'file' — the caller must
  // copy each entry's file into the SAME directory as the written HTML
  // before invoking Vivliostyle (same-directory file:// resource loading
  // is unrestricted; cross-directory is not — see figureImageSrc's doc
  // comment for the browser-QA finding that drove this design).
  paperAssetsDir = null,
  imageMode = 'web',
  images = [],
}) {
  // draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判): small-question
  // numbering in the `blocks`-array path is WHOLE-PAPER continuous again
  // (round-1's per-group reset to `(1)` is retired — owner QA verdict B).
  // `startNum` seeds it, same as pre-round1 draft-depassage-letter form.
  const startNum = Number.isInteger(questionNumberStart) && questionNumberStart >= 1 ? questionNumberStart : 1
  const isExam = printStyle === 'exam'
  const isTeacher = versionType === 'teacher'
  const itemByGroupId = new Map(items.map((item) => [item.detail.id, item]))

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
    for (const block of blocks) {
      if (block.type === 'section_header' && block.title) {
        // heading-fidelity cut (Locked Decision 1/2): 部/节判定单源 —
        // 部标题(第X部分…)黑体加粗顶格, 节标题(第X节…)宋体常规缩进 2 字符.
        // 层级靠字重与缩进区分, 两态共用 10.5pt (标准 §2/§4 一律不放大字号).
        const kind = headingKind(block.title)
        sections.push(`<h2 class="section-header section-header--${kind}">${escapeHtml(block.title)}</h2>`)
      } else if (block.type === 'page_break') {
        sections.push('<div class="page-break"></div>')
      } else if (block.type === 'question_group' && block.questionGroupId) {
        const item = itemByGroupId.get(block.questionGroupId)
        if (!item) continue
        const { detail } = item
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

        let groupHtml = '<section class="question-group">'

        groupHtml += `<div class="group-header">${chineseNumeral(groupNum)}、${escapeHtml(groupHeaderLabel)}${escapeHtml(groupHeaderScoreSuffix)}</div>`

        if (!isExam) {
          groupHtml += `<div class="group-meta"><strong>${escapeHtml(detail.title)}</strong> · ${groupTypeLabels[detail.groupType] || detail.groupType} · 每题 ${score} 分</div>`
        }

        // draft-numbering-style v2 (owner 拍板 2026-07-10 二轮改判):
        // small-question numbering is whole-paper continuous (`questionNum`,
        // declared outside this per-group block, never reset). `blankCounter`
        // is seeded to THIS group's first continuous number so every in-text
        // blank marker found in the passage below gets the SAME number as
        // the corresponding small-question list entry — see
        // `renderPassageLineWithBlanks`'s doc comment.
        const blankCounter = { next: questionNum }

        if (passage) {
          const figuresInfo = getFiguresInfo(block.questionGroupId)
          groupHtml += `<div class="passage">${passage.split(/\n/).map((line) => renderPassageLine(line, detail.groupType, figuresInfo, imageMode, images, blankCounter)).join('')}</div>`
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
        if (BLANK_BEARING_GROUP_TYPES.has(detail.groupType)) {
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

        if (isWritingGroupType(detail.groupType)) {
          groupHtml += renderWritingAnswerBox(detail)
        }

        for (const question of detail.questions) {
          const stemText = String(question.stem || '').trim()
          const hasOptions = Array.isArray(question.options) && question.options.length > 0
          // 空题干:挖空题号已在文中(语法填空/完形/七选五)。有选项则题号与选项同行
          // (真卷完形形态);无选项且非教师版则整行不出(语法填空文后无内容)。
          if (!stemText && !hasOptions && !isTeacher) {
            questionNum += 1
            continue
          }
          if (!stemText && hasOptions) {
            // 真卷完形形态:题号与选项同一行「41. A. xxx B. xxx C. xxx D. xxx」
            groupHtml += `<div class="question"><p class="options-inline options-inline--numbered"><span class="qnum">${questionNum}.</span>${question.options.map((o) => `<span>${escapeHtml(o.label)}. ${escapeHtml(o.content)}</span>`).join('')}</p>`
          } else {
            groupHtml += `<div class="question"><p class="stem"><span class="qnum">${questionNum}.</span> ${escapeHtml(question.stem)}</p>`
            groupHtml += renderOptions(question.options, detail.groupType)
          }
          if (isTeacher) {
            groupHtml += `<div class="answer"><p><strong>【答案】</strong>${escapeHtml(question.answer || '待补')}</p>`
            const rawExplanation = question.explanation || question.note || ''
            const explanation = isMetaStub(rawExplanation) ? '' : rawExplanation
            if (explanation) {
              groupHtml += `<p class="explanation"><strong>【解析】</strong>${escapeHtml(explanation)}</p>`
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
    // buildDocxPayload/buildPdfPayload) always sends a non-empty `blocks`
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
   Bottom margin is 24mm (not standard-mandated directly) so the §1 footer
   distance (页码距底 ≈17.5mm) falls out of an exact, documented sum:
   24mm margin-bottom - 6.5mm @bottom-center padding-bottom = 17.5mm. */
@page {
  size: A4;
  margin: 21mm 24mm 24mm 24mm;

  @bottom-center {
    content: "英语试题 第" counter(page) "页(共" counter(pages) "页)";
    font-family: ${paperSurfaceTokens.paperFontStack};
    font-size: 9pt;
    color: #000;
    vertical-align: bottom;
    padding-bottom: 6.5mm;
  }
}

body {
  font-family: ${paperSurfaceTokens.paperFontStack};
  font-size: 10.5pt;
  /* standard §3: line-height is a FIXED 18pt baseline — same
     paperLineHeight token the screen PaperSurface / writing page consume
     (Chunk A), ≈1.714 at 10.5pt body text. */
  line-height: ${paperSurfaceTokens.paperLineHeight};
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
  font-size: 10.5pt;
  margin: 1.2em 0 0.6em;
}

.section-header--part {
  font-family: ${paperSurfaceTokens.paperFontStackHeading};
  font-weight: bold;
  text-indent: 0;
  padding-left: 0;
}

.section-header--section {
  font-family: ${paperSurfaceTokens.paperFontStackZh};
  font-weight: normal;
  text-indent: 0;
  /* 标准 §4: 节标题缩进 2 字符 (10.5pt 下 1 字符 ≈ 10.5pt → 21pt). */
  padding-left: 21pt;
}

.page-break {
  break-before: page;
}

.question-group {
  margin-bottom: 1em;
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

.passage {
  margin: 0.5em 0;
  text-indent: 2em;
}

.passage p {
  margin: 0 0 0.3em;
  text-indent: 2em;
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

.qnum {
  font-weight: bold;
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

.options-inline {
  margin: 0.2em 0 0.2em 2em;
}

.options-inline span {
  margin-right: 2em;
}

.options-inline--numbered .qnum {
  margin-right: 0.6em;
}

/* standard §3b 分页纪律(owner 2026-07-08):段落可跨页;单个小题不拆;
   标题不落页尾;写作框整框不拆。 */
.question {
  break-inside: avoid;
}

.section-header,
.group-meta,
.group-header {
  break-after: avoid;
}

.writing-answer-box {
  break-inside: avoid;
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
.print-blank {
  display: inline-block;
  white-space: nowrap;
  border-bottom: 0.48pt solid #000;
  text-align: center;
  vertical-align: baseline;
  margin: 0 0.15em;
  /* inline-block 会继承段落首行缩进并作用于自身首行，把题号推出横线（owner QA 实测撞字），必须归零 */
  text-indent: 0;
}

.print-blank--short { width: 3.3em; }
.print-blank--seven { width: 4.6em; }

.print-blank-num {
  display: inline-block;
}

/* standard §8 — 写作答题区: 应用文/读后续写各一个细边框素框, 框内无横线/提示行.
   writing-box-starters (owner 拍板 2026-07-16): 读后续写框内印两句段首语,
   各在自己段落的起笔位置(第一句贴框顶内衬, 第二句在框高 50% 处), position:
   relative 承载子行的 absolute 定位; 应用文框维持空框(无 starter 子元素时
   与刀前字节一致)。 */
.writing-answer-box {
  border: 0.48pt solid #000;
  margin: 1em auto 0;
  position: relative;
}

.writing-starter-line {
  position: absolute;
  left: 3mm;
  right: 3mm;
  margin: 0;
}

.writing-starter-line--1 {
  top: 1mm;
}

.writing-starter-line--2 {
  top: 50%;
}

/* Exam density: tighter */
.exam .passage p { margin-bottom: 0.2em; }
.exam .question { margin: 0.4em 0; }
.exam .group-meta { display: none; }

/* Handout density: more spacing */
.handout .passage p { margin-bottom: 0.4em; }
.handout .question { margin: 0.8em 0; }
</style>
</head>
<body class="${densityClass}">
<div class="paper-header">
  <h1>${escapeHtml(title || '英语试题')}</h1>
  ${versionLabel ? `<p class="version-label">${escapeHtml(versionLabel)}</p>` : ''}
</div>
${sections.join('\n')}
</body>
</html>`
}
