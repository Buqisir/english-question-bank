#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-openvoice-v26/manifest.json'), 'utf8'))
if (
  manifest.schemaVersion !== 'gaokao-frequency-qwen-voice-design-openvoice-v26'
  || manifest.entries.length !== 6
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false
) throw new Error('Expected six private V26 pronunciation-first voice-transfer candidates')

const targets = new Map([
  ['gaokao-frequency-2081-violin', '重音在 LIN，末元音是 /ɪ/'],
  ['gaokao-frequency-1887-hello', '重读 LOW'],
  ['gaokao-frequency-2396-ballet', '读作 /bælˈeɪ/，重读 LAY'],
])
const labels = ['A26', 'B26']
const grouped = new Map()
for (const entry of manifest.entries) {
  const group = grouped.get(entry.entryId) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry.publicPath
  grouped.set(entry.entryId, group)
}
const cases = [...grouped.values()].map(({base, candidates}) => {
  if (!labels.every((label) => candidates[label])) throw new Error(`Incomplete V26 pair: ${base.entryId}`)
  return {
    id: `${base.entryId}--american`,
    headword: base.headword,
    verifiedIpa: base.verifiedIpa,
    target: targets.get(base.entryId),
    candidates,
  }
}).sort((left, right) => left.headword.localeCompare(right.headword))
if (cases.length !== 3 || !cases.every((entry) => entry.target)) throw new Error('Expected the exact three V26 cases')

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-stress-center-owner-qa-v25.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜3 条重音收尾 V25</title>', '<title>高中 3000 词｜3 条发音优先 V26</title>')
  .replace('剩余 3 个词｜重音收尾 V25', '剩余 3 个词｜发音优先 V26')
  .replace('equator A21、domain C22、dolphin A24 已保留。每个词只听 A25、B25；时长与语速不变，只调整重音中心。', 'equator A21、domain C22、dolphin A24 已保留。每个词只听 A26、B26；先由 Qwen 读对重音，再转换回 Google 美国女声音色。')
  .replace('V25 待判断词条', 'V26 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A25","B25"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-voice-qwen-stress-center-owner-qa-v25', 'gaokao-qwen-voice-design-openvoice-owner-qa-v26')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'qwen-voice-design-openvoice-owner-qa-v26.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
