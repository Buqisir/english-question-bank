import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import playwright from '../../../app/node_modules/playwright/index.js'
import { sha256 } from '../../../shared/paper-canonical/stable.mjs'

function escaped(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

// A text-layer PDF whose only embedded raster is a `/ImageMask true` stencil
// XObject. `pdfimages -list` reports its type as `stencil` — a fourth raster
// kind distinct from image/mask/smask — so this fixture exercises the raster
// gate's stencil branch (Detail #361).
function stencilImagePdfBytes() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> /ProcSet [/PDF /Text /ImageB /ImageC /ImageI] >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    null,
  ]
  const content = 'BT /F1 12 Tf 50 750 Td (This page carries one stencil image mask.) Tj ET\nq 24 0 0 24 50 700 cm /Im1 Do Q\n'
  const mask = Buffer.alloc(8, 0xff)
  objects[3] = `<< /Length ${content.length} >>\nstream\n${content}endstream`
  objects[5] = `<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ImageMask true /BitsPerComponent 1 /Length ${mask.length} >>\nstream\n${mask.toString('latin1')}\nendstream`
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((object, index) => {
    offsets.push(out.length)
    out += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(out, 'latin1')
}

function paragraph(text, className = '') {
  return `<p${className ? ` class="${className}"` : ''}>${escaped(text)}</p>`
}

function question(number) {
  return '<div class="question">'
    + paragraph(`${number}. Which choice fits item ${number}?`)
    + paragraph('A. Alpha')
    + paragraph('B. Bravo')
    + paragraph('C. Charlie')
    + paragraph('D. Delta')
    + '</div>'
}

function reading(letter, from, to, { table = false, crossPageParagraph = false } = {}) {
  return [
    paragraph(letter),
    ...(crossPageParagraph ? [
      paragraph('A small device can locate your dog accurately, with'),
      '<p style="break-before:page">a battery that lasts up to 14 days.</p>',
    ] : [paragraph(`${letter} passage keeps one small promise.`)]),
    ...(table ? [
      '<table><tbody>'
        + '<tr><td>Day</td><td>Task</td></tr>'
        + '<tr><td>Monday</td><td>Read</td></tr>'
        + '</tbody></table>',
    ] : []),
    ...Array.from({ length: to - from + 1 }, (_, index) => question(from + index)),
  ].join('')
}

function questionHtml({ includeTable = true, crossPageParagraph = false, listening = false } = {}) {
  const sevenParagraphs = Array.from({ length: 5 }, (_, index) =>
    paragraph(`A short guide has ${36 + index}._____ for learners.`)).join('')
  const sevenOptions = 'ABCDEFG'.split('').map((label) =>
    paragraph(`${label}. ${label} option sentence.`)).join('')
  const clozeText = Array.from({ length: 15 }, (_, index) =>
    `${41 + index}._____`).join(' and ')
  const grammarText = Array.from({ length: 10 }, (_, index) =>
    `${56 + index}._____(${index % 2 === 0 ? 'learn' : 'word'})`).join(' and ')
  return [
    paragraph('Synthetic NCK1 PDF paper'),
    ...(listening ? [
      paragraph('第一部分 听力'), paragraph('第一节'),
      paragraph('听下面5段对话。每段对话仅读一遍。'),
      ...Array.from({ length: 20 }, (_, index) => [
        ...(index === 5 ? [paragraph('第二节')] : []),
        ...([5, 7, 10, 13, 16].includes(index)
          ? [paragraph(`听第${[5, 7, 10, 13, 16].indexOf(index) + 6}段材料，回答第${index + 1}至第${({ 5: 7, 7: 10, 10: 13, 13: 16, 16: 20 })[index]}题。`)] : []),
        paragraph(`${index + 1}. Which listening choice fits?`),
        paragraph('A. Alpha'), paragraph('B. Bravo'), paragraph('C. Charlie'),
      ]).flat(),
    ] : []),
    paragraph('第二部分 阅读 (共两节，满分50分)'),
    paragraph('第一节(共15小题；每小题2.5分，满分37.5分)'),
    paragraph('阅读下列短文，从每题所给的四个选项中选出最佳选项。'),
    reading('A', 21, 23, { table: includeTable, crossPageParagraph }),
    reading('B', 24, 27),
    reading('C', 28, 31),
    reading('D', 32, 35),
    paragraph('第二节(共5小题；每小题2.5分，满分12.5分)'),
    paragraph('阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。'),
    sevenParagraphs,
    sevenOptions,
    paragraph('第三部分 语言运用 (共两节，满分30分)'),
    paragraph('第一节(共15小题；每小题1分，满分15分)'),
    paragraph('阅读下面短文，从每题所给的四个选项中选出最佳选项。'),
    paragraph(`A learner finished the plan: ${clozeText}.`),
    ...Array.from({ length: 15 }, (_, index) => question(41 + index)),
    paragraph('第二节(共10小题；每小题1.5分，满分15分)'),
    paragraph('阅读下面材料，在空白处填入适当的单词或括号内单词的正确形式。'),
    paragraph(`Practice helps: ${grammarText}.`),
    paragraph('第四部分 写作 (共两节，满分40分)'),
    paragraph('第一节(满分15分)'),
    paragraph('Write a short notice for the reading club.'),
    paragraph('内容包括：'),
    paragraph('1. Share the meeting time;'),
    paragraph('2. Invite new members.'),
    paragraph('注意：'),
    paragraph('1. 写作词数应为80个左右；'),
    paragraph('2. 请按如下格式在答题卡的相应位置作答。'),
    paragraph('Should We Join the Reading Club?'),
    paragraph('第二节(满分25分)'),
    paragraph('阅读下面材料，根据其内容和所给段落开头语续写两段。'),
    paragraph('Mia found a lost notebook after class.'),
    paragraph('The owner name was written on its first page.'),
    paragraph('注意：'),
    paragraph('1. 续写词数应为150左右；'),
    paragraph('2. 请按如下格式在答题卡的相应位置作答。'),
    paragraph('Mia carried the notebook to the school office.'),
    paragraph('The next morning, a student came to thank her.'),
  ].join('')
}

function answerHtml({
  answerShape = 'detailed',
  answerHeading = true,
  ambiguousTextAnswer = false,
  listening = false,
} = {}) {
  const key = [
    paragraph('Synthetic official answers'),
    ...(listening ? [paragraph('1-5ABCAB6-10BCABC11-15ABCAB16-20BCABC')] : []),
    paragraph('21-23ABC24-27DABC28-31BCDA32-35CDAB'),
    paragraph('36-40ABCDE'),
    paragraph('41-45ABCDA46-50BCDAB51-55CDABC'),
    ...(ambiguousTextAnswer
      ? [
          paragraph('56.walked 57.quickly 58.on 59.the 60.path 61.and 62.shared 63.a 64.kind'),
          paragraph('65.note because this sentence explains the answer without any boundary'),
        ]
      : [paragraph('56.walked 57.quickly 58.on 59.the 60.path 61.and 62.shared 63.a 64.kind 65.note')]),
  ]
  if (answerShape === 'key_only') return key.join('')
  return [
    ...(answerHeading ? [paragraph('答案与解析')] : []),
    ...key,
    paragraph('21. A【解析】deliberately untrusted explanation'),
    paragraph('56. walked【解析】deliberately untrusted explanation'),
    paragraph('第四部分 写作'),
    paragraph('第一节：应用文（满分15分）'),
    paragraph('Should We Join the Reading Club?'),
    paragraph('Join us on Friday to read and share ideas.'),
    paragraph('第二节：读后续写（满分25分）'),
    paragraph('Mia carried the notebook to the school office. The teacher found its owner.'),
    paragraph('The next morning, a student came to thank her. They became friends.'),
    ...(listening ? [
      paragraph('高三听力录音原文'),
      paragraph('听力考试正式开始。'),
      paragraph('例如：先听例题。'), paragraph('M: This is the example only.'),
      // Linux emoji font metrics split/reorder the mixed speech/cue PDF item.
      // The C1 regression probes UTF-16 surrogate refusal with explicit OCR text.
      ...Array.from({ length: 10 }, (_, index) => [
        paragraph(`Text ${index + 1}`),
        paragraph(index === 4 ? 'M: Keep every word 。第一节到此结束。' : `M: Synthetic speech ${index + 1}.`),
        ...(index === 5 ? [paragraph('W: OK, the underground, and then a short walk. Thanks a lot.')] : []),
      ]).flat(),
      paragraph('请从A、B、C中选择。'),
      paragraph('应用文评分标准'), paragraph('Scoring appendix must remain in the source.'),
    ] : []),
    paragraph('【答案详解】'),
    paragraph('21. This deliberately untrusted explanation must not enter Canonical output.'),
  ].join('')
}

function combinedHtml({ combinedBoundary = 'valid', ...options } = {}) {
  const boundary = combinedBoundary === 'missing'
    ? ''
    : combinedBoundary === 'duplicate'
      ? paragraph('参考答案') + paragraph('英语答案')
      : paragraph('参考答案及解析')
  return questionHtml(options) + boundary + answerHtml({ ...options, answerHeading: false })
}

function documentHtml(body, extraStyle = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; font: 9px/1.22 Arial, "Noto Sans CJK SC", sans-serif; }
    p { margin: 0 0 18px; }
    .question { break-inside: avoid; margin-bottom: 4px; }
    .question p { margin-bottom: 2px; }
    table { border-collapse: collapse; width: 220px; margin: 4px 0 6px 10px; }
    td { border: 1px solid #222; padding: 3px 5px; width: 110px; }
    ${extraStyle}
  </style></head><body>${body}</body></html>`
}

const tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8DAwMDAxMDAwMAAAAwAAf4V9xQAAAAASUVORK5CYII='

async function renderPdf(browser, html) {
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })
    return new Uint8Array(await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    }))
  } finally {
    await page.close()
  }
}

function pdfPageCount(bytes) {
  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-pdf-fixture-'))
  try {
    const filePath = path.join(temp, 'fixture.pdf')
    writeFileSync(filePath, bytes)
    const info = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' })
    const count = Number(/^Pages:\s+(\d+)$/mu.exec(info)?.[1])
    if (!Number.isInteger(count) || count < 1) throw new Error('Synthetic PDF page count is unavailable')
    return count
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

function record(documentId, role, bytes, fileName) {
  return {
    documentId,
    role,
    mediaType: 'application/pdf',
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    pageCount: pdfPageCount(bytes),
    path: `source/${fileName}`,
  }
}

export async function makeSyntheticNck1PdfFixture({
  includeAnswerShapes = false,
  includeTable = true,
  includeExtractionCases = true,
  crossPageParagraph = false,
  listening = false,
} = {}) {
  const browser = await playwright.chromium.launch({ headless: true, channel: 'chromium' })
  try {
    const questionBytes = await renderPdf(browser, documentHtml(questionHtml({ includeTable, crossPageParagraph, listening })))
    const answerBytes = await renderPdf(browser, documentHtml(answerHtml({ listening })))
    const answerShapeBytes = includeAnswerShapes ? {
      keyOnly: await renderPdf(browser, documentHtml(answerHtml({ answerShape: 'key_only' }))),
      ambiguous: await renderPdf(browser, documentHtml(answerHtml({
        answerShape: 'key_only',
        ambiguousTextAnswer: true,
      }))),
      combined: await renderPdf(browser, documentHtml(combinedHtml({ includeTable }))),
      combinedMissingBoundary: await renderPdf(browser, documentHtml(combinedHtml({
        combinedBoundary: 'missing',
        includeTable,
      }))),
      combinedDuplicateBoundary: await renderPdf(browser, documentHtml(combinedHtml({
        combinedBoundary: 'duplicate',
        includeTable,
      }))),
    } : null
    // OCR/image consumers need only sourceDocuments. Keep all extraction
    // cases for their dedicated verifier, but never render unused inputs.
    const extractionPdf = (html) => includeExtractionCases ? renderPdf(browser, html) : null
    const imageOnlyBytes = await extractionPdf(documentHtml(
      '<div class="image-only" aria-label="synthetic raster page"></div>',
      '.image-only { width: 100%; height: 250mm; background: linear-gradient(135deg, #ddd, #aaa); }',
    ))
    const incompleteBytes = await extractionPdf(documentHtml(
      paragraph('First page has a text layer.')
        + '<div class="empty-page"></div>',
      '.empty-page { break-before: page; width: 100%; height: 250mm; background: #eee; }',
    ))
    const multiColumnBytes = await extractionPdf(documentHtml(
      '<div class="columns"><div>'
        + Array.from({ length: 4 }, (_, index) => paragraph(`Left column ${index + 1}.`)).join('')
        + '</div><div>'
        + Array.from({ length: 4 }, (_, index) => paragraph(`Right column ${index + 1}.`)).join('')
        + '</div></div>',
      '.columns { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; }',
    ))
    const overlapBytes = await extractionPdf(documentHtml(
      '<div class="overlap">'
        + paragraph('First overlapping text block.', 'first')
        + paragraph('Second overlapping text block.', 'second')
        + '</div>',
      '.overlap { position: relative; height: 100px; } .overlap p { position: absolute; left: 0; top: 0; }',
    ))
    const alignedNonTableBytes = await extractionPdf(documentHtml(
      '<table class="unbordered"><tbody>'
        + '<tr><td>Left one</td><td>Right one</td></tr>'
        + '<tr><td>Left two</td><td>Right two</td></tr>'
        + '</tbody></table>',
      '.unbordered td { border: 0; }',
    ))
    const embeddedImageBytes = await extractionPdf(documentHtml(
      paragraph('This text page also contains one synthetic raster image.')
        + `<img src="${tinyPngDataUrl}" alt="" width="32" height="24">`,
    ))
    const examRow = (texts) => `<div class="exam-row">${texts.map((text) => `<span>${escaped(text)}</span>`).join('')}</div>`
    const rowStyle = '.exam-row { display: flex; justify-content: space-between; margin-bottom: 20px; }'
    const labelledRowsBytes = await extractionPdf(documentHtml([
      examRow(['A. Alpha', 'B. Bravo', 'C. Charlie']),
      examRow(['A. One', 'B. Two', 'C. Three', 'D. Four']),
      examRow(['41.', 'A. Red', 'B. Blue', 'C. Green', 'D. Yellow']),
      examRow(['1-5 ABCAB', '6-10 BCABC', '11-15 ABCAB', '16-20 BCABC']),
      examRow(['56. to learn', '57. quickly', '58. on', '59. the', '60. path']),
      paragraph('第 1 页 共 1 页'),
      paragraph('第 1 页 共 1 页', 'page-number'),
    ].join(''), rowStyle + '@page { margin: 0; } body { margin: 12px; } .page-number { position: absolute; top: 288mm; margin: 0; line-height: 1; }'))
    const misorderedOptionsBytes = await extractionPdf(documentHtml(
      examRow(['A. Alpha', 'C. Charlie', 'B. Bravo']), rowStyle,
    ))
    const documents = [
      record('question-source-1', 'question_source', questionBytes, 'question-source-1.pdf'),
      record('official-answers-2', 'official_answers', answerBytes, 'official-answers-2.pdf'),
    ]
    return {
      paperId: 'paper-synthetic-pdf-text',
      questionBytes,
      answerBytes,
      labelledRows: includeExtractionCases
        ? { bytes: labelledRowsBytes, pageCount: pdfPageCount(labelledRowsBytes) }
        : null,
      sourceDocuments: [
        { ...documents[0], bytes: questionBytes },
        { ...documents[1], bytes: answerBytes },
      ],
      answerShapes: answerShapeBytes ? {
        keyOnlyDocuments: [
          { ...documents[0], bytes: questionBytes },
          {
            ...record('official-answers-key-only', 'official_answers', answerShapeBytes.keyOnly, 'official-answers-key-only.pdf'),
            bytes: answerShapeBytes.keyOnly,
          },
        ],
        ambiguousDocuments: [
          { ...documents[0], bytes: questionBytes },
          {
            ...record('official-answers-ambiguous', 'official_answers', answerShapeBytes.ambiguous, 'official-answers-ambiguous.pdf'),
            bytes: answerShapeBytes.ambiguous,
          },
        ],
        combinedDocuments: [{
          ...record('question-and-answers-1', 'question_and_answers', answerShapeBytes.combined, 'question-and-answers-1.pdf'),
          bytes: answerShapeBytes.combined,
        }],
        combinedMissingBoundaryDocuments: [{
          ...record('question-and-answers-missing-boundary', 'question_and_answers', answerShapeBytes.combinedMissingBoundary, 'question-and-answers-missing-boundary.pdf'),
          bytes: answerShapeBytes.combinedMissingBoundary,
        }],
        combinedDuplicateBoundaryDocuments: [{
          ...record('question-and-answers-duplicate-boundary', 'question_and_answers', answerShapeBytes.combinedDuplicateBoundary, 'question-and-answers-duplicate-boundary.pdf'),
          bytes: answerShapeBytes.combinedDuplicateBoundary,
        }],
      } : null,
      manifest: {
        schemaVersion: 'universal-nck1-source-manifest-v1',
        paperId: 'paper-synthetic-pdf-text',
        profileId: 'nck1',
        provenance: { paperName: 'Synthetic NCK1 PDF', source: 'test fixture' },
        documents,
        materializationPath: 'materialization/nck1-source-materialization-v1.json',
        mediaDirectory: 'materialization/media',
        canonicalRequestPath: 'canonical-evidence/canonical-import-request.json',
      },
      negative: includeExtractionCases ? {
        misorderedOptions: { bytes: misorderedOptionsBytes, pageCount: pdfPageCount(misorderedOptionsBytes) },
        imageOnly: {
          bytes: imageOnlyBytes,
          pageCount: pdfPageCount(imageOnlyBytes),
        },
        incomplete: {
          bytes: incompleteBytes,
          pageCount: pdfPageCount(incompleteBytes),
        },
        multiColumn: {
          bytes: multiColumnBytes,
          pageCount: pdfPageCount(multiColumnBytes),
        },
        overlap: {
          bytes: overlapBytes,
          pageCount: pdfPageCount(overlapBytes),
        },
        alignedNonTable: {
          bytes: alignedNonTableBytes,
          pageCount: pdfPageCount(alignedNonTableBytes),
        },
        embeddedImage: {
          bytes: embeddedImageBytes,
          pageCount: pdfPageCount(embeddedImageBytes),
        },
        stencilImage: {
          bytes: stencilImagePdfBytes(),
          pageCount: 1,
        },
      } : null,
    }
  } finally {
    await browser.close()
  }
}
