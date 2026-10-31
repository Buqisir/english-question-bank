import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { compileSemanticTables } from './ocr-semantic-tables.mjs'
import { buildSourceReferences, joinTranscriptTurns } from './ocr-proofread.mjs'
import { validateSourceReferences } from '../../server/paper-import/sourceReferences.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { resolveOcrContentVisual } from '../../server/paper-import/nck1OcrContentVisuals.mjs'

function rubricHeadingFixture(headingPage, intervening = false) {
  const line = (text, id) => ({ text, itemId: id, observationIds: [`w-${id}`] })
  const heading = line('三、各档次的给分范围和要求', 'rubric')
  const rows = ['第五档', '第四档', '第三档', '第二档', '第一档', '0分']
    .map((name, index) => [line(name, `grade-${index}`), line('评分描述。', `description-${index}`)])
  const pages = [
    { page: 1, orderedItems: [line('第四部分 写作', 'part'), line('第一节（满分15分）', 'application'),
      line('参考范文', 'sample'), line('A short source sample.', 'essay'),
      line('二、内容要点', 'points'), line('内容要点说明。', 'points-body'),
      ...(headingPage === 1 ? [heading] : [])], visualClassifications: [] },
    { page: 2, orderedItems: [...(headingPage === 2 ? [heading] : []),
      ...(intervening ? [line('读后续写评分标准', 'other-task')] : []),
      ...rows.flat(), ...(!intervening ? [line('第二节（满分25分）', 'continuation'),
        line('参考范文', 'next-sample'), line('A continuation sample.', 'next-essay')] : [])],
      visualClassifications: [{ classification: 'semantic_table', regionId: 'answers:page-2:rubric',
        rows: rows.map(row => ({ header: false, cells: row.map(cell => [cell.itemId]) })) }] },
  ]
  const materialization = { paperId: 'paper-rubric-heading-test',
    documents: [{ documentId: 'answers', role: 'official_answers', sha256: `sha256:${'a'.repeat(64)}` }],
    groups: ['application', 'continuation'].map(taskType => ({ groupId: taskType, writingTask: { taskType } })) }
  const evidence = { documents: [{ documentId: 'answers', pages: pages.map(page => ({
    observations: page.orderedItems.map((item, i) => ({ observationId: item.observationIds[0], text: item.text,
      region: { x: .1, y: .05 + i * .025, width: .6, height: .02 } })),
  })) }] }
  return [materialization, evidence, { documents: [{ documentId: 'answers', pages }] }]
}

for (const headingPage of [1, 2]) test(`v23 rubric heading on page ${headingPage} owns the page 2 table`, () => {
  const input = rubricHeadingFixture(headingPage)
  const result = buildSourceReferences(...input)
  assert.equal(result.groups[0].scoring.entries.at(-1).sourceLabel, '三、各档次的给分范围和要求')
  const table = result.groups[0].scoring.entries.at(-1).blocks.find(block => block.kind === 'table')
  assert.equal(table.rows[0][0].text, '第五档')
  assert.equal(table.rows.length, 6)
  assert.equal(result.groups[1].scoring.state, 'not_supplied')
  const script = `import { buildSourceReferences } from ${JSON.stringify(new URL('./ocr-proofread.mjs', import.meta.url).href)};
    buildSourceReferences(...JSON.parse(process.argv[1]), { producerVersion: 'ocr-source-references-producer-v22' });`
  const historical = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(input)], { encoding: 'utf8' })
  assert.equal(historical.status, 1)
  assert.match(historical.stderr, /Unresolved writing task visual ownership/u)
})

test('intervening continuation scoring heading prevents application from owning the table', () => {
  const input = rubricHeadingFixture(1, true)
  const result = buildSourceReferences(...input)
  assert(!JSON.stringify(result.groups[0].scoring).includes('第五档'))
  assert.equal(result.groups[1].scoring.entries[0].blocks[0].kind, 'table')
})

for (const scoringLabel of ['4. 评分细则', '（一）评分原则：', '（二）各档次给分范围和要求',
  '二、各档次给分范围及要求']) {
test(`parenthesized task and ${scoringLabel} retain a 7 by 7 scoring table across pages 4 to 6`, () => {
  const documentSha256 = `sha256:${'a'.repeat(64)}`
  const items = Array.from({ length: 49 }, (_, index) => ({
    itemId: `cell-item-${index}`, cell: `cell-${index}`, observationIds: [`cell-word-${index}`],
    text: `评分格${index + 1}`,
  }))
  const [table] = compileSemanticTables({ semanticTables: [{ name: 'application-score',
    region: { x: 100, y: 200, width: 700, height: 600 },
    rows: Array.from({ length: 7 }, (_, row) => ({
      header: row === 0, cells: Array.from({ length: 7 }, (_, col) => [`cell-${row * 7 + col}`]),
    })),
  }] }, items, { documentId: 'answers', page: 6, width: 1000, height: 1000 })
  const line = (text, id) => ({ text, itemId: id, observationIds: [`word-${id}`] })
  const pages = [
    { page: 4, orderedItems: [line('（二）应用文写作', 'task')] },
    { page: 5, orderedItems: [line('2. 参考范文', 'sample'), line('Our club welcomes new readers.', 'essay')] },
    { page: 6, orderedItems: [line(scoringLabel, 'scoring'), ...items], visualClassifications: [table.visual] },
    { page: 7, orderedItems: [line('（三）读后续写（满分25分）', 'continuation'),
      line('2. 参考范文', 'continuation-sample'), line('Mina found the owner.', 'continuation-essay')] },
  ]
  const evidencePages = Array.from({ length: 7 }, (_, index) => ({
    observations: (pages.find(page => page.page === index + 1)?.orderedItems || []).map((item, i) => ({
      observationId: item.observationIds[0], text: item.text,
      region: { x: Number((.1 + (i % 7) * .1).toFixed(6)),
        y: Number((.2 + Math.floor(i / 7) * .08).toFixed(6)), width: .08, height: .02 },
    })),
  }))
  const materialization = { paperId: 'paper-table-test',
    documents: [{ documentId: 'answers', role: 'official_answers', sha256: documentSha256,
      mediaType: 'application/pdf', pageCount: 7 }],
    groups: [{ groupId: 'application', writingTask: { taskType: 'application' } },
      { groupId: 'continuation', writingTask: { taskType: 'continuation' } }],
  }
  const before = structuredClone(materialization)
  const { groups, structuredScoring } = buildSourceReferences(materialization,
    { documents: [{ documentId: 'answers', pages: evidencePages }] },
    { documents: [{ documentId: 'answers', pages }] })
  assert.equal(structuredScoring, true)
  const [entry] = groups[0].scoring.entries
  assert.equal(entry.sourceLabel, scoringLabel)
  assert.equal(entry.labelSource.locator.page, 6)
  assert.equal(entry.blocks.length, 1)
  const [block] = entry.blocks
  assert.equal(block.kind, 'table')
  assert.equal(block.rows.length, 7)
  assert(block.rows.every(row => row.length === 7))
  block.rows.flat().forEach((cell, index) => {
    assert.equal(cell.text, items[index].text)
    assert.deepEqual(cell.source, { documentSha256, locator: {
      kind: 'page_region', documentId: 'answers', page: 6,
      region: evidencePages[5].observations[index + 1].region,
    } })
  })
  assert.equal(new Set(block.rows.flat().map(cell => JSON.stringify(cell.source.locator))).size, 49)
  assert.equal(groups[0].essays.entries[0].sourceLabel, '2. 参考范文')
  assert.equal(groups[0].essays.entries[0].paragraphs[0].text, 'Our club welcomes new readers.')
  assert.equal(groups[1].scoring.state, 'not_supplied')
  assert.equal(groups[1].essays.entries[0].paragraphs[0].text, 'Mina found the owner.')
  assert.deepEqual(materialization, before, 'references must not mutate student-facing question material')
  assert(!JSON.stringify(materialization.groups).includes('评分格'))
  const sourceDigest = `sha256:${'b'.repeat(64)}`, candidateDigest = `sha256:${'c'.repeat(64)}`
  assert.deepEqual(validateSourceReferences({ materialization, sourceDigest, candidateDigest, sidecar: {
    schemaVersion: 'source-references-v2', paperId: materialization.paperId, sourceDigest, candidateDigest,
    materializationDigest: digestJson(materialization), groups,
  } }), [])
})
}

function specificationAppendixFixture(header = '题号 题型 分值 考查的主要内容及知识点 难度') {
  const texts = [
    ['第一节 应用文', '参考范文', 'Dear Jack,', 'Our club welcomes you.', 'Yours,', 'Li Hua',
      '第二节 读后续写', '参考范文', 'Mina found the owner.'],
    ['听力原文', 'Text 1', 'M: Hello.', '评分细则', '（一）应用文写作评分参考标准',
      '覆盖全部要点。', '（二）读后续写评分参考标准', '情节合理，语言连贯。'],
    [header, '第四部分', '第一节', '应用文写作', '15', '体裁：告知信。'],
    ['续表', '题号', '题型', '分值', '考查的主要内容及知识点', '难度',
      '第二节', '读后续写', '25', '体裁：记叙文。', '中'],
  ]
  const pages = texts.map((rows, p) => ({ page: p + 1,
    orderedItems: rows.map((text, i) => ({ text, itemId: `p${p}-i${i}`, observationIds: [`p${p}-w${i}`] })),
    visualClassifications: [] }))
  pages[3].visualClassifications.push({ regionId: 'answers:page-4:table-1', classification: 'semantic_table',
    rows: [true, false].map((header, r) => ({ header,
      cells: Array.from({ length: 5 }, (_, c) => [`p3-i${1 + r * 5 + c}`]) })) })
  return [{ paperId: 'paper-specification-test',
    documents: [{ documentId: 'answers', role: 'official_answers', sha256: `sha256:${'a'.repeat(64)}` }],
    groups: ['application', 'continuation'].map(taskType => ({ groupId: taskType, writingTask: { taskType } })),
  }, { documents: [{ documentId: 'answers', pages: pages.map(page => ({
    observations: page.orderedItems.map((item, i) => ({ observationId: item.observationIds[0],
      text: item.text, region: { x: .1, y: .1 + i * .04, width: .8, height: .02 } })),
  })) }] }, { documents: [{ documentId: 'answers', pages }] }]
}

for (const header of ['题号 题型 分值 考查的主要内容及知识点 难度', '其他材料']) test(
  `specification header in ${header === '其他材料' ? 'table cells' : 'plain text'} retains source tables and both real scoring sections`, () => {
  const input = specificationAppendixFixture(header)
  const before = structuredClone(input)
  const result = buildSourceReferences(...input)
  assert.deepEqual(input, before, 'source table, words and confirmation remain immutable')
  assert.deepEqual(result.groups.map(group => group.scoring.state), ['captured', 'captured'])
  assert.deepEqual(result.groups.map(group => group.essays.entries.length), [1, 1])
  assert.deepEqual(result.groups.map(group => group.scoring.entries[0].blocks[0].paragraph.text),
    ['覆盖全部要点。', '情节合理，语言连贯。'])
  assert(!JSON.stringify(result.groups).includes('体裁'))
  assert(result.review.some(item => item.tableId === 'source-answers-page-4-table-1'
    && /specification/u.test(item.issue)), 'excluded source table is named in the review')
})

test('an unscoped table without an explicit specification header degrades its task', () => {
  const input = specificationAppendixFixture('其他材料')
  input[2].documents[0].pages[3].orderedItems[4].text = '其他说明'
  // BUB-168: the unattached scoring table's task degrades to not_supplied
  // rather than aborting the whole build.
  const result = buildSourceReferences(...input)
  assert(result.groups.some(group => group.essays.state === 'not_supplied'
    || group.scoring.state === 'not_supplied'))
  assert(result.review.some(entry => /degraded to not_supplied/u.test(entry.issue)))
})

function objectiveAnswerTableFixture(rows = [['题号', '21', '22'], ['答案', 'C', 'B']]) {
  const input = specificationAppendixFixture()
  const page = input[2].documents[0].pages[0]
  const proof = input[1].documents[0].pages[0]
  const items = rows.flat().map((text, i) => ({
    text, itemId: `objective-${i}`, observationIds: [`objective-word-${i}`],
  }))
  page.orderedItems.unshift(...items)
  let offset = 0
  page.visualClassifications.push({ classification: 'semantic_table', regionId: 'answers:page-1:objective',
    rows: rows.map((row, r) => {
      const cells = items.slice(offset, offset + row.length).map(item => [item.itemId])
      offset += row.length
      return { header: r % 2 === 0, cells }
    }) })
  proof.observations.unshift(...items.map((item, i) => ({
    observationId: item.observationIds[0], text: item.text,
    region: { x: .1 + i % 3 * .2, y: .05 + Math.floor(i / 3) * .03, width: .1, height: .02 },
  })))
  return input
}

for (const [label, rows] of [
  ['two rows', [['题号', '21', '22'], ['答案', 'C', 'B']]],
  ['four rows', [['题号', '21', '22'], ['答案', 'C', 'B'],
    ['题号', '23', '24'], ['答案', 'A', 'G']]],
  ['six rows', [['题号', '21', '22'], ['答案', 'C', 'B'],
    ['题号', '23', '24'], ['答案', 'A', 'G'], ['题号', '25', '26'], ['答案', 'E', 'F']]],
  ['source 序号 label', [['序号', '21', '22'], ['答案', 'C', 'B'],
    ['序号', '23', '24'], ['答案', 'A', 'G']]],
  ['without labels', [['21', '22'], ['C', 'B'], ['23', '24'], ['A', 'G']]],
  ['labeled word answers', [['序号', '56', '57'], ['答案', 'impressive', 'houses'],
    ['序号', '58', '59'], ['答案', 'acknowledged', 'incredibly']]],
  ['short phrases and alternatives', [['题号', '56', '57'], ['答案', 'who/that', 'has been told/was told'],
    ['序号', '58', '59'], ['答案', "don't", 'well-known/one’s own']]],
]) test(`objective question/answer grid with ${label} stays source evidence without entering writing scoring`, () => {
  const input = objectiveAnswerTableFixture(rows)
  const before = structuredClone(input)
  const result = buildSourceReferences(...input)
  assert.deepEqual(input, before)
  assert.deepEqual(result.groups.map(group => group.scoring.state), ['captured', 'captured'])
  assert(!JSON.stringify(result.groups).includes('source-answers-page-1-objective'))
  assert(result.review.some(item => item.tableId === 'source-answers-page-1-objective'
    && /objective answer table.*retained in source evidence/u.test(item.issue)))
})

function assertUnscopedTableDegraded(input) {
  const before = structuredClone(input)
  const result = buildSourceReferences(...input)
  // An unrecognized, unowned table remains source evidence. Neither writing
  // task can claim it or guess a sample/rubric from the surrounding text.
  assert.deepEqual(result.groups.map(group => [group.essays.state, group.scoring.state]),
    [['not_supplied', 'not_supplied'], ['not_supplied', 'not_supplied']])
  assert(result.groups.every(group => !group.essays.entries.length && !group.scoring.entries.length))
  assert(result.review.some(entry =>
    /Source table source-answers-page-1-objective has no writing-task scope/u.test(entry.issue)))
  assert(!result.review.some(entry => entry.tableId === 'source-answers-page-1-objective'
    && /objective answer table.*retained in source evidence/u.test(entry.issue)))
  assert.deepEqual(input, before, 'unrecognized source table and all answer text stay unchanged')
}

for (const [label, rows] of [
  ['odd row count', [['题号', '21', '22'], ['答案', 'C', 'B'], ['题号', '23', '24']]],
  ['decreasing numbers within a pair', [['题号', '22', '21'], ['答案', 'C', 'B']]],
  ['decreasing numbers across pairs', [['题号', '21', '22'], ['答案', 'C', 'B'],
    ['题号', '20', '23'], ['答案', 'A', 'G']]],
  ['repeated number across pairs', [['题号', '21', '22'], ['答案', 'C', 'B'],
    ['题号', '22', '23'], ['答案', 'A', 'G']]],
  ['unlabeled word answers', [['56', '57'], ['impressive', 'houses']]],
  ['word answers without number label', [['56', '57', '58'], ['答案', 'impressive', 'houses']]],
  ['word answers without answer label', [['题号', '56', '57'], ['impressive', 'houses', 'adding']]],
  ['Chinese answer text', [['题号', '56', '57'], ['答案', 'impressive', '房子']]],
  ['digits in an answer', [['题号', '56', '57'], ['答案', 'impressive', 'word2']]],
  ['fraction answer', [['题号', '56', '57'], ['答案', 'impressive', '1/2']]],
  ['four-word answer', [['题号', '56', '57'], ['答案', 'impressive', 'one two three four']]],
  ['double-spaced answer', [['题号', '56', '57'], ['答案', 'impressive', 'has  been']]],
  ['punctuated answer', [['题号', '56', '57'], ['答案', 'impressive', 'houses.']]],
  ['empty alternative', [['题号', '56', '57'], ['答案', 'impressive', 'who/']]],
  ['mixed choices and words in a row', [['题号', '56', '57'], ['答案', 'C', 'houses']]],
  ['mixed choices and words across rows', [['题号', '21', '22'], ['答案', 'C', 'B'],
    ['题号', '56', '57'], ['答案', 'impressive', 'houses']]],
  ['blank answer', [['题号', '21', '22'], ['答案', 'C', '']]],
  ['non-choice letter', [['题号', '21', '22'], ['答案', 'C', 'H']]],
  ['unequal paired row widths', [['题号', '21', '22'], ['答案', 'C']]],
  ['unequal widths across pairs', [['题号', '21', '22'], ['答案', 'C', 'B'],
    ['题号', '23'], ['答案', 'A']]],
  ['writing scoring table', [['档次', '分值', '描述'], ['第五档', '13–15', '覆盖全部要点。'],
    ['第四档', '10–12', '内容完整。'], ['第三档', '7–9', '语言基本连贯。']]],
]) test(`a table with ${label} is not excluded as an objective answer grid`, () => {
  const input = objectiveAnswerTableFixture(rows)
  assertUnscopedTableDegraded(input)
})

test('tables resembling answer grids without exact labels, increasing numbers and choice letters leave references empty', () => {
  for (const [index, text] of [[0, '档次'], [1, '21–25'], [2, '21'], [3, '参考答案'], [4, '内容完整']]) {
    const input = objectiveAnswerTableFixture()
    input[2].documents[0].pages[0].orderedItems[index].text = text
    assertUnscopedTableDegraded(input)
  }
})

function fixture() {
  const items = Array.from({ length: 14 }, (_, index) => ({
    cell: `cell-${index}`, itemId: `item-${index}`, observationIds: [`word-${index}`],
    text: index === 0 ? '档次' : index === 1 ? '描述'
      : index === 12 ? '零分' : index === 13 ? '抄原文，未作答，跑题。' : `档次说明${index}`,
  }))
  const draft = { semanticTables: [{ name: 'scoring',
    region: { x: 100, y: 200, width: 800, height: 600 },
    rows: Array.from({ length: 7 }, (_, row) => ({
      header: row === 0, cells: [[`cell-${row * 2}`], [`cell-${row * 2 + 1}`]],
    })),
  }] }
  const context = { documentId: 'answers', page: 1, width: 1000, height: 1000 }
  return { items, draft, context }
}

function geometricFixture(region, box) {
  const value = fixture()
  value.draft.semanticTables[0].region = region
  value.context.width = 1191
  value.context.height = 1684
  value.items.forEach((item, i) => { item.numbers = [i + 1] })
  value.context.words = value.items.map((item, i) => ({
    number: i + 1, box: i === 1 ? box
      : { left: region.x + 10, top: region.y + 10 + i, width: 10, height: 10 },
  }))
  return value
}

function resolveGeometry(value, table, extraObservations = []) {
  const { items, context } = value
  return resolveOcrContentVisual({
    paperId: 'paper-table-test',
    document: { documentId: context.documentId, role: 'official_answers', mediaType: 'application/pdf' },
    visual: table.visual, region: table, claimedItems: new Set(),
    page: { page: context.page, orderedItems: items, furnitureObservationIds: [],
      observations: [...context.words.map(({ box }, i) => ({
        observationId: items[i].observationIds[0],
        region: { x: box.left / context.width, y: box.top / context.height,
          width: box.width / context.width, height: box.height / context.height },
      })), ...extraObservations] },
  })
}

test('fits all eight diagnosed edge overflows before the unchanged containment validator', () => {
  const cases = [
    // Qiangji w13: top 55 vs declared 57.
    [{ x: 52, y: 57, width: 1087, height: 358 }, { left: 738, top: 55, width: 21, height: 39 }, 2, 'top'],
    ...[
      [158, 605, 876, 697, 5], // Jiangsu eight cities
      [109, 1322, 910, 212, 3], [242, 138, 777, 71, 3], [109, 209, 910, 878, 2], // four schools
      [178, 1142, 835, 378, 4], [178, 1004, 835, 484, 5], [178, 145, 835, 304, 5], // Zhengzhou
    ].map(([x, y, width, height, overflow]) => [
      { x, y, width, height }, { left: x + 20, top: y + height - 20, width: 20, height: 20 + overflow }, overflow, 'bottom',
    ]),
  ]
  for (const [region, box, overflow, edge] of cases) {
    const value = geometricFixture(region, box)
    const before = structuredClone(value)
    const [original] = compileSemanticTables(value.draft, value.items, { ...value.context, words: [] })
    assert.throws(() => resolveGeometry(value, original), /within the classified/)
    const [table] = compileSemanticTables(value.draft, value.items, value.context)
    assert.deepEqual(table.pixels, { ...region, y: region.y - (edge === 'top' ? overflow : 0),
      height: region.height + overflow })
    assert.doesNotThrow(() => resolveGeometry(value, table))
    assert.deepEqual(value, before, 'drafts and OCR words are immutable inputs')
  }
})

test('overflow above 5px leaves the whole rectangle unchanged and is still rejected', () => {
  const region = { x: 178, y: 145, width: 835, height: 304 }
  const value = geometricFixture(region, { left: 176, top: 430, width: 20, height: 25 })
  const [table] = compileSemanticTables(value.draft, value.items, value.context)
  assert.deepEqual(table.pixels, region, 'do not partly fit the 2px left overflow when bottom exceeds threshold')
  assert.throws(() => resolveGeometry(value, table), /within the classified/)
})

test('left/right fitting uses only bound words and newly enclosed foreign words still fail', () => {
  const region = { x: 100, y: 200, width: 800, height: 600 }
  for (const box of [
    { left: 95, top: 210, width: 10, height: 10 },
    { left: 895, top: 210, width: 10, height: 10 },
  ]) {
    const value = geometricFixture(region, box)
    value.context.words.push({ number: 99, box: { left: 1, top: 1, width: 1, height: 1 } })
    const [table] = compileSemanticTables(value.draft, value.items, value.context)
    assert.equal(table.pixels.width, 805)
    assert.equal(table.pixels.y, 200)
  }
  const value = geometricFixture(region, { left: 95, top: 210, width: 10, height: 10 })
  const [table] = compileSemanticTables(value.draft, value.items, value.context)
  assert.throws(() => resolveGeometry(value, table, [{
    observationId: 'foreign', region: { x: 96 / 1191, y: 250 / 1684, width: 2 / 1191, height: 2 / 1684 },
  }]), /must be accounted for/)
})

test('compiles explicit 7 by 2 cells to the existing semantic table confirmation', () => {
  const { items, draft, context } = fixture()
  const [table] = compileSemanticTables(draft, items, context)
  assert.equal(table.visual.classification, 'semantic_table')
  assert.deepEqual(Object.keys(table.visual), ['regionId', 'classification', 'rows'])
  assert.equal(table.visual.rows.length, 7)
  assert.deepEqual(table.visual.rows[6], { header: false, cells: [['item-12'], ['item-13']] })
  assert.deepEqual(table.region, { x: .1, y: .2, width: .8, height: .6 })
})

test('rejects missing, repeated, orphaned or reordered cell identities', () => {
  for (const corrupt of [
    ({ draft }) => { draft.semanticTables[0].rows[1].cells[0] = ['missing'] },
    ({ draft }) => { draft.semanticTables[0].rows[1].cells[0] = ['cell-0'] },
    ({ draft }) => { draft.semanticTables[0].rows.pop() },
    ({ items }) => { [items[2], items[3]] = [items[3], items[2]] },
  ]) {
    const value = fixture()
    corrupt(value)
    assert.throws(() => compileSemanticTables(value.draft, value.items, value.context))
  }
})

test('rejects nonrectangular, out-of-page or emphasized table declarations', () => {
  for (const corrupt of [
    ({ draft }) => { draft.semanticTables[0].rows[1].cells.pop() },
    ({ draft }) => { draft.semanticTables[0].region.width = 1000 },
    ({ items }) => { items[2].emphasis = [{ text: items[2].text, marks: ['bold'] }] },
    ({ items }) => { items[2].figure = 'picture' },
  ]) {
    const value = fixture()
    corrupt(value)
    assert.throws(() => compileSemanticTables(value.draft, value.items, value.context))
  }
})

test('table cell identities survive active transcript joining unchanged', () => {
  const { items } = fixture()
  const result = joinTranscriptTurns(items, [], { inTranscript: true }, 'table')
  assert.equal(result.joins, 0)
  assert.deepEqual(result.items, items)
})

for (const crossPage of [false, true]) test(
  `captures a scoring table in v2 with 14 distinct PDF locators and ${crossPage ? 'a cross-page' : 'a single-page'} essay`, () => {
  const { items, draft, context } = fixture()
  const [table] = compileSemanticTables(draft, items, context)
  const texts = ['第二节 读后续写', '一、评分原则', '按档次评分。',
    ...items.map(item => item.text), 'One possible version:', crossPage ? 'A source sample that' : 'A source sample.']
  const orderedItems = texts.map((text, index) => index >= 3 && index < 17
    ? items[index - 3] : { itemId: `outside-${index}`, observationIds: [`outside-word-${index}`], text })
  const observations = orderedItems.map((item, index) => ({
    observationId: item.observationIds[0], text: item.text,
    region: { x: index >= 3 && index < 17 ? (index % 2 ? .1 : .3) : .1,
      y: .1 + index * .03, width: .15, height: .02 },
  }))
  const materialization = {
    paperId: 'paper-table-test',
    documents: [{ documentId: 'answers', role: 'official_answers',
      sha256: `sha256:${'a'.repeat(64)}`, mediaType: 'application/pdf', pageCount: crossPage ? 2 : 1 }],
    groups: [{ groupId: 'continuation', writingTask: { taskType: 'continuation' } }],
  }
  const continuationRegion = { x: .1, y: .1, width: .15, height: .02 }
  const { groups, structuredScoring } = buildSourceReferences(materialization,
    { documents: [{ documentId: 'answers', pages: [{ observations }, ...(crossPage ? [{
      observations: [{ observationId: 'continued-word', region: continuationRegion }],
    }] : [])] }] },
    { documents: [{ documentId: 'answers', pages: [{ page: 1, orderedItems,
      visualClassifications: [table.visual] }, ...(crossPage ? [{
      page: 2, orderedItems: [{ itemId: 'continued-item', observationIds: ['continued-word'], text: 'continues on another page.' }],
    }] : [])] }] })
  assert.equal(structuredScoring, true)
  const blocks = groups[0].scoring.entries[0].blocks
  assert.deepEqual(blocks.map(block => block.kind), ['paragraph', 'table'])
  assert.equal(blocks[1].rows.length, 7)
  assert.equal(new Set(blocks[1].rows.flat().map(cell => JSON.stringify(cell.source.locator))).size, 14)
  assert.deepEqual(blocks[1].rows[6].map(cell => cell.text), ['零分', '抄原文，未作答，跑题。'])
  const essayParagraphs = groups[0].essays.entries[0].paragraphs
  assert.deepEqual(essayParagraphs.map(p => p.text), [
    crossPage ? 'A source sample that continues on another page.' : 'A source sample.',
  ])
  assert.deepEqual(essayParagraphs[0].source.locator, {
    kind: 'page_region', documentId: 'answers', page: 1, region: observations.at(-1).region,
  })
  assert.deepEqual(essayParagraphs[0].continuationSources, crossPage ? [{
    documentSha256: materialization.documents[0].sha256,
    locator: { kind: 'page_region', documentId: 'answers', page: 2, region: continuationRegion },
  }] : undefined)
  const sourceDigest = `sha256:${'b'.repeat(64)}`, candidateDigest = `sha256:${'c'.repeat(64)}`
  assert.deepEqual(validateSourceReferences({ materialization, sourceDigest, candidateDigest, sidecar: {
    schemaVersion: 'source-references-v2', paperId: materialization.paperId,
    sourceDigest, candidateDigest, materializationDigest: digestJson(materialization), groups,
  } }), [])
})
