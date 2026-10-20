import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { entryPath, resolveRef, snapshot } from './snapshot.mjs'

const repo = path.resolve(import.meta.dirname, '../../..')
mkdirSync(path.join(repo, '.scratch'), { recursive: true })
const directory = mkdtempSync(path.join(repo, '.scratch/join-equivalence-'))
after(() => rmSync(directory, { recursive: true, force: true }))
const baselineSha = '2d39e86946cce738db7fb727b9e6cfbf4aaa6e02'
snapshot(repo, resolveRef(repo, baselineSha), path.join(directory, 'baseline'))
const baseline = path.join(directory, 'baseline', entryPath)
const candidate = path.join(repo, entryPath)
const row = value => typeof value === 'string' ? { text: value } : value

function references(pageRows) {
  const evidencePages = []
  const pages = pageRows.map((rows, index) => {
    const observations = []
    const orderedItems = rows.map((value, i) => {
      const { text, left = .1, width = .8, emphasis } = row(value)
      const ids = Array.from({ length: 4 }, (_, j) => {
        const observationId = `p${index + 1}-o${i}-${j}`
        observations.push({ observationId, region: {
          x: left + width * j / 4, y: .2 + i * .04, width: width / 4, height: .02,
        } })
        return observationId
      })
      return { itemId: `p${index + 1}-i${i}`, text, observationIds: ids, ...(emphasis ? { emphasis } : {}) }
    })
    evidencePages.push({ observations })
    return { page: index + 1, orderedItems }
  })
  return [{
    documents: [{ documentId: 'answers', role: 'official_answers', sha256: 'abc' }],
    groups: [{ groupId: 'continuation', writingTask: { taskType: 'continuation' } }],
  }, { documents: [{ documentId: 'answers', pages: evidencePages }] },
  { documents: [{ documentId: 'answers', pages }] }]
}

function transcript(pageRows) {
  const drafts = {}
  const pages = pageRows.map((rows, p) => {
    const words = []
    const key = `answers-p${p + 1}`
    const items = rows.map((value, i) => {
      const { text, left = 10, emphasis, ...extra } = row(value)
      const tokens = text.split(' ')
      for (const [j, token] of tokens.entries()) words.push({
        number: words.length + 1, text: token, line: `row${i}`,
        box: { left: left + j * 90 / tokens.length, top: i * 15, width: 90 / tokens.length, height: 10 },
      })
      return { lines: `L${i + 1}`, text, ...(emphasis ? { emphasis } : {}), ...extra }
    })
    drafts[key] = { documentId: 'answers', page: p + 1, items }
    return { documentId: 'answers', page: p + 1, key, words }
  })
  return { documents: [{ documentId: 'answers', role: 'official_answers' }],
    trace: { schemaVersion: 'ocr-proofread-trace-v2', pages }, drafts }
}

function capture(modulePath, channel, input) {
  const script = `import * as source from ${JSON.stringify(pathToFileURL(modulePath).href)};
    const input = JSON.parse(process.argv[1]);
    const output = ${channel === 'R' ? 'source.buildSourceReferences(...input)'
      : '[...source.buildTranscriptJoinDocuments(input)].map(({document, pages}) => ({document, pages: [...pages]}))'};
    console.log(JSON.stringify(output));`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(input)],
    { encoding: 'utf8', timeout: 10_000 })
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

const paragraphs = output => output.groups[0].essays.entries[0].paragraphs
const heading = ['第二节 读后续写', '参考范文']
const cases = [
  { name: 'reference hyphens retain a space and review', channel: 'R',
    input: references([[...heading, 'A tiny green shoot grew in the gar-', 'den beside the gate.']]),
    check: output => {
      assert.equal(paragraphs(output)[0].text, 'A tiny green shoot grew in the gar- den beside the gate.')
      assert.equal(output.review.length, 1)
    } },
  { name: 'reference emphasis remains in the confirmed source without adding output marks', channel: 'R',
    input: references([[...heading,
      { text: 'Our club will plant', emphasis: [{ start: 4, end: 8, marks: ['bold'] }] },
      { text: 'herbs in the garden.', emphasis: [{ start: 0, end: 5, marks: ['underline'] }] }]]),
    check: output => {
      assert.equal(paragraphs(output)[0].text, 'Our club will plant herbs in the garden.')
      assert.equal(Object.hasOwn(paragraphs(output)[0], 'emphasis'), false)
    } },
  { name: 'reference page turns keep separate page locators, hyphens and review order', channel: 'R',
    input: references([[...heading, 'A tiny green shoot grew in the gar-'], ['den beside the gate.']]),
    check: output => {
      assert.deepEqual(paragraphs(output).map(p => [p.text, p.source.locator.page]),
        [['A tiny green shoot grew in the gar-', 1], ['den beside the gate.', 2]])
      assert.deepEqual(output.review.map(r => r.itemId), ['p1-i2', 'p2-i0'])
    } },
  { name: 'reference first-line indent remains a normalized-coordinate boundary', channel: 'R',
    input: references([[...heading, 'They left early.', { text: 'A new paragraph starts here.', left: .14, width: .76 }]]),
    check: output => assert.equal(paragraphs(output).length, 2) },
  { name: 'speech hyphen wraps omit the space and remap emphasis', channel: 'T',
    input: transcript([['Text 1', { text: 'M: The source spans a well-', emphasis: [{ text: 'well-', marks: ['bold'] }] },
      { text: 'known garden path.', emphasis: [{ text: 'known', marks: ['underline'] }] }]]),
    check: output => {
      const item = output[0].pages[0].items[1]
      assert.equal(item.text, 'M: The source spans a well-known garden path.')
      assert.deepEqual(item.emphasis.map(e => [e.text, e.occurrence]), [['well-', 1], ['known', 1]])
    } },
  { name: 'speech repeated emphasis occurrences survive cross-line joining', channel: 'T',
    input: transcript([['Text 1', { text: 'M: Hello hello（注）', emphasis: [{ text: 'hello', marks: ['bold'] }] },
      { text: 'hello again.', emphasis: [{ text: 'hello', marks: ['underline'] }] }]]),
    check: output => assert.deepEqual(output[0].pages[0].items[1].emphasis.map(e => e.occurrence), [1, 2]) },
  { name: 'speech hanging indent joins at the pixel body margin', channel: 'T',
    input: transcript([['Text 1', 'M: These are some words', { text: 'and these continue that turn', left: 28 }]]),
    check: output => assert.equal(output[0].pages[0].joins, 1) },
  { name: 'speech extra indent separates at the pixel body margin', channel: 'T',
    input: transcript([['Text 1', 'M: These are some words', { text: 'A new paragraph starts here', left: 40 }]]),
    check: output => assert.equal(output[0].pages[0].joins, 0) },
  { name: 'speech page turns retain transcript state but never join across pages', channel: 'T',
    input: transcript([['Text 1', 'M: The source spans a well-'], ['known garden path.', 'W: Thank you.']]),
    check: output => {
      assert.deepEqual(output[0].pages.map(p => [p.stateBefore, p.joins]), [[false, 0], [true, 0]])
      assert.equal(output[0].pages[1].items[0].text, 'known garden path.')
    } },
  { name: 'annotation continuation preserves CJK glue and cross-line emphasis', channel: 'T',
    input: transcript([['Text 9',
      { text: '★ 美索不达米亚是两河之间的土地（两河指幼发', emphasis: [{ text: '幼发', marks: ['bold'] }] },
      { text: '拉底河与底格里斯河）。', emphasis: [{ text: '拉底河', marks: ['underline'] }] }, '★ 另一条注释。']]),
    check: output => {
      assert.equal(output[0].pages[0].items[1].text, '★ 美索不达米亚是两河之间的土地（两河指幼发拉底河与底格里斯河）。')
      assert.equal(output[0].pages[0].items[1].emphasis.length, 2)
      assert.equal(output[0].pages[0].items[2].text, '★ 另一条注释。')
    } },
  { name: 'annotation hyphens retain their space instead of speech glue', channel: 'T',
    input: transcript([['Text 9', '★ 另一条注释连接 word-', '后半句。']]),
    check: output => assert.equal(output[0].pages[0].items[1].text, '★ 另一条注释连接 word- 后半句。') },
  { name: 'annotation inline restored lines normalize emphasis alongside text', channel: 'T',
    input: transcript([['Text 9', { text: '★ 剑桥大学是顶尖研究\n型大学。',
      emphasis: [{ text: '研究\n型大学', marks: ['bold'] }] }]]),
    check: output => {
      assert.equal(output[0].pages[0].items[1].text, '★ 剑桥大学是顶尖研究型大学。')
      assert.equal(output[0].pages[0].items[1].emphasis[0].text, '研究型大学')
    } },
  { name: 'annotation page turns reset note continuation without resetting transcript state', channel: 'T',
    input: transcript([['Text 9', '★ 美索不达米亚是两河之间的土地（两河指幼发'], ['拉底河与底格里斯河）。']]),
    check: output => {
      assert.equal(output[0].pages[1].stateBefore, true)
      assert.equal(output[0].pages[1].joins, 0)
    } },
]

// Jiyang Text 7: OCR splits W and its colon/body into overlapping physical lines.
const split = transcript([['Text 7', 'W: I’ve downloaded lots', 'of tasty-looking recipes']])
split.trace.pages[0].words = [
  { number: 1, text: 'Text 7', line: 'heading', box: { left: 109, top: 1100, width: 90, height: 19 } },
  { number: 2, text: '=', line: 'label', box: { left: 109, top: 1162, width: 18, height: 15 } },
  { number: 3, text: ':', line: 'speech', box: { left: 130, top: 1175, width: 2, height: 2 } },
  { number: 4, text: 'I’ve downloaded lots', line: 'speech', box: { left: 139, top: 1162, width: 943, height: 19 } },
  { number: 5, text: 'of', line: 'continuation', box: { left: 141, top: 1198, width: 14, height: 27 } },
  { number: 6, text: 'tasty-looking recipes', line: 'continuation', box: { left: 181, top: 1198, width: 150, height: 19 } },
]
split.drafts['answers-p1'].items[1].lines = 'L2-L3'
split.drafts['answers-p1'].items[2].lines = 'L4'
cases.push({ name: 'speech split speaker/colon physical lines preserve hanging-wrap proof', channel: 'T', input: split,
  check: output => assert.equal(output[0].pages[0].items[1].text, 'W: I’ve downloaded lots of tasty-looking recipes') })

const image = transcript([['Text 1', 'A source figure.']])
image.drafts['answers-p1'].items[1] = { imageOnly: true, figure: 'map', figureRegion: { x: 10, y: 15, width: 90, height: 10 } }
cases.push({ name: 'textless image-only items keep the old lazy note handling', channel: 'T', input: image,
  check: output => {
    assert.equal(output[0].pages[0].joins, 0)
    assert.equal(output[0].pages[0].items[1].imageOnly, true)
  } })

for (const { name, channel, input, check } of cases) {
  test(`join cross-commit equivalence: ${name}`, () => {
    const expected = capture(baseline, channel, input)
    check(expected) // Guard against a vacuous comparison of two equally wrong/unused fixtures.
    // The historical R entry predates the scoring-format flag; these fixtures have no tables.
    assert.deepEqual(capture(candidate, channel, input),
      channel === 'R' ? { ...expected, structuredScoring: false } : expected)
  })
}

test('4b behavior fix: a short line followed by lowercase text splits into two located paragraphs', () => {
  const input = references([[...heading, { text: 'They left early', width: .4 }, 'and returned the next morning.']])
  const before = capture(baseline, 'R', input)
  assert.equal(paragraphs(before).length, 1)
  assert.equal(paragraphs(before)[0].text, 'They left early and returned the next morning.')
  const expected = structuredClone(before)
  expected.structuredScoring = false
  const original = paragraphs(before)[0]
  const entry = expected.groups[0].essays.entries[0]
  entry.paragraphs = ['They left early', 'and returned the next morning.'].map((text, index) => ({
    ...original, paragraphId: `${entry.referenceId}-p${index + 1}`, text,
    source: { ...original.source, locator: { ...original.source.locator,
      region: { x: .1, y: index ? .32 : .28, width: index ? .8 : .4, height: .02 } } },
  }))
  assert.deepEqual(capture(candidate, 'R', input), expected)
})

test('4b behavior fix: previous-page margin restores cross-page review without changing page locators', () => {
  const input = references([[...heading, { text: 'They left early.', width: .55 }], ['Another day began.']])
  const before = capture(baseline, 'R', input)
  assert.deepEqual(paragraphs(before).map(p => p.source.locator.page), [1, 2])
  assert.deepEqual(before.review, [])
  const expected = structuredClone(before)
  expected.structuredScoring = false
  expected.review = [{ itemId: 'p2-i0',
    issue: 'paragraph continues across a page turn; split into two located paragraphs' }]
  assert.deepEqual(capture(candidate, 'R', input), expected)
})
