#!/usr/bin/env node
// Offline capture/layout lane only. No Review, DB, promotion or production API.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { importCanonicalCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import {
  assertSourceReferences, prepareSourceReferences, sourceReferencesSchema,
} from '../../server/paper-import/sourceReferences.mjs'
import { buildAnswerOnlyHtml } from '../../server/answer-renderer.mjs'
import { renderPaginatedPaper } from '../../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../../server/draft-paper/chromiumPool.mjs'

function option(name) {
  const index = process.argv.indexOf(name)
  const value = index < 0 ? null : process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`)
  return path.resolve(value)
}

function writeNew(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, value, { flag: 'wx' })
}

const normalize = value => value.replace(/\s+/gu, ' ').trim()

let activeQaOutput = null
try {
  const command = process.argv[2]
  if (!['prepare', 'finalize', 'qa'].includes(command)) throw new Error('Use prepare|finalize|qa --paper-dir <workspace> --output <new path>; finalize adds --input, qa adds --references')
  const loaded = loadNck1ReviewSource(option('--paper-dir'))
  if (loaded.analyzedPackage) throw new Error('This capture lane requires raw-source materialization')
  const imported = importCanonicalCandidate(loaded.sourceInput)
  if (!imported.candidate || imported.issues.length) throw new Error(`Invalid source candidate: ${imported.issues[0]?.code}`)
  const binding = {
    materialization: loaded.materialization,
    sourceDigest: imported.candidate.source.sha256,
    candidateDigest: imported.candidate.candidateDigest,
    sourceDocuments: loaded.sourceInput.documents,
  }
  const output = option('--output')
  if (command === 'prepare') {
    writeNew(output, `${JSON.stringify({
      schemaVersion: 'source-references-request-v1',
      outputSchema: sourceReferencesSchema,
      sourceDocuments: loaded.manifest.documents,
      instructions: 'Capture all source essays/labels/paragraphs and scoring references. Source text only; no AI writing, summaries or legacy modelAnswer conversion. Review every answer-bearing document before declaring not_supplied. Keep unprocessed when incomplete. This is local capture, not Review/publication or source-fidelity approval.',
      template: prepareSourceReferences(binding),
    }, null, 2)}\n`)
    console.log(JSON.stringify({ status: 'local_capture_prepared', output, paperId: loaded.materialization.paperId }))
  } else {
    const input = command === 'finalize' ? option('--input') : option('--references')
    const referencesBytes = readFileSync(input)
    const sourceReferences = JSON.parse(referencesBytes.toString('utf8'))
    assertSourceReferences({ ...binding, sidecar: sourceReferences })
    if (command === 'finalize') {
      writeNew(output, `${stableStringify(sourceReferences)}\n`)
      console.log(JSON.stringify({ status: 'local_capture_finalized', output, sourceReferencesDigest: sha256(readFileSync(output)), sourceFidelity: 'native_docx_paragraphs_replayed_pdf_text_requires_source_review' }))
    } else {
      if (existsSync(output)) throw new Error('QA output must be a new directory; preserve previous evidence')
      const includeScoring = process.argv.includes('--include-scoring')
      const html = buildAnswerOnlyHtml({ ...binding, sourceReferences,
        paperName: loaded.config.provenance.paperName, includeScoring })
      mkdirSync(output, { recursive: true })
      activeQaOutput = output
      writeNew(path.join(output, 'answerOnly.html'), html)
      const rendered = await renderPaginatedPaper(html, { inspect: async page => page.evaluate(() => {
        const pages = [...document.querySelectorAll('.pagedjs_page_content')]
        const collect = selector => pages.flatMap(page => [...page.querySelectorAll(selector)])
        // Fragment boundaries can be inside a hyphenated word. Preserve the
        // original text nodes and explicit BRs; innerText adds visual breaks.
        const text = node => node.nodeType === Node.TEXT_NODE ? node.textContent
          : node.nodeName === 'BR' ? '\n' : [...node.childNodes].map(text).join('')
        const texts = (selector, attribute) => collect(selector).reduce((result, node) => {
          const id = node.getAttribute(attribute)
          result[id] = (result[id] || '') + text(node)
          return result
        }, {})
        const transcripts = collect('[data-transcript-segment] .transcript').reduce((result, node) => {
          const id = node.closest('[data-transcript-segment]').dataset.transcriptSegment
          result[id] = (result[id] || '') + text(node)
          return result
        }, {})
        const firstPage = document.querySelector('.pagedjs_page').getBoundingClientRect()
        const area = document.querySelector('.pagedjs_area').getBoundingClientRect()
        const style = selector => {
          const css = getComputedStyle(collect(selector)[0])
          return { fontSize: parseFloat(css.fontSize), lineHeight: parseFloat(css.lineHeight), align: css.textAlign }
        }
        const nameBox = collect('.paper-name')[0].getBoundingClientRect()
        const subjectBox = collect('h1')[0].getBoundingClientRect()
        const textOutsidePage = pages.flatMap(page => {
          const area = page.closest('.pagedjs_page').querySelector('.pagedjs_area').getBoundingClientRect()
          const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT)
          const range = document.createRange()
          const failures = []
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue
            range.selectNodeContents(walker.currentNode)
            if ([...range.getClientRects()].some(rect => rect.width && rect.height
              && (rect.top < area.top - 1 || rect.bottom > area.bottom + 1
                || rect.left < area.left - 1 || rect.right > area.right + 1))) failures.push(true)
          }
          return failures
        }).length
        return {
          geometry: { width: firstPage.width, height: firstPage.height,
            top: area.top - firstPage.top, left: area.left - firstPage.left,
            right: firstPage.right - area.right, bottom: firstPage.bottom - area.bottom,
            headingGap: subjectBox.top - nameBox.bottom },
          typography: { paperName: style('.paper-name'), subject: style('h1'), body: style('td') },
          keys: collect('[data-answer-number]').map(node => ({ number: Number(node.dataset.answerNumber), text: text(node) })),
          ranges: collect('[data-answer-range]').map(node => ({ range: node.dataset.answerRange,
            numbers: [...node.querySelectorAll('[data-answer-number]')].map(answer => Number(answer.dataset.answerNumber)) })),
          grammarRows: collect('.answer-keys--5 tr').map(row => [...row.querySelectorAll('[data-answer-number]')]
            .map(answer => Number(answer.dataset.answerNumber))),
          paragraphs: texts('[data-reference-paragraph]', 'data-reference-paragraph'),
          labels: texts('[data-reference-label]', 'data-reference-label'),
          transcripts,
          horizontalOverflow: collect('td,p,h1,h2,h3').filter(node => node.scrollWidth > node.clientWidth + 1).length,
          textOutsidePage,
        }
      }) })
      writeNew(path.join(output, 'answerOnly-screen.html'), rendered.paginatedHtml)
      writeNew(path.join(output, 'answerOnly.pdf'), rendered.pdfBytes)
      const geometry = rendered.inspection.geometry
      if (Object.entries({ width: 210, height: 297, top: 21, left: 20, right: 20, bottom: 24 })
        .some(([key, mm]) => Math.abs(geometry[key] - mm * 96 / 25.4) > 1)) {
        throw new Error(`Rendered page is not the A4 answer geometry: ${JSON.stringify(geometry)}`)
      }
      const { paperName, subject, body } = rendered.inspection.typography
      if (Math.abs(paperName.fontSize - 24) > 0.1 || paperName.lineHeight !== 36 || paperName.align !== 'center'
        || Math.abs(subject.fontSize - 20 * 96 / 72) > 0.1 || subject.align !== 'center'
        || body.fontSize !== 16 || body.lineHeight !== 26 || Math.abs(geometry.headingGap - 8 * 96 / 72) > 0.1) {
        throw new Error('Rendered answer typography is not the selected layout draft')
      }
      const listening = binding.materialization.listening
      const expectedKeys = [
        ...(listening.state === 'captured' ? listening.answers : []),
        ...binding.materialization.answers,
      ].sort((a, b) => a.canonicalNumber - b.canonicalNumber)
      if (rendered.inspection.keys.length !== expectedKeys.length
        || expectedKeys.some((answer, index) => rendered.inspection.keys[index].number !== answer.canonicalNumber
          || normalize(rendered.inspection.keys[index].text) !== normalize(answer.value))) {
        throw new Error('Rendered answers changed their source values, coverage or order')
      }
      const ranges = [
        ...(listening.state === 'captured' ? [[1, 5], [6, 10], [11, 15], [16, 20]] : []),
        [21, 23], [24, 27], [28, 31], [32, 35], [36, 40], [41, 45], [46, 50], [51, 55],
      ].map(([first, last]) => ({ range: `${first}-${last}`, numbers: Array.from({ length: last - first + 1 }, (_, i) => first + i) }))
      if (JSON.stringify(rendered.inspection.ranges) !== JSON.stringify(ranges)
        || JSON.stringify(rendered.inspection.grammarRows) !== JSON.stringify([[56, 57, 58, 59, 60], [61, 62, 63, 64, 65]])) {
        throw new Error('Rendered answer ranges or five-column grammar rows disagree with the reference format')
      }
      for (const group of sourceReferences.groups) {
        for (const kind of includeScoring ? ['essays', 'scoring'] : ['essays']) {
          for (const entry of group[kind].entries) {
            if (entry.sourceLabel !== null
              && normalize(rendered.inspection.labels[entry.referenceId] || '') !== normalize(entry.sourceLabel)) {
              throw new Error(`Rendered source label changed: ${entry.referenceId}`)
            }
            for (const paragraph of entry.paragraphs) {
              if (normalize(rendered.inspection.paragraphs[paragraph.paragraphId] || '') !== normalize(paragraph.text)) {
                throw new Error(`Rendered source paragraph changed: ${paragraph.paragraphId}`)
              }
            }
          }
        }
      }
      if (listening.state === 'captured') {
        for (const segment of listening.transcript) {
          if (normalize(rendered.inspection.transcripts[segment.segmentId] || '') !== normalize(segment.text)) {
            throw new Error(`Rendered source transcript changed: ${segment.segmentId}; retained PDF/DOM at ${output}`)
          }
        }
      }
      if (rendered.inspection.horizontalOverflow) throw new Error('Answer booklet text overflows its columns')
      if (rendered.inspection.textOutsidePage) throw new Error('Answer booklet text exceeds the printable page area')
      const report = {
        status: 'local_layout_candidate', edition: 'answerOnly', layout: 'reference-v2',
        paperId: binding.materialization.paperId,
        sourceDigest: binding.sourceDigest, candidateDigest: binding.candidateDigest,
        sourceReferencesDigest: sha256(referencesBytes), materializationDigest: sourceReferences.materializationDigest,
        pdfSha256: sha256(rendered.pdfBytes), pageCount: rendered.pageCount,
        geometryPx: geometry, typographyPx: rendered.inspection.typography,
        includeScoring, inspectedAnswerNumbers: rendered.inspection.keys.map(key => key.number),
        inspectedAnswerRanges: rendered.inspection.ranges, grammarRows: rendered.inspection.grammarRows,
        inspectedReferenceParagraphs: Object.keys(rendered.inspection.paragraphs).length,
        inspectedTranscriptSegments: listening.state === 'captured' ? listening.transcript.length : 0,
        sourceFidelity: 'native_docx_paragraphs_replayed_pdf_text_requires_source_review',
        reviewRevision: null, publication: null,
      }
      writeNew(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
      console.log(JSON.stringify({ ...report, output }))
    }
  }
} catch (error) {
  if (activeQaOutput) writeNew(path.join(activeQaOutput, 'failure-report.json'), `${JSON.stringify({
    status: 'failed_local_layout_candidate', error: error.message,
  }, null, 2)}\n`)
  console.error(error.message)
  process.exitCode = 1
} finally {
  await closeChromiumPool()
}
