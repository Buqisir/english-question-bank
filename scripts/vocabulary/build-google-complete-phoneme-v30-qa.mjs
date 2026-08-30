#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-complete-phoneme-v30/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-complete-phoneme-v30'
  || manifest.entries.length !== 6
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false) {
  throw new Error('Expected six private V30 Google differential candidates')
}

const labels = ['A30', 'B30', 'C30']
const grouped = new Map()
for (const entry of manifest.entries) {
  const group = grouped.get(entry.entryId) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry.publicPath
  grouped.set(entry.entryId, group)
}
const cases = [...grouped.values()].map(({base, candidates}) => {
  if (!labels.every((label) => candidates[label])) throw new Error(`Incomplete V30 triplet: ${base.entryId}`)
  return {
    id: `${base.entryId}--american`,
    headword: base.headword,
    verifiedIpa: base.verifiedIpa,
    target: 'A30 旧 Google 原音；B30 完整 IPA 孤立词；C30 完整 IPA 句内读后截取。',
    candidates,
  }
}).sort((left, right) => left.headword.localeCompare(right.headword))
if (cases.length !== 2) throw new Error('Expected exactly ballet and violin')

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-same-voice-surrogate-owner-qa-v29.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜相似词教师 V29</title>', '<title>高中 3000 词｜Google 完整音素差分 V30</title>')
  .replace('最后 2 个词｜相似词教师 V29', '最后 2 个词｜Google 完整音素差分 V30')
  .replace('hello A27 已保留。ballet 用 balain / balay 教重读；violin 用自然句 / violinist 教重读。两层都只用同音色 Qwen Base。', '这轮完全不用 Qwen。A30 是旧 Google 原音；B30 是同一 Google 女声用完整单词 IPA；C30 是同一 IPA 放进自然句后按时间点截出。')
  .replace('V29 待判断词条', 'V30 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A29","B29"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-voice-qwen-same-voice-surrogate-owner-qa-v29', 'gaokao-google-neural2-complete-phoneme-owner-qa-v30')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-complete-phoneme-owner-qa-v30.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
