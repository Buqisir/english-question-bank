#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')

function parseArgs(argv) {
  const args = { batchSize: 15, model: 'deepseek-chat' }
  for (let index = 0; index < argv.length; index += 2) args[argv[index].replace(/^--/u, '')] = argv[index + 1]
  for (const key of ['selection', 'output']) if (!args[key]) throw new Error(`Missing --${key}`)
  args.batchSize = Number(args.batchSize)
  return args
}

async function reviewAlts(entries, model) {
  const response = await fetch(process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `你是教学图片无障碍文本审校员。只返回JSON {"entries":[]}。
每项只返回entryId和alt。根据iconName中实际存在的画面主体，以及teachingSenses所表达的当前教学义，写一句准确、克制的中文alt：
- 先忠实说明实际画面，再说明它帮助表达哪个教学义；不得声称图中有iconName没有的文字、数字、颜色、人物或物体。
- 不把多个义项硬塞进一张图；只解释这张图最直接表达的一个核心义。
- 不使用Emoji，不改变entryId。`,
      }, { role: 'user', content: JSON.stringify({ entries }) }],
    }),
  })
  if (!response.ok) throw new Error(`Visual alt review failed: ${response.status} ${await response.text()}`)
  const payload = await response.json()
  return JSON.parse(payload.choices?.[0]?.message?.content ?? '').entries
}

const args = parseArgs(process.argv.slice(2))
if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is required')
const selection = JSON.parse(readFileSync(path.resolve(args.selection), 'utf8'))
const outputPath = path.resolve(args.output)
const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')).entries : []
const completed = new Map(existing.map((entry) => [entry.entryId, entry]))

for (let start = 0; start < selection.entries.length; start += args.batchSize) {
  const missing = selection.entries.slice(start, start + args.batchSize).filter((entry) => !completed.has(entry.entryId))
  if (!missing.length) continue
  const reviewed = await reviewAlts(missing.map((entry) => ({
    entryId: entry.entryId,
    headword: entry.headword,
    iconName: entry.iconName,
    teachingSenses: entry.teachingSenses,
  })), args.model)
  const byId = new Map(reviewed.map((entry) => [entry.entryId, entry]))
  for (const source of missing) {
    const result = byId.get(source.entryId)
    if (!result || !/[\u3400-\u9fff]/u.test(result.alt ?? '') || /\p{Extended_Pictographic}/u.test(result.alt)) {
      throw new Error(`Invalid reviewed alt for ${source.entryId}`)
    }
    const assetPath = path.join(rootDir, 'app/public', source.path.replace(/^\//u, ''))
    const bytes = readFileSync(assetPath)
    completed.set(source.entryId, {
      entryId: source.entryId,
      headword: source.headword,
      visualKey: source.visualKey,
      slug: source.slug,
      width: source.width,
      height: source.height,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      path: source.path,
      alt: result.alt.trim(),
      version: selection.version,
    })
  }
  const ordered = selection.entries.filter((entry) => completed.has(entry.entryId)).map((entry) => completed.get(entry.entryId))
  writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 'gaokao-frequency-visual-manifest-v1', version: selection.version, entries: ordered }, null, 2)}\n`)
  console.log(`reviewed ${ordered.length}/${selection.entries.length}`)
}

console.log(`complete ${completed.size}/${selection.entries.length}`)
