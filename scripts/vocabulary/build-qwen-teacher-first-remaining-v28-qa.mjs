#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-teacher-first-remaining-v28/manifest.json'), 'utf8'))
if (
  manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-teacher-first-remaining-v28'
  || manifest.entries.length !== 2
  || manifest.failures.length !== 2
  || manifest.formalAssetsChanged !== false
) throw new Error('Expected one technically viable V28 candidate per word and two rejected fast candidates')

const targets = new Map([
  ['gaokao-frequency-2081-violin', '重音在 LIN，末元音是 /ɪ/；必须自然'],
  ['gaokao-frequency-2396-ballet', '读作 /bælˈeɪ/，重读 LAY；必须自然'],
])
const labels = ['V28']
const grouped = new Map()
for (const entry of manifest.entries) {
  const group = grouped.get(entry.entryId) ?? {base: entry, candidates: {}}
  if (group.candidates.V28) throw new Error(`Duplicate viable V28 candidate: ${entry.entryId}`)
  group.candidates.V28 = entry.publicPath
  grouped.set(entry.entryId, group)
}
const cases = [...grouped.values()].map(({base, candidates}) => {
  if (!labels.every((label) => candidates[label])) throw new Error(`Incomplete V28 pair: ${base.entryId}`)
  return {
    id: `${base.entryId}--american`,
    headword: base.headword,
    verifiedIpa: base.verifiedIpa,
    target: targets.get(base.entryId),
    candidates,
  }
}).sort((left, right) => left.headword.localeCompare(right.headword))
if (cases.length !== 2 || !cases.every((entry) => entry.target)) throw new Error('Expected the exact two V28 cases')

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-teacher-first-hello-owner-qa-v27.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜hello 最小试验 V27</title>', '<title>高中 3000 词｜最后 2 词 V28</title>')
  .replace('只测 hello｜自然教师音 V27', '最后 2 个词｜沿用通过路线 V28')
  .replace('V26 已整批作废。本轮只听 hello 的 A27、B27；最终由 Qwen Base 直接生成，不换声、不变速、不做重音后处理。', 'hello A27 已保留。本轮每词只听一条 V28；偏快候选已丢弃。沿用通过路线，不换声、不变速、不做重音后处理。')
  .replace('V27 hello 待判断', 'V28 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A27","B27"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-voice-qwen-teacher-first-hello-owner-qa-v27', 'gaokao-google-voice-qwen-teacher-first-remaining-owner-qa-v28')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-teacher-first-remaining-owner-qa-v28.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
