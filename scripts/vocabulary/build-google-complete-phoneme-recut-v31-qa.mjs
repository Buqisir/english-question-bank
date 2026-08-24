#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-complete-phoneme-recut-v31/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-complete-phoneme-recut-v31'
  || manifest.entries.length !== 4
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false) {
  throw new Error('Expected four private V31 recut candidates')
}

const labels = ['A31', 'B31']
const grouped = new Map()
for (const entry of manifest.entries) {
  const group = grouped.get(entry.entryId) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry.publicPath
  grouped.set(entry.entryId, group)
}
const cases = [...grouped.values()].map(({base, candidates}) => {
  if (!labels.every((label) => candidates[label])) throw new Error(`Incomplete V31 pair: ${base.entryId}`)
  return {
    id: `${base.entryId}--american`,
    headword: base.headword,
    verifiedIpa: base.verifiedIpa,
    target: '发音保持 C30 不变。A31 严格按标记裁切；B31 保留极短安全边界。只判断截取是否干净。',
    candidates,
  }
}).sort((left, right) => left.headword.localeCompare(right.headword))
if (cases.length !== 2) throw new Error('Expected exactly ballet and violin')

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-neural2-complete-phoneme-owner-qa-v30.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜Google 完整音素差分 V30</title>', '<title>高中 3000 词｜Google 精确重截 V31</title>')
  .replace('最后 2 个词｜Google 完整音素差分 V30', '最后 2 个词｜Google 精确重截 V31')
  .replace('这轮完全不用 Qwen。A30 是旧 Google 原音；B30 是同一 Google 女声用完整单词 IPA；C30 是同一 IPA 放进自然句后按时间点截出。', '不重新合成，只重截你已确认发音正确的 C30。A31 严格按标记裁切；B31 留约 10ms 起音和 15ms 收音安全边界。')
  .replace('V30 待判断词条', 'V31 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A30","B30","C30"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-neural2-complete-phoneme-owner-qa-v30', 'gaokao-google-neural2-complete-phoneme-recut-owner-qa-v31')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-complete-phoneme-recut-owner-qa-v31.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
