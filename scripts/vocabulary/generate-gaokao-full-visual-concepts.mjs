#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = { batchSize: 10, concurrency: 4, model: 'deepseek-chat' }
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['source', 'learning', 'output']) if (!args[key]) throw new Error(`Missing --${key}`)
  args.batchSize = Number(args.batchSize)
  args.concurrency = Number(args.concurrency)
  args.fallbackOnly = args.fallbackOnly === 'true'
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 15) throw new Error('batchSize must be 1–15')
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 6) throw new Error('concurrency must be 1–6')
  return args
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const readCheckpoint = async (filePath) => {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')).entries
    } catch (error) {
      lastError = error
      await sleep(500)
    }
  }
  throw new Error(`Unable to read checkpoint ${filePath}: ${lastError?.message ?? lastError}`)
}

const prompt = `你为高中英语单词建立可检索的教学视觉方案。只返回JSON {"entries":[]}，不使用Markdown。
每项原样返回entryId、headword，并给出：preferredMode、teachingSense、visualSentenceId、concept、searchQuery、sceneQuery、proposedAlt、rationale。
规则：
1. preferredMode只能是direct-sense或sentence-scene。具体名词、人物、动作、地点、可稳定视觉化概念优先direct-sense；关系词、抽象副词、介词、多义词或无法脱离语境准确表达的词用sentence-scene。
2. teachingSense必须来自teachingSenses。direct-sense的visualSentenceId必须为null；sentence-scene必须在三条例句中选最具体准确的一条，visualSentenceId写candidate-a、candidate-b或candidate-c，且该句teachingSense必须等于返回的teachingSense。
3. concept是简短具体英文画面；searchQuery是1至4个常见英文词，先写最有区分度的可见主体或动作，供手绘图标库检索。不要只搜抽象英文单词，不要包含标点。
4. sceneQuery保存subject、action、object、condition；不适用的字段可为null。句义图必须包含例句中可见的人、动作、物与必要条件，不得编造矛盾事实。
5. proposedAlt用中文准确描述想找的画面；rationale说明图如何服务教学义。不得使用Emoji，不得为了配图改写例句。`

async function generateBatch(entries, model) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required')
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.15,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify({ entries }) }],
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${(await response.text()).slice(0, 500)}`)
      const payload = await response.json()
      return JSON.parse(payload.choices?.[0]?.message?.content ?? '').entries
    } catch (error) {
      lastError = error
      if (attempt < 4) await sleep(attempt * 1_500)
    }
  }
  throw new Error(`Visual concept generation failed after 4 attempts: ${lastError?.message ?? lastError}`)
}

function validateBatch(sourceBatch, generated) {
  if (!Array.isArray(generated) || generated.length !== sourceBatch.length) throw new Error('Visual concept batch size mismatch')
  const byId = new Map(generated.map((entry) => [entry.entryId, entry]))
  return sourceBatch.map((source) => {
    const entry = byId.get(source.entryId)
    if (!entry || entry.headword !== source.headword) throw new Error(`Visual concept identity mismatch for ${source.entryId}`)
    if (!['direct-sense', 'sentence-scene'].includes(entry.preferredMode)) throw new Error(`Invalid visual mode for ${source.entryId}`)
    if (!source.teachingSenses.includes(entry.teachingSense)) throw new Error(`Invalid visual teaching sense for ${source.entryId}`)
    const visualSentenceId = entry.visualSentenceId ?? null
    const candidateId = visualSentenceId?.match(/^candidate-([abc])$/u)?.[1]
    const sentence = candidateId ? source.examples.find((example) => example.candidateId === candidateId) : null
    if (entry.preferredMode === 'direct-sense' && visualSentenceId !== null) throw new Error(`Direct visual has sentence binding for ${source.entryId}`)
    if (entry.preferredMode === 'sentence-scene' && (!sentence || sentence.teachingSense !== entry.teachingSense)) throw new Error(`Sentence visual cannot resolve exact example for ${source.entryId}`)
    const searchQuery = String(entry.searchQuery ?? '').replace(/[^A-Za-z0-9 -]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 60)
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/u.test(searchQuery)) throw new Error(`Invalid search query for ${source.entryId}`)
    if (!entry.concept?.trim() || !/[\u3400-\u9fff]/u.test(entry.proposedAlt ?? '') || !/[\u3400-\u9fff]/u.test(entry.rationale ?? '')) throw new Error(`Incomplete visual concept for ${source.entryId}`)
    if (/\p{Extended_Pictographic}/u.test(`${entry.concept}${entry.proposedAlt}${entry.rationale}`)) throw new Error(`Emoji in visual concept for ${source.entryId}`)
    return {
      entryId: source.entryId,
      headword: source.headword,
      preferredMode: entry.preferredMode,
      teachingSense: entry.teachingSense,
      visualSentenceId,
      sentence: sentence ? { ...sentence } : null,
      concept: entry.concept.trim(),
      searchQuery,
      sceneQuery: entry.sceneQuery && typeof entry.sceneQuery === 'object' ? entry.sceneQuery : null,
      proposedAlt: entry.proposedAlt.trim(),
      rationale: entry.rationale.trim(),
    }
  })
}

function fallbackConcept(source) {
  const sentence = source.examples[0]
  const searchQuery = source.headword.replace(/[^A-Za-z0-9 -]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 60) || 'person scene'
  return {
    entryId: source.entryId,
    headword: source.headword,
    preferredMode: 'sentence-scene',
    teachingSense: sentence.teachingSense,
    visualSentenceId: `candidate-${sentence.candidateId}`,
    sentence: { ...sentence },
    concept: sentence.english,
    searchQuery,
    sceneQuery: null,
    proposedAlt: `准确呈现例句“${sentence.chinese}”的完整可见场景`,
    rationale: '自动概念连续未通过结构校验，安全退回候选 A 的完整句景；最终图片仍须由 Subagent 实际看图确认。',
  }
}

const args = parseArgs(process.argv.slice(2))
const sourceEntries = JSON.parse(readFileSync(path.resolve(args.source), 'utf8')).entries
if (sourceEntries.length !== 3_000) throw new Error('Full visual concept source must contain exactly 3000 entries')
const learningPath = path.resolve(args.learning)
const outputPath = path.resolve(args.output)
const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')).entries : []
const completed = new Map(existing.map((entry) => [entry.entryId, entry]))
const batches = []
for (let start = 0; start < sourceEntries.length; start += args.batchSize) {
  const missing = sourceEntries.slice(start, start + args.batchSize).filter((entry) => !completed.has(entry.entryId))
  if (missing.length) batches.push(missing)
}

let nextBatchIndex = 0
async function generateNextBatch() {
  while (nextBatchIndex < batches.length) {
    const sourceBatch = batches[nextBatchIndex]
    nextBatchIndex += 1
    let learningById
    while (true) {
      const learning = await readCheckpoint(learningPath)
      learningById = new Map(learning.map((entry) => [entry.entryId, entry]))
      if (sourceBatch.every((source) => learningById.has(source.entryId))) break
      await sleep(3_000)
    }
    const inputs = sourceBatch.map((source) => {
      const learning = learningById.get(source.entryId)
      return { entryId: source.entryId, headword: source.headword, teachingSenses: learning.teachingSenses, examples: learning.examples }
    })
    let validated = args.fallbackOnly ? inputs.map(fallbackConcept) : undefined
    let validationError
    if (!validated) {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          validated = validateBatch(inputs, await generateBatch(inputs, args.model))
          break
        } catch (error) {
          validationError = error
          if (attempt < 4) await sleep(attempt * 1_500)
        }
      }
    }
    if (!validated) {
      validated = inputs.map(fallbackConcept)
      console.warn(`visual concept fallback for ${inputs.map((entry) => entry.entryId).join(',')}: ${validationError?.message ?? validationError}`)
    }
    for (const entry of validated) completed.set(entry.entryId, entry)
    const ordered = sourceEntries.filter((entry) => completed.has(entry.entryId)).map((entry) => completed.get(entry.entryId))
    writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 'gaokao-frequency-visual-concepts-v2', model: args.model, entries: ordered }, null, 2)}\n`)
    console.log(`visual concepts ${ordered.length}/${sourceEntries.length}`)
  }
}

await Promise.all(Array.from({ length: Math.min(args.concurrency, batches.length) }, () => generateNextBatch()))
console.log(`complete ${completed.size}/${sourceEntries.length}`)
