#!/usr/bin/env node
// 校验某个 cut 的 RM-merge 前必需 artifact 是否齐全、非空。
// 编译自 AGENTS.md「Before RM merge ... artifact gate」规则:把「阿澈 手动跑 gate + 散文描述」
// 变成一条 harness 无关、谁都能跑的命令(Claude / Codex / 人 都能用)。
//
// 现实校准:真实 cut 的「DEV 执行契约」命名不统一(plan.md / pm-spec.md / goal*.md 混用),
//          所以这里做的是「宽松存在性 gate」——挡住明显缺失,不强求统一命名。
//          (命名统一是另一个可单独清理的小债;此脚本不替它做主。)
//
// 用法:
//   node scripts/verify-cut-artifacts.mjs <cut-dir> <tier:small|medium|large>
// 例:
//   node scripts/verify-cut-artifacts.mjs docs/cuts/C8-draft-paper-composer large
//
// 退出码:必需 artifact 齐全 → 0;有缺失 → 1(可挡 merge);用法错 → 2。

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs'
import path from 'node:path'

const [, , cutDirArg, tierArg] = process.argv

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function nonEmptyFile(p) {
  try {
    if (!existsSync(p) || statSync(p).size === 0) return false
    return readFileSync(p, 'utf8').trim().length > 0
  } catch {
    return false
  }
}

// DEV 执行契约:命名不统一,任一非空即可。
function findPlanArtifact(dir) {
  let entries = []
  try { entries = readdirSync(dir) } catch { return null }
  const isPlanLike = (f) => f === 'plan.md' || f === 'pm-spec.md' || /^goal.*\.md$/.test(f)
  return entries.filter(isPlanLike).find((f) => nonEmptyFile(path.join(dir, f))) || null
}

function usage(msg) {
  if (msg) console.error(`\n${msg}`)
  console.error('\n用法: node scripts/verify-cut-artifacts.mjs <cut-dir> <tier:small|medium|large>')
  process.exit(2)
}

if (!cutDirArg || !tierArg) usage('缺少参数。')
const tier = String(tierArg).toLowerCase()
if (!['small', 'medium', 'large'].includes(tier)) usage(`未知 tier: ${tierArg}`)

if (tier === 'small') {
  console.log('small cut:无强制 artifact gate(按 AGENTS.md,小活不上 cut 仪式)。')
  process.exit(0)
}

const cutDir = path.resolve(process.cwd(), cutDirArg)
assert(`cut 目录存在: ${cutDirArg}`, existsSync(cutDir), `找不到目录:${cutDir}`)

// medium / large 共同必需:一份非空的 DEV 执行契约(plan.md / pm-spec.md / goal*.md)
const plan = findPlanArtifact(cutDir)
assert(
  '计划类 artifact 存在且非空 (plan.md / pm-spec.md / goal*.md 任一)',
  Boolean(plan),
  '没找到任何非空的 plan.md / pm-spec.md / goal*.md —— medium+ 需要 DEV 执行契约',
)
if (plan) console.log(`  ↳ 命中:${plan}`)

// large 额外必需:cut-note.md 非空(收口记录)
if (tier === 'large') {
  assert('cut-note.md 存在且非空 (large)', nonEmptyFile(path.join(cutDir, 'cut-note.md')))
}

// fresh CR 是 medium / large 的必需 merge gate；PA 仍按触发条件需要，脚本无法判断。
const hasPa = readdirSync(cutDir).some((f) => /pa[-.]/.test(f) && nonEmptyFile(path.join(cutDir, f)))
assert('cr.md 存在且非空 (medium+ fresh CR)', nonEmptyFile(path.join(cutDir, 'cr.md')))
if (!hasPa) console.warn('NOTE 没看到 PA 记录 —— 若本 cut 用了 PA,确认 PA-lite 已记进计划文件。')

console.log(`\nartifact gate (${tier}): PASS ${passed}, FAIL ${failed}`)
process.exit(failed > 0 ? 1 : 0)
