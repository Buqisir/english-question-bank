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
 */

import { paperSurfaceTokens } from '../shared/papersurface/tokens.mjs'
import { paperBlankPattern } from '../shared/papersurface/blankPattern.mjs'

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
 */
function renderPassageLineWithBlanks(line, groupType) {
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
    out += `<span class="print-blank ${blankWidthClass}"><span class="print-blank-num">${escapeHtml(match[1])}</span></span>`
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

function renderWritingAnswerBox(detail) {
  const continuation = isContinuationWriting(detail)
  const widthMm = continuation ? 145 : 144
  const heightMm = continuation ? 57 : 65
  return `<div class="writing-answer-box" style="width:${widthMm}mm;height:${heightMm}mm;"></div>`
}

export function buildPrintHtml({ title, versionType, printStyle, items, blocks, questionNumberStart }) {
  const startNum = Number.isInteger(questionNumberStart) && questionNumberStart >= 1 ? questionNumberStart : 1
  const isExam = printStyle === 'exam'
  const isTeacher = versionType === 'teacher'
  const itemByGroupId = new Map(items.map((item) => [item.detail.id, item]))

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
    for (const block of blocks) {
      if (block.type === 'section_header' && block.title) {
        sections.push(`<h2 class="section-header">${escapeHtml(block.title)}</h2>`)
      } else if (block.type === 'page_break') {
        sections.push('<div class="page-break"></div>')
      } else if (block.type === 'question_group' && block.questionGroupId) {
        const item = itemByGroupId.get(block.questionGroupId)
        if (!item) continue
        const { detail } = item
        const score = Number.isFinite(Number(block.score)) ? Number(block.score) : item.score
        const passage = (detail.passage.materialText || detail.passage.summary || '').trim()

        let groupHtml = '<section class="question-group">'

        if (!isExam) {
          groupHtml += `<div class="group-meta"><strong>${escapeHtml(detail.title)}</strong> · ${groupTypeLabels[detail.groupType] || detail.groupType} · 每题 ${score} 分</div>`
        }

        if (passage) {
          groupHtml += `<div class="passage">${passage.split(/\n/).map((line) => `<p>${renderPassageLineWithBlanks(line, detail.groupType)}</p>`).join('')}</div>`
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
    // Legacy: render by items
    let questionNum = startNum
    for (const item of items) {
      const { detail } = item
      const passage = (detail.passage.materialText || detail.passage.summary || '').trim()
      let groupHtml = '<section class="question-group">'
      if (passage) {
        groupHtml += `<div class="passage">${passage.split(/\n/).map((line) => `<p>${renderPassageLineWithBlanks(line, detail.groupType)}</p>`).join('')}</div>`
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
  font-size: 18pt;
  font-weight: bold;
  margin: 0 0 0.3em;
}

.paper-header .version-label {
  font-size: 11pt;
  color: #555;
}

.section-header {
  font-family: ${paperSurfaceTokens.paperFontStackHeading};
  font-size: 12pt;
  font-weight: bold;
  margin: 1.2em 0 0.6em;
  text-indent: 0;
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

.passage {
  margin: 0.5em 0;
  text-indent: 2em;
}

.passage p {
  margin: 0 0 0.3em;
  text-indent: 2em;
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

/* standard §8 — 写作答题区: 应用文/读后续写各一个细边框素框, 框内无横线/提示行. */
.writing-answer-box {
  border: 0.48pt solid #000;
  margin: 1em auto 0;
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
