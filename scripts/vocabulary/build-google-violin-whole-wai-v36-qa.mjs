#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-whole-wai-v36/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-violin-whole-wai-v36'
  || manifest.entries.length !== 2
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false) throw new Error('Expected two private V36 whole-word WAI candidates')

const labels = ['A36', 'B36']
const base = manifest.entries[0]
const candidates = Object.fromEntries(manifest.entries.map((entry) => [entry.candidateLabel, entry.publicPath]))
if (!labels.every((label) => candidates[label])) throw new Error('Incomplete V36 whole-word WAI pair')
const cases = [{
  id: `${base.entryId}--american`,
  headword: base.headword,
  verifiedIpa: base.ownerTargetIpa,
  target: '不再分段。整词 /ˌwaɪ.əˈlɪn/ 一次生成：WAI 次重音，LIN 主重音。A36 自然；B36 整词强调。',
  candidates,
}]

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-neural2-violin-vai-stress-owner-qa-v35.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜violin VAI 次重音 V35</title>', '<title>高中 3000 词｜violin 整词 WAI V36</title>')
  .replace('最后 1 个词｜violin VAI 次重音 V35', '最后 1 个词｜violin 整词 WAI V36')
  .replace('VAI 应有接近“歪”的 /aɪ/，并承担次重音；LIN 仍是主重音。本轮用 Google 自然单词 vie 提供 VAI。', '停止分段拼接。按 Owner 目标把整词一次写成 /ˌwaɪ.əˈlɪn/：WAI 次重音，LIN 主重音。')
  .replace('V35 待判断词条', 'V36 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A35","B35"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-neural2-violin-vai-stress-owner-qa-v35', 'gaokao-google-neural2-violin-whole-wai-owner-qa-v36')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-whole-wai-owner-qa-v36.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
