import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import playwright from '../../../app/node_modules/playwright/index.js'
import { makeFixture } from '../../../scripts/verify-nck1-source-materialization.mjs'
import { syntheticApplicationParts, syntheticContinuationSample } from '../../../scripts/lib/syntheticReviewAnswerFixture.mjs'
import { extractNck1PdfTextStructure } from '../../../server/paper-import/nck1PdfTextSourceAdapter.mjs'

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const p = text => `<p>${escape(text)}</p>`
const endStream = 'BT /FEnd 12 Tf 50 780 Td (End of question paper.) Tj ET\n'
// Extract the no-listening page's actual text geometry from the exact PDF
// operators/font/media box used by the runtime incremental update.
const endObjects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 594.95996 841.91998] /Resources << /Font << /FEnd 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(endStream)} >>\nstream\n${endStream}endstream`,
]
let endPdf = '%PDF-1.4\n'
const offsets = endObjects.map((object, i) => {
  const offset = Buffer.byteLength(endPdf)
  endPdf += `${i + 1} 0 obj\n${object}\nendobj\n`
  return offset
})
const endXref = Buffer.byteLength(endPdf)
endPdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${endXref}\n%%EOF\n`
const endItem = extractNck1PdfTextStructure(Buffer.from(endPdf), { documentId: 'paper', expectedPageCount: 1 }).body[0]
const font = name => readFileSync(new URL(`../../../app/public/fonts/paper/${name}`, import.meta.url)).toString('base64')
const style = `
@font-face { font-family: SourceHan; src: url(data:font/otf;base64,${font('source-han-serif/SourceHanSerifCN-Regular.otf')}); }
@font-face { font-family: Termes; src: url(data:font/otf;base64,${font('termes/texgyretermes-regular.otf')}); }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; color: #111; font: 12px/1.5 Termes, SourceHan, serif; }
section { position: relative; width: 210mm; height: 297mm; padding: 16mm 18mm; break-after: page; }
section:last-child { break-after: auto; }
h1 { font: 18px/1.5 SourceHan; margin: 0 0 6mm; }
p { margin: 0 0 3mm; }
.options { margin-bottom: 2mm; }
.listening { font-size: 11px; }
.listening p { break-inside: avoid; margin-bottom: 2mm; }
.transcripts { font-size: 10px; }
.application { position: absolute; left: 18mm; bottom: 24mm; }
`
const materialization = makeFixture({ listening: true })
materialization.listening.transcript[0].text = 'Where will you meet your sister tomorrow morning? I will meet her beside the central library before lunch.'
materialization.listening.questions[5].options[2].text = 'Ask the librarian for information about the new community reading programme.'
const questionPages = materialization.groups.map(group => `<section><h1>${escape(group.slotId)}</h1>`
  + group.blocks.map(block => p(block.content.map(item => item.kind === 'text'
    ? item.text : `____${item.blankId.split(':').at(-1)}____`).join(''))).join('')
  + group.questions.map(question => p(`${question.canonicalNumber}. ${question.stem}`)
    + p(question.options.map(option => `${option.label}. ${option.text}`).join('   '))).join('')
  + group.optionBank.map(option => p(`${option.label}. ${option.text}`)).join('') + '</section>')
questionPages.push(`<section><h1>Listening</h1><div class="listening">${
  materialization.listening.questions.map(question => p(`${question.canonicalNumber}. ${question.stem}`)
    + p(question.options.map(option => `${option.label}. ${option.text}`).join('   '))).join('')
}</div></section>`)
const answerPages = [
  `<section><h1>参考答案</h1>${p(materialization.answers.map(answer => `${answer.canonicalNumber}. ${answer.value}`).join('  '))}
  ${p('听力答案：1—20 A')}<div class="transcripts">${materialization.listening.transcript.map((item, index) =>
    p(`Text ${index + 1}`) + p(item.text)).join('')}</div>
  <div class="application">${p('第一节 应用文')}${p('参考范文')}${p(syntheticApplicationParts[0])}</div></section>`,
  `<section>${p(syntheticApplicationParts[1])}${p('应用文评分标准')}${p('内容完整，语言准确，表达连贯。')}
  ${p('第二节 读后续写')}${p('参考范文')}${p(syntheticContinuationSample)}
  ${p('读后续写评分标准')}${p('情节合理，衔接自然，语言准确。')}</section>`,
]
const browser = await playwright.chromium.launch({ headless: true, channel: 'chromium' })
try {
  const documents = []
  let listeningPage
  for (const [documentId, file, pages] of [['paper', 'questions.pdf', questionPages], ['answers', 'answers.pdf', answerPages]]) {
    const page = await browser.newPage()
    try {
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${pages.join('')}</body></html>`)
      await page.evaluate(() => document.fonts.ready)
      const printedItems = await page.evaluate(() => [...document.querySelectorAll('section')].map(section => {
        const bounds = section.getBoundingClientRect()
        return [...section.querySelectorAll('h1,p')].filter(element => element.textContent.trim()).map(element => {
          const range = document.createRange(); range.selectNodeContents(element)
          const rect = range.getBoundingClientRect()
          return { text: element.textContent.trim(), region: {
            x: (rect.left - bounds.left) / bounds.width, y: (rect.top - bounds.top) / bounds.height,
            width: rect.width / bounds.width, height: rect.height / bounds.height,
          } }
        })
      }))
      const bytes = await page.pdf({ printBackground: true, preferCSSPageSize: true })
      writeFileSync(new URL(file, import.meta.url), bytes)
      if (documentId === 'paper') {
        const pdf = bytes.toString('latin1')
        const pageObjects = [...pdf.matchAll(/(\d+) 0 obj\n(<<[\s\S]*?)\nendobj/gu)]
          .filter(match => /\/Type\s*\/Page\b/u.test(match[2]))
        assert.equal(pageObjects.length, 10)
        listeningPage = { objectId: Number(pageObjects[9][1]), dictionary: pageObjects[9][2],
          size: Number([...pdf.matchAll(/\/Size\s+(\d+)/gu)].at(-1)[1]),
          root: [...pdf.matchAll(/\/Root\s+(\d+\s+\d+\s+R)/gu)].at(-1)[1],
          previousXref: Number([...pdf.matchAll(/startxref\s+(\d+)/gu)].at(-1)[1]) }
      }
      const structure = extractNck1PdfTextStructure(bytes, { documentId, expectedPageCount: pages.length })
      assert.deepEqual(structure.issues ?? [], [])
      documents.push({ documentId, pages: pages.map((_, index) => {
        const observations = printedItems[index]
          .map((item, i) => ({ observationId: `${documentId}:p${index + 1}:o${i + 1}`,
            regionId: `${documentId}:p${index + 1}:r${i + 1}`, region: item.region,
            text: item.text, confidence: .995, alternatives: [] }))
        assert(observations.length)
        return { page: index + 1, observations,
          regions: observations.map(item => ({ regionId: item.regionId, kind: 'text', region: item.region })),
          readingOrderEdges: observations.slice(1).map((item, i) => ({ before: observations[i].observationId, after: item.observationId })) }
      }) })
    } finally { await page.close() }
  }
  writeFileSync(new URL('ocr-items.json', import.meta.url), `${JSON.stringify({ documents, listeningPage,
    noListening: { stream: endStream, text: endItem.text, region: endItem.sourceIndex.region } }, null, 2)}\n`)
} finally { await browser.close() }
