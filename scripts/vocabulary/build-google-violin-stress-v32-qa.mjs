#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-neural2-violin-stress-v32/manifest.json'), 'utf8'))
if (manifest.schemaVersion !== 'gaokao-frequency-google-neural2-violin-stress-v32'
  || manifest.entries.length !== 3
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false) {
  throw new Error('Expected three private V32 violin stress candidates')
}

const labels = ['A32', 'B32', 'C32']
const base = manifest.entries[0]
const candidates = Object.fromEntries(manifest.entries.map((entry) => [entry.candidateLabel, entry.publicPath]))
if (!labels.every((label) => candidates[label])) throw new Error('Incomplete V32 violin trio')
const cases = [{
  id: `${base.entryId}--american`,
  headword: base.headword,
  verifiedIpa: base.verifiedIpa,
  target: '只判断主重音是否落在 LIN。A32 完整 IPA；B32 完整词强调；C32 Google 分段温和强化 LIN。',
  candidates,
}]

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-neural2-complete-phoneme-recut-owner-qa-v31.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜Google 精确重截 V31</title>', '<title>高中 3000 词｜violin Google 重音 V32</title>')
  .replace('最后 2 个词｜Google 精确重截 V31', '最后 1 个词｜violin Google 重音 V32')
  .replace('不重新合成，只重截你已确认发音正确的 C30。A31 严格按标记裁切；B31 留约 10ms 起音和 15ms 收音安全边界。', 'ballet A31 已锁定。本轮回到 Google 本身，只修 violin 的 LIN 主重音；目标词前后加短静音后再截取。')
  .replace('V31 待判断词条', 'V32 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A31","B31"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-neural2-complete-phoneme-recut-owner-qa-v31', 'gaokao-google-neural2-violin-stress-owner-qa-v32')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-neural2-violin-stress-owner-qa-v32.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
