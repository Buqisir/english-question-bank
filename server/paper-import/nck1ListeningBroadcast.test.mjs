import test from 'node:test'
import assert from 'node:assert/strict'
import { produceNck1DocxMaterialization, produceNck1MaterializationFromStructures } from './nck1DocxMaterializationProducer.mjs'
import { extractDocxDocumentStructure } from '../paper-canonical/docxSourceAdapter.mjs'
import { makeSyntheticNck1DocxFixture } from '../../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'

// Beidou's actual broadcast layout, with synthetic question speech.
const opening = [
  '注意：回答听力部分时，请先将答案标在试卷上。',
  '听力部分结束前，你将有两分钟的时间将你的答案转涂到答题卡上。',
  '第一节',
  '听下面5段录音。每段录音后有一个小题，从题中所给的A、B、C三个选项中选出最佳选项。',
  '听完每段录音后，你都有10秒钟的时间来回答有关小题和阅读下一小题。每段录音播放两遍。',
]
const transition = [
  '第一节到此结束。',
  '第二节',
  '听下面5段录音。每段录音后有几个小题，从题中所给的A、B、C三个选项中选出最佳选项。',
  '听每段录音前，你将有时间阅读各个小题，每小题5秒钟；听完后，每小题都有5秒钟的作答时间。每段录音播放两遍。',
]
const paragraph = text => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
function run(change = () => {}) {
  const cues = { opening: [...opening], transition: [...transition], ending: ['停顿02′00″', '听力部分到此结束。'] }
  change(cues)
  const fixture = makeSyntheticNck1DocxFixture({ listening: true, transformXml: xml => xml
    .replace(paragraph('Text 1'), cues.opening.map(paragraph).join('') + paragraph('Text 1'))
    .replace(paragraph('Text 6'), cues.transition.map(paragraph).join('') + paragraph('Text 6'))
    .replace(paragraph('Synthetic transcript 10.'), paragraph('Synthetic transcript 10.') + cues.ending.map(paragraph).join('')),
  })
  return produceNck1DocxMaterialization({ paperId: fixture.paperId, documents: fixture.sourceDocuments })
}

test('wrapped Beidou broadcasts preserve individual source records and ten clean transcripts', () => {
  const result = run()
  assert.deepEqual(result.review.required, [])
  assert.deepEqual(result.materialization.listening.transcript.map(item => item.text),
    Array.from({ length: 10 }, (_, i) => `Synthetic transcript ${i + 1}.`))
  const partition = result.review.listeningSourcePartition
  const records = [...partition.openingPreamble, ...partition.segments.flatMap(s => s.bodyItems), ...partition.trailingItems]
  for (const text of [...opening, ...transition, '停顿02′00″']) {
    const matching = records.filter(item => item.text === text)
    assert.equal(matching.length, 1)
    assert.equal(matching[0].disposition, 'excluded_exam_broadcast')
    assert(matching[0].source)
  }
  assert(records.every((item, i) => !i || item.sourceOrder > records[i - 1].sourceOrder))
})

test('wrong section and interrupted cue still require review', () => {
  for (const change of [
    cues => { cues.opening[2] = '第二节' },
    cues => { cues.transition[1] = '第一节' },
    cues => { cues.transition.splice(3, 0, 'M: This is speech.') },
    cues => { cues.opening.splice(1, 0, 'Text 0') },
  ]) {
    const result = run(change)
    assert.equal(result.disposition, 'needs_agent_review')
    assert(result.review.required.some(issue => /LISTENING/.test(issue.code)))
  }
  const mixed = run(cues => { cues.transition[2] += 'M: Keep this speech.' })
  assert(mixed.materialization.listening.transcript.some(item => item.text.includes('Keep this speech.')))
  const malformed = run(cues => { cues.ending[0] = '停顿02′99″' })
  assert(malformed.materialization.listening.transcript.at(-1).text.includes('停顿02′99″'))
})

test('existing single paragraph broadcasts remain accepted', () => {
  assert.deepEqual(run(cues => {
    cues.opening = [opening.slice(0, 2).join(''), opening.slice(2).join('')]
    cues.transition = [transition[0], transition.slice(1).join('')]
  }).review.required, [])
})

test('文章大意 heading ends the listening transcript before reading explanations', () => {
  for (const heading of ['文章大意：本文是一篇应用文。', '【文章大意】：本文是一篇应用文。',
    '文章大意', '【文章大意】本文是一篇应用文。']) {
    const fixture = makeSyntheticNck1DocxFixture({ listening: true, transformXml: xml => xml
      .replace('Synthetic transcript 10.', 'Leave a positive impact on our planet. Thank you.')
      .replace(paragraph('【答案解析】'), [heading, '阅读理解解析。', '评分标准：按档次给分。'].map(paragraph).join('')),
    })
    const result = produceNck1DocxMaterialization({ paperId: fixture.paperId, documents: fixture.sourceDocuments })
    assert.deepEqual(result.review.required, [], heading)
    assert.equal(result.materialization.listening.transcript.at(-1).text,
      'Leave a positive impact on our planet. Thank you.', heading)
  }
})

test('文章大意 within listening speech does not end the transcript', () => {
  const speech = 'M: The phrase 文章大意 means the main idea. Keep reading. Thank you.'
  const fixture = makeSyntheticNck1DocxFixture({ listening: true, transformXml: xml => xml
    .replace('Synthetic transcript 10.', speech),
  })
  const result = produceNck1DocxMaterialization({ paperId: fixture.paperId, documents: fixture.sourceDocuments })
  assert.deepEqual(result.review.required, [])
  assert.equal(result.materialization.listening.transcript.at(-1).text, speech)
})

test('文章大意 commentary before a labelled writing sample preserves both model answers', () => {
  const fixture = makeSyntheticNck1DocxFixture()
  const baseline = produceNck1DocxMaterialization({ paperId: fixture.paperId, documents: fixture.sourceDocuments })
  const changed = makeSyntheticNck1DocxFixture({ transformXml: xml => xml.replace(
    paragraph('第二节：读后续写（满分25分）'),
    ['第二节：读后续写（满分25分）', '文章大意：本文讲述了学生归还笔记本的故事。',
      'One possible version:'].map(paragraph).join(''),
  ) })
  const result = produceNck1DocxMaterialization({ paperId: changed.paperId, documents: changed.sourceDocuments })
  const samples = produced => produced.materialization.groups.filter(group => group.writingTask)
    .map(group => group.writingTask.officialModelAnswer)
  assert.equal(result.disposition, 'ready_for_verification')
  assert.deepEqual(result.review.required, [])
  assert.equal(samples(baseline).length, 2)
  assert(samples(baseline).every(sample => typeof sample === 'string' && sample.length > 0))
  assert.deepEqual(samples(result), samples(baseline))
})

test('文章大意 and answer lines in the same source paragraph preserve the answer key', () => {
  const fixture = makeSyntheticNck1DocxFixture()
  const baseline = produceNck1DocxMaterialization({ paperId: fixture.paperId, documents: fixture.sourceDocuments })
  const changed = makeSyntheticNck1DocxFixture({ transformXml: xml => xml.replace(
    paragraph('21-23ABC24-27DABC28-31BCDA32-35CDAB'),
    '<w:p><w:r><w:t>文章大意：本文是一篇应用文。</w:t><w:br/><w:t>21-23ABC24-27DABC28-31BCDA32-35CDAB</w:t></w:r></w:p>',
  ) })
  const result = produceNck1DocxMaterialization({ paperId: changed.paperId, documents: changed.sourceDocuments })
  const answers = produced => produced.materialization.answers.map(({ questionId, value }) => ({ questionId, value }))
  assert.equal(result.materialization.answers.length, baseline.materialization.answers.length)
  assert.deepEqual(answers(result), answers(baseline))
  assert.equal(result.disposition, 'ready_for_verification')
  assert.deepEqual(result.review.required, [])
})

function analysisTitleRun(change = () => {}) {
  const fixture = makeSyntheticNck1DocxFixture({ listening: true })
  const documents = fixture.sourceDocuments
  const question = documents.find(item => item.role === 'question_source' && item.mediaType.includes('wordprocessingml'))
  const answer = documents.find(item => item.role === 'official_answers')
  const coverage = documents.find(item => item.documentId === question.renditionDocumentId)
  const questionStructure = extractDocxDocumentStructure(question.bytes)
  const answerStructure = extractDocxDocumentStructure(answer.bytes)
  const titleIndex = answerStructure.body.findIndex(item => item.text === '【答案解析】')
  change(answerStructure.body, titleIndex)
  const retained = JSON.stringify(answerStructure)
  const result = produceNck1MaterializationFromStructures({
    paperId: fixture.paperId, documents, question, answer, coverage,
    questionStructure, answerStructure, issues: [], codePrefix: 'NCK1_DOCX',
    producerVersion: 'boundary-test', sourceDigest: 'boundary-test',
    reviewSchemaVersion: 'nck1-docx-materialization-review-v1',
  })
  assert.equal(JSON.stringify(answerStructure), retained, 'answers source structure must remain byte-identical')
  return result
}

test('standalone 英语试卷 analysis titles close ordered Text 10 without consuming answers', () => {
  const baseline = analysisTitleRun()
  for (const title of ['英语试卷详解答案', '英语试卷参考答案与解析：', '英语试卷参考答案及解析:']) {
    const result = analysisTitleRun((body, i) => { body[i].text = title })
    assert.deepEqual(result.review.required, [])
    assert.equal(result.disposition, 'ready_for_verification')
    assert.equal(result.materialization.listening.transcript[9].text, 'Synthetic transcript 10.')
    assert.deepEqual(result.materialization.listening.transcript.slice(0, 9),
      baseline.materialization.listening.transcript.slice(0, 9))
    assert.equal(result.review.listeningSourcePartition.analysisBoundary.text, title)
    assert.deepEqual(result.materialization.answers, baseline.materialization.answers)
  }
})

test('unproven separate line before a new analysis title withholds T10 and requires author review', () => {
  for (const extra of ['2026届高三年级阶段训练', 'Another independent source paragraph.']) {
    const baseline = analysisTitleRun()
    const result = analysisTitleRun((body, i) => {
      body[i].text = '英语试卷参考答案与解析'
      body.splice(i, 0, { kind: 'paragraph', text: extra,
        sourceIndex: { kind: 'page_region', page: 2, region: { x: .1, y: .01, width: .8, height: .03 } } })
    })
    assert.equal(result.disposition, 'needs_agent_review')
    assert(result.review.required.some(issue => issue.code === 'NCK1_DOCX_LISTENING_ANALYSIS_TAIL_AMBIGUOUS' && issue.source))
    assert.equal(result.materialization.listening.transcript[9].text, '')
    assert.deepEqual(result.materialization.listening.transcript.slice(0, 9),
      baseline.materialization.listening.transcript.slice(0, 9))
    const partition = result.review.listeningSourcePartition
    assert.equal(partition.analysisBoundary.text, '英语试卷参考答案与解析')
    assert(partition.segments[9].bodyItems.some(item => item.text === extra && item.disposition === 'unresolved'))
  }
})

test('new analysis boundary requires a whole standalone paragraph after a unique ordered Text 1–10 run', () => {
  for (const text of ['M: 英语试卷详解答案 is a heading.', '英语试卷详解答案 extra',
    '英语试卷详解答案\nReading explanation.']) {
    const result = analysisTitleRun((body, i) => { body[i].text = text })
    assert.equal(result.review.listeningSourcePartition.analysisBoundary, null)
    assert(result.materialization.listening.transcript[9].text.includes(text))
  }
  for (const change of [
    (body, i) => { body[i] = { ...body[i], kind: 'table', text: '英语试卷详解答案' } },
    (body, i) => { body[i].text = '英语试卷详解答案'; body.find(item => item.text === 'Text 9').text = 'Text 8' },
    (body, i) => { body[i].text = '英语试卷详解答案'; body.find(item => item.text === 'Text 9').text = 'Text 10' },
    (body, i) => { body[i].text = 'Unrecognized end'; body.find(item => item.text === 'Synthetic transcript 9.').text = '英语试卷详解答案' },
  ]) {
    const result = analysisTitleRun(change)
    assert.equal(result.review.listeningSourcePartition.analysisBoundary, null)
  }
})
