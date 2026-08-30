#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
  const args = { batchSize: 15, model: 'deepseek-chat' }
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['learning', 'output']) if (!args[key]) throw new Error(`Missing --${key}`)
  args.batchSize = Number(args.batchSize)
  return args
}

async function generate(entries, model) {
  const response = await fetch(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `你为高中英语单词匹配手绘教学图。只返回JSON {"entries":[]}。
每词输出 entryId、headword、concept、searchQuery、alt：
- concept必须是简短英文、可被图标搜索识别的具体物体、人物动作或日常场景；抽象词要落到最容易理解的具体场景，不能只写抽象符号。
- searchQuery必须是1至3个常见英文词，只保留画面的主体名词或最关键动作，用于图标库检索；不要把整个场景描述重复进去。
- alt是准确中文无障碍描述，直接说明画面及它如何表达当前核心义。
- 不使用Emoji，不改变entryId/headword。不同词尽量采用不同场景。`,
      }, {
        role: 'user',
        content: JSON.stringify({ entries: entries.map((entry) => ({ entryId: entry.entryId, headword: entry.headword, teachingSenses: entry.teachingSenses })) }),
      }],
    }),
  })
  if (!response.ok) throw new Error(`Visual concept generation failed: ${response.status} ${await response.text()}`)
  const payload = await response.json()
  return JSON.parse(payload.choices?.[0]?.message?.content ?? '').entries
}

const args = parseArgs(process.argv.slice(2))
if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required')
const learning = JSON.parse(readFileSync(path.resolve(args.learning), 'utf8')).entries
const outputPath = path.resolve(args.output)
const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')).entries : []
const completed = new Map(existing.map((entry) => [entry.entryId, entry]))

for (let start = 0; start < learning.length; start += args.batchSize) {
  const missing = learning.slice(start, start + args.batchSize).filter((entry) => !completed.has(entry.entryId))
  if (!missing.length) continue
  const generated = await generate(missing, args.model)
  const byId = new Map(generated.map((entry) => [entry.entryId, entry]))
  for (const source of missing) {
    const entry = byId.get(source.entryId)
    if (!entry || entry.headword !== source.headword || !entry.concept?.trim() || !/^[A-Za-z][A-Za-z -]{0,40}$/u.test(entry.searchQuery?.trim() ?? '') || !/[\u3400-\u9fff]/u.test(entry.alt ?? '')) {
      throw new Error(`Invalid visual concept for ${source.entryId}`)
    }
    if (/\p{Extended_Pictographic}/u.test(`${entry.concept}${entry.alt}`)) throw new Error(`Emoji in visual concept for ${source.entryId}`)
    completed.set(source.entryId, { entryId: source.entryId, headword: source.headword, concept: entry.concept.trim(), searchQuery: entry.searchQuery.trim(), alt: entry.alt.trim() })
  }
  const ordered = learning.filter((entry) => completed.has(entry.entryId)).map((entry) => completed.get(entry.entryId))
  writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 'gaokao-frequency-visual-concepts-v1', model: args.model, entries: ordered }, null, 2)}\n`)
  console.log(`generated ${ordered.length}/${learning.length}`)
}
console.log(`complete ${completed.size}/${learning.length}`)
