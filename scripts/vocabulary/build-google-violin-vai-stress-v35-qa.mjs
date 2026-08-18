#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-vai-stress-v35/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-violin-vai-stress-v35'
  || manifest.entries.length !== 2
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false) throw new Error('Expected two private V35 VAI-stress candidates')

const labels = ['A35', 'B35']
const base = manifest.entries[0]
const candidates = Object.fromEntries(manifest.entries.map((entry) => [entry.candidateLabel, entry.publicPath]))
if (!labels.every((label) => candidates[label])) throw new Error('Incomplete V35 VAI-stress pair')
const cases = [{
  id: `${base.entryId}--american`,
  headword: base.headword,
  verifiedIpa: base.verifiedIpa,
  target: 'VAI 要有接近“歪”的 /aɪ/ 和清楚的次重音。A35 自然重读；B35 稍慢、稍强。/ə/ 与 LIN 不动。',
  candidates,
}]

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-neural2-violin-vai-owner-qa-v34.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜violin VAI V34</title>', '<title>高中 3000 词｜violin VAI 次重音 V35</title>')
  .replace('最后 1 个词｜violin VAI V34', '最后 1 个词｜violin VAI 次重音 V35')
  .replace('问题已锁定为 VAI。本轮恢复它正确的次重音；中间弱读与 LIN 保持上一轮参数不变。', 'VAI 应有接近“歪”的 /aɪ/，并承担次重音；LIN 仍是主重音。本轮用 Google 自然单词 vie 提供 VAI。')
  .replace('V34 待判断词条', 'V35 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A34","B34"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-neural2-violin-vai-owner-qa-v34', 'gaokao-google-neural2-violin-vai-stress-owner-qa-v35')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-vai-stress-owner-qa-v35.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
