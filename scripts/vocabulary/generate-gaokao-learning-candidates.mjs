#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = { batchSize: 10, concurrency: 4, model: process.env.DEEPSEEK_VOCABULARY_MODEL || 'deepseek-chat', requestTimeoutMs: 60_000 }
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['input', 'output']) if (!args[key]) throw new Error(`Missing --${key}`)
  args.batchSize = Number(args.batchSize)
  args.concurrency = Number(args.concurrency)
  args.requestTimeoutMs = Number(args.requestTimeoutMs)
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 6) throw new Error('concurrency must be 1–6')
  if (!Number.isInteger(args.requestTimeoutMs) || args.requestTimeoutMs < 30_000 || args.requestTimeoutMs > 120_000) throw new Error('requestTimeoutMs must be 30000–120000')
  return args
}

function systemPrompt() {
  return `你是中国高中英语词汇内容编辑。只返回JSON，不要Markdown。
任务：根据源书词条生成适合高中生的学习内容。源书词形、词性与全部中文义不得丢失或改写成别的义。
规则：
1. teachingSenses选1至3个高考常见核心义，必须来自sourceMeanings；若有多个重要义，优先分别覆盖。
2. 给出准确美式、英式IPA。美式保留卷舌/r/；长元音、重音和弱读符号不可省略。
3. pronunciationMode只能是syllables或forms。普通词按音节；多词形、缩写和词组用forms。americanParts和britishParts都包含spelling与phonetic。
4. 无论核心义有几个，都必须给出恰好三条例句A/B/C；核心义不足三个时复用同一义但更换场景。英文不得重复，中文翻译准确。
5. highlight必须是英文例句中实际出现的目标单词或目标词形本身，不要连带其他单词；不得使用Emoji；规避暴力、政治立场、歧视、酒赌毒和不良儿童引导。
6. headword和entryId必须原样返回。
输出：{"entries":[{"entryId":"...","headword":"...","phonetics":{"american":"/.../","british":"/.../"},"partOfSpeech":"...","sourceMeanings":["..."],"teachingSenses":["..."],"pronunciationMode":"syllables|forms","pronunciationParts":{"american":[{"spelling":"...","phonetic":"/.../"}],"british":[...]},"examples":[{"candidateId":"a|b|c","teachingSense":"...","english":"...","chinese":"...","highlight":"..."}]}]}`
}

function validateBatch(sourceEntries, generatedEntries) {
  if (!Array.isArray(generatedEntries) || generatedEntries.length !== sourceEntries.length) throw new Error('Generated batch size mismatch')
  const byId = new Map(generatedEntries.map((entry) => [entry.entryId, entry]))
  return sourceEntries.map((source) => {
    const entry = byId.get(source.entryId)
    if (!entry || entry.headword !== source.headword) throw new Error(`Identity mismatch for ${source.entryId}`)
    if (!Array.isArray(entry.teachingSenses) || entry.teachingSenses.length < 1 || entry.teachingSenses.length > 3) throw new Error(`Invalid teachingSenses for ${source.entryId}`)
    if (!['syllables', 'forms'].includes(entry.pronunciationMode)) throw new Error(`Invalid pronunciationMode for ${source.entryId}`)
    for (const accent of ['american', 'british']) {
      if (!/^\/.+\/$/u.test(entry.phonetics?.[accent] ?? '')) throw new Error(`Invalid ${accent} IPA for ${source.entryId}`)
      if (!Array.isArray(entry.pronunciationParts?.[accent]) || entry.pronunciationParts[accent].length < 1) throw new Error(`Missing ${accent} pronunciation parts for ${source.entryId}`)
    }
    if (!Array.isArray(entry.examples) || entry.examples.length !== 3) {
      throw new Error(`Need three examples for ${source.entryId}: ${JSON.stringify(entry)}`)
    }
    if (entry.examples.map((example) => example.candidateId).sort().join('') !== 'abc') throw new Error(`Candidate IDs invalid for ${source.entryId}`)
    const normalizedExamples = entry.examples.map((example) => {
      if (!example.english.includes(example.highlight)) throw new Error(`Highlight missing for ${source.entryId}/${example.candidateId}`)
      const teachingSense = entry.teachingSenses.includes(example.teachingSense)
        ? example.teachingSense
        : entry.teachingSenses.find((sense) => sense.includes(example.teachingSense) || example.teachingSense.includes(sense))
        ?? entry.teachingSenses[0]
      if (!/[\u4e00-\u9fff]/u.test(example.chinese)) throw new Error(`Chinese translation missing for ${source.entryId}/${example.candidateId}`)
      return { ...example, teachingSense }
    })
    return { ...entry, examples: normalizedExamples, partOfSpeech: source.partOfSpeech, sourceMeanings: source.sourceMeanings }
  })
}

async function generateBatch(entries, args) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required')
  const endpoint = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions'
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: args.model,
          temperature: 0.25,
          max_tokens: 2_000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt() },
            { role: 'user', content: JSON.stringify({ entries: entries.map((entry) => ({ entryId: entry.entryId, headword: entry.headword, partOfSpeech: entry.partOfSpeech, sourceMeanings: entry.sourceMeanings })) }) },
          ],
        }),
        signal: AbortSignal.timeout(args.requestTimeoutMs),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${(await response.text()).slice(0, 500)}`)
      const body = await response.json()
      const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? '')
      return validateBatch(entries, parsed.entries)
    } catch (error) {
      lastError = error
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
    }
  }
  throw new Error(`Generation failed after 4 attempts: ${lastError?.message ?? lastError}`)
}

const args = parseArgs(process.argv.slice(2))
const input = JSON.parse(readFileSync(path.resolve(args.input), 'utf8'))
const outputPath = path.resolve(args.output)
const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')).entries : []
const completed = new Map(existing.map((entry) => [entry.entryId, entry]))
const batches = []
for (let start = 0; start < input.entries.length; start += args.batchSize) {
  const missing = input.entries.slice(start, start + args.batchSize).filter((entry) => !completed.has(entry.entryId))
  if (missing.length) batches.push(missing)
}
let nextBatchIndex = 0
const generateNextBatch = async () => {
  while (nextBatchIndex < batches.length) {
    const batch = batches[nextBatchIndex]
    nextBatchIndex += 1
    const generated = await generateBatch(batch, args)
    for (const entry of generated) completed.set(entry.entryId, entry)
    const ordered = input.entries.filter((entry) => completed.has(entry.entryId)).map((entry) => completed.get(entry.entryId))
    writeFileSync(outputPath, JSON.stringify({ schemaVersion: 'gaokao-learning-candidates-v1', model: args.model, entries: ordered }, null, 2) + '\n')
    console.log(`generated ${ordered.length}/${input.entries.length}`)
  }
}
await Promise.all(Array.from({ length: Math.min(args.concurrency, batches.length) }, () => generateNextBatch()))
console.log(`complete ${completed.size}/${input.entries.length}`)
