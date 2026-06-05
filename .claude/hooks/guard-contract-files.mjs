#!/usr/bin/env node
// PreToolUse hook — 契约级文件写入护栏
// 编译自 AGENTS.md「UI Collaboration / 文件边界」规则(能确定性强制的别写成文字 → 用 hook)。
// 作用:写入 domain / schema / Adapter / PaperSurface 这类「契约级」文件时,弹一次确认,
//      把「靠 agent 自觉读文字」升级成「动手时被物理拦一下」。
// 语义:ask(确认),不是 deny(硬禁) —— 保留「被 plan.md 分配就能改」的原意。
// 只守最该停手的契约子集;server/** 等日常 DEV 常改的留在 AGENTS.md 文字原则里,不在此 hook。

import { readFileSync } from 'node:fs'

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

if (isProtected) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason:
        `「${rel}」是契约级文件(领域模型 / schema / Adapter / PaperSurface)。` +
        `改它会牵动数据契约、导出、跨组件同步。\n` +
        `确认这是被 committed plan.md 分配的 DEV scope 内的改动,再继续。\n` +
        `(此护栏由 AGENTS.md 文件边界规则编译为 hook;嫌烦可在 .claude/settings.json 里去掉。)`,
    },
  }
  process.stdout.write(JSON.stringify(out))
}

process.exit(0)
