import test from 'node:test'
import assert from 'node:assert/strict'
import { produceNck1DocxMaterialization } from './nck1DocxMaterializationProducer.mjs'
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
