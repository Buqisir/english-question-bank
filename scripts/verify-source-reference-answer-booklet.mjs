#!/usr/bin/env node
// Geometry checks run ONLY with --preview, not by the Full CI plan.
// Use fresh output directories for each invocation:
// for sample in long multi single short; do
//   node scripts/verify-source-reference-answer-booklet.mjs --preview "/tmp/answer-grid-$sample" --grammar-grid-case "$sample"
// done
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { makeFixture } from './verify-nck1-source-materialization.mjs'
import { makeSyntheticNck1DocxFixture } from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { prepareSourceReferences, validateSourceReferences, sourceReferenceBlocks } from '../server/paper-import/sourceReferences.mjs'
import { buildAnswerOnlyHtml, buildAssembledAnswerOnlyHtml } from '../server/answer-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'

const digest = letter => `sha256:${letter.repeat(64)}`
const normalize = text => text.replace(/\s+/gu, ' ').trim()

// Original synthetic content, not a copied commercial answer booklet.
export function fixture({ listening = true, structuredScoring = false } = {}) {
  const prose = 'Our well-rounded group kept the proposal clear, practical and open to different views. '
  const paragraphs = [
    'For the proposal', 'A Useful Proposal', 'Dear Editor,', prose.repeat(45), 'Yours sincerely,', 'Alex',
    'Against the proposal', 'A < B & C is an example, not markup. We prefer the alternative.',
    prose.repeat(20), prose.repeat(28), 'Scoring reference', 'Content: 5 points. Language: 7 points. Structure: 3 points.',
  ]
  const scoringRows = [
    ['档次', '要求'], ['第五档', '内容完整，表达准确，衔接自然。'],
    ['第四档', '基本覆盖内容，个别错误不影响理解。'], ['第三档', '主要内容可辨；A < B & C 保留为原文。'],
    ['第二档', '内容有缺漏，表达需要读者推测。'], ['第一档', '仅有零散信息。'], ['零分', ''],
  ]
  const afterTable = 'Apply the source criteria together, not as an automatic score.'
  const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const paragraphXml = text => `<w:p><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`
  const scoringXml = structuredScoring ? `<w:tbl>${scoringRows.map(row =>
    `<w:tr>${row.map(text => `<w:tc>${paragraphXml(text)}</w:tc>`).join('')}</w:tr>`,
  ).join('')}</w:tbl>${paragraphXml(afterTable)}` : ''
  const source = makeSyntheticNck1DocxFixture({ transformXml: () =>
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(paragraphXml).join('')}${scoringXml}</w:body></w:document>`,
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
  const sourceReferences = prepareSourceReferences({ ...binding, structuredScoring })
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
  if (structuredScoring) {
    const scoring = sourceReferences.groups[0].scoring.entries[0]
    scoring.blocks = [
      { kind: 'paragraph', paragraph: scoring.paragraphs[0] },
      { kind: 'table', tableId: 'table:scoring', rows: scoringRows.map((row, r) => row.map((text, c) => ({
        cellId: `cell:scoring:${r + 1}:${c + 1}`, text, source: location(13 + r * 2 + c),
      }))) },
      { kind: 'paragraph', paragraph: { paragraphId: 'paragraph:scoring:after', role: 'body',
        text: afterTable, source: location(27) } },
    ]
    delete scoring.paragraphs
  }
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

function continuationContractChecks() {
  for (const structuredScoring of [false, true]) {
    const input = fixture({ structuredScoring })
    const bytes = Buffer.from('Synthetic four-page PDF answer source')
    const document = { documentId: 'answers', role: 'official_answers', mediaType: 'application/pdf',
      sha256: sha256(bytes), byteLength: bytes.length, pageCount: 4 }
    input.materialization.documents[1] = document
    // An independently valid binding must still be rejected as a continuation
    // when its document ID differs, even if its exact bytes/SHA are the same.
    input.materialization.documents.push({ ...document, documentId: 'answers-other' })
    input.sourceDocuments = ['answers', 'answers-other'].map(documentId => ({ documentId, bytes }))
    const location = (page, documentId = 'answers') => ({ documentSha256: document.sha256,
      locator: { kind: 'page_region', documentId, page, region: { x: 0, y: 0, width: 1, height: 1 } } })
    const groups = input.sourceReferences.groups
    input.sourceReferences = { ...prepareSourceReferences(input), groups }
    for (const group of groups) for (const kind of ['essays', 'scoring']) {
      const section = group[kind]
      section.evidence = section.evidence.flatMap(() => [location(1), location(1, 'answers-other')])
      for (const entry of section.entries) {
        if (entry.labelSource) entry.labelSource = location(1)
        for (const block of sourceReferenceBlocks(entry)) {
          if (block.kind === 'paragraph') block.paragraph.source = location(1)
          else for (const cell of block.rows.flat()) cell.source = location(1)
        }
      }
    }
    // PDF table cells need distinct locations, just like native DOCX cells.
    if (structuredScoring) {
      input.sourceReferences.schemaVersion = 'source-references-v2'
      const cells = groups[0].scoring.entries[0].blocks[1].rows.flat()
      cells.forEach((cell, index) => {
        cell.source.locator.region = { x: 0, y: index / cells.length, width: 1, height: 1 / cells.length }
      })
    }
    const validate = sidecar => validateSourceReferences({ ...input, sidecar })
    const body = sidecar => sidecar.groups[0].essays.entries[0].paragraphs[2]
    assert.deepEqual(validate(input.sourceReferences), [], 'legacy shape remains valid')
    const legacy = structuredClone(input.sourceReferences)
    const legacyHtml = buildAnswerOnlyHtml(input)
    assert.deepEqual(input.sourceReferences, legacy, 'legacy reads do not add or rewrite fields')
    body(input.sourceReferences).continuationSources = [location(2)]
    assert.deepEqual(validate(input.sourceReferences), [], `${input.sourceReferences.schemaVersion}: two-page body`)
    const html = buildAnswerOnlyHtml(input)
    assert.equal(html, legacyHtml, 'provenance does not change rendered output')
    const paragraph = body(input.sourceReferences)
    const rendered = [...html.matchAll(/<p\b[^>]*data-reference-paragraph="paragraph:positive:3"[^>]*>([\s\S]*?)<\/p>/gu)]
    assert.equal(rendered.length, 1, 'a continued paragraph renders as one p')
    assert.equal(rendered[0][1], paragraph.text)
    const reject = (label, change, code) => {
      const sidecar = structuredClone(input.sourceReferences)
      change(body(sidecar), sidecar)
      assert(validate(sidecar).some(issue => issue.code === code), `${sidecar.schemaVersion}: ${label}: ${code}`)
    }
    const sourceError = 'SOURCE_REFERENCES_CONTINUATION_SOURCE_INVALID'
    const locationError = 'SOURCE_REFERENCES_CONTINUATION_LOCATION_INVALID'
    const roleError = 'SOURCE_REFERENCES_CONTINUATION_ROLE_INVALID'
    reject('different document ID', p => { p.continuationSources[0].locator.documentId = 'answers-other' }, sourceError)
    reject('different SHA', p => { p.continuationSources[0].documentSha256 = digest('e') }, sourceError)
    reject('DOCX continuation', p => {
      p.continuationSources[0].locator = { kind: 'docx_part', documentId: 'answers',
        part: 'word/document.xml', selector: '(/w:document/w:body//w:p)[1]' }
    }, locationError)
    reject('DOCX first fragment', p => {
      p.source.locator = { kind: 'docx_part', documentId: 'answers',
        part: 'word/document.xml', selector: '(/w:document/w:body//w:p)[1]' }
    }, locationError)
    reject('non-adjacent page', p => { p.continuationSources[0].locator.page = 3 }, locationError)
    reject('descending page', p => { p.source.locator.page = 3 }, locationError)
    reject('duplicate page', p => { p.continuationSources[0].locator.page = 1 }, locationError)
    reject('later skipped page', p => { p.continuationSources.push(location(4)) }, locationError)
    reject('later repeated page', p => { p.continuationSources.push(location(2)) }, locationError)
    reject('empty array', p => { p.continuationSources = [] }, 'SOURCE_REFERENCES_SCHEMA_INVALID')
    reject('out-of-bounds region', p => { p.continuationSources[0].locator.region.x = 0.1 }, 'SOURCE_REFERENCES_LOCATION_INVALID')
    reject('page beyond source', p => {
      p.source.locator.page = 4
      p.continuationSources[0].locator.page = 5
    }, 'SOURCE_REFERENCES_LOCATION_INVALID')
    reject('scoring paragraph', (p, sidecar) => {
      const scoring = sourceReferenceBlocks(sidecar.groups[0].scoring.entries[0])[0].paragraph
      scoring.continuationSources = structuredClone(p.continuationSources)
    }, roleError)
    for (const role of ['title', 'label', 'salutation', 'closing', 'signature']) {
      reject(`non-body ${role}`, p => { p.role = role }, roleError)
    }
    body(input.sourceReferences).continuationSources.push(location(3), location(4))
    assert.deepEqual(validate(input.sourceReferences), [], 'all ordered fragments are validated')
  }
  console.log('PASS v1/v2 continued paragraph provenance, legacy output, single-p rendering and fail-closed mutations')
}

function answerLabelChecks() {
  const labels = html => [...html.matchAll(/<h3 class="reference-label"[^>]*>([\s\S]*?)<\/h3>/gu)]
    .map(match => match[1])
  for (const structuredScoring of [false, true]) {
    const input = fixture({ structuredScoring })
    const original = structuredClone(input.sourceReferences)
    const html = buildAnswerOnlyHtml(input)
    assert.deepEqual(labels(html), ['For the proposal', 'Against the proposal', '参考范文'],
      'source-printed labels stay exact; a single unlabeled essay gets no number')
    assert.deepEqual(input.sourceReferences, original, 'display labels do not rewrite source fields')
    assert.match(html, /aria-label="听力原文"><h2>听力原文<\/h2><article[^>]+><h3 class="transcript-label">Text 1<\/h3>/u)
    assert.equal((html.match(/<h2>听力原文<\/h2>/gu) || []).length, 1)

    const entries = input.sourceReferences.groups[0].essays.entries
    for (const entry of entries) {
      entry.sourceLabel = null
      entry.labelSource = null
    }
    assert.deepEqual(labels(buildAnswerOnlyHtml(input)), ['参考范文一', '参考范文二', '参考范文'])
    // Number by source order even when some entries carry their own label.
    entries[0].sourceLabel = original.groups[0].essays.entries[0].sourceLabel
    entries[0].labelSource = original.groups[0].essays.entries[0].labelSource
    assert.deepEqual(labels(buildAnswerOnlyHtml(input)), ['For the proposal', '参考范文二', '参考范文'])
    entries[0].sourceLabel = null
    entries[0].labelSource = null
    for (let number = 3; number <= 11; number++) {
      const entry = structuredClone(entries[1])
      entry.referenceId = `reference:variant:${number}`
      entry.paragraphs.forEach((paragraph, index) => { paragraph.paragraphId = `paragraph:variant:${number}:${index}` })
      entries.push(entry)
    }
    assert.deepEqual(labels(buildAnswerOnlyHtml(input)).slice(8, 11), ['参考范文九', '参考范文十', '参考范文十一'])
    const group = input.materialization.groups.find(group => group.writingTask?.taskType === 'application')
    const item = { source: input, detail: { id: group.groupId, paperId: input.materialization.paperId, questions: [] } }
    const assembled = buildAssembledAnswerOnlyHtml({ paperName: input.paperName, items: [item] })
    assert.deepEqual(labels(assembled), labels(buildAnswerOnlyHtml(input)).slice(0, 11))
    assert(!assembled.includes('源参考'))
    assert(!assembled.includes('<h2>听力原文</h2>'), 'writing-only selections do not invent listening')

    const questions = [1, 2, 3, 4, 5].map(number => ({ questionId: `question:listening:${number}` }))
    const listeningItem = { source: input,
      detail: { id: 'group:listening:first', paperId: input.materialization.paperId, groupType: 'listening',
        questions: questions.map(question => ({ id: question.questionId })) },
      canonicalGroup: { groupId: 'group:listening:first', paperId: input.materialization.paperId,
        groupType: 'listening', questions } }
    const listeningHtml = buildAssembledAnswerOnlyHtml({ paperName: input.paperName, items: [listeningItem] })
    assert.match(listeningHtml, /aria-label="听力原文"><h2>听力原文<\/h2><article[^>]+><h3 class="transcript-label">Text 1<\/h3>/u)
    assert.equal((listeningHtml.match(/<h2>听力原文<\/h2>/gu) || []).length, 1)
  }
  assert(!buildAnswerOnlyHtml(fixture({ listening: false })).includes('<h2>听力原文</h2>'))
  console.log('PASS v1/v2 source labels, single/multiple essay numbering and whole/assembled transcript headings')
}

function contractChecks() {
  answerLabelChecks()
  continuationContractChecks()
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
  const structured = fixture({ structuredScoring: true })
  assert.deepEqual(validateSourceReferences({ ...structured, sidecar: structured.sourceReferences }), [])
  const tableHtml = buildAnswerOnlyHtml({ ...structured, includeScoring: true })
  assert.match(tableHtml, /data-reference-cell="cell:scoring:3:2"/)
  assert.match(tableHtml, /A &lt; B &amp; C 保留为原文/)
  assert(!buildAnswerOnlyHtml(structured).includes('data-reference-table='))
  assert(tableHtml.indexOf('data-reference-paragraph="paragraph:scoring:1"') < tableHtml.indexOf('data-reference-table="table:scoring"'))
  assert(tableHtml.indexOf('data-reference-table="table:scoring"') < tableHtml.indexOf('data-reference-paragraph="paragraph:scoring:after"'))
  for (const [change, code] of [
    [table => table.rows[1].pop(), 'SOURCE_REFERENCES_TABLE_INVALID'],
    [table => table.rows.reverse(), 'SOURCE_REFERENCES_TABLE_INVALID'],
    [table => { table.rows[0][0].cellId = table.tableId }, 'SOURCE_REFERENCES_ID_DUPLICATE'],
    [table => { table.rows[0][0].text = 'Changed score' }, 'SOURCE_REFERENCES_TEXT_DISAGREES'],
    [table => { table.rows[0][0].source.documentSha256 = digest('e') }, 'SOURCE_REFERENCES_SOURCE_INVALID'],
    [table => { table.rows[0][0].source = structuredClone(table.rows[0][1].source) }, 'SOURCE_REFERENCES_TABLE_INVALID'],
  ]) {
    const sidecar = structuredClone(structured.sourceReferences)
    change(sidecar.groups[0].scoring.entries[0].blocks[1])
    assert(validateSourceReferences({ ...structured, sidecar }).some(issue => issue.code === code), code)
  }
  console.log('PASS source-reference binding, native paragraph replay, absence, variants and independent answer content')
}

// Before Ship, --preview renders only this non-default layout sample; it does
// not execute the formal mutation/regression pack above.
async function preview(output) {
  if (existsSync(output)) throw new Error('Use a new preview directory')
  const input = fixture({ listening: false, structuredScoring: process.argv.includes('--structured-scoring') })
  const caseIndex = process.argv.indexOf('--grammar-grid-case')
  const grammarCase = caseIndex >= 0 ? process.argv[caseIndex + 1] : process.argv.includes('--grammar-grid') ? 'long' : null
  if (grammarCase) {
    // Reproduce isolated numbers when short and long answers share five columns.
    const cases = {
      long: ['are arranged', 'Originating', 'as', 'have gone', 'whose',
        'repetitive/repeated', 'a', 'studios', 'and', 'while / though / although'],
      multi: Array(10).fill('pneumonoultramicroscopicsilicovolcanoconiosis'),
      single: ['w'.repeat(150), 'a', 'as', 'of', 'the', 'a', 'as', 'of', 'the', 'a'],
      short: ['a', 'of', 'the', 'was', 'whose', 'to', 'an', 'in', 'and', 'as'],
    }
    const values = cases[grammarCase]
    if (!values) throw new Error('Unknown --grammar-grid-case')
    for (const answer of input.materialization.answers) {
      if (answer.canonicalNumber >= 56) answer.value = values[answer.canonicalNumber - 56]
    }
    input.sourceReferences.materializationDigest = prepareSourceReferences(input).materializationDigest
  }
  const html = buildAnswerOnlyHtml({ ...input, includeScoring: true })
  mkdirSync(output, { recursive: true })
  writeFileSync(path.join(output, 'answerOnly.html'), html, { flag: 'wx' })
  const result = await renderPaginatedPaper(html, { inspect: page => page.evaluate(() => {
    const pages = [...document.querySelectorAll('.pagedjs_page_content')]
    const text = node => node.nodeType === Node.TEXT_NODE ? node.textContent
      : node.nodeName === 'BR' ? '\n' : [...node.childNodes].map(text).join('')
    const collect = selector => pages.flatMap(page => [...page.querySelectorAll(selector)])
    const bounds = node => {
      const { left, right, top, bottom } = node.getBoundingClientRect()
      return { left, right, top, bottom }
    }
    const paragraphs = collect('[data-reference-paragraph]').reduce((entries, node) => {
      const id = node.dataset.referenceParagraph
      entries[id] = (entries[id] || '') + text(node)
      return entries
    }, {})
    const cells = collect('[data-reference-cell]').reduce((entries, node) => {
      const id = node.dataset.referenceCell
      entries[id] = (entries[id] || '') + text(node)
      return entries
    }, {})
    return { paragraphs, cells, references: [...new Set(collect('[data-source-reference]').map(node => node.dataset.sourceReference))],
      tables: collect('.answer-keys').map(node => ({
        box: bounds(node), page: bounds(node.closest('.pagedjs_page_content')),
      })),
      answerBounds: collect('[data-answer-number]').map(node => {
        const range = document.createRange()
        range.selectNodeContents(node)
        return { number: node.dataset.answerNumber, page: bounds(node.closest('.pagedjs_page_content')),
          boxes: [...range.getClientRects()].filter(rect => rect.width > 0).map(({ left, right, top, bottom }) =>
            ({ left, right, top, bottom })) }
      }),
      keys: collect('[data-answer-number]').map(node => ({ number: Number(node.dataset.answerNumber), text: text(node) })),
      grammar: collect('.answer-keys--5 [data-answer-number]').map(node => {
        const rects = element => {
          const range = document.createRange()
          range.selectNodeContents(element)
          return [...range.getClientRects()].filter(rect => rect.width > 0)
        }
        const cell = node.closest('td')
        const label = rects(cell.querySelector('.answer-number'))[0]
        const lines = rects(node)
        const splitWords = []
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) for (const match of walker.currentNode.textContent.matchAll(/[A-Za-z]+/gu)) {
          const range = document.createRange()
          range.setStart(walker.currentNode, match.index)
          range.setEnd(walker.currentNode, match.index + match[0].length)
          if (new Set([...range.getClientRects()].map(rect => rect.top)).size > 1) splitWords.push(match[0])
        }
        return { number: Number(node.dataset.answerNumber), labelTop: label.top,
          splitWords,
          lines: lines.map(rect => ({ top: rect.top, left: rect.left, right: rect.right })),
          cellRight: cell.getBoundingClientRect().right }
      }),
      roles: collect('[data-reference-paragraph]').map(node => ({ id: node.dataset.referenceParagraph,
        align: getComputedStyle(node).textAlign, indent: getComputedStyle(node).textIndent })),
      horizontalOverflow: collect('td,p,h1,h2,h3').filter(node => node.scrollWidth > node.clientWidth + 1).length,
    }
  }) })
  writeFileSync(path.join(output, 'answerOnly-screen.html'), result.paginatedHtml, { flag: 'wx' })
  writeFileSync(path.join(output, 'answerOnly.pdf'), result.pdfBytes, { flag: 'wx' })
  for (const group of input.sourceReferences.groups) for (const kind of ['essays', 'scoring']) {
    for (const entry of group[kind].entries) for (const block of sourceReferenceBlocks(entry)) {
      if (block.kind === 'table') {
        for (const cell of block.rows.flat()) assert.equal(normalize(result.inspection.cells[cell.cellId]), normalize(cell.text), cell.cellId)
      } else {
        const { paragraph } = block
        assert.equal(normalize(result.inspection.paragraphs[paragraph.paragraphId]), normalize(paragraph.text), paragraph.paragraphId)
      }
    }
  }
  assert.deepEqual(result.inspection.references, ['reference:positive', 'reference:negative', 'reference:continuation', 'reference:scoring'])
  assert.deepEqual(result.inspection.keys.map(key => key.number), Array.from({ length: 45 }, (_, i) => i + 21))
  for (const answer of input.materialization.answers) {
    assert.equal(normalize(result.inspection.keys.find(key => key.number === answer.canonicalNumber).text),
      normalize(answer.value), `Q${answer.canonicalNumber}: answer text changed`)
  }
  assert.equal(result.inspection.roles.find(role => role.id === 'paragraph:positive:4').align, 'right')
  assert.equal(result.inspection.roles.find(role => role.id === 'paragraph:positive:5').align, 'right')
  assert.equal(result.inspection.grammar.length, 10)
  const inside = (box, page) => box.left >= page.left - 1 && box.right <= page.right + 1
    && box.top >= page.top - 1 && box.bottom <= page.bottom + 1
  for (const table of result.inspection.tables) assert(inside(table.box, table.page), 'answer table exceeds page content')
  for (const answer of result.inspection.answerBounds) for (const box of answer.boxes) {
    assert(inside(box, answer.page), `Q${answer.number}: answer text exceeds page content`)
  }
  for (const answer of result.inspection.grammar) {
    if (grammarCase === 'long' || grammarCase === 'short') {
      assert.deepEqual(answer.splitWords, [], `Q${answer.number}: ordinary word split`)
    }
    assert(Math.abs(answer.labelTop - answer.lines[0].top) < 1, `Q${answer.number}: number separated from answer`)
    for (const line of answer.lines) {
      assert(Math.abs(line.left - answer.lines[0].left) < 1, `Q${answer.number}: missing hanging indent`)
      assert(line.right <= answer.cellRight + 1, `Q${answer.number}: answer overflows its column`)
    }
  }
  assert.equal(result.inspection.horizontalOverflow, 0)
  const report = { status: 'synthetic_local_layout_candidate', pageCount: result.pageCount, pdfSha256: sha256(result.pdfBytes),
    inspectedReferenceParagraphs: Object.keys(result.inspection.paragraphs).length, answerCount: result.inspection.keys.length,
    inspectedReferenceCells: Object.keys(result.inspection.cells).length,
    grammarCase, tableBoundsChecked: result.inspection.tables.length,
    answerBoundsChecked: result.inspection.answerBounds.length,
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
