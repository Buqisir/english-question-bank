// DOCX OOXML renderer: builds WordprocessingML document.xml for question-set exports,
// packages it into a .docx zip, and converts to PDF via LibreOffice (soffice).
// Extracted VERBATIM (indent 0, no re-indent) out of server/api.mjs
// (cut H5-G, refactor-roadmap-2026-06). USER-VISIBLE: every WordprocessingML string
// literal is byte-sensitive and must stay byte-for-byte identical — the produced
// .docx/.pdf bytes are part of the contract.
//
// Two free identifiers are INJECTED via createDocxRenderer({ groupTypeLabels, optionalString })
// under the SAME name (stored on module-level `let` bindings the moved bodies close over),
// so the moved code is byte-identical to api.mjs. Everything else (node:fs / node:os /
// node:path / node:child_process, plus the zip + soffice shell-outs) is imported DIRECTLY
// here. The module does NOT import api.mjs (no cycle). timestampPrefix STAYS in api.mjs —
// it is not part of docx rendering; the docx code never calls it.
//
// The factory returns the 3 entry fns api.mjs re-injects into createExportImplementation:
// buildDocumentXml / writeDocxPackage / convertDocxToPdf. The other 23 docx helpers +
// readingDistractorTypeLabel stay file-private.

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let groupTypeLabels
let optionalString

export function createDocxRenderer(deps = {}) {
  if (!deps.groupTypeLabels || typeof deps.groupTypeLabels !== 'object') {
    throw new Error('groupTypeLabels is required')
  }
  if (typeof deps.optionalString !== 'function') {
    throw new Error('optionalString is required')
  }

  groupTypeLabels = deps.groupTypeLabels
  optionalString = deps.optionalString

  return { buildDocumentXml, writeDocxPackage, convertDocxToPdf }
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function run(text, options = {}) {
  const runProperties = [
    options.bold ? '<w:b/>' : '',
    options.italic ? '<w:i/>' : '',
    options.size ? `<w:sz w:val="${options.size}"/>` : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
  ].join('')
  const textParts = String(text ?? '').split('\n')
  const textXml = textParts
    .map((part, index) => `${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(part)}</w:t>`)
    .join('')

  return `<w:r>${runProperties ? `<w:rPr>${runProperties}</w:rPr>` : ''}${textXml}</w:r>`
}

function paragraph(content = '', options = {}) {
  const children = Array.isArray(content) ? content.join('') : run(content)
  const properties = [
    options.align ? `<w:jc w:val="${options.align}"/>` : '',
    options.before || options.after
      ? `<w:spacing${options.before ? ` w:before="${options.before}"` : ''}${options.after ? ` w:after="${options.after}"` : ''}/>`
      : '',
    options.indentLeft ? `<w:ind w:left="${options.indentLeft}"/>` : '',
    options.keepNext ? '<w:keepNext/>' : '',
    options.shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.shading}"/>` : '',
  ].join('')

  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${children}</w:p>`
}

function docxSimpleTable(rows, { colWidths = [], headerShading = 'E5E7EB', bodyShading = 'F9FAFB' } = {}) {
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map((r) => r.length))
  const widths = colWidths.length === colCount ? colWidths : Array(colCount).fill(Math.floor(9000 / colCount))

  const tablePr = [
    '<w:tblW w:w="5000" w:type="pct"/>',
    '<w:tblBorders>',
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>',
    '</w:tblBorders>',
  ].join('')

  const rowXml = rows.map((cells, rowIndex) => {
    const shading = rowIndex === 0 ? headerShading : bodyShading
    const cellsXml = cells.map((cell, colIndex) => {
      const width = widths[colIndex] || 2400
      const content = typeof cell === 'string'
        ? paragraph(cell, { after: 40 })
        : Array.isArray(cell)
          ? paragraph(cell, { after: 40 })
          : `<w:p>${cell}</w:p>`
      return `<w:tc>
        <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${shading}"/></w:tcPr>
        ${content}
      </w:tc>`
    }).join('')
    return `<w:tr>${cellsXml}</w:tr>`
  }).join('')

  return `<w:tbl><w:tblPr>${tablePr}</w:tblPr>${rowXml}</w:tbl>`
}

function normalizeDocxLines(text) {
  const value = String(text || '').replace(/\r\n?/g, '\n').trim()
  if (!value) return []
  return value.split('\n').map((line) => stripTrailingSpaces(line)).filter(Boolean)
}

function stripTrailingSpaces(line) {
  return line.replace(/[^\S\u3000]+$/, '').replace(/^[^\S\u3000]+/, '')
}

function docxQuestionStem(detail, question) {
  const questionNo = String(question.questionNo || '').trim()

  if (detail.groupType === 'seven_choices' || detail.groupType === 'grammar_cloze') {
    return questionNo ? `第 ${questionNo} 空` : '空'
  }

  if (detail.groupType === 'cloze') {
    return question.stem || (questionNo ? `第 ${questionNo} 空` : '完形填空')
  }

  return question.stem || (questionNo ? `第 ${questionNo} 题` : '题目')
}

function uniqueDocxOptions(questions) {
  const seen = new Set()
  const options = []

  questions.forEach((question) => {
    question.options.forEach((option) => {
      const label = String(option.label || '').trim()
      const content = String(option.content || '').trim()
      const key = `${label}::${content}`

      if ((!label && !content) || seen.has(key)) return
      seen.add(key)
      options.push(option)
    })
  })

  return options.sort((a, b) => {
    const orderDelta = Number(a.displayOrder || 0) - Number(b.displayOrder || 0)
    if (orderDelta !== 0) return orderDelta
    return String(a.label || '').localeCompare(String(b.label || ''), 'en', { numeric: true })
  })
}

function findSavedReadingParseQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedQuestions = Array.isArray(detail.readingParseResult?.questions)
    ? detail.readingParseResult.questions
    : []

  return savedQuestions.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

function findSavedReadingVerifyQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedResults = Array.isArray(detail.readingVerifyResult?.results)
    ? detail.readingVerifyResult.results
    : []

  return savedResults.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

function findSavedGrammarParseQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedQuestions = Array.isArray(detail.grammarParseResult?.questions)
    ? detail.grammarParseResult.questions
    : []

  return savedQuestions.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

function findSavedClozeParseQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedQuestions = Array.isArray(detail.clozeParseResult?.questions)
    ? detail.clozeParseResult.questions
    : []

  return savedQuestions.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

function findSavedSevenChoicesParseQuestion(detail, question) {
  const questionNo = String(question.questionNo || '').trim()
  if (!questionNo) return null

  const savedQuestions = Array.isArray(detail.sevenChoicesParseResult?.questions)
    ? detail.sevenChoicesParseResult.questions
    : []

  return savedQuestions.find((item) => String(item.questionNo || '').trim() === questionNo) || null
}

const docxVerifyVerdictLabels = {
  correct: '录入答案正确',
  answer_wrong: '录入答案错误',
  explanation_wrong: '解析需复核',
  both_wrong: '答案与解析均需复核',
  uncertain: '状态不确定',
  skipped: '已跳过',
}

function docxVerifyStatusLabel(verifyItem) {
  if (!verifyItem) return '状态未保存'
  return docxVerifyVerdictLabels[verifyItem.verdict] || '状态不确定'
}

function docxQuestionExplanation(detail, question) {
  const savedAiParse = detail.groupType === 'reading'
    ? findSavedReadingParseQuestion(detail, question)
    : detail.groupType === 'cloze'
      ? findSavedClozeParseQuestion(detail, question)
    : detail.groupType === 'seven_choices'
      ? findSavedSevenChoicesParseQuestion(detail, question)
    : detail.groupType === 'grammar_cloze'
      ? findSavedGrammarParseQuestion(detail, question)
    : null
  const savedAiExplanation = optionalString(savedAiParse?.explanation || savedAiParse?.analysis)
  if (savedAiExplanation) return savedAiExplanation

  return optionalString(question.explanation) || '待补'
}

function pushDocxLabelParagraph(body, label, text, options = {}) {
  const value = optionalString(text)
  if (!value) return

  body.push(
    paragraph(
      [
        run(`${label}：`, { bold: true }),
        run(value),
      ],
      options,
    ),
  )
}

function pushDocxReadingAnalysis(body, detail, question) {
  const savedAiParse = findSavedReadingParseQuestion(detail, question)
  if (!savedAiParse) {
    body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
    return
  }

  const verifyItem = findSavedReadingVerifyQuestion(detail, question)
  const isCorrect = verifyItem?.verdict === 'correct'
  const statusColor = isCorrect ? '065F46' : '92400E'
  const statusBg = isCorrect ? 'D1FAE5' : 'FEF3C7'
  const statusIcon = isCorrect ? '\u2713' : '\u26A0'
  const statusText = isCorrect ? '答案确认正确' : docxVerifyStatusLabel(verifyItem)

  body.push(
    paragraph(
      [
        run(`${statusIcon} `, { bold: true, size: 22, color: statusColor }),
        run(statusText, { bold: true, size: 21, color: statusColor }),
      ],
      { before: 20, after: 80, shading: statusBg, indentLeft: 120 },
    ),
  )

  pushDocxLabelParagraph(body, '题目翻译', savedAiParse.questionTranslation, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '题型策略', savedAiParse.strategy, { after: 50, shading: 'F8FAFC' })

  const locationText = [
    optionalString(savedAiParse.locationSentence),
    optionalString(savedAiParse.locationSentenceTranslation),
  ].filter(Boolean).join('\n')
  pushDocxLabelParagraph(body, '定位句', locationText, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '答案句', savedAiParse.answerSentence, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, 'AI 解析', savedAiParse.explanation || '待补', { after: 70, shading: 'F8FAFC' })

  const synonymMappings = Array.isArray(savedAiParse.synonymMappings) ? savedAiParse.synonymMappings : []
  if (synonymMappings.length > 0) {
    body.push(paragraph([run('同义替换', { bold: true, size: 21, color: '1D4ED8' })], { before: 60, after: 50, shading: 'DBEAFE', keepNext: true }))
    const tableRows = [
      [[run('原文表达', { bold: true, size: 19 })], [run('同义替换', { bold: true, size: 19 })]],
      ...synonymMappings.map((m) => [optionalString(m.text), optionalString(m.replacement)]),
    ]
    body.push(docxSimpleTable(tableRows, { colWidths: [4500, 4500] }))
    body.push(paragraph('', { after: 40 }))
  }

  const distractorAnalysis = Array.isArray(savedAiParse.distractorAnalysis) ? savedAiParse.distractorAnalysis : []
  if (distractorAnalysis.length > 0) {
    body.push(paragraph([run('选项分析', { bold: true, size: 21 })], { before: 60, after: 50, keepNext: true }))
    distractorAnalysis.forEach((item) => {
      const option = optionalString(item.option)
      const type = optionalString(item.type)
      const reason = optionalString(item.reason)
      const label = [option, type ? `（${readingDistractorTypeLabel(type)}）` : ''].filter(Boolean).join(' ')
      body.push(
        paragraph(
          [
            run(`${label || '\u00A0'}  `, { bold: true, size: 20, color: type === '0' ? '047857' : 'B91C1C' }),
            run(reason || type || '待补'),
          ],
          { after: 35, indentLeft: 240, shading: type === '0' ? 'ECFDF5' : 'FFF7ED' },
        ),
      )
    })
  }

  pushDocxLabelParagraph(body, '语言特征', savedAiParse.languageFeatures, { before: 40, after: 120, shading: 'F8FAFC' })
}

function pushDocxGrammarAnalysis(body, detail, question) {
  const savedAiParse = findSavedGrammarParseQuestion(detail, question)
  if (!savedAiParse) {
    body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
    return
  }

  pushDocxLabelParagraph(body, 'AI 答案', savedAiParse.answer, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '提示词意思', savedAiParse.hintMeaning, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, 'AI 解析', savedAiParse.analysis || '待补', { after: 70, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '挖空句翻译', savedAiParse.sentenceTranslation, { after: 120, shading: 'F8FAFC' })
}

function pushDocxClozeAnalysis(body, detail, question) {
  const savedAiParse = findSavedClozeParseQuestion(detail, question)
  if (!savedAiParse) {
    body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
    return
  }

  const answerText = [
    optionalString(savedAiParse.answer),
    optionalString(savedAiParse.answerText),
    optionalString(savedAiParse.answerMeaning) ? `（${optionalString(savedAiParse.answerMeaning)}）` : '',
  ].filter(Boolean).join(' · ')
  pushDocxLabelParagraph(body, 'AI 答案', answerText || savedAiParse.answer, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, 'AI 解析', savedAiParse.analysis || '待补', { after: 70, shading: 'F8FAFC' })

  const distractorAnalysis = Array.isArray(savedAiParse.distractorAnalysis) ? savedAiParse.distractorAnalysis : []
  if (distractorAnalysis.length > 0) {
    body.push(paragraph([run('干扰项分析', { bold: true, size: 21 })], { before: 60, after: 50, keepNext: true }))
    distractorAnalysis.forEach((item) => {
      const option = optionalString(item.option)
      const text = optionalString(item.text)
      const reason = optionalString(item.reason)
      body.push(
        paragraph(
          [
            run(`${option || '\u00A0'}  `, { bold: true, size: 20, color: 'B91C1C' }),
            run([text, reason].filter(Boolean).join('：') || '待补'),
          ],
          { after: 35, indentLeft: 240, shading: 'FFF7ED' },
        ),
      )
    })
  }
}

function pushDocxSevenChoicesAnalysis(body, detail, question) {
  const savedAiParse = findSavedSevenChoicesParseQuestion(detail, question)
  if (!savedAiParse) {
    body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
    return
  }

  const answerText = [
    optionalString(savedAiParse.answer),
    optionalString(savedAiParse.optionText),
  ].filter(Boolean).join(' · ')
  pushDocxLabelParagraph(body, 'AI 答案', answerText || savedAiParse.answer, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '选项翻译', savedAiParse.optionTranslation, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, '上下文位置', savedAiParse.positionContext, { after: 50, shading: 'F8FAFC' })
  pushDocxLabelParagraph(body, 'AI 解析', savedAiParse.analysis || '待补', { after: 120, shading: 'F8FAFC' })
}

function pushDocxAnswerArea(body, detail, question, versionType) {
  if (versionType === 'student') {
    return
  }

  body.push(paragraph([run(`答案：${question.answer || '待补'}`, { bold: true })], { after: 40, shading: 'EEF2F4' }))

  if (detail.groupType === 'reading') {
    pushDocxReadingAnalysis(body, detail, question)
    return
  }

  if (detail.groupType === 'cloze') {
    pushDocxClozeAnalysis(body, detail, question)
    return
  }

  if (detail.groupType === 'seven_choices') {
    pushDocxSevenChoicesAnalysis(body, detail, question)
    return
  }

  if (detail.groupType === 'grammar_cloze') {
    pushDocxGrammarAnalysis(body, detail, question)
    return
  }

  body.push(paragraph(`解析：${docxQuestionExplanation(detail, question)}`, { after: 120, shading: 'EEF2F4' }))
}

// --- Exam-style renderer: formal Gaokao-style paper layout ---
function buildExamDocumentXml({ title, versionType, items, blocks, questionNumberStart }) {
  const startNum = Number.isInteger(questionNumberStart) && questionNumberStart >= 1 ? questionNumberStart : 1
  const body = []

  // Header: centered title, no metadata line
  body.push(paragraph([run(title || '英语试题', { bold: true, size: 32 })], { align: 'center', after: 60 }))
  if (versionType === 'teacher') {
    body.push(paragraph([run('（教师版 含答案解析）', { size: 20, color: '666666' })], { align: 'center', after: 200 }))
  } else {
    body.push(paragraph('', { after: 160 }))
  }

  const itemByGroupId = new Map(items.map((item) => [item.detail.id, item]))

  // Determine if we should use short-option two-column layout
  function isShortOptions(options) {
    if (!options || options.length === 0) return false
    return options.every((o) => String(o.content || '').length <= 20)
  }

  function renderOptionsExam(body, options, groupType) {
    if (!options || options.length === 0) return
    if (groupType === 'cloze') {
      // Cloze: inline
      const inlineText = options.map((o) => `${o.label}. ${o.content}`).join('    ')
      body.push(paragraph(inlineText, { after: 50, indentLeft: 420 }))
      return
    }
    if (isShortOptions(options) && options.length === 4) {
      // Two-column borderless table for short ABCD options
      const row1 = [
        `${options[0].label}. ${options[0].content}`,
        `${options[1].label}. ${options[1].content}`,
      ]
      const row2 = [
        `${options[2].label}. ${options[2].content}`,
        `${options[3].label}. ${options[3].content}`,
      ]
      body.push(examOptionTable([row1, row2]))
    } else {
      // Single-column
      options.forEach((option) => {
        body.push(paragraph(`${option.label}. ${option.content}`, { after: 30, indentLeft: 420 }))
      })
    }
  }

  // Render blocks or legacy items
  if (Array.isArray(blocks) && blocks.length > 0) {
    let questionNum = startNum

    for (const block of blocks) {
      if (block.type === 'section_header' && block.title) {
        body.push(paragraph([run(block.title, { bold: true, size: 24 })], { before: 280, after: 120, keepNext: true }))
      } else if (block.type === 'page_break') {
        body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
      } else if (block.type === 'question_group' && block.questionGroupId) {
        const item = itemByGroupId.get(block.questionGroupId)
        if (!item) continue
        const { detail } = item
        const score = Number.isFinite(Number(block.score)) ? Number(block.score) : item.score
        const passageLines = normalizeDocxLines(detail.passage.materialText || detail.passage.summary || '')

        // Extract passage label (A/B/C/D) from sectionTitle if possible
        const sectionTitle = block.sectionTitle || item.sectionTitle || ''
        const passageLabelMatch = sectionTitle.match(/([A-D])$/)
        const passageLabel = passageLabelMatch ? passageLabelMatch[1] : ''

        if (passageLabel) {
          body.push(paragraph([run(passageLabel, { bold: true, size: 22 })], { align: 'center', before: 160, after: 80, keepNext: true }))
        }

        // Passage text
        if (passageLines.length > 0 && passageLines[0]) {
          passageLines.forEach((line) => {
            body.push(paragraph(line, { after: 60 }))
          })
          body.push(paragraph('', { after: 80 }))
        }

        // Questions
        detail.questions.forEach((question) => {
          body.push(
            paragraph(
              [run(`${questionNum}.  ${docxQuestionStem(detail, question)}`)],
              { before: 60, after: 50 },
            ),
          )
          renderOptionsExam(body, question.options, detail.groupType)

          // Teacher version: compact answer
          if (versionType === 'teacher') {
            body.push(paragraph([run(`【答案】${question.answer || '待补'}`, { size: 18, color: '333333' })], { after: 30, indentLeft: 420 }))
            const explanation = question.explanation || question.note || ''
            if (explanation) {
              body.push(paragraph([run(`【解析】${explanation}`, { size: 18, color: '666666' })], { after: 50, indentLeft: 420 }))
            }
          }
          questionNum++
        })
      }
    }
  } else {
    // Legacy fallback for exam style
    let questionNum = startNum
    items.forEach((item) => {
      const { detail } = item
      const passageLines = normalizeDocxLines(detail.passage.materialText || detail.passage.summary || '')

      if (passageLines.length > 0 && passageLines[0]) {
        passageLines.forEach((line) => {
          body.push(paragraph(line, { after: 60 }))
        })
        body.push(paragraph('', { after: 80 }))
      }

      detail.questions.forEach((question) => {
        body.push(
          paragraph([run(`${questionNum}.  ${docxQuestionStem(detail, question)}`)], { before: 60, after: 50 }),
        )
        renderOptionsExam(body, question.options, detail.groupType)
        if (versionType === 'teacher') {
          body.push(paragraph([run(`【答案】${question.answer || '待补'}`, { size: 18, color: '333333' })], { after: 30, indentLeft: 420 }))
        }
        questionNum++
      })
    })
  }

  // TODO: Footer with page numbers (英语试题 第 PAGE 页（共 NUMPAGES 页）) requires
  // header/footer parts in the DOCX package. Skipped in V1 to avoid destabilizing
  // the zip package structure. Can be added by creating word/footer1.xml and
  // referencing it in sectPr with <w:footerReference>.
  body.push(
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`,
  )

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body.join('')}</w:body>
</w:document>`
}

// Borderless two-column option table for exam style
function examOptionTable(rows) {
  const colWidth = 4500
  const rowXml = rows.map((cells) => {
    const cellsXml = cells.map((cell) =>
      `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/><w:tcBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tcBorders></w:tcPr>${paragraph(cell, { after: 30 })}</w:tc>`
    ).join('')
    return `<w:tr>${cellsXml}</w:tr>`
  }).join('')
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${colWidth}"/><w:gridCol w:w="${colWidth}"/></w:tblGrid>${rowXml}</w:tbl>`
}

function buildDocumentXml({ title, versionType, items, blocks, questionNumberStart, printStyle }) {
  if (printStyle === 'exam') {
    return buildExamDocumentXml({ title, versionType, items, blocks, questionNumberStart })
  }
  // Handout style (original behavior)
  const versionLabel = versionType === 'student' ? '学生版' : '教师版'
  const totalQuestions = items.reduce((sum, item) => sum + item.detail.questions.length, 0)
  const totalScore = items.reduce((sum, item) => sum + item.detail.questions.length * item.score, 0)
  const body = [
    paragraph([run('ENGLISH QUESTION SET', { bold: true, size: 20, color: '6D737B' })], { align: 'center', after: 80 }),
    paragraph([run(title, { bold: true, size: 32 })], { align: 'center', after: 100 }),
    paragraph(`${versionLabel} · ${items.length} 题组 · ${totalQuestions} 小题 · ${totalScore.toFixed(1)} 分`, {
      align: 'center',
      after: 260,
    }),
  ]

  const startNum = Number.isInteger(questionNumberStart) && questionNumberStart >= 1 ? questionNumberStart : 1

  // If blocks are provided, render by block sequence
  if (Array.isArray(blocks) && blocks.length > 0) {
    let questionNum = startNum
    const itemByGroupId = new Map(items.map((item) => [item.detail.id, item]))

    for (const block of blocks) {
      if (block.type === 'section_header' && block.title) {
        body.push(
          paragraph([run(block.title, { bold: true, size: 28 })], { before: 300, after: 120, keepNext: true }),
        )
      } else if (block.type === 'page_break') {
        body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
      } else if (block.type === 'question_group' && block.questionGroupId) {
        const item = itemByGroupId.get(block.questionGroupId)
        if (!item) continue
        const { detail, note, sectionTitle } = item
        // Prefer block.score (from PaperExportBlock) over item.score
        const score = Number.isFinite(Number(block.score)) ? Number(block.score) : item.score
        const passageLines = normalizeDocxLines(detail.passage.materialText || detail.passage.summary || '暂无完整原文。')

        body.push(
          paragraph(
            [
              run(`${sectionTitle || detail.title}`, { bold: true, size: 26 }),
            ],
            { before: 240, after: 40, keepNext: true },
          ),
          paragraph(`${detail.title} · ${detail.source} · ${groupTypeLabels[detail.groupType] || detail.groupType} · 每题 ${score} 分`, {
            after: 120,
          }),
        )
        if (versionType === 'teacher' && note) {
          body.push(paragraph(`讲评备注：${note}`, { after: 120, shading: 'EEF2F4' }))
        }
        body.push(paragraph([run(detail.passage.title, { bold: true, size: 22 })], { after: 60, keepNext: true }))
        passageLines.forEach((line) => {
          body.push(paragraph(line, { after: 80, indentLeft: 240 }))
        })

        if (detail.groupType === 'seven_choices') {
          const sharedOptions = uniqueDocxOptions(detail.questions)
          if (sharedOptions.length > 0) {
            body.push(paragraph([run('选项', { bold: true })], { before: 80, after: 50, keepNext: true }))
            sharedOptions.forEach((option) => {
              body.push(paragraph(`${option.label}. ${option.content}`, { after: 40, indentLeft: 360 }))
            })
          }
        }

        detail.questions.forEach((question) => {
          body.push(
            paragraph(
              [
                run(`${questionNum}. `, { bold: true }),
                run(docxQuestionStem(detail, question), { bold: true }),
              ],
              { before: 90, after: 70, keepNext: true },
            ),
          )
          if (detail.groupType !== 'seven_choices') {
            if (detail.groupType === 'cloze' && question.options.length > 0) {
              const inlineText = question.options.map((o) => `${o.label}. ${o.content}`).join('  ')
              body.push(paragraph(inlineText, { after: 60, indentLeft: 360 }))
            } else {
              question.options.forEach((option) => {
                body.push(paragraph(`${option.label}. ${option.content}`, { after: 40, indentLeft: 360 }))
              })
            }
          }
          pushDocxAnswerArea(body, detail, question, versionType)
          questionNum++
        })
      }
    }
  } else {
    // Legacy fallback: render by items array (flat question group list without block structure).
    // This path is kept for backward compatibility with older saved paper sets that don't have blocks.
    // Once all clients send blocks, this branch can be removed.
    let legacyQuestionNum = startNum
    items.forEach((item, groupIndex) => {
      const { detail, note, score, sectionTitle } = item
      const passageLines = normalizeDocxLines(detail.passage.materialText || detail.passage.summary || '暂无完整原文。')

      body.push(
        paragraph(
          [
            run(`${groupIndex + 1}. `, { bold: true, size: 26 }),
            run(sectionTitle || detail.title, { bold: true, size: 26 }),
          ],
          { before: groupIndex === 0 ? 0 : 240, after: 40, keepNext: true },
        ),
        paragraph(`${detail.title} · ${detail.source} · ${groupTypeLabels[detail.groupType] || detail.groupType} · 每题 ${score} 分`, {
          after: 120,
        }),
      )
      if (versionType === 'teacher' && note) {
        body.push(paragraph(`讲评备注：${note}`, { after: 120, shading: 'EEF2F4' }))
      }
      body.push(paragraph([run(detail.passage.title, { bold: true, size: 22 })], { after: 60, keepNext: true }))

      passageLines.forEach((line) => {
        body.push(paragraph(line, { after: 80, indentLeft: 240 }))
      })

      if (detail.groupType === 'seven_choices') {
        const sharedOptions = uniqueDocxOptions(detail.questions)

        if (sharedOptions.length > 0) {
          body.push(paragraph([run('选项', { bold: true })], { before: 80, after: 50, keepNext: true }))
          sharedOptions.forEach((option) => {
            body.push(paragraph(`${option.label}. ${option.content}`, { after: 40, indentLeft: 360 }))
          })
        }
      }

      detail.questions.forEach((question) => {
        body.push(
          paragraph(
            [
              run(`${legacyQuestionNum}. `, { bold: true }),
              run(docxQuestionStem(detail, question), { bold: true }),
            ],
            { before: 90, after: 70, keepNext: true },
          ),
        )

        if (detail.groupType !== 'seven_choices') {
          if (detail.groupType === 'cloze' && question.options.length > 0) {
            const inlineText = question.options.map((o) => `${o.label}. ${o.content}`).join('  ')
            body.push(paragraph(inlineText, { after: 60, indentLeft: 360 }))
          } else {
            question.options.forEach((option) => {
              body.push(paragraph(`${option.label}. ${option.content}`, { after: 40, indentLeft: 360 }))
            })
          }
        }

        pushDocxAnswerArea(body, detail, question, versionType)
        legacyQuestionNum++
      })
    })
  }

  body.push(
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`,
  )

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body.join('')}</w:body>
</w:document>`
}

function writeDocxPackage({ documentXml, outputPath, title }) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'question-bank-docx-'))

  try {
    mkdirSync(path.join(tempDir, '_rels'), { recursive: true })
    mkdirSync(path.join(tempDir, 'docProps'), { recursive: true })
    mkdirSync(path.join(tempDir, 'word'), { recursive: true })

    writeFileSync(
      path.join(tempDir, '[Content_Types].xml'),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    )

    writeFileSync(
      path.join(tempDir, '_rels/.rels'),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    )

    writeFileSync(
      path.join(tempDir, 'docProps/core.xml'),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>English Question Bank</dc:creator>
  <cp:lastModifiedBy>English Question Bank</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`,
    )

    writeFileSync(
      path.join(tempDir, 'docProps/app.xml'),
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>English Question Bank</Application>
</Properties>`,
    )

    writeFileSync(path.join(tempDir, 'word/document.xml'), documentXml)
    execFileSync('zip', ['-qr', outputPath, '.'], { cwd: tempDir })
    return readFileSync(outputPath)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function findSoffice() {
  const candidates = [
    process.env.SOFFICE_PATH,
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/Applications/OpenOffice.app/Contents/MacOS/soffice',
    'soffice',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate === 'soffice' || existsSync(candidate)) return candidate
  }

  throw new Error('LibreOffice soffice not found; cannot export PDF')
}

function convertDocxToPdf(docxPath, outputPath) {
  const soffice = findSoffice()
  const profileDir = mkdtempSync(path.join(tmpdir(), 'question-bank-lo-profile-'))

  try {
    execFileSync(
      soffice,
      [
        '--headless',
        `-env:UserInstallation=file://${profileDir}`,
        '--convert-to',
        'pdf',
        '--outdir',
        path.dirname(outputPath),
        docxPath,
      ],
      { stdio: 'pipe' },
    )

    const generatedPath = path.join(path.dirname(outputPath), `${path.basename(docxPath, '.docx')}.pdf`)
    if (!existsSync(generatedPath)) {
      throw new Error('LibreOffice did not produce a PDF file')
    }
    if (generatedPath !== outputPath) {
      renameSync(generatedPath, outputPath)
    }
  } finally {
    rmSync(profileDir, { recursive: true, force: true })
  }
}

function readingDistractorTypeLabel(type) {
  const normalized = optionalString(type)
  if (normalized === '0') return '正确项'
  if (normalized === '1') return '细节词误导'
  if (normalized === '2') return '无中生有'
  if (normalized === '3') return '常识干扰'
  return normalized
}
