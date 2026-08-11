#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const rootDir = path.resolve(import.meta.dirname, '..')
const sourcePath = path.join(rootDir, 'app/src/features/vocabulary-practice/vocabularyWordSearch.ts')
const runtimeDir = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-word-search-'))
const runtimePath = path.join(runtimeDir, 'vocabularyWordSearch.mjs')

async function loadModule() {
  const require = createRequire(import.meta.url)
  const typescriptEntry = require.resolve('typescript', { paths: [path.join(rootDir, 'app')] })
  const ts = await import(pathToFileURL(typescriptEntry).href)
  const output = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText
  writeFileSync(runtimePath, output)
  return import(pathToFileURL(runtimePath).href)
}

function fixture(index, overrides = {}) {
  return {
    id: `entry-${index}`,
    headword: `lesson${index}`,
    teachingSense: `第${index}个意思`,
    partOfSpeech: 'n.',
    pronunciationMode: 'syllables',
    ...overrides,
  }
}

function placementLetters(page, placement) {
  const rowStep = placement.endRow === placement.row ? 0 : placement.endRow > placement.row ? 1 : -1
  const columnStep = placement.endColumn === placement.column ? 0 : 1
  return Array.from({ length: placement.gridWord.length }, (_, index) => (
    page.grid[placement.row + rowStep * index][placement.column + columnStep * index]
  )).join('')
}

let passed = 0
function pass(label) {
  passed += 1
  console.log(`PASS ${label}`)
}

try {
  const wordSearch = await loadModule()

  assert.equal(wordSearch.getVocabularyWordSearchAnswer('a / an'), 'a')
  assert.equal(wordSearch.getVocabularyWordSearchAnswer('child (pl. children)'), 'child')
  assert.equal(wordSearch.getVocabularyWordSearchAnswer('according (to)'), 'according to')
  assert.equal(wordSearch.getVocabularyWordSearchAnswer('ice cream'), 'ice cream')
  assert.equal(wordSearch.getVocabularyWordSearchGridWord('p.m.'), 'pm')
  assert.equal(wordSearch.getVocabularyWordSearchGridWord('AI'), 'AI')
  pass('多词形只取主词形，真实词组保留空格作答并去空格入阵')

  const entries = Array.from({ length: 60 }, (_, index) => fixture(index + 1))
  const pool = Array.from({ length: 120 }, (_, index) => fixture(index + 101, {
    headword: `extra${index + 1}`,
    teachingSense: `额外含义${index + 1}`,
  }))
  assert.deepEqual(
    [1, 15, 16, 60].map((count) => wordSearch.buildVocabularyWordSearchPages('set-pages', entries.slice(0, count), pool).length),
    [1, 2, 2, 6],
  )
  assert.deepEqual(
    wordSearch.buildVocabularyWordSearchPages('set-pages', entries, pool).map((page) => page.clues.length),
    [10, 10, 10, 10, 10, 10],
  )
  pass('1、15、16、60词按原顺序分成每页最多10词')

  const targets = [
    fixture(1, { headword: 'receive', teachingSense: '收到', partOfSpeech: 'v.' }),
    fixture(2, { headword: 'success', teachingSense: '成功', partOfSpeech: 'n.' }),
    fixture(3, { headword: 'China', teachingSense: '中国', partOfSpeech: 'n.' }),
    fixture(4, { headword: 'BBC (= British Broadcasting Corporation)', teachingSense: '英国广播公司', partOfSpeech: 'n.' }),
    fixture(5, { headword: 'ice cream', teachingSense: '冰激凌', partOfSpeech: 'n.' }),
    fixture(6, { headword: 'choice', teachingSense: '选择', partOfSpeech: 'n.' }),
    fixture(7, { headword: 'choose', teachingSense: '选择', partOfSpeech: 'v.' }),
    fixture(8, { headword: 'he', teachingSense: '他', partOfSpeech: 'pron.' }),
    fixture(9, { headword: 'him', teachingSense: '他', partOfSpeech: 'pron.' }),
    fixture(10, { headword: 'practicea' }),
  ]
  const decoyPool = Array.from({ length: 20 }, (_, index) => fixture(index + 201, {
    headword: `decoy${String.fromCharCode(97 + index)}`,
    teachingSense: `无关含义${index}`,
  }))
  const first = wordSearch.buildVocabularyWordSearchPages('fixed-set', targets, [...targets, ...decoyPool])[0]
  const second = wordSearch.buildVocabularyWordSearchPages('fixed-set', targets, [...targets, ...decoyPool])[0]
  const otherSet = wordSearch.buildVocabularyWordSearchPages('other-set', targets, [...targets, ...decoyPool])[0]
  assert.deepEqual(first, second)
  assert.notDeepEqual(first.grid, otherSet.grid)
  assert.deepEqual(first.clues.map((clue) => clue.entryId), targets.map((entry) => entry.id))
  assert.deepEqual(first.clues.map((clue) => clue.number), Array.from({ length: 10 }, (_, index) => index + 1))
  pass('同一生词组重复下载布局稳定，新生词组重新排阵且提示保持原顺序')

  assert.equal(first.grid.length, 12)
  assert.equal(first.grid.every((row) => row.length === 12), true)
  assert.equal(first.placements.every((placement) => placementLetters(first, placement) === placement.gridWord), true)
  assert.equal(first.placements.every((placement) => ['right', 'down', 'down-right', 'up-right'].includes(placement.direction)), true)
  assert.equal(wordSearch.findUnsafeVocabularyWordSearchWords(first.grid).length, 0)
  pass('12×12词阵只使用正向横竖斜方向，所有放置可回读且随机填充通过儿童安全门')

  const targetPlacements = first.placements.filter((placement) => placement.kind === 'target')
  assert.equal(targetPlacements.length, first.clues.filter((clue) => clue.searchable).length)
  assert.equal(targetPlacements.find((placement) => placement.entryId === 'entry-3').gridWord, 'China')
  assert.equal(targetPlacements.find((placement) => placement.entryId === 'entry-4').gridWord, 'BBC')
  assert.equal(targetPlacements.find((placement) => placement.entryId === 'entry-5').gridWord, 'icecream')
  assert.equal(first.clues.find((clue) => clue.entryId === 'entry-8').searchable, false)
  assert.match(first.clues.find((clue) => clue.entryId === 'entry-8').hint, /直接写/)
  assert.equal(first.grid.flat().some((letter) => letter === 'C'), true)
  assert.equal(first.grid.flat().every((letter) => /^[a-z]$/u.test(letter) || ['B', 'C'].includes(letter)), true)
  pass('字母阵以小写为主，专有名词和缩写保留原大小写，词组连续藏入；一两字母短词改为直接写')

  assert.equal(first.correctDecoys.length, 2)
  assert.equal(first.correctDecoys.every((word) => !targets.some((entry) => entry.headword === word)), true)
  assert.equal(first.misspellingDecoys.length, 1)
  assert.equal([
    JSON.stringify({ incorrect: 'sucess', correct: 'success' }),
    JSON.stringify({ incorrect: 'recieve', correct: 'receive' }),
  ].includes(JSON.stringify(first.misspellingDecoys[0])), true)
  assert.equal(first.placements.filter((placement) => placement.kind === 'correct-decoy').length, 2)
  assert.equal(first.placements.filter((placement) => placement.kind === 'misspelling-decoy').length, 1)
  pass('每10个目标词稳定加入2个无关正确词和最多1个已审核相近错词')

  const twoPageTargets = [...targets, fixture(11, {
    headword: 'outsider',
    teachingSense: '另一页目标词',
  })]
  const pagesWithWholeSetExclusion = wordSearch.buildVocabularyWordSearchPages(
    'whole-set-exclusion',
    twoPageTargets,
    [...twoPageTargets, ...decoyPool],
  )
  assert.equal(pagesWithWholeSetExclusion[0].correctDecoys.includes('outsider'), false)
  pass('无关正确词排除整个生词组，而不只排除当前页目标词')

  const choiceClues = first.clues.filter((clue) => clue.teachingSense === '选择')
  const pronounClues = first.clues.filter((clue) => clue.teachingSense === '他')
  assert.deepEqual(choiceClues.map((clue) => clue.hint), ['n.', 'v.'])
  assert.deepEqual(pronounClues.map((clue) => clue.hint), ['直接写 · 2字母', '3字母'])
  pass('同页重复中文义优先用词性区分，仍相同则补字母数')

  const occupied = new Map()
  for (const placement of first.placements) {
    const rowStep = placement.endRow === placement.row ? 0 : placement.endRow > placement.row ? 1 : -1
    const columnStep = placement.endColumn === placement.column ? 0 : 1
    for (let index = 0; index < placement.gridWord.length; index += 1) {
      const key = `${placement.row + rowStep * index}:${placement.column + columnStep * index}`
      occupied.set(key, (occupied.get(key) ?? 0) + 1)
    }
  }
  assert.equal([...occupied.values()].some((count) => count > 1), true)
  pass('目标词与干扰词可在显示字符完全相同时交叉共用格子')

  const unsafeGrid = Array.from({ length: 12 }, () => Array(12).fill('a'))
  unsafeGrid[3].splice(4, 4, ...'shit')
  assert.deepEqual(wordSearch.findUnsafeVocabularyWordSearchWords(unsafeGrid), ['shit'])
  unsafeGrid[3].splice(4, 4, ...'aaaa')
  unsafeGrid[5].splice(4, 3, ...'sex')
  unsafeGrid[7].splice(4, 4, ...'piss')
  assert.deepEqual(wordSearch.findUnsafeVocabularyWordSearchWords(unsafeGrid), ['ass', 'piss', 'sex'])
  unsafeGrid[5].splice(4, 3, ...'fag')
  unsafeGrid[7].splice(4, 4, ...'spic')
  unsafeGrid[9].splice(4, 4, ...'dyke')
  assert.deepEqual(wordSearch.findUnsafeVocabularyWordSearchWords(unsafeGrid), ['dyke', 'fag', 'spic'])
  pass('安全检查能识别横竖斜及反向形成的不适合儿童词串')

  const reverseOccurrenceGrid = Array.from({ length: 12 }, () => Array(12).fill('x'))
  reverseOccurrenceGrid[1].splice(1, 3, ...'few')
  reverseOccurrenceGrid[3].splice(1, 3, ...'wef')
  assert.equal(wordSearch.findVocabularyWordSearchOccurrences(reverseOccurrenceGrid, 'few').length, 2)
  pass('唯一答案按八个阅读方向检查，能发现随机形成的反向同词')

  const directOnlyPage = wordSearch.buildVocabularyWordSearchPages(
    'direct-only-set',
    [fixture(301, { headword: 'a / an', teachingSense: '一个' })],
    decoyPool,
  )[0]
  assert.equal(directOnlyPage.clues[0].searchable, false)
  assert.deepEqual(directOnlyPage.grid, [])
  assert.deepEqual(directOnlyPage.placements, [])
  assert.deepEqual(directOnlyPage.correctDecoys, [])
  assert.deepEqual(directOnlyPage.misspellingDecoys, [])
  pass('整页只有直接写词时不生成只有干扰项的空词阵')

  const longWordPage = wordSearch.buildVocabularyWordSearchPages(
    'long-word-set',
    [
      fixture(302, { headword: 'characteristic', teachingSense: '特征' }),
      fixture(303, { headword: 'receive', teachingSense: '收到' }),
    ],
    decoyPool,
  )[0]
  assert.equal(longWordPage.clues[0].searchable, false)
  assert.match(longWordPage.clues[0].hint, /直接写/)
  assert.equal(longWordPage.placements.some((placement) => placement.entryId === 'entry-302'), false)
  pass('超过12格的极少数长词自动改为直接写，不阻断整页生成')

  const sourceMap = JSON.parse(readFileSync(
    path.join(rootDir, 'data/vocabulary/wanwei-round-one-source-map-v1.json'),
    'utf8',
  ))
  const sourceLedger = JSON.parse(readFileSync(
    path.join(rootDir, 'data/vocabulary/source-evidence/wanwei-page-review-ledger-v1.json'),
    'utf8',
  ))
  const exampleCandidates = JSON.parse(readFileSync(
    path.join(rootDir, 'data/vocabulary/wanwei-example-candidates-v1.json'),
    'utf8',
  ))
  assert.equal(sourceMap.entries.length, 1600)
  assert.equal(sourceLedger.entries.length, 1600)
  assert.equal(exampleCandidates.entries.length, 1600)
  const ledgerById = new Map(sourceLedger.entries.map((entry) => [entry.entryId, entry]))
  const examplesById = new Map(exampleCandidates.entries.map((entry) => [entry.entryId, entry]))
  assert.equal(ledgerById.size, 1600)
  assert.equal(examplesById.size, 1600)
  const realEntries = sourceMap.entries.map((source, index) => {
    const ledger = ledgerById.get(source.id)
    const examples = examplesById.get(source.id)
    assert.equal(source.sourceOrder, index + 1)
    assert.equal(ledger?.sourceOrder, source.sourceOrder)
    assert.equal(ledger?.headword, source.headword)
    assert.equal(ledger?.verdict, 'approved')
    assert.equal(examples?.sourceOrder, source.sourceOrder)
    assert.equal(examples?.headword, source.headword)
    assert.equal(examples?.candidates?.[0]?.teachingSense, examples?.teachingSense)
    assert.equal(typeof ledger?.observedPartOfSpeech, 'string')
    assert.equal(typeof examples?.teachingSense, 'string')
    return {
      id: source.id,
      headword: source.headword,
      teachingSense: examples.teachingSense,
      partOfSpeech: ledger.observedPartOfSpeech,
    }
  })
  assert.equal(realEntries.length, 1600)
  let realPageCount = 0
  for (let index = 0; index < realEntries.length; index += 10) {
    const realPages = wordSearch.buildVocabularyWordSearchPages(
      `real-set-${index / 10 + 1}`,
      realEntries.slice(index, index + 10),
      realEntries,
    )
    assert.equal(realPages.length, 1)
    assert.equal(
      realPages[0].placements.filter((placement) => placement.kind === 'target').length,
      realPages[0].clues.filter((clue) => clue.searchable).length,
    )
    assert.equal(realPages[0].placements.every((placement) => placementLetters(realPages[0], placement) === placement.gridWord), true)
    for (const placement of realPages[0].placements.filter((item) => item.kind === 'target')) {
      assert.equal(wordSearch.findVocabularyWordSearchOccurrences(realPages[0].grid, placement.gridWord).length, 1)
    }
    assert.deepEqual(
      wordSearch.findUnsafeVocabularyWordSearchWordsCreatedByFill(realPages[0].grid, realPages[0].placements),
      [],
    )
    assert.equal(realPages[0].grid.length, 12)
    realPageCount += 1
  }
  assert.equal(realPageCount, 160)
  pass('真实万唯1600词逐批生成160页，全部目标可放置或明确直接写，并通过安全填充')

  console.log(`Vocabulary word-search verification passed (${passed} checks).`)
} finally {
  rmSync(runtimeDir, { recursive: true, force: true })
}
