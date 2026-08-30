#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-teacher-first-hello-v27/manifest.json'), 'utf8'))
if (
  manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-teacher-first-hello-v27'
  || manifest.entries.length !== 2
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false
) throw new Error('Expected two private hello-only V27 candidates')

const labels = ['A27', 'B27']
const candidates = {}
for (const entry of manifest.entries) candidates[entry.candidateLabel] = entry.publicPath
if (!labels.every((label) => candidates[label])) throw new Error('Incomplete V27 hello pair')
const cases = [{
  id: 'gaokao-frequency-1887-hello--american',
  headword: 'hello',
  verifiedIpa: '/heˈloʊ/',
  target: '重读 LOW；必须自然，不能有机械音',
  candidates,
}]

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/qwen-voice-design-openvoice-owner-qa-v26.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜3 条发音优先 V26</title>', '<title>高中 3000 词｜hello 最小试验 V27</title>')
  .replace('剩余 3 个词｜发音优先 V26', '只测 hello｜自然教师音 V27')
  .replace('equator A21、domain C22、dolphin A24 已保留。每个词只听 A26、B26；先由 Qwen 读对重音，再转换回 Google 美国女声音色。', 'V26 已整批作废。本轮只听 hello 的 A27、B27；最终由 Qwen Base 直接生成，不换声、不变速、不做重音后处理。')
  .replace('V26 待判断词条', 'V27 hello 待判断')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A26","B26"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-qwen-voice-design-openvoice-owner-qa-v26', 'gaokao-google-voice-qwen-teacher-first-hello-owner-qa-v27')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-teacher-first-hello-owner-qa-v27.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
