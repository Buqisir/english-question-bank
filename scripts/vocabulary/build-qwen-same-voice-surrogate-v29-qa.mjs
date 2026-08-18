#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-same-voice-surrogate-v29/manifest.json'), 'utf8'))
if (
  manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-same-voice-surrogate-v29'
  || manifest.entries.length !== 4
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false
) throw new Error('Expected four private V29 surrogate-distilled candidates')

const targets = new Map([
  ['gaokao-frequency-2081-violin', '重音在 LIN，末元音是 /ɪ/；音色接近 hello A27'],
  ['gaokao-frequency-2396-ballet', '读作 /bælˈeɪ/，重读 LAY；音色接近 hello A27'],
])
const labels = ['A29', 'B29']
const grouped = new Map()
for (const entry of manifest.entries) {
  const group = grouped.get(entry.entryId) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry.publicPath
  grouped.set(entry.entryId, group)
}
const cases = [...grouped.values()].map(({base, candidates}) => {
  if (!labels.every((label) => candidates[label])) throw new Error(`Incomplete V29 pair: ${base.entryId}`)
  return {
    id: `${base.entryId}--american`,
    headword: base.headword,
    verifiedIpa: base.verifiedIpa,
    target: targets.get(base.entryId),
    candidates,
  }
}).sort((left, right) => left.headword.localeCompare(right.headword))
if (cases.length !== 2 || !cases.every((entry) => entry.target)) throw new Error('Expected the exact two V29 cases')

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-teacher-first-remaining-owner-qa-v28.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜最后 2 词 V28</title>', '<title>高中 3000 词｜相似词教师 V29</title>')
  .replace('最后 2 个词｜沿用通过路线 V28', '最后 2 个词｜相似词教师 V29')
  .replace('hello A27 已保留。本轮每词只听一条 V28；偏快候选已丢弃。沿用通过路线，不换声、不变速、不做重音后处理。', 'hello A27 已保留。ballet 用 balain / balay 教重读；violin 用自然句 / violinist 教重读。两层都只用同音色 Qwen Base。')
  .replace('V28 待判断词条', 'V29 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["V28"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-voice-qwen-teacher-first-remaining-owner-qa-v28', 'gaokao-google-voice-qwen-same-voice-surrogate-owner-qa-v29')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-same-voice-surrogate-owner-qa-v29.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
