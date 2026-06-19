/**
 * verify-national-format.mjs
 *
 * Static guard for the cloze20 × reading-passage format truth table (cut
 * import-national-2020-2024, PA MF-1/MF-2/MF-3). No DB, no AI. Asserts:
 *  1. resolveFormatProfile routes the full truth table and THROWS on unknown cells.
 *  2. The 2022-甲 groups.json (if split) resolves to nationalLegacy with A-D + 全国 scores.
 *  3. validator's reading-letter expectation mirrors packageBuilder on cloze20×4.
 *
 * Usage: node verify-national-format.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveFormatProfile } from '../../server/paper-import-ai/packageBuilder.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let fails = 0
const ok = (name, cond) => { console.log(`  ${cond ? '[OK]' : '[FAIL]'} ${name}`); if (!cond) fails++ }

// Synthetic reading groups: N distinct A-D passages.
const readingGroups = (n) =>
  ['a', 'b', 'c', 'd'].slice(0, n).map((l) => ({ groupId: `group-x-reading-${l}` }))
const cloze = (n) => ({ questions: Array.from({ length: n }, (_, i) => ({ id: i })) })
const throws = (fn) => { try { fn(); return false } catch { return true } }

console.log('== 1. 真值表 ==')
ok('cloze15 → newStandard (不查阅读篇数)', resolveFormatProfile(cloze(15), readingGroups(4)).readingScore === 2.5 && resolveFormatProfile(cloze(15), readingGroups(4)).requireWritingFamilies === true)
ok('cloze缺 → newStandard', resolveFormatProfile(null, readingGroups(4)).requireWritingFamilies === true)
ok('cloze20 + 4篇 → nationalLegacy (readingScore 2, 不要写作)', (() => { const p = resolveFormatProfile(cloze(20), readingGroups(4)); return p.readingScore === 2 && p.sevenScore === 2 && p.clozeScore === 1.5 && p.requireWritingFamilies === false && p.readingLabels.length === 4 })())
ok('cloze20 + 3篇 → zjLegacy (readingScore 2.5, 要写作)', (() => { const p = resolveFormatProfile(cloze(20), readingGroups(3)); return p.readingScore === 2.5 && p.sevenScore === 2 && p.requireWritingFamilies === true && p.readingLabels.length === 3 })())

console.log('== 2. throw 守卫 (MF-1: 未知格不静默回退) ==')
ok('cloze20 + 2篇 → throw', throws(() => resolveFormatProfile(cloze(20), readingGroups(2))))
ok('cloze20 + 0篇 → throw', throws(() => resolveFormatProfile(cloze(20), readingGroups(0))))
ok('cloze18 → throw', throws(() => resolveFormatProfile(cloze(18), readingGroups(4))))

console.log('== 3. 2022-甲 真 groups.json 路由 ==')
const jiaDir = path.join(__dirname, 'papers', 'paper-2022-jia')
if (existsSync(path.join(jiaDir, 'groups.json'))) {
  const g = JSON.parse(readFileSync(path.join(jiaDir, 'groups.json'), 'utf8'))
  const letters = new Set((g.readingGroups || []).map((x) => String(x.groupId).match(/reading-([abcd])$/i)?.[1]?.toUpperCase()).filter(Boolean))
  const p = resolveFormatProfile(g.cloze, g.readingGroups)
  ok('2022-甲 → nationalLegacy', p.requireWritingFamilies === false && p.readingScore === 2)
  ok('2022-甲 阅读 4 篇 A-D', letters.size === 4 && ['A', 'B', 'C', 'D'].every((l) => letters.has(l)))
  ok('2022-甲 完形 20 / 语法 nos 61-70', g.cloze.questions.length === 20 && g.grammar.questions[0].stem === '61' && g.grammar.questions[9].stem === '70')
  ok('2022-甲 写作不导 (application/continuation null)', g.application == null && g.continuation == null)
  // MF-3: validator 的 expectedLetters 镜像逻辑 (cloze20 ∧ 含D → A-D)
  const validatorExpects = g.cloze.questions.length === 20 ? (letters.has('D') ? 4 : 3) : 4
  ok('MF-3 validator 期望 4 篇 = packageBuilder', validatorExpects === p.readingLabels.length)
} else {
  console.log('  [SKIP] 2022-甲 未 split (先跑 01-split)')
}

console.log(fails === 0 ? '\n✅ 全部通过' : `\n❌ ${fails} 项失败`)
process.exit(fails === 0 ? 0 : 1)
