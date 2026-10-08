#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { makeFixture } from './verify-nck1-source-materialization.mjs'
import { makeSyntheticNck1DocxFixture } from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { prepareSourceReferences, validateSourceReferences } from '../server/paper-import/sourceReferences.mjs'
import { buildAnswerOnlyHtml, buildAssembledAnswerOnlyHtml } from '../server/answer-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'

const digest = letter => `sha256:${letter.repeat(64)}`
const normalize = text => text.replace(/\s+/gu, ' ').trim()

// Original synthetic content, not a copied commercial answer booklet.
export function fixture({ listening = true } = {}) {
  const prose = 'Our well-rounded group kept the proposal clear, practical and open to different views. '
  const paragraphs = [
    'For the proposal', 'A Useful Proposal', 'Dear Editor,', prose.repeat(45), 'Yours sincerely,', 'Alex',
    'Against the proposal', 'A < B & C is an example, not markup. We prefer the alternative.',
    prose.repeat(20), prose.repeat(28), 'Scoring reference', 'Content: 5 points. Language: 7 points. Structure: 3 points.',
  ]
  const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const source = makeSyntheticNck1DocxFixture({ transformXml: () =>
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(text =>
      `<w:p><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`,
  }).sourceDocuments.find(document => document.role === 'official_answers')
  const materialization = makeFixture({ listening })
  materialization.documents[1] = { ...materialization.documents[1], mediaType: source.mediaType,
    sha256: source.sha256, byteLength: source.bytes.length }
  materialization.answers.find(answer => answer.canonicalNumber === 56).value =
    'will have been taught / will be taught / pneumonoultramicroscopicsilicovolcanoconiosis'
  materialization.answers.find(answer => answer.canonicalNumber === 65).value = 'had written / wrote'
  materialization.answers.reverse()
  const binding = { materialization, sourceDigest: digest('c'), candidateDigest: digest('d'),
    sourceDocuments: [{ documentId: 'answers', bytes: source.bytes }] }
  const sourceReferences = prepareSourceReferences(binding)
  const location = index => ({ documentSha256: source.sha256, locator: { kind: 'docx_part',
    documentId: 'answers', part: 'word/document.xml', selector: `(/w:document/w:body//w:p)[${index}]` } })
  const entry = (id, label, indexes, roles) => ({
    referenceId: `reference:${id}`, authority: 'source_reference',
    sourceLabel: label === null ? null : paragraphs[label - 1], labelSource: label === null ? null : location(label),
    paragraphs: indexes.map((index, n) => ({ paragraphId: `paragraph:${id}:${n + 1}`,
      role: roles[n], text: paragraphs[index - 1], source: location(index) })),
  })
  sourceReferences.groups[0].essays = { state: 'captured', evidence: [], entries: [
    entry('positive', 1, [2, 3, 4, 5, 6], ['title', 'salutation', 'body', 'closing', 'signature']),
    entry('negative', 7, [8], ['body']),
  ] }
  sourceReferences.groups[1].essays = { state: 'captured', evidence: [], entries: [
    entry('continuation', null, [9, 10], ['body', 'body']),
  ] }
  sourceReferences.groups[0].scoring = { state: 'captured', evidence: [], entries: [
    entry('scoring', 11, [12], ['body']),
  ] }
  sourceReferences.groups[1].scoring = { state: 'not_supplied', entries: [], evidence: [location(12)] }
  return { ...binding, sourceReferences, paperName: '合成排版样张：多范文、长答案与源评分参考' }
}

export function assemblyFixture() {
  const first = fixture()
  const second = fixture()
  second.materialization.paperId = 'paper-second-synthetic'
  for (const group of second.materialization.groups) {
    group.groupId = `second:${group.groupId}`
    for (const question of group.questions) question.questionId = `second:${question.questionId}`
  }
  for (const answer of second.materialization.answers) answer.questionId = `second:${answer.questionId}`
  const references = second.sourceReferences.groups
  second.sourceReferences = prepareSourceReferences(second)
  second.sourceReferences.groups.forEach((group, index) => {
    group.essays = references[index].essays
    group.scoring = references[index].scoring
  })
  const item = (source, slotId) => {
    const group = source.materialization.groups.find(group => group.slotId === slotId)
    return { source, detail: { id: group.groupId, paperId: source.materialization.paperId,
      groupType: group.family, questions: group.questions.map(question => ({ id: question.questionId })) } }
  }
  return { paperName: '合成混编样张：重排、跨卷、仅应用文', questionNumberStart: 73,
    items: [item(second, 'reading.b'), item(first, 'grammar-fill'), item(second, 'writing.application')] }
}

function contractChecks() {
  const input = fixture()
  const validate = sidecar => validateSourceReferences({ ...input, sidecar })
  assert.deepEqual(validate(input.sourceReferences), [])
  const prepared = prepareSourceReferences(input)
  assert.equal(prepared.groups[0].essays.state, 'unprocessed')
  assert.equal(prepared.groups[0].essays.entries.length, 0)
  assert(validate(prepared).some(issue => issue.code === 'SOURCE_REFERENCES_UNPROCESSED'))
  const reject = (change, code) => {
    const sidecar = structuredClone(input.sourceReferences)
    change(sidecar)
    assert(validate(sidecar).some(issue => issue.code === code), code)
  }
  for (const key of ['paperId', 'sourceDigest', 'candidateDigest', 'materializationDigest']) {
    reject(sidecar => { sidecar[key] = key === 'paperId' ? 'paper-another' : digest('e') }, 'SOURCE_REFERENCES_BINDING_STALE')
  }
  reject(sidecar => sidecar.groups.pop(), 'SOURCE_REFERENCES_GROUP_MISSING')
  reject(sidecar => { sidecar.groups[0].taskType = 'continuation' }, 'SOURCE_REFERENCES_GROUP_FOREIGN')
  reject(sidecar => sidecar.groups.push(structuredClone(sidecar.groups[0])), 'SOURCE_REFERENCES_GROUP_DUPLICATE')
  reject(sidecar => { sidecar.groups[0].essays.entries[1].paragraphs[0].paragraphId = 'paragraph:positive:1' }, 'SOURCE_REFERENCES_ID_DUPLICATE')
  reject(sidecar => { sidecar.groups[0].essays.entries[0].authority = 'ai_model_answer' }, 'SOURCE_REFERENCES_SCHEMA_INVALID')
  reject(sidecar => { sidecar.groups[0].essays.entries[0].sourceLabel = 'Rewritten heading' }, 'SOURCE_REFERENCES_TEXT_DISAGREES')
  reject(sidecar => { sidecar.groups[0].essays.entries[0].labelSource = null }, 'SOURCE_REFERENCES_LABEL_INVALID')
  reject(sidecar => { sidecar.groups[0].essays.entries[0].paragraphs[0].text = 'A rewritten title' }, 'SOURCE_REFERENCES_TEXT_DISAGREES')
  reject(sidecar => { sidecar.groups[0].essays.entries[0].paragraphs[0].source.locator.selector = '(/w:document/w:body//w:p)[7]' }, 'SOURCE_REFERENCES_TEXT_DISAGREES')
  reject(sidecar => { sidecar.groups[0].essays.entries[0].paragraphs[0].source.locator.selector = 'paragraph two' }, 'SOURCE_REFERENCES_LOCATION_INVALID')
  reject(sidecar => { sidecar.groups[0].essays.entries[0].paragraphs[0].source.documentSha256 = digest('e') }, 'SOURCE_REFERENCES_SOURCE_INVALID')
  reject(sidecar => {
    const paragraph = sidecar.groups[0].essays.entries[0].paragraphs[0]
    paragraph.source = { documentSha256: digest('a'), locator: { kind: 'page_region', documentId: 'paper',
      page: 1, region: { x: 0, y: 0, width: 1, height: 1 } } }
  }, 'SOURCE_REFERENCES_SOURCE_INVALID')
  assert(validateSourceReferences({ ...input, sidecar: input.sourceReferences,
    sourceDocuments: [{ documentId: 'answers', bytes: Buffer.from('changed bytes') }] })
    .some(issue => issue.code === 'SOURCE_REFERENCES_SOURCE_BYTES_CHANGED'))
  // A second answer-bearing document cannot be silently ignored for absence.
  const additional = structuredClone(input)
  additional.materialization.documents.push({ documentId: 'answers-pdf', role: 'official_answers',
    mediaType: 'application/pdf', sha256: digest('f'), byteLength: 100, pageCount: 2 })
  additional.sourceReferences = prepareSourceReferences(additional)
  for (const group of additional.sourceReferences.groups) for (const kind of ['essays', 'scoring']) {
    group[kind] = { state: 'not_supplied', entries: [], evidence: [input.sourceReferences.groups[1].scoring.evidence[0]] }
  }
  const pdfLocation = { documentSha256: digest('f'), locator: { kind: 'page_region', documentId: 'answers-pdf',
    page: 2, region: { x: 0.6, y: 0.4, width: 0.4, height: 0.6 } } }
  const pdfValidate = () => validateSourceReferences({ ...additional, sourceDocuments: null, sidecar: additional.sourceReferences })
  assert(pdfValidate().some(issue => issue.code === 'SOURCE_REFERENCES_ABSENCE_INCOMPLETE'))
  for (const group of additional.sourceReferences.groups) for (const kind of ['essays', 'scoring']) group[kind].evidence.push(structuredClone(pdfLocation))
  assert.deepEqual(pdfValidate(), [])
  additional.sourceReferences.groups[0].essays.evidence[1].locator.region.width = 0.41
  assert(pdfValidate().some(issue => issue.code === 'SOURCE_REFERENCES_LOCATION_INVALID'))
  additional.sourceReferences.groups[0].essays.evidence[1].locator.region.width = 0.4
  additional.sourceReferences.groups[0].essays.evidence[1].locator.page = 3
  assert(pdfValidate().some(issue => issue.code === 'SOURCE_REFERENCES_LOCATION_INVALID'))
  const html = buildAnswerOnlyHtml(input)
  assert.match(html, /For the proposal/)
  assert.match(html, /Against the proposal/)
  assert.match(html, /A &lt; B &amp; C/)
  assert.match(html, /will have been taught \/ will be taught/)
  assert(!html.includes('Scoring reference'))
  assert(!html.includes('application-writing prompt'))
  assert(!html.includes('Story material'))
  assert(!html.includes('data-pdf-student-product'))
  assert.match(buildAnswerOnlyHtml({ ...input, includeScoring: true }), /Scoring reference/)
  assert.throws(() => buildAnswerOnlyHtml({ ...input, sourceReferences: prepared }), /UNPROCESSED/)
  assert(!buildAnswerOnlyHtml(fixture({ listening: false })).includes('data-answer-section="transcripts"'))
  const assembly = assemblyFixture()
  const assembled = buildAssembledAnswerOnlyHtml(assembly)
  assert.deepEqual([...assembled.matchAll(/data-answer-number="(\d+)"/g)].map(match => Number(match[1])),
    Array.from({ length: 14 }, (_, index) => index + 73))
  assert.match(assembled, /data-answer-range="73-76"/)
  assert.match(assembled, /For the proposal/)
  assert.match(assembled, /Against the proposal/)
  assert(!assembled.includes('reference:continuation'))
  assert(!assembled.includes('data-transcript-segment'))
  assert(!assembled.includes('application-writing prompt'))
  assert.throws(() => buildAssembledAnswerOnlyHtml({ ...assembly, items: [assembly.items[0], assembly.items[0]] }), /唯一/)
  const missing = structuredClone(assembly)
  missing.items[1].source = null
  assert.throws(() => buildAssembledAnswerOnlyHtml(missing), /同版本/)
  const foreign = structuredClone(assembly)
  foreign.items[0].detail.paperId = 'paper-another'
  assert.throws(() => buildAssembledAnswerOnlyHtml(foreign), /同一卷/)
  const reorderedQuestions = structuredClone(assembly)
  reorderedQuestions.items[0].detail.questions.reverse()
  assert.throws(() => buildAssembledAnswerOnlyHtml(reorderedQuestions), /精确答案源/)
  const writingQuestion = structuredClone(assembly)
  writingQuestion.items[2].detail.questions = [{ id: 'invented-writing-question' }]
  assert.throws(() => buildAssembledAnswerOnlyHtml(writingQuestion), /Writing Task/)
  assert.throws(() => buildAssembledAnswerOnlyHtml({ ...assembly, questionNumberStart: Number.MAX_SAFE_INTEGER }), /安全整数/)
  console.log('PASS source-reference binding, native paragraph replay, absence, variants and independent answer content')
}

// Before Ship, --preview renders only this non-default layout sample; it does
// not execute the formal mutation/regression pack above.
async function preview(output) {
  if (existsSync(output)) throw new Error('Use a new preview directory')
  const input = fixture({ listening: false })
  const html = buildAnswerOnlyHtml({ ...input, includeScoring: true })
  mkdirSync(output, { recursive: true })
  writeFileSync(path.join(output, 'answerOnly.html'), html, { flag: 'wx' })
  const result = await renderPaginatedPaper(html, { inspect: page => page.evaluate(() => {
    const pages = [...document.querySelectorAll('.pagedjs_page_content')]
    const text = node => node.nodeType === Node.TEXT_NODE ? node.textContent
      : node.nodeName === 'BR' ? '\n' : [...node.childNodes].map(text).join('')
    const collect = selector => pages.flatMap(page => [...page.querySelectorAll(selector)])
    const paragraphs = collect('[data-reference-paragraph]').reduce((entries, node) => {
      const id = node.dataset.referenceParagraph
      entries[id] = (entries[id] || '') + text(node)
      return entries
    }, {})
    return { paragraphs, references: [...new Set(collect('[data-source-reference]').map(node => node.dataset.sourceReference))],
      keys: collect('[data-answer-number]').map(node => ({ number: Number(node.dataset.answerNumber), text: text(node) })),
      roles: collect('[data-reference-paragraph]').map(node => ({ id: node.dataset.referenceParagraph,
        align: getComputedStyle(node).textAlign, indent: getComputedStyle(node).textIndent })),
      horizontalOverflow: collect('td,p,h1,h2,h3').filter(node => node.scrollWidth > node.clientWidth + 1).length,
    }
  }) })
  writeFileSync(path.join(output, 'answerOnly-screen.html'), result.paginatedHtml, { flag: 'wx' })
  writeFileSync(path.join(output, 'answerOnly.pdf'), result.pdfBytes, { flag: 'wx' })
  for (const group of input.sourceReferences.groups) for (const kind of ['essays', 'scoring']) {
    for (const entry of group[kind].entries) for (const paragraph of entry.paragraphs) {
      assert.equal(normalize(result.inspection.paragraphs[paragraph.paragraphId]), normalize(paragraph.text), paragraph.paragraphId)
    }
  }
  assert.deepEqual(result.inspection.references, ['reference:positive', 'reference:negative', 'reference:continuation', 'reference:scoring'])
  assert.deepEqual(result.inspection.keys.map(key => key.number), Array.from({ length: 45 }, (_, i) => i + 21))
  assert.equal(normalize(result.inspection.keys.find(key => key.number === 56).text),
    'will have been taught / will be taught / pneumonoultramicroscopicsilicovolcanoconiosis')
  assert.equal(normalize(result.inspection.keys.find(key => key.number === 65).text), 'had written / wrote')
  assert.equal(result.inspection.roles.find(role => role.id === 'paragraph:positive:4').align, 'right')
  assert.equal(result.inspection.roles.find(role => role.id === 'paragraph:positive:5').align, 'right')
  assert.equal(result.inspection.horizontalOverflow, 0)
  const report = { status: 'synthetic_local_layout_candidate', pageCount: result.pageCount, pdfSha256: sha256(result.pdfBytes),
    inspectedReferenceParagraphs: Object.keys(result.inspection.paragraphs).length, answerCount: result.inspection.keys.length,
    includeScoring: true, listening: false, reviewRevision: null, publication: null }
  writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
  console.log(JSON.stringify(report))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) try {
  if (process.argv[2] === '--preview') {
    if (!process.argv[3]) throw new Error('--preview needs a new output directory')
    await preview(path.resolve(process.argv[3]))
  } else contractChecks()
} finally {
  await closeChromiumPool()
}
