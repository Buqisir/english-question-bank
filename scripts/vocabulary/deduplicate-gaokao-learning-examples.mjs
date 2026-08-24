#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (index % 2 === 0) rows.push([value.replace(/^--/u, ''), all[index + 1]])
  return rows
}, []))
if (!args.input) throw new Error('Missing --input')
if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required')
const inputPath = path.resolve(args.input)
const payload = JSON.parse(readFileSync(inputPath, 'utf8'))
const normalize = (value) => value.trim().toLocaleLowerCase()
const occupied = new Set()
const duplicateRows = []

for (const entry of payload.entries) {
  for (const example of entry.examples) {
    const key = normalize(example.english)
    if (occupied.has(key)) duplicateRows.push({ entry, example })
    else occupied.add(key)
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const prompt = `你是高中英语词汇例句编辑。只返回 JSON {"entries":[{"entryId":"...","candidateId":"a","english":"全新英文句","chinese":"准确中文翻译","highlight":"目标词形"}]}。
每项把 sentenceToReplace 重写成一条全新、自然、具体、难度适中的英文例句，并给准确中文翻译。禁止照抄输入对象，禁止返回 sentenceToReplace/translationToReplace 字段。
必须保留 highlight 的完全相同词形，表达 teachingSense；highlight 只返回该目标词形。
不得复用原句，不得与同批其他句重复，不得添加 Emoji、暴力、歧视、酒赌毒或不良儿童引导。
返回 entryId、candidateId、english、chinese、highlight。`

async function rewriteBatch(rows, model = 'deepseek-chat') {
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          max_tokens: 4_000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: JSON.stringify({ entries: rows.map(({ entry, example }) => ({ entryId: entry.entryId, headword: entry.headword, candidateId: example.candidateId, teachingSense: example.teachingSense, sentenceToReplace: example.english, translationToReplace: example.chinese, requiredHighlight: example.highlight })) }) },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`)
      const generated = JSON.parse((await response.json()).choices?.[0]?.message?.content ?? '').entries
      if (!Array.isArray(generated) || generated.length !== rows.length) throw new Error('Rewrite batch size mismatch')
      const byKey = new Map(generated.map((entry) => [`${entry.entryId}:${entry.candidateId}`, entry]))
      const local = new Set()
      return rows.map(({ entry, example }) => {
        const rewritten = byKey.get(`${entry.entryId}:${example.candidateId}`)
        const escapedHighlight = example.highlight.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
        const actualHighlight = rewritten?.english?.match(new RegExp(escapedHighlight, 'iu'))?.[0]
        if (!rewritten || !actualHighlight || !/[\u3400-\u9fff]/u.test(rewritten.chinese ?? '')) throw new Error(`Invalid rewrite for ${entry.entryId}/${example.candidateId}: ${JSON.stringify(rewritten)}`)
        const key = normalize(rewritten.english)
        if (occupied.has(key) || local.has(key)) throw new Error(`Rewrite is still duplicated: ${rewritten.english}`)
        local.add(key)
        return { entry, example, rewritten: { ...example, english: rewritten.english.trim(), chinese: rewritten.chinese.trim(), highlight: actualHighlight } }
      })
    } catch (error) {
      lastError = error
      if (attempt < 4) await sleep(attempt * 1_500)
    }
  }
  if (rows.length > 1) {
    const recovered = []
    for (const row of rows) recovered.push(...await rewriteBatch([row]))
    return recovered
  }
  if (model !== 'deepseek-reasoner') return rewriteBatch(rows, 'deepseek-reasoner')
  throw new Error(`Unable to rewrite duplicate batch: ${lastError?.message ?? lastError}`)
}

for (let start = 0; start < duplicateRows.length; start += 5) {
  const rewritten = await rewriteBatch(duplicateRows.slice(start, start + 5))
  for (const row of rewritten) {
    const index = row.entry.examples.findIndex((example) => example.candidateId === row.example.candidateId)
    row.entry.examples[index] = row.rewritten
    occupied.add(normalize(row.rewritten.english))
  }
  writeFileSync(inputPath, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`deduplicated ${Math.min(start + 5, duplicateRows.length)}/${duplicateRows.length}`)
}

writeFileSync(inputPath, `${JSON.stringify(payload, null, 2)}\n`)
console.log(`complete ${duplicateRows.length}`)
