#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-vai-v34/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-violin-vai-v34'
  || manifest.entries.length !== 2
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false) throw new Error('Expected two private V34 VAI candidates')

const labels = ['A34', 'B34']
const base = manifest.entries[0]
const candidates = Object.fromEntries(manifest.entries.map((entry) => [entry.candidateLabel, entry.publicPath]))
if (!labels.every((label) => candidates[label])) throw new Error('Incomplete V34 VAI pair')
const cases = [{
  id: `${base.entryId}--american`,
  headword: base.headword,
  verifiedIpa: base.verifiedIpa,
  target: '只修 VAI。A34 恢复 /ˌvaɪ/ 次重音；B34 同样恢复次重音并稍慢、稍清楚。/ə/ 与 LIN 完全不动。',
  candidates,
}]

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-neural2-violin-front-owner-qa-v33.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜violin 前半段 V33</title>', '<title>高中 3000 词｜violin VAI V34</title>')
  .replace('最后 1 个词｜violin 前半段 V33', '最后 1 个词｜violin VAI V34')
  .replace('LIN 已锁定不动。本轮只把前半段拆成明确的 /vaɪ/ 和弱读 /ə/，消除听起来像 wire 的黏连。', '问题已锁定为 VAI。本轮恢复它正确的次重音；中间弱读与 LIN 保持上一轮参数不变。')
  .replace('V33 待判断词条', 'V34 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A33","B33"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-neural2-violin-front-owner-qa-v33', 'gaokao-google-neural2-violin-vai-owner-qa-v34')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-vai-owner-qa-v34.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
