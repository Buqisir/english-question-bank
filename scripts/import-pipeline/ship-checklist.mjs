#!/usr/bin/env node
/**
 * Agent ship checklist for one NCK1 paper.
 * Evaluates ready_to_ship, prints the production disclosure, writes receipts.
 * Does not run pull-run-push. Does not talk to production.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { probePaper } from '../../import-ops/lib/probe.mjs'

export const SHIP_COMMAND = 'node scripts/pull-run-push.mjs push'
export const GO_LIVE_RECORD = 'docs/cuts/launch-deploy/go-live-record.md'
export const DEFAULT_REMOTE_REPO = '/opt/eqb/english-question-bank'
export const DEFAULT_SHIP_FAILED_NOTE =
  'push 中途失败；生产 eqb 可能仍停着，先拉起再谈重试。重试仍要口头「重试上线」。'

function probesReady(paper) {
  return Boolean(paper.latest && paper.aiCheck && paper.qaAccepted)
}

function isShipFailed(paper) {
  return paper.status === 'failed' && paper.blocked?.code === 'ship_failed'
}

export function buildDisclosure({
  paperId,
  remote = process.env.EQB_REMOTE || '',
  remoteRepo = process.env.EQB_REMOTE_REPO || DEFAULT_REMOTE_REPO,
} = {}) {
  const target = remote.trim()
    ? remote.trim()
    : 'EQB_REMOTE 未设；真 push 前必须指向生产（见 go-live-record）'
  return [
    `卷：${paperId || '(未指定)'}`,
    `目标机：${target}；远端仓库 ${remoteRepo}`,
    `命令：${SHIP_COMMAND}。整份 data/question-bank.sqlite 替换 + app/public/paper-assets/ 加性同步。不是单卷增量，不是 deploy.sh。`,
    '本机其他未上线改动会一并上去。',
    'SQLite：远端留下 question-bank.sqlite.bak.<stamp>；推错人工用 bak 退。',
    'paper-assets：无自动回滚；推错人工覆盖或删远端目录。',
    '中途失败时生产服务可能停在 stopped；先拉起再谈重试。',
    `动生产前必读 ${GO_LIVE_RECORD}，且必须有当前 owner 口头授权。`,
  ].join('\n')
}

export function evaluateShip({ repoRoot, paperId, ownerSaid = null }) {
  const paper = probePaper({ repoRoot, paperId })
  const disclosure = buildDisclosure({ paperId })

  if (paper.status === 'shipped') {
    return {
      ok: false,
      code: 'already_shipped',
      paper,
      disclosure,
      message: `拒绝 push：${paperId} 已有 shipped.json。`,
    }
  }

  if (isShipFailed(paper)) {
    if (ownerSaid !== 'retry-ship') {
      return {
        ok: false,
        code: 'retry_requires_verbal',
        paper,
        disclosure,
        message: `拒绝 push：${paperId} 为 ship_failed。重试仍要当前口头「重试上线」（--owner-said-retry-ship）。`,
      }
    }
    if (!probesReady(paper)) {
      return {
        ok: false,
        code: 'not_ready_to_ship',
        paper,
        disclosure,
        message: `拒绝 push：${paperId} 为 ship_failed，但 latest / ai-answer-check / qa-accepted 不齐。`,
      }
    }
    return {
      ok: true,
      code: 'retry_allowed',
      paper,
      disclosure,
      command: SHIP_COMMAND,
      message: `允许：${paperId} 可重试上线。本清单不执行 push。`,
    }
  }

  if (paper.status !== 'ready_to_ship') {
    return {
      ok: false,
      code: 'not_ready_to_ship',
      paper,
      disclosure,
      message: `拒绝 push：${paperId} 状态是 ${paper.status}，不是 ready_to_ship。`,
    }
  }

  if (ownerSaid !== 'ship') {
    return {
      ok: false,
      code: 'requires_verbal_ship',
      paper,
      disclosure,
      message: `拒绝 push：${paperId} 虽为 ready_to_ship，但缺少当前口头「上线」（--owner-said-ship）。`,
    }
  }

  return {
    ok: true,
    code: 'allowed',
    paper,
    disclosure,
    command: SHIP_COMMAND,
    message: `允许：${paperId} 为 ready_to_ship。本清单不执行 push。`,
  }
}

function signalsDir(repoRoot, paperId) {
  return path.join(repoRoot, 'scripts/import-pipeline/papers', paperId, 'signals')
}

function canRecordShipOutcome(paper) {
  if (!probesReady(paper)) return false
  return paper.status === 'ready_to_ship' || isShipFailed(paper) || paper.status === 'shipped'
}

export function writeShippedReceipt({
  repoRoot,
  paperId,
  shippedAt = new Date().toISOString(),
}) {
  const paper = probePaper({ repoRoot, paperId })
  if (!canRecordShipOutcome(paper)) {
    return {
      ok: false,
      code: 'not_ready_to_ship',
      paper,
      message: `拒绝写 shipped.json：${paperId} 不是 ready_to_ship / ship_failed 重试面。`,
    }
  }
  const dir = signalsDir(repoRoot, paperId)
  mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, 'shipped.json')
  writeFileSync(
    filePath,
    `${JSON.stringify({ shippedAt, command: SHIP_COMMAND }, null, 2)}\n`,
  )
  return {
    ok: true,
    code: 'shipped',
    path: filePath,
    paper: probePaper({ repoRoot, paperId }),
  }
}

export function writeShipFailedReceipt({
  repoRoot,
  paperId,
  at = new Date().toISOString(),
  note = DEFAULT_SHIP_FAILED_NOTE,
}) {
  const paper = probePaper({ repoRoot, paperId })
  if (paper.status === 'shipped') {
    return {
      ok: false,
      code: 'already_shipped',
      paper,
      message: `拒绝写 ship_failed：${paperId} 已有 shipped.json。`,
    }
  }
  if (!probesReady(paper)) {
    return {
      ok: false,
      code: 'not_ready_to_ship',
      paper,
      message: `拒绝写 ship_failed：${paperId} 未具备 latest + ai-answer-check + qa-accepted。`,
    }
  }
  const dir = signalsDir(repoRoot, paperId)
  mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, 'blocked.json')
  const oneLine = String(note || DEFAULT_SHIP_FAILED_NOTE).replace(/\s+/g, ' ').trim()
  writeFileSync(
    filePath,
    `${JSON.stringify({ code: 'ship_failed', at, note: oneLine }, null, 2)}\n`,
  )
  return {
    ok: true,
    code: 'ship_failed',
    path: filePath,
    paper: probePaper({ repoRoot, paperId }),
  }
}

function parseOwnerSaid(argv) {
  const ship = argv.includes('--owner-said-ship')
  const retry = argv.includes('--owner-said-retry-ship')
  if (ship && retry) {
    return { error: '不能同时给 --owner-said-ship 与 --owner-said-retry-ship' }
  }
  if (retry) return { ownerSaid: 'retry-ship' }
  if (ship) return { ownerSaid: 'ship' }
  return { ownerSaid: null }
}

function option(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 ? null : argv[index + 1]
}

function resolveRepoRoot() {
  if (process.env.EQB_ROOT) return path.resolve(process.env.EQB_ROOT)
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
}

function printCheck(result) {
  const stream = result.ok ? process.stdout : process.stderr
  stream.write(`${result.message}\n`)
  stream.write('\n跑前必须摊开：\n')
  stream.write(`${result.disclosure}\n`)
  if (result.ok) {
    process.stdout.write(
      `\n下一步（本清单不执行）：${SHIP_COMMAND}\n`
        + '成功后：node scripts/import-pipeline/ship-checklist.mjs record-shipped <paperId>\n'
        + '失败后：node scripts/import-pipeline/ship-checklist.mjs record-failed <paperId>\n',
    )
  }
}

function main(argv = process.argv.slice(2)) {
  const [sub, paperId, ...rest] = argv
  const repoRoot = resolveRepoRoot()
  if (!sub || sub === '--help' || sub === '-h') {
    console.error(
      'Usage:\n'
        + '  node scripts/import-pipeline/ship-checklist.mjs check <paperId> --owner-said-ship\n'
        + '  node scripts/import-pipeline/ship-checklist.mjs check <paperId> --owner-said-retry-ship\n'
        + '  node scripts/import-pipeline/ship-checklist.mjs record-shipped <paperId>\n'
        + '  node scripts/import-pipeline/ship-checklist.mjs record-failed <paperId> [--note <one-line>]\n'
        + '本清单不执行 push，不连生产。',
    )
    process.exit(sub ? 0 : 1)
  }
  if (!paperId || paperId.startsWith('--')) {
    console.error('需要 paperId。本清单不执行 push。')
    process.exit(1)
  }

  if (sub === 'check') {
    const parsed = parseOwnerSaid(rest)
    if (parsed.error) {
      console.error(`拒绝 push：${parsed.error}`)
      process.exit(1)
    }
    const result = evaluateShip({
      repoRoot,
      paperId,
      ownerSaid: parsed.ownerSaid,
    })
    printCheck(result)
    process.exit(result.ok ? 0 : 1)
  }

  if (sub === 'record-shipped') {
    const result = writeShippedReceipt({ repoRoot, paperId })
    if (!result.ok) {
      console.error(result.message)
      process.exit(1)
    }
    console.log(`wrote ${result.path}`)
    return
  }

  if (sub === 'record-failed') {
    const result = writeShipFailedReceipt({
      repoRoot,
      paperId,
      note: option(rest, '--note') || DEFAULT_SHIP_FAILED_NOTE,
    })
    if (!result.ok) {
      console.error(result.message)
      process.exit(1)
    }
    console.log(`wrote ${result.path}`)
    return
  }

  console.error(`未知子命令 ${sub}。本清单不执行 push。`)
  process.exit(1)
}

const invokedAsCli =
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedAsCli) main()
