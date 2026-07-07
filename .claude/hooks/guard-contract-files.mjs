#!/usr/bin/env node
// PreToolUse hook — 契约级文件写入护栏
// 编译自 AGENTS.md「UI Collaboration / 文件边界」规则(能确定性强制的别写成文字 → 用 hook)。
// 作用:写入 domain / schema / Adapter / PaperSurface 这类「契约级」文件时物理拦下,
//      把「靠 agent 自觉读文字」升级成「动手时被物理拦住」。
// 语义:deny(硬禁) —— 2026-07-07 从 ask 升级:owner 启用 bypassPermissions 全放手模式后,
//      ask 的交互确认不再弹出,deny 是官方文档保证在 bypass 下仍生效的唯一语义。
// 豁免口子:当 committed plan.md 把契约文件分配进 DEV scope 时,orchestrator 创建
//      仓库根部的 `.claude/contract-unlock`(gitignored),干完该 cut 立即删除。
//      「被 plan.md 分配就能改」的原意由这个显式解锁动作承接。
// 只守最该停手的契约子集;server/** 等日常 DEV 常改的留在 AGENTS.md 文字原则里,不在此 hook。

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

function readStdin() {
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

let data = {}
try { data = JSON.parse(readStdin() || '{}') } catch { data = {} }

const filePath =
  data?.tool_input?.file_path ||
  data?.tool_input?.path ||
  ''

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
let rel = String(filePath)
if (rel.startsWith(root)) rel = rel.slice(root.length)
rel = rel.replace(/^\/+/, '')

// 契约级受保护子集(任何角色改前都该停一下)
const protectedPrefixes = [
  'app/src/domain/',
  'schemas/',
  'shared/papersurface/',
]
const isAdapter = /Adapter\.ts$/.test(rel)
const isProtected = Boolean(rel) && (protectedPrefixes.some((p) => rel.startsWith(p)) || isAdapter)

const unlocked = existsSync(join(root, '.claude', 'contract-unlock'))

if (isProtected && !unlocked) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `「${rel}」是契约级文件(领域模型 / schema / Adapter / PaperSurface)。` +
        `改它会牵动数据契约、导出、跨组件同步。\n` +
        `若此改动确属 committed plan.md 分配的 DEV scope:先 touch .claude/contract-unlock ` +
        `解锁,干完该 cut 立即删除它。\n` +
        `(此护栏由 AGENTS.md 文件边界规则编译为 hook;deny 语义在 bypassPermissions 下仍生效。)`,
    },
  }
  process.stdout.write(JSON.stringify(out))
}

process.exit(0)
