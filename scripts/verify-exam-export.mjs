#!/usr/bin/env node
/**
 * Verification: exam-style DOCX export XML behavior.
 * Tests without depending on UI or actual file I/O.
 * Verifies: page_break present, metadata line absent, continuous numbering,
 * section title present, two-column option table for short options.
 */

// Minimal stubs for the helpers used by buildExamDocumentXml
function escapeXml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function run(text, options = {}) {
  const runProperties = [
    options.bold ? '<w:b/>' : '',
    options.italic ? '<w:i/>' : '',
    options.size ? `<w:sz w:val="${options.size}"/>` : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
  ].join('')
  const textXml = `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`
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

function normalizeDocxLines(text) {
  return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
}

function docxQuestionStem(detail, question) {
  return question.stem || ''
}

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

// Inline the exam renderer logic
function buildExamDocumentXml({ title, versionType, items, blocks, questionNumberStart }) {
  const startNum = Number.isInteger(questionNumberStart) && questionNumberStart >= 1 ? questionNumberStart : 1
  const body = []

  body.push(paragraph([run(title || '英语试题', { bold: true, size: 32 })], { align: 'center', after: 60 }))
  if (versionType === 'teacher') {
    body.push(paragraph([run('（教师版 含答案解析）', { size: 20, color: '666666' })], { align: 'center', after: 200 }))
  } else {
    body.push(paragraph('', { after: 160 }))
  }

  const itemByGroupId = new Map(items.map((item) => [item.detail.id, item]))

  function isShortOptions(options) {
    if (!options || options.length === 0) return false
    return options.every((o) => String(o.content || '').length <= 20)
  }

  function renderOptionsExam(body, options, groupType) {
    if (!options || options.length === 0) return
    if (groupType === 'cloze') {
      const inlineText = options.map((o) => `${o.label}. ${o.content}`).join('    ')
      body.push(paragraph(inlineText, { after: 50, indentLeft: 420 }))
      return
    }
    if (isShortOptions(options) && options.length === 4) {
      body.push(examOptionTable([
        [`${options[0].label}. ${options[0].content}`, `${options[1].label}. ${options[1].content}`],
        [`${options[2].label}. ${options[2].content}`, `${options[3].label}. ${options[3].content}`],
      ]))
    } else {
      options.forEach((option) => {
        body.push(paragraph(`${option.label}. ${option.content}`, { after: 30, indentLeft: 420 }))
      })
    }
  }

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
        const passageLines = normalizeDocxLines(detail.passage.materialText || '')
        if (passageLines.length > 0) {
          passageLines.forEach((line) => body.push(paragraph(line, { after: 60 })))
          body.push(paragraph('', { after: 80 }))
        }
        detail.questions.forEach((question) => {
          body.push(paragraph([run(`${questionNum}.  ${docxQuestionStem(detail, question)}`)], { before: 60, after: 50 }))
          renderOptionsExam(body, question.options, detail.groupType)
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
  }

  body.push(`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}</w:body></w:document>`
}

// --- Test fixtures ---
const items = [
  {
    detail: {
      id: 'g1',
      title: '2025 新I 阅读理解 B',
      groupType: 'reading',
      passage: { title: 'Passage B', materialText: 'The quick brown fox jumps over the lazy dog.' },
      questions: [
        { id: 'q1', questionNo: '1', stem: 'What does the fox do?', answer: 'B', explanation: 'It jumps.', options: [
          { label: 'A', content: 'Sleeps' }, { label: 'B', content: 'Jumps' },
          { label: 'C', content: 'Runs' }, { label: 'D', content: 'Eats' },
        ]},
        { id: 'q2', questionNo: '2', stem: 'What is the dog?', answer: 'A', explanation: 'Lazy.', options: [
          { label: 'A', content: 'Lazy' }, { label: 'B', content: 'Fast' },
          { label: 'C', content: 'Smart' }, { label: 'D', content: 'Brave' },
        ]},
        { id: 'q3', questionNo: '3', stem: 'What color is the fox?', answer: 'C', explanation: 'Brown.', options: [
          { label: 'A', content: 'Red' }, { label: 'B', content: 'White' },
          { label: 'C', content: 'Brown' }, { label: 'D', content: 'Black' },
        ]},
        { id: 'q4', questionNo: '4', stem: 'Where does this happen?', answer: 'D', explanation: 'Over the dog.', options: [
          { label: 'A', content: 'In a park' }, { label: 'B', content: 'At home' },
          { label: 'C', content: 'In a forest' }, { label: 'D', content: 'Over the dog' },
        ]},
      ],
    },
    score: 2.5,
    sectionTitle: '阅读理解 B',
    note: '',
  },
  {
    detail: {
      id: 'g2',
      title: '2025 新I 七选五',
      groupType: 'seven_choices',
      passage: { title: 'Seven Choices', materialText: 'Some passage about life skills.' },
      questions: [
        { id: 'q5', questionNo: '5', stem: 'What fits here?', answer: 'E', explanation: '', options: [] },
        { id: 'q6', questionNo: '6', stem: 'Next blank?', answer: 'A', explanation: '', options: [] },
        { id: 'q7', questionNo: '7', stem: 'Third blank?', answer: 'C', explanation: '', options: [] },
      ],
    },
    score: 2,
    sectionTitle: '七选五',
    note: '',
  },
]

const blocks = [
  { type: 'section_header', title: '第一部分 阅读理解' },
  { type: 'question_group', questionGroupId: 'g1', score: 2.5, sectionTitle: '阅读理解 B' },
  { type: 'page_break' },
  { type: 'section_header', title: '第二节 七选五' },
  { type: 'question_group', questionGroupId: 'g2', score: 2, sectionTitle: '七选五' },
]

// --- Run tests ---
let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.error(`  ✗ ${name}: ${detail || 'failed'}`) }
}

console.log('=== Exam Export Verification ===\n')

// Student version
const studentXml = buildExamDocumentXml({ title: '2025 英语试题', versionType: 'student', items, blocks, questionNumberStart: 21 })

console.log('Test: Student exam export')
assert('page_break present', studentXml.includes('w:type="page"'), 'no page break found')
assert('no metadata line (题组/小题/分)', !studentXml.includes('题组') && !studentXml.includes('小题'), 'metadata line found')
assert('section title present', studentXml.includes('第一部分 阅读理解'), 'section title missing')
assert('second section title present', studentXml.includes('第二节 七选五'), 'second section title missing')
assert('question 21 present', studentXml.includes('21.'), 'question 21 missing')
assert('question 24 present', studentXml.includes('24.'), 'question 24 missing')
assert('question 25 present (continuous after section)', studentXml.includes('25.'), 'question 25 missing')
assert('question 27 present', studentXml.includes('27.'), 'question 27 missing')
assert('no answer in student', !studentXml.includes('【答案】'), 'answer found in student version')
assert('two-column table present (short options)', studentXml.includes('<w:tbl>'), 'no table found for short options')
assert('borderless table', studentXml.includes('w:val="none"'), 'table has borders')

// Teacher version
console.log('\nTest: Teacher exam export')
const teacherXml = buildExamDocumentXml({ title: '2025 英语试题', versionType: 'teacher', items, blocks, questionNumberStart: 21 })
assert('teacher label present', teacherXml.includes('教师版'), 'teacher label missing')
assert('answer present in teacher', teacherXml.includes('【答案】B'), 'answer missing in teacher')
assert('explanation content present', teacherXml.includes('It jumps.'), 'explanation text missing in teacher')

// NOTE: Footer with page numbers is a TODO (requires header/footer DOCX parts).
console.log('\nNote: Footer page numbers skipped in V1 (requires DOCX footer parts).')

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
process.exit(failed > 0 ? 1 : 0)
