#!/usr/bin/env node
// 校验某个多会话 initiative 的执行合同是否存在、非空。
// Matt-native 流程不再要求 RM / CR / cut-note 仪式；本脚本只挡住
// “fresh implementation task 没有 durable spec/legacy plan 可读”。
//
// 现实校准:真实 cut 的「DEV 执行契约」命名不统一(plan.md / pm-spec.md / goal*.md 混用),
//          所以兼容历史 plan.md / pm-spec.md / goal*.md；新工作优先 spec.md。
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
  const isPlanLike = (f) => f === 'spec.md' || f === 'plan.md' || f === 'pm-spec.md' || /^goal.*\.md$/.test(f)
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
  console.log('small cut:无强制 artifact gate。')
  process.exit(0)
}

const cutDir = path.resolve(process.cwd(), cutDirArg)
assert(`cut 目录存在: ${cutDirArg}`, existsSync(cutDir), `找不到目录:${cutDir}`)

// medium / large 共同必需:一份非空执行合同(spec.md 优先；历史命名兼容)
const plan = findPlanArtifact(cutDir)
assert(
  '执行合同存在且非空 (spec.md / legacy plan)',
  Boolean(plan),
  '没找到任何非空的 spec.md / plan.md / pm-spec.md / goal*.md',
)
if (plan) console.log(`  ↳ 命中:${plan}`)

console.log(`\nartifact gate (${tier}): PASS ${passed}, FAIL ${failed}`)
process.exit(failed > 0 ? 1 : 0)
