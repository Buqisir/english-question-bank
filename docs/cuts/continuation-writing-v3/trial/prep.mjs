import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
// Usage: node prep.mjs <out-dir>. Writes <paper>/v2-prompt.txt, v3-prompt.txt and assets.json.
// CW_PAPERS=<id,...> limits the papers; CW_V2_TARGET=<n> overrides wordCountTarget in the V2 prompt only, to match lengths.
const root = path.resolve(import.meta.dirname, '../../../..')
const out = process.argv[2]
const { buildNarrativeContinuationStagedAnalysisContract } = await import(path.join(root, 'server/paper-import-ai/analyzeNarrativeContinuation.mjs'))
const v2 = buildNarrativeContinuationStagedAnalysisContract()
const v3full = readFileSync(root + '/prompts/continuation-writing-model-answer-v3.md', 'utf8')
const v3 = v3full.slice(v3full.indexOf('你是一名'))
const papers = {
  'paper-2022-i': 'test-fixtures/retired-paper-assets', 'paper-2023-i': 'test-fixtures/retired-paper-assets',
  'paper-zj-2024-jan': 'test-fixtures/retired-paper-assets', 'paper-mock-sz-2026-m1': 'app/public/paper-assets',
  'paper-2024-i': 'test-fixtures/retired-paper-assets', 'paper-2025-i': 'test-fixtures/retired-paper-assets', 'paper-2025-ii': 'test-fixtures/retired-paper-assets',
  // Round 3 blind papers, not seen by the Owner in earlier rounds.
  'paper-2020-i': 'test-fixtures/retired-paper-assets', 'paper-2026-i': 'test-fixtures/retired-paper-assets',
  'paper-zj-2025-jan': 'test-fixtures/retired-paper-assets', 'paper-mock-gd-2026-m1': 'app/public/paper-assets',
}
// CW_PAPERS=a,b limits the run to those papers.
if (process.env.CW_PAPERS) {
  const keep = new Set(process.env.CW_PAPERS.split(','))
  for (const id of Object.keys(papers)) if (!keep.has(id)) delete papers[id]
}
const index = {}
for (const [id, base] of Object.entries(papers)) {
  const dir = path.join(root, base, id)
  const asset = JSON.parse(readFileSync(path.join(dir, 'latest/paper-asset.json'), 'utf8'))
  const t = Object.values(asset.content.writingTasks).find((x) => x.taskType === 'continuation')
  const input = { writingTaskId: t.writingTaskId || '', groupId: t.groupId || '', taskType: 'continuation', instruction: t.instruction, materialText: t.materialText, paragraphStarters: [...t.continuationStarters], wordCountTarget: Number(t.wordCountTarget || 150) }
  const v2Input = process.env.CW_V2_TARGET ? { ...input, wordCountTarget: Number(process.env.CW_V2_TARGET) } : input
  const task = ['Complete continuation Writing Task:', '', 'Structured input:', JSON.stringify(input, null, 2)].join('\n')
  mkdirSync(path.join(out, id), { recursive: true })
  writeFileSync(path.join(out, id, 'v3-prompt.txt'), `${v3}\n\n${task}\n`)
  const v2Task = ['Complete continuation Writing Task:', '', 'Structured input:', JSON.stringify(v2Input, null, 2)].join('\n')
  writeFileSync(path.join(out, id, 'v2-prompt.txt'), `${v2}\n\n${v2Task}\n`)
  index[id] = dir
}
writeFileSync(path.join(out, 'assets.json'), JSON.stringify(index, null, 2))
console.log(Object.keys(index).join(' '), v2.length, v3.length)
