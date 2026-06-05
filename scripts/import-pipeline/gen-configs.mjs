// Generate per-paper config.json for all 新课标 答案版 files.
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const DIR = '/Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/高考真题/阅读解析与答案版/真题答案版'
// Resolve relative to THIS file so it works regardless of cwd (was a cwd-relative literal in .scratch).
const PAPERS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'papers')

const files = readdirSync(DIR).filter((f) => /新课标.*答案版\.docx$/.test(f) && !f.startsWith('~$'))
const out = []
for (const file of files) {
  const year = Number(file.match(/^(\d{4})/)[1])
  // 卷别: check II / Ⅱ / 2 BEFORE single I
  const isII = /(II|Ⅱ|2卷|２)/.test(file.replace(/^\d{4}/, ''))
  const roman = isII ? 'ii' : 'i'
  const cn = isII ? 'Ⅱ' : 'Ⅰ'
  const paperId = `paper-${year}-${roman}`
  const config = {
    docxPath: `${DIR}/${file}`,
    paperId,
    provenance: {
      sourceType: '真题',
      region: `全国新课标${cn}`,
      paperName: `${year}年新课标${cn}卷`,
      year,
      defaultTags: ['真题', String(year), `新课标${cn}卷`],
    },
  }
  mkdirSync(`${PAPERS_ROOT}/${paperId}`, { recursive: true })
  writeFileSync(`${PAPERS_ROOT}/${paperId}/config.json`, JSON.stringify(config, null, 2))
  out.push({ paperId, file, ...config.provenance })
}
out.sort((a, b) => a.paperId.localeCompare(b.paperId))
for (const o of out) console.log(`${o.paperId}  <- ${o.file}  | ${o.region} | ${o.paperName}`)
console.log(`\n${out.length} configs written to ${PAPERS_ROOT}/<paperId>/config.json`)
