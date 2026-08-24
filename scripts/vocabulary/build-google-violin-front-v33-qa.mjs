#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-front-v33/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-violin-front-v33'
  || manifest.entries.length !== 2
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false) throw new Error('Expected two private V33 violin-front candidates')

const labels = ['A33', 'B33']
const base = manifest.entries[0]
const candidates = Object.fromEntries(manifest.entries.map((entry) => [entry.candidateLabel, entry.publicPath]))
if (!labels.every((label) => candidates[label])) throw new Error('Incomplete V33 violin-front pair')
const cases = [{
  id: `${base.entryId}--american`,
  headword: base.headword,
  verifiedIpa: base.verifiedIpa,
  target: 'LIN 保持 C32 不变。A33 明确 /vaɪ/ + 自然弱读 /ə/；B33 明确 /vaɪ/ + 更短的 /ə/。',
  candidates,
}]

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-neural2-violin-stress-owner-qa-v32.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜violin Google 重音 V32</title>', '<title>高中 3000 词｜violin 前半段 V33</title>')
  .replace('最后 1 个词｜violin Google 重音 V32', '最后 1 个词｜violin 前半段 V33')
  .replace('ballet A31 已锁定。本轮回到 Google 本身，只修 violin 的 LIN 主重音；目标词前后加短静音后再截取。', 'LIN 已锁定不动。本轮只把前半段拆成明确的 /vaɪ/ 和弱读 /ə/，消除听起来像 wire 的黏连。')
  .replace('V32 待判断词条', 'V33 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A32","B32","C32"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-neural2-violin-stress-owner-qa-v32', 'gaokao-google-neural2-violin-front-owner-qa-v33')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-front-owner-qa-v33.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
