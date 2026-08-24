#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-wai-contour-v37/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-violin-wai-contour-v37'
  || manifest.entries.length !== 2
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false) throw new Error('Expected two private V37 WAI-contour candidates')

const labels = ['A37', 'B37']
const base = manifest.entries[0]
const candidates = Object.fromEntries(manifest.entries.map((entry) => [entry.candidateLabel, entry.publicPath]))
if (!labels.every((label) => candidates[label])) throw new Error('Incomplete V37 WAI-contour pair')
const cases = [{
  id: `${base.entryId}--american`,
  headword: base.headword,
  verifiedIpa: base.ownerTargetIpa,
  target: '整词连续不变，只改 WAI 音高走向。A37 陈述句中间，较平；B37 疑问句中间，略扬。目标是“歪”，不是“外”。',
  candidates,
}]

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-neural2-violin-whole-wai-owner-qa-v36.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜violin 整词 WAI V36</title>', '<title>高中 3000 词｜violin WAI 语调 V37</title>')
  .replace('最后 1 个词｜violin 整词 WAI V36', '最后 1 个词｜violin WAI 语调 V37')
  .replace('停止分段拼接。按 Owner 目标把整词一次写成 /ˌwaɪ.əˈlɪn/：WAI 次重音，LIN 主重音。', '音素已经锁定，问题是“外”式下降调。本轮取消词前后停顿，让整词在句中自然形成“歪”的平/扬走向。')
  .replace('V36 待判断词条', 'V37 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A36","B36"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-neural2-violin-whole-wai-owner-qa-v36', 'gaokao-google-neural2-violin-wai-contour-owner-qa-v37')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-wai-contour-owner-qa-v37.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
