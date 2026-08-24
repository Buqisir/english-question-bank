#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = { batchSize: 5, concurrency: 1, model: 'deepseek-reasoner', requestTimeoutMs: 90_000 }
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['source', 'candidates', 'output']) if (!args[key]) throw new Error(`Missing --${key}`)
  args.batchSize = Number(args.batchSize)
  args.concurrency = Number(args.concurrency)
  args.requestTimeoutMs = Number(args.requestTimeoutMs)
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 4) throw new Error('concurrency must be 1–4')
  if (!Number.isInteger(args.requestTimeoutMs) || args.requestTimeoutMs < 30_000 || args.requestTimeoutMs > 180_000) throw new Error('requestTimeoutMs must be 30000–180000')
  return args
}

function parseJsonObject(rawText) {
  const trimmed = rawText.trim().replace(/^```json\s*/u, '').replace(/\s*```$/u, '')
  return JSON.parse(trimmed)
}

async function callReviewer(messages, model, requestTimeoutMs) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required')
  const endpoint = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions'
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, temperature: 0, max_tokens: 6_000, response_format: { type: 'json_object' }, messages }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`)
      const payload = await response.json()
      const rawText = payload.choices?.[0]?.message?.content ?? ''
      if (!rawText) throw new Error('Independent reviewer returned no final content')
      return rawText
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000))
    }
  }
  throw new Error(`Independent review failed after 3 attempts: ${lastError?.message ?? lastError}`)
}

function validate(source, candidate, reviewerModel) {
  if (candidate.entryId !== source.entryId || candidate.headword !== source.headword) throw new Error(`Identity mismatch for ${source.entryId}`)
  if (!Array.isArray(candidate.teachingSenses) || candidate.teachingSenses.length < 1 || candidate.teachingSenses.length > 3) throw new Error(`Invalid teachingSenses for ${source.entryId}`)
  if (!['syllables', 'forms'].includes(candidate.pronunciationMode)) throw new Error(`Invalid pronunciationMode for ${source.entryId}`)
  if (!Array.isArray(candidate.examples) || candidate.examples.length !== 3) throw new Error(`Need three examples for ${source.entryId}`)
  if (candidate.examples.map((example) => example.candidateId).sort().join('') !== 'abc') throw new Error(`Invalid candidate IDs for ${source.entryId}`)
  for (const example of candidate.examples) {
    if (!candidate.teachingSenses.includes(example.teachingSense)) throw new Error(`Invalid example sense for ${source.entryId}/${example.candidateId}`)
    if (!example.english.includes(example.highlight)) throw new Error(`Missing highlight for ${source.entryId}/${example.candidateId}`)
  }
  for (const accent of ['american', 'british']) {
    if (!/^\/.+\/$/u.test(candidate.phonetics?.[accent] ?? '')) throw new Error(`Invalid ${accent} IPA for ${source.entryId}`)
    if (!Array.isArray(candidate.pronunciationParts?.[accent]) || !candidate.pronunciationParts[accent].length) throw new Error(`Missing ${accent} parts for ${source.entryId}`)
  }
  return {
    ...candidate,
    partOfSpeech: source.partOfSpeech,
    sourceMeanings: source.sourceMeanings,
    independentReview: {
      reviewer: reviewerModel,
      status: 'approved',
      notes: Array.isArray(candidate.independentReview?.notes) ? candidate.independentReview.notes : [],
    },
  }
}

function validateReviewedBatch(sourceBatch, parsed, reviewerModel) {
  if (!Array.isArray(parsed.entries) || parsed.entries.length !== sourceBatch.length) throw new Error('Review batch size mismatch')
  const returnedEntries = parsed.entries.map((entry) => entry?.candidate ?? entry)
  const returnedById = new Map(returnedEntries.filter((entry) => entry?.entryId).map((entry) => [entry.entryId, entry]))
  const usedReturned = new Set()
  return sourceBatch.map((source) => {
    const headwordMatches = returnedEntries.filter((entry) => entry?.headword === source.headword && !usedReturned.has(entry))
    const returned = returnedById.get(source.entryId) ?? (headwordMatches.length === 1 ? headwordMatches[0] : undefined)
    if (!returned || usedReturned.has(returned)) throw new Error(`Independent review changed identity or omitted ${source.entryId}`)
    usedReturned.add(returned)
    return validate(source, { ...returned, entryId: source.entryId, headword: source.headword }, reviewerModel)
  })
}

const args = parseArgs(process.argv.slice(2))
const sourceEntries = JSON.parse(readFileSync(path.resolve(args.source), 'utf8')).entries
const candidatePath = path.resolve(args.candidates)
const loadCandidateMap = async () => {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const entries = JSON.parse(readFileSync(candidatePath, 'utf8')).entries
      return new Map(entries.map((entry) => [entry.entryId, entry]))
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(`Unable to read candidate checkpoint: ${lastError?.message ?? lastError}`)
}
const outputPath = path.resolve(args.output)
const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')).entries : []
const reviewed = new Map(existing.map((entry) => [entry.entryId, entry]))

const pendingBatches = []
for (let start = 0; start < sourceEntries.length; start += args.batchSize) {
  const sourceBatch = sourceEntries.slice(start, start + args.batchSize).filter((entry) => !reviewed.has(entry.entryId) && (!args.onlyEntryId || entry.entryId === args.onlyEntryId))
  if (sourceBatch.length) pendingBatches.push(sourceBatch)
}

let nextBatchIndex = 0
const reviewerSystemPrompt = `你是独立的高中英语词汇审校员。只返回JSON对象。逐词审查并必要时直接修正候选内容：
- 美式与英式IPA、重音、长短元音和/r/必须准确；音节或词形拆分必须和拼写及IPA一致。
- pronunciationMode只能原样使用"syllables"或"forms"；普通单词用"syllables"，并列词形或变形用"forms"。
- phonetics.american与phonetics.british各自必须是一个且仅一个由单对斜杠包围的IPA字符串，例如"/trænsˈpɔːrt/"。禁止返回括号说明、词性标签、多个分立的/读音/或斜杠外文字。同形异音词按当前teachingSenses和sourceMeanings所对应的教学读音选择一个；若词性共用同一义，优先源书所列读音。
- 1至3个核心义必须来自源书全部义项，并优先高考常见义；不得丢改sourceMeanings。
- 恰好三句A/B/C，覆盖核心义，英语自然、难度适中、翻译准确、highlight只含句中目标词形。
- 排除重复句、Emoji、不良儿童引导、政治立场、暴力、歧视、酒赌毒。
返回 {"entries":[完整修正后的候选对象]}，并为每项添加 independentReview:{"notes":[简短修订说明]}。即使无需修订也返回完整对象。`

async function reviewBatch(sourceBatch, reviewInput, reviewerModel = args.model) {
  let parseError
  const maxValidationAttempts = sourceBatch.length > 1 ? 2 : 3
  for (let attempt = 1; attempt <= maxValidationAttempts; attempt += 1) {
    try {
      const rawText = await callReviewer([
        { role: 'system', content: reviewerSystemPrompt },
        { role: 'user', content: JSON.stringify({ entries: reviewInput }) },
      ], reviewerModel, args.requestTimeoutMs)
      return validateReviewedBatch(sourceBatch, parseJsonObject(rawText), reviewerModel)
    } catch (error) {
      parseError = error
      if (attempt < maxValidationAttempts) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000))
    }
  }
  throw new Error(`Independent review returned invalid content after ${maxValidationAttempts} attempts: ${parseError?.message ?? parseError}`)
}

async function reviewNextBatch() {
  while (nextBatchIndex < pendingBatches.length) {
    const sourceBatch = pendingBatches[nextBatchIndex]
    nextBatchIndex += 1
  let candidateById
  while (true) {
    candidateById = await loadCandidateMap()
    if (sourceBatch.every((source) => candidateById.has(source.entryId))) break
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
  const reviewInput = sourceBatch.map((source) => ({
    source: {
      entryId: source.entryId,
      headword: source.headword,
      sourcePhonetic: source.sourcePhonetic,
      partOfSpeech: source.partOfSpeech,
      sourceMeanings: source.sourceMeanings,
    },
    candidate: candidateById.get(source.entryId),
  }))
  let validatedEntries
  try {
    validatedEntries = await reviewBatch(sourceBatch, reviewInput)
  } catch (error) {
    if (sourceBatch.length === 1) {
      if (args.model === 'deepseek-reasoner') throw error
      console.warn(`reasoner fallback ${sourceBatch[0].entryId}: ${error.message}`)
      validatedEntries = await reviewBatch(sourceBatch, reviewInput, 'deepseek-reasoner')
    } else {
      console.warn(`batch fallback ${sourceBatch[0].entryId}..${sourceBatch.at(-1).entryId}: ${error.message}`)
      validatedEntries = []
      for (let index = 0; index < sourceBatch.length; index += 1) {
        try {
          validatedEntries.push(...await reviewBatch([sourceBatch[index]], [reviewInput[index]]))
        } catch (singleError) {
          if (args.model === 'deepseek-reasoner') throw singleError
          console.warn(`reasoner fallback ${sourceBatch[index].entryId}: ${singleError.message}`)
          validatedEntries.push(...await reviewBatch([sourceBatch[index]], [reviewInput[index]], 'deepseek-reasoner'))
        }
      }
    }
  }
  for (const entry of validatedEntries) reviewed.set(entry.entryId, entry)
  const ordered = sourceEntries.filter((entry) => reviewed.has(entry.entryId)).map((entry) => reviewed.get(entry.entryId))
  writeFileSync(outputPath, JSON.stringify({ schemaVersion: 'gaokao-learning-reviewed-v1', model: args.model, entries: ordered }, null, 2) + '\n')
  console.log(`reviewed ${ordered.length}/${sourceEntries.length}`)
  }
}

await Promise.all(Array.from({ length: Math.min(args.concurrency, pendingBatches.length) }, () => reviewNextBatch()))
console.log(`complete ${reviewed.size}/${sourceEntries.length}`)
