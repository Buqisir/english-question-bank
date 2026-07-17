#!/usr/bin/env node
// 全库破折号归一（dash-normalize-bank 刀，2026-07-17）。
// 标准 v2 §7 + Import Normalization Principle：英文破折号 = en-dash
// 「 – 」前后各一空格；中文语境全角「—」保留。三类判法（判例表见
// docs/cuts/dash-normalize-bank/cut-note.md，116 唯一位点逐个人判）：
//   H 复合词连字符（fur-coat-wearing 类）→「-」
//   R 数字/日期区间（1756–1823 类）→ en-dash 不加空格
//   D 从句破折（默认类）→「 – 」
// 幂等。用法：
//   node scripts/normalize-dashes.mjs            # asset 文件 + 本地 DB
//   node scripts/normalize-dashes.mjs --db-only  # 只动 DB（生产用）
//   node scripts/normalize-dashes.mjs --dry-run  # 只报数不写
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, writeFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbOnly = process.argv.includes('--db-only')
const dryRun = process.argv.includes('--dry-run')

// H：复合词（em-dash 实为连字符——raw 复刻件源头邋遢，非导入损伤）
const COMPOUNDS = [
  ['fur—coat—wearing', 'fur-coat-wearing'],
  ['full—body', 'full-body'],
  ['off—set', 'off-set'],
  ['Cattle—raising', 'Cattle-raising'],
  ['cattle—raising', 'cattle-raising'],
  ['naturally—grown', 'naturally-grown'],
  ['14—year—olds', '14-year-olds'],
  ['two—parent', 'two-parent'],
  ['ice—free', 'ice-free'],
  ['fast—flowing', 'fast-flowing'],
  ['cure—all', 'cure-all'],
  ['decision—making', 'decision-making'],
  ['high—level', 'high-level'],
]
// R：区间（en-dash 排印惯例不加空格）
const RANGES = [
  ['1756—1823', '1756–1823'],
  ['Monday—Saturday', 'Monday–Saturday'],
  ['10:00—17:45', '10:00–17:45'],
  ['£12—£96', '£12–£96'],
]
// 生僻但要防误伤的边界：em-dash 两侧任一为 CJK → 中文用法，保留。
const LATIN_PREV = /[A-Za-z0-9’”"')\].,!?%]/
const LATIN_NEXT = /[A-Za-z0-9_’“"'(\[]/

export function normalizeDashes(text) {
  let t = text
  for (const [from, to] of COMPOUNDS) t = t.split(from).join(to)
  for (const [from, to] of RANGES) t = t.split(from).join(to)
  t = t.split(' — ').join(' – ') // 带空格 em（全库实核无中文语境用例）
  t = t.replace(/([  ])—([  ])/gu, '$1–$2') // NBSP 参与的双侧空格变体
  t = t.replace(/([  ])—(?=[A-Za-z_’“'(])/gu, '$1– ') // 左空右贴（"(草坪) —and"）
  t = t.replace(/([  ])—(?=")/gu, '$1–') // 串尾悬挂破折（"recommend —"）
  t = t.replace(/(.)—(.)/gsu, (m, a, b) =>
    LATIN_PREV.test(a) && LATIN_NEXT.test(b) ? `${a} – ${b}` : m,
  ) // D 默认类：紧排从句破折
  t = t.replace(/([A-Za-z])--([A-Za-z])/g, '$1 – $2') // 双连字符残留
  return t
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  let fileChanges = 0
  if (!dbOnly) {
    const files = globSync('app/public/paper-assets/*/latest/**/*.json', { cwd: rootDir })
      .filter((f) => !/\/(raw|listening|figures)\//.test(f))
    for (const rel of files) {
      const fp = path.join(rootDir, rel)
      const before = readFileSync(fp, 'utf8')
      const after = normalizeDashes(before)
      if (before !== after) {
        fileChanges += 1
        if (!dryRun) writeFileSync(fp, after)
        console.log(`asset ${before === after ? '' : '~'} ${rel}`)
      }
    }
    console.log(`asset files changed: ${fileChanges}`)
  }

  const db = new DatabaseSync(path.join(rootDir, 'data', 'question-bank.sqlite'))
  const targets = [
    ['passages', 'id', 'material_text'],
    ['questions', 'id', 'stem'],
    ['options', 'id', 'content'],
  ]
  let rowChanges = 0
  for (const [table, idCol, col] of targets) {
    const rows = db
      .prepare(`SELECT ${idCol} AS id, ${col} AS v FROM ${table} WHERE ${col} LIKE '%—%' OR ${col} LIKE '%--%'`)
      .all()
    for (const row of rows) {
      const after = normalizeDashes(String(row.v))
      if (after !== row.v) {
        rowChanges += 1
        if (!dryRun) db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${idCol} = ?`).run(after, row.id)
      }
    }
  }
  console.log(`db rows changed: ${rowChanges}${dryRun ? ' (dry-run, 未写)' : ''}`)
  db.close()
}
