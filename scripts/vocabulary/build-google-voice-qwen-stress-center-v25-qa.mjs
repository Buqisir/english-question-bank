#!/usr/bin/env node

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-stress-center-v25/manifest.json'), 'utf8'))
if (
  manifest.schemaVersion !== 'gaokao-frequency-google-voice-qwen-stress-center-v25'
  || manifest.entries.length !== 6
  || manifest.failures.length !== 0
  || manifest.formalAssetsChanged !== false
) throw new Error('Expected six private V25 stress-center candidates')

const targets = new Map([
  ['gaokao-frequency-2081-violin', '重音在 LIN，末元音是 /ɪ/'],
  ['gaokao-frequency-1887-hello', '重读 LO'],
  ['gaokao-frequency-2396-ballet', '读作 /bælˈeɪ/，重读 LAY'],
])
const labels = ['A25', 'B25']
const grouped = new Map()
for (const entry of manifest.entries) {
  const group = grouped.get(entry.entryId) ?? {base: entry, candidates: {}}
  group.candidates[entry.candidateLabel] = entry.publicPath
  grouped.set(entry.entryId, group)
}
const cases = [...grouped.values()].map(({base, candidates}) => {
  if (!labels.every((label) => candidates[label])) throw new Error(`Incomplete V25 pair: ${base.entryId}`)
  return {
    id: `${base.entryId}--american`,
    headword: base.headword,
    verifiedIpa: base.verifiedIpa,
    target: targets.get(base.entryId),
    candidates,
  }
}).sort((left, right) => left.headword.localeCompare(right.headword))
if (cases.length !== 3 || !cases.every((entry) => entry.target)) throw new Error('Expected the exact three V25 cases')

const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-natural-cadence-owner-qa-v24.html')
let html = readFileSync(sourcePath, 'utf8')
html = html
  .replace('<title>高中 3000 词｜4 条自然节奏 V24</title>', '<title>高中 3000 词｜3 条重音收尾 V25</title>')
  .replace('剩余 4 个词｜自然节奏 V24', '剩余 3 个词｜重音收尾 V25')
  .replace('domain C22、equator A21 已保留。每个词只听 A24、B24；本批已对齐原词时长与留白。', 'equator A21、domain C22、dolphin A24 已保留。每个词只听 A25、B25；时长与语速不变，只调整重音中心。')
  .replace('V24 待判断词条', 'V25 待判断词条')
  .replace(/    const cases = .*\n/, `    const cases = ${JSON.stringify(cases).replaceAll('<', '\\u003c')}\n`)
  .replace('    const labels = ["A24","B24"]', `    const labels = ${JSON.stringify(labels)}`)
  .replace('gaokao-google-voice-qwen-natural-cadence-owner-qa-v24', 'gaokao-google-voice-qwen-stress-center-owner-qa-v25')

const outputDirectory = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa')
mkdirSync(outputDirectory, {recursive: true})
const outputPath = path.join(outputDirectory, 'google-voice-qwen-stress-center-owner-qa-v25.html')
writeFileSync(outputPath, html, 'utf8')
console.log(outputPath)
