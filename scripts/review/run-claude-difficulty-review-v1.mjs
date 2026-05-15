import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname)
const INPUT_PATH = path.join(ROOT, 'knowledge/difficulty/full-bcd-difficulty-calibration-v1.jsonl')
const OUTPUT_PATH = path.join(ROOT, 'knowledge/difficulty/full-bcd-difficulty-claude-review-v1.json')
const GENERATED_AT = '2026-05-15T00:00:00.000Z'
const BATCH_SIZE = 20

function ensureInput() {
  execFileSync('node', ['scripts/review/build-full-bcd-difficulty-calibration-v1.mjs'], {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  })
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function parseReviewLines(text, batch, batchIndex) {
  const expectedIds = new Set(batch.map((record) => record.questionId))
  const reviews = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || !line.startsWith('REVIEW\t')) continue
    const parts = line.split('\t')
    if (parts.length < 5) {
      throw new Error(`Claude batch ${batchIndex + 1} malformed review line:\n${line}`)
    }
    const [, questionId, difficultyText, experienceFit, ...noteParts] = parts
    if (!expectedIds.has(questionId)) {
      throw new Error(`Claude batch ${batchIndex + 1} unknown questionId in line:\n${line}`)
    }
    reviews.push({
      questionId,
      difficulty: Number(difficultyText),
      experienceFit,
      note: noteParts.join(' ').replace(/\s+/g, ' ').trim()
    })
  }
  if (reviews.length !== batch.length) {
    throw new Error(`Claude batch ${batchIndex + 1} expected ${batch.length} REVIEW lines, got ${reviews.length}:\n${text}`)
  }
  return reviews
}

function compactRecord(record) {
  return {
    questionId: record.questionId,
    source: `${record.year} ${record.sourcePaper} ${record.passageLabel} Q${record.questionNo}`,
    stem: record.stem,
    answer: record.answer,
    surfaceType: record.surfaceType,
    answeringMove: record.answeringMove,
    tCardId: record.tCardId,
    deepseekScore10: record.aiDifficultyScore,
    deepseekMappedDifficulty: record.deepseekMappedDifficulty,
    blockers: record.aiMainBlockers,
    evidence: record.evidenceExcerpt
  }
}

function callClaude(batch, batchIndex, batchCount) {
  const systemPrompt = [
    'You are Claude Opus acting as an independent Gaokao English teaching reviewer.',
    'Review only small-question difficulty, not answer correctness.',
    'Do not anchor on the DeepSeek score; use it only as one signal.',
    'Difficulty scale is 1-5 for real Chinese high-school exam takers:',
    '1 very easy direct locating; 2 easy but has a small wording/detail burden; 3 medium with real classroom blockers; 4 hard with abstraction, strong distractors, or multi-step processing; 5 very hard even for strong students.',
    'For word-meaning questions, do not mechanically count the underlined target word itself as a vocab blocker; judge by context clues, options, and answer path.',
    'Return tab-separated REVIEW lines only. No markdown. No JSON. No tool calls.',
    'Format each line exactly: REVIEW<TAB>questionId<TAB>difficulty<TAB>experienceFit<TAB>note',
    'Do not put tabs inside note.'
  ].join('\n')
  const prompt = JSON.stringify({
    task: 'Give independent Claude difficulty reviews for these Gaokao reading questions.',
    batch: `${batchIndex + 1}/${batchCount}`,
    outputFormat: 'One line per item: REVIEW\\tquestionId\\tdifficulty(1-5)\\texperienceFit(符合经验|偏易|偏难|需人工)\\tnote(Chinese, <=60 chars)',
    items: batch.map(compactRecord)
  })

  const result = spawnSync('claude', [
    '-p',
    '--model', 'opus',
    '--effort', 'high',
    '--permission-mode', 'plan',
    '--tools', '',
    '--system-prompt', systemPrompt,
    prompt
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Claude batch ${batchIndex + 1} failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`)
  }
  return parseReviewLines(result.stdout, batch, batchIndex)
}

ensureInput()

const records = fs.readFileSync(INPUT_PATH, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
const batches = chunk(records, BATCH_SIZE)
const reviews = []

for (let index = 0; index < batches.length; index += 1) {
  console.error(`Reviewing batch ${index + 1}/${batches.length} (${batches[index].length} questions)...`)
  reviews.push(...callClaude(batches[index], index, batches.length))
}

const questionIds = new Set(records.map((record) => record.questionId))
const seen = new Set()
for (const review of reviews) {
  if (!questionIds.has(review.questionId)) throw new Error(`Unknown questionId from Claude: ${review.questionId}`)
  if (seen.has(review.questionId)) throw new Error(`Duplicate Claude review: ${review.questionId}`)
  seen.add(review.questionId)
  if (!Number.isInteger(review.difficulty) || review.difficulty < 1 || review.difficulty > 5) {
    throw new Error(`Invalid Claude difficulty for ${review.questionId}: ${review.difficulty}`)
  }
  review.experienceFit = String(review.experienceFit || '').slice(0, 20)
  review.note = String(review.note || '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

if (seen.size !== records.length) {
  throw new Error(`Expected ${records.length} Claude reviews, got ${seen.size}`)
}

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify({
  version: 'v1',
  reviewer: 'claude-opus',
  generatedAt: GENERATED_AT,
  reviewCount: reviews.length,
  reviews
}, null, 2)}\n`)

execFileSync('node', ['scripts/review/build-full-bcd-difficulty-calibration-v1.mjs'], {
  cwd: ROOT,
  stdio: 'inherit',
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024
})

console.log(JSON.stringify({ outputPath: OUTPUT_PATH, reviewCount: reviews.length }, null, 2))
