// Generate per-paper config.json for 新课标 + 全国甲乙丙 答案版 files.
// (浙江卷走 zj-* 脚本,不在此。)
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const DIR = '/Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/高考真题/阅读解析与答案版/真题答案版'
// Resolve relative to THIS file so it works regardless of cwd (was a cwd-relative literal in .scratch).
const PAPERS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'papers')

const NATIONAL_PINYIN = { 甲: 'jia', 乙: 'yi', 丙: 'bing' }

// Classify one 答案版 docx → config, or null if not a supported format here.
function configFor(file) {
  const year = Number(file.match(/^(\d{4})/)?.[1])
  if (!year) return null

  // 新课标 I/II 卷
  if (/新课标.*答案版\.docx$/.test(file)) {
    const isII = /(II|Ⅱ|2卷|２)/.test(file.replace(/^\d{4}/, '')) // 卷别: check II / Ⅱ / 2 BEFORE single I
    const cn = isII ? 'Ⅱ' : 'Ⅰ'
    return {
      docxPath: `${DIR}/${file}`,
      paperId: `paper-${year}-${isII ? 'ii' : 'i'}`,
      provenance: { sourceType: '真题', region: `全国新课标${cn}`, paperName: `${year}年新课标${cn}卷`, year, defaultTags: ['真题', String(year), `新课标${cn}卷`] },
    }
  }

  // 全国甲/乙/丙卷 (老全国卷)
  const nat = file.match(/^\d{4}年全国(甲|乙|丙)卷-答案版\.docx$/)
  if (nat) {
    const juan = nat[1]
    return {
      docxPath: `${DIR}/${file}`,
      paperId: `paper-${year}-${NATIONAL_PINYIN[juan]}`,
      provenance: { sourceType: '真题', region: `全国${juan}卷`, paperName: `${year}年全国${juan}卷`, year, defaultTags: ['真题', String(year), `全国${juan}卷`] },
    }
  }

  return null
}

const out = []
for (const file of readdirSync(DIR)) {
  if (file.startsWith('~$')) continue
  const config = configFor(file)
  if (!config) continue
  mkdirSync(`${PAPERS_ROOT}/${config.paperId}`, { recursive: true })
  writeFileSync(`${PAPERS_ROOT}/${config.paperId}/config.json`, JSON.stringify(config, null, 2))
  out.push({ paperId: config.paperId, file, ...config.provenance })
}
out.sort((a, b) => a.paperId.localeCompare(b.paperId))
for (const o of out) console.log(`${o.paperId}  <- ${o.file}  | ${o.region} | ${o.paperName}`)
console.log(`\n${out.length} configs written to ${PAPERS_ROOT}/<paperId>/config.json`)
