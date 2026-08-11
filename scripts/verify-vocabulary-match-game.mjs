#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const rootDir = path.resolve(import.meta.dirname, '..')
const sourcePath = path.join(rootDir, 'app/src/features/vocabulary-practice/vocabularyMatchGame.ts')
const runtimeDir = mkdtempSync(path.join(tmpdir(), 'eqb-vocabulary-match-game-'))
const runtimePath = path.join(runtimeDir, 'vocabularyMatchGame.mjs')

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

function fixture(index, teachingSense = `含义 ${index}`) {
  return { id: `entry-${index}`, headword: `word${index}`, teachingSense }
}

function select(module, state, cardId) {
  return module.selectVocabularyMatchCard(state, cardId)
}

let passed = 0
function pass(label) {
  passed += 1
  console.log(`PASS ${label}`)
}

try {
  const game = await loadModule()
  const sixty = Array.from({ length: 60 }, (_, index) => fixture(index + 1))
  assert.deepEqual(game.splitVocabularyMatchRounds([fixture(1)]).map((round) => round.length), [1])
  assert.deepEqual(game.splitVocabularyMatchRounds(sixty.slice(0, 8)).map((round) => round.length), [8])
  assert.deepEqual(game.splitVocabularyMatchRounds(sixty.slice(0, 10)).map((round) => round.length), [10])
  assert.deepEqual(game.splitVocabularyMatchRounds(sixty.slice(0, 15)).map((round) => round.length), [10, 5])
  assert.deepEqual(game.splitVocabularyMatchRounds(sixty).map((round) => round.length), [10, 10, 10, 10, 10, 10])
  assert.deepEqual(game.splitVocabularyMatchRounds(sixty).flat().map((entry) => entry.id), sixty.map((entry) => entry.id))
  pass('1、8、10、15、60 词按原顺序分成最多 10 词的轮次')

  const identityShuffle = (cards) => cards
  let state = game.createVocabularyMatchGame([fixture(1), fixture(2)], identityShuffle)
  assert.equal(state.cards.length, 4)
  let result = select(game, state, 'entry-1:word')
  state = result.state
  assert.equal(result.outcome, 'first')
  assert.equal(result.spokenEntryId, 'entry-1')
  assert.equal(state.cards.find((card) => card.id === 'entry-1:word').status, 'revealed')
  result = select(game, state, 'entry-1:word')
  assert.equal(result.outcome, 'ignored')
  assert.equal(result.state, state)
  pass('首次翻开英文只触发一次发音，同卡重复点击不改变状态')

  result = select(game, state, 'entry-2:meaning')
  state = result.state
  assert.equal(result.outcome, 'mismatch')
  assert.equal(result.spokenEntryId, null)
  assert.deepEqual(
    state.cards.filter((card) => card.status === 'revealed').map((card) => card.id),
    ['entry-1:word', 'entry-2:meaning'],
  )
  result = select(game, state, 'entry-2:word')
  state = result.state
  assert.equal(result.outcome, 'first')
  assert.equal(result.spokenEntryId, 'entry-2')
  assert.deepEqual(state.cards.filter((card) => card.status === 'revealed').map((card) => card.id), ['entry-2:word'])
  pass('错配保持翻开，第三张先盖回旧组合并成为新的第一张')

  result = select(game, state, 'entry-2:meaning')
  state = result.state
  assert.equal(result.outcome, 'match')
  assert.equal(state.cards.length, 4)
  const settled = game.settleVocabularyMatch(state)
  assert.equal(settled.matchedPairCount, 1)
  assert.equal(settled.cards.length, 4)
  assert.deepEqual(
    settled.cards.filter((card) => card.status === 'matched').map((card) => card.id),
    ['entry-2:word', 'entry-2:meaning'],
  )
  pass('正确配对结算后保留原卡槽数组，其他卡片不会重排')

  state = game.createVocabularyMatchGame([
    fixture(1, '相同中文义'),
    fixture(2, '相同中文义'),
  ], identityShuffle)
  state = select(game, state, 'entry-1:word').state
  result = select(game, state, 'entry-2:meaning')
  assert.equal(result.outcome, 'match')
  state = game.settleVocabularyMatch(result.state)
  state = select(game, state, 'entry-2:word').state
  result = select(game, state, 'entry-1:meaning')
  state = game.settleVocabularyMatch(result.state)
  assert.equal(result.outcome, 'match')
  assert.equal(game.isVocabularyMatchRoundComplete(state), true)
  pass('同轮完全相同的中文义可互换配对并正常完成')

  state = game.createVocabularyMatchGame([fixture(1, '相同中文义'), fixture(2, '相同中文义')], identityShuffle)
  state = select(game, state, 'entry-1:word').state
  result = select(game, state, 'entry-2:word')
  assert.equal(result.outcome, 'mismatch')
  pass('相同中文义仍必须由英文卡与中文卡组成一对')

  assert.throws(() => game.splitVocabularyMatchRounds(sixty, 0), /positive integer/)
  pass('非法轮次大小会明确失败')

  console.log(`Vocabulary match game verification passed (${passed} checks).`)
} finally {
  rmSync(runtimeDir, { recursive: true, force: true })
}
