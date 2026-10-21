import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { makeDrawingAreaCompilation, drawingAreaConsumption } from '../test-fixtures/paper-canonical/applicationDrawingAreaFixture.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { planStudentProductPdf } from '../server/draft-paper/studentProductPdf.mjs'
import { inspectGroups } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { buildAnswerOnlyHtml } from '../server/answer-renderer.mjs'
import { prepareSourceReferences } from '../server/paper-import/sourceReferences.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import oldConsumer from '../standards/paper-canonical/consumers/print-pdf-v48.json' with { type: 'json' }

export function drawingAreaPrintFixture({ drawing = true, longOpening = false, listening = true, labelMarks = [], structuredAnswerRegion = false, consumerContractRef } = {}) {
  const ready = makeDrawingAreaCompilation({ drawing, longOpening, listening, labelMarks, structuredAnswerRegion })
  const consumption = drawingAreaConsumption(ready.compilation, consumerContractRef)
  const groups = ready.compilation.artifacts.canonicalPaper.questionGroups
  const items = groups.map(group => ({
    detail: { id: group.identity.groupId, paperId: consumption.paperId,
      groupType: ['application-writing', 'continuation-writing'].includes(group.contractRef.familyContractId) ? 'writing'
        : group.contractRef.familyContractId === 'grammar-fill' ? 'grammar_cloze'
          : group.contractRef.familyContractId === 'seven-choices' ? 'seven_choices'
          : group.contractRef.familyContractId,
      passage: '', questions: group.questionRefs.map(ref => ({ id: ref.questionId, stem: '', options: [] })) },
    score: group.contractRef.familyContractId === 'application-writing' ? 15 : 0,
  }))
  const html = buildPrintHtml({ title: 'World Smile Day · Synthetic Drawing Area Fixture',
    versionType: 'student', printStyle: 'exam', items,
    blocks: items.map(item => ({ type: 'question_group', questionGroupId: item.detail.id, score: item.score })),
    questionNumberStart: 1, canonicalConsumption: consumption })
  return { ...ready, consumption, html }
}

export function verifyDrawingAreaPrint() {
  const current = drawingAreaPrintFixture()
  assert.match(current.html, /data-canonical-drawing-area-id=/)
  assert.equal((current.html.match(/作图处/g) || []).length, 1)
  assert(current.html.indexOf('This is my logo') < current.html.indexOf('作图处'))
  assert(current.html.indexOf('作图处') < current.html.indexOf('Li Hua from Class 2'))
  const old = drawingAreaPrintFixture({ drawing: false })
  assert(!old.html.includes('data-canonical-drawing-area-id='))
  const legacy = drawingAreaPrintFixture({ drawing: false, consumerContractRef: {
    id: oldConsumer.consumerId, version: oldConsumer.version, digest: oldConsumer.contractDigest,
  } })
  assert.equal(old.html, legacy.html, 'no drawing area preserves old/current consumer Print bytes')
  console.log('PASS source-backed drawing label occurs once in Print HTML, ordered above signature')
}

async function inspectDrawingAreaGroups(page) {
  const groups = await inspectGroups(page)
  const drawing = await page.evaluate(() => [...document.querySelectorAll('.pagedjs_page [data-canonical-drawing-area-id]')].map(area => {
    const box = area.closest('.canonical-application-response')
    const rect = element => {
      const r = element.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    return { groupId: area.closest('[data-canonical-group-id]').dataset.canonicalGroupId,
      area: rect(area), box: rect(box), top: rect(area.parentElement),
      given: rect(area.previousElementSibling),
      signature: rect(box.querySelector('.canonical-application-given-bottom')) }
  }))
  assert.equal(drawing.length, 1, 'one drawing area on one paginated page')
  for (const geometry of drawing) {
    assert.ok(Math.abs(geometry.area.width - geometry.area.height) <= 1)
    assert.ok(Math.abs(geometry.area.width / geometry.top.width - .25) <= .003)
    assert.ok(geometry.box.height >= 65 / 25.4 * 96 - 1)
    assert.ok(geometry.area.bottom < geometry.signature.y)
    assert.ok(geometry.given.right <= geometry.area.x + 1)
    assert.ok(geometry.signature.bottom <= geometry.box.bottom)
    groups.find(group => group.id === geometry.groupId).drawingGeometry = geometry
  }
  return groups
}

async function preview(destination) {
  mkdirSync(destination, { recursive: true })
  const base = drawingAreaPrintFixture()
  const long = drawingAreaPrintFixture({ longOpening: true })
  writeFileSync(path.join(destination, 'print.html'), base.html)
  writeFileSync(path.join(destination, 'print-long-opening.html'), long.html)
  writeFileSync(path.join(destination, 'consumption.json'), JSON.stringify(drawingAreaConsumption(base.compilation, consumerContractRefs.screen)))
  writeFileSync(path.join(destination, 'consumption-long.json'), JSON.stringify(drawingAreaConsumption(long.compilation, consumerContractRefs.screen)))
  const materialization = JSON.parse(new TextDecoder().decode(base.sourceInput.materializationBytes))
  const refs = prepareSourceReferences({ materialization,
    sourceDigest: base.imported.candidate.source.sha256, candidateDigest: base.imported.candidate.candidateDigest })
  const answerDocument = materialization.documents.find(document => document.documentId === 'answers')
  for (const group of refs.groups) for (const role of ['essays', 'scoring']) {
    group[role] = { state: 'not_supplied', entries: [],
      evidence: [{ documentSha256: answerDocument.sha256,
        locator: { kind: 'page_region', documentId: 'answers', page: 1,
          region: { x: 0, y: 0, width: 1, height: 1 } } }] }
  }
  const answers = buildAnswerOnlyHtml({ paperName: 'Synthetic Drawing Area Fixture', materialization,
    sourceReferences: refs, sourceDigest: base.imported.candidate.source.sha256,
    candidateDigest: base.imported.candidate.candidateDigest, sourceInput: base.sourceInput })
  assert(!answers.includes('作图处') && !answers.includes('data-canonical-drawing-area-id='))
  writeFileSync(path.join(destination, 'answerOnly.html'), answers)
  const metadata = { fixture: 'synthetic; no real paper data', products: {}, screenGroupId:
    base.consumption.selections.find(item => item.familyContractId === 'application-writing').groupIds[0] }
  try {
    for (const edition of ['largeComplete', 'largeNoListening', 'economy8']) {
      const fixture = edition === 'largeComplete' ? base : drawingAreaPrintFixture({ listening: false })
      const result = await planStudentProductPdf(fixture.html, {
        edition, render: html => renderPaginatedPaper(html, { inspect: inspectDrawingAreaGroups }),
      })
      writeFileSync(path.join(destination, `${edition}.pdf`), result.pdfBytes)
      writeFileSync(path.join(destination, `${edition}.html`), result.paginatedHtml)
      const application = result.inspection.find(group => group.applicationPresent)
      assert(application?.applicationAnswerPages?.length === 1)
      metadata.products[edition] = { pageCount: result.pageCount, applicationPage: application.applicationAnswerPages[0],
        layout: result.layout, searchedCandidates: result.searchedCandidates, geometry: application.drawingGeometry }
      writeFileSync(path.join(destination, 'metadata.json'), JSON.stringify(metadata, null, 2))
      console.log(edition, metadata.products[edition])
    }
  } finally { await closeChromiumPool() }
}

async function serve(destination) {
  const { createServer } = await import('../app/node_modules/vite/dist/node/index.js')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const server = await createServer({ configFile: false, root: path.join(root, 'app'),
    server: { host: '127.0.0.1', port: 5197, strictPort: true, fs: { allow: [root, destination] } },
    plugins: [{ name: 'drawing-area-synthetic-fixture', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/qa/canonical-application-writing-consumption.json') {
          res.setHeader('Content-Type', 'application/json')
          res.end(readFileSync(path.join(destination, req.headers.referer?.includes('long=1') ? 'consumption-long.json' : 'consumption.json')))
        } else if (req.url === '/print.html') {
          res.setHeader('Content-Type', 'text/html')
          res.end(readFileSync(path.join(destination, 'print.html')))
        } else next()
      })
    } }] })
  await server.listen()
  console.log('Drawing-area QA server http://127.0.0.1:5197')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destination = process.argv[3]
  assert(destination && path.isAbsolute(destination), 'Provide an absolute preview directory')
  if (process.argv[2] === '--serve') await serve(destination)
  else { verifyDrawingAreaPrint(); await preview(destination) }
}
