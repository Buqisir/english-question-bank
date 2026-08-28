#!/usr/bin/env node
/**
 * Agent ship checklist for one NCK1 paper.
 * Evaluates ready_to_ship, prints the production disclosure, writes receipts.
 * Does not run pull-run-push or mutate production. Universal checks make one
 * read-only request to the Review service to reject superseded approvals.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inspectPublicationReceipt,
  probePaper,
} from '../../import-ops/lib/probe.mjs'

export const SHIP_COMMAND =
  'node scripts/pull-run-push.mjs push <paperId> --owner-said-ship'
export const GO_LIVE_RECORD = 'docs/cuts/launch-deploy/go-live-record.md'
export const DEFAULT_REMOTE_REPO = '/opt/eqb/english-question-bank'
export const DEFAULT_SHIP_FAILED_NOTE =
  'push 中途失败；生产 eqb 可能仍停着，先拉起再谈重试。重试仍要口头「重试上线」。'

function readJson(filePath) {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function isUniversalPaper({ repoRoot, paperId }) {
  const config = readJson(path.join(
    repoRoot,
    'scripts/import-pipeline/papers',
    paperId,
    'config.json',
  ))
  return config?.format === 'universal-nck1'
}

function exactUniversalAcceptedPublication({ repoRoot, paperId }) {
  const paperDir = path.join(repoRoot, 'scripts/import-pipeline/papers', paperId)
  if (!isUniversalPaper({ repoRoot, paperId })) return true
  const summary = readJson(path.join(paperDir, 'canonical-evidence', 'candidate-summary.json'))
  const confirmation = readJson(path.join(
    paperDir,
    'canonical-evidence',
    'teacher-confirmation-v1.json',
  ))
  const approval = readJson(path.join(
    paperDir,
    'canonical-evidence',
    'web-review-approval-v1.json',
  ))
  const receipt = readJson(path.join(paperDir, 'signals', 'qa-accepted.json'))
  const publication = readJson(path.join(
    paperDir,
    'signals',
    'locally-published.json',
  ))
  const paperAssetsDir = process.env.QUESTION_BANK_PAPER_ASSET_ROOT
    || path.join(repoRoot, 'app/public/paper-assets')
  const publicationInspection = inspectPublicationReceipt({
    dbPath: process.env.QUESTION_BANK_DB || path.join(repoRoot, 'data/question-bank.sqlite'),
    paperAssetsDir,
    paperId,
    receipt: publication,
  })
  return Boolean(
    summary
    && receipt?.schemaVersion === 'web-import-review-qa-accepted-v1'
    && publication?.schemaVersion === 'universal-nck1-local-publication-v1'
    && confirmation?.schemaVersion === 'teacher-confirmation-v1'
    && approval?.schemaVersion === 'web-import-review-approval-v1'
    && confirmation.confirmed === true
    && summary.paperId === paperId
    && approval.paperId === paperId
    && approval.approvalId === receipt.approvalId
    && approval.revisionId === receipt.revisionId
    && summary.sourceDigest === receipt.sourceDigest
    && summary.candidateDigest === receipt.candidateDigest
    && approval.sourceDigest === receipt.sourceDigest
    && approval.candidateDigest === receipt.candidateDigest
    && approval.visibleStructureDigest === receipt.visibleStructureDigest
    && approval.analysisDigest === receipt.analysisDigest
    && approval.bundleDigest === receipt.bundleDigest
    && publication.approvalId === receipt.approvalId
    && publication.revisionId === receipt.revisionId
    && publication.sourceDigest === receipt.sourceDigest
    && publication.candidateDigest === receipt.candidateDigest
    && publication.visibleStructureDigest === receipt.visibleStructureDigest
    && publication.analysisDigest === receipt.analysisDigest
    && publication.bundleDigest === receipt.bundleDigest
    && Number.isInteger(publication.assetVersion)
    && publication.assetVersion > 0
    && publication.versionName === `v${publication.assetVersion}`
    && typeof publication.canonicalPublicationDigest === 'string'
    && publicationInspection.current
    && confirmation.sourceDigest === summary.sourceDigest
    && confirmation.candidateDigest === summary.candidateDigest
    && typeof receipt.bundleDigest === 'string'
    && typeof receipt.analysisDigest === 'string'
  )
}

function exactCurrentWebReview({ repoRoot, paperId, webReviewStatus }) {
  if (!isUniversalPaper({ repoRoot, paperId })) return true
  const paperDir = path.join(repoRoot, 'scripts/import-pipeline/papers', paperId)
  const receipt = readJson(path.join(paperDir, 'signals', 'qa-accepted.json'))
  const approval = webReviewStatus?.approval
  return Boolean(
    receipt
    && webReviewStatus?.paperId === paperId
    && webReviewStatus.latestRevisionId === receipt.revisionId
    && webReviewStatus.latest?.id === receipt.revisionId
    && webReviewStatus.latest?.state === 'approved'
    && webReviewStatus.latest?.bundleDigest === receipt.bundleDigest
    && approval?.schemaVersion === 'web-import-review-approval-v1'
    && approval.approvalId === receipt.approvalId
    && approval.revisionId === receipt.revisionId
    && approval.sourceDigest === receipt.sourceDigest
    && approval.candidateDigest === receipt.candidateDigest
    && approval.visibleStructureDigest === receipt.visibleStructureDigest
    && approval.analysisDigest === receipt.analysisDigest
    && approval.bundleDigest === receipt.bundleDigest
  )
}

function probesReady(paper, input) {
  return Boolean(
    paper.latest
    && paper.aiCheck
    && paper.qaAccepted
    && (!paper.universal || paper.locallyPublished)
    && exactUniversalAcceptedPublication(input),
  )
}

function isShipFailed(paper) {
  return paper.status === 'failed' && paper.blocked?.code === 'ship_failed'
}

export function shipCommand({ paperId, ownerSaid = 'ship' }) {
  const flag = ownerSaid === 'retry-ship'
    ? '--owner-said-retry-ship'
    : '--owner-said-ship'
  return `node scripts/pull-run-push.mjs push ${paperId} ${flag}`
}

export function buildDisclosure({
  paperId,
  ownerSaid = 'ship',
  remote = process.env.EQB_REMOTE || '',
  remoteRepo = process.env.EQB_REMOTE_REPO || DEFAULT_REMOTE_REPO,
} = {}) {
  const target = remote.trim()
    ? remote.trim()
    : 'EQB_REMOTE 未设；真 push 前必须指向生产（见 go-live-record）'
  return [
    `卷：${paperId || '(未指定)'}`,
    `目标机：${target}；远端仓库 ${remoteRepo}`,
    `命令：${shipCommand({ paperId: paperId || '<paperId>', ownerSaid })}。整份 data/question-bank.sqlite 替换 + app/public/paper-assets/ 加性同步。不是单卷增量，不是 deploy.sh。`,
    '本机其他未上线改动会一并上去。',
    'SQLite：远端留下 question-bank.sqlite.bak.<stamp>；推错人工用 bak 退。',
    'paper-assets：无自动回滚；推错人工覆盖或删远端目录。',
    '中途失败时生产服务可能停在 stopped；先拉起再谈重试。',
    '实际 push 会先锁定当前网页认可；锁持有期间新 revision 与问题状态变更均被拒绝。',
    `动生产前必读 ${GO_LIVE_RECORD}，且必须有当前 owner 口头授权。`,
  ].join('\n')
}

export function evaluateShip({ repoRoot, paperId, ownerSaid = null, webReviewStatus = null }) {
  const paper = probePaper({ repoRoot, paperId })
  const disclosure = buildDisclosure({ paperId, ownerSaid })

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
    if (!probesReady(paper, { repoRoot, paperId })) {
      return {
        ok: false,
        code: 'not_ready_to_ship',
        paper,
        disclosure,
        message: `拒绝 push：${paperId} 为 ship_failed，但 latest / ai-answer-check / qa-accepted / locally-published 不齐。`,
      }
    }
    if (!exactCurrentWebReview({ repoRoot, paperId, webReviewStatus })) {
      return {
        ok: false,
        code: 'review_receipt_stale',
        paper,
        disclosure,
        message: `拒绝 push：${paperId} 的网页审核收据不再是 Review 服务的当前认可以及最新 revision。`,
      }
    }
    return {
      ok: true,
      code: 'retry_allowed',
      paper,
      disclosure,
      command: shipCommand({ paperId, ownerSaid }),
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

  if (!probesReady(paper, { repoRoot, paperId })) {
    return {
      ok: false,
      code: 'review_receipt_stale',
      paper,
      disclosure,
      message: `拒绝 push：${paperId} 的网页审核收据与当前 universal Candidate 不一致。`,
    }
  }

  if (!exactCurrentWebReview({ repoRoot, paperId, webReviewStatus })) {
    return {
      ok: false,
      code: 'review_receipt_stale',
      paper,
      disclosure,
      message: `拒绝 push：${paperId} 的网页审核收据不再是 Review 服务的当前认可以及最新 revision。`,
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
    command: shipCommand({ paperId, ownerSaid }),
    message: `允许：${paperId} 为 ready_to_ship。本清单不执行 push。`,
  }
}

function signalsDir(repoRoot, paperId) {
  return path.join(repoRoot, 'scripts/import-pipeline/papers', paperId, 'signals')
}

function canRecordShipOutcome(paper, input) {
  if (!probesReady(paper, input)) return false
  return paper.status === 'ready_to_ship' || isShipFailed(paper) || paper.status === 'shipped'
}

export function writeShippedReceipt({
  repoRoot,
  paperId,
  shippedAt = new Date().toISOString(),
}) {
  const paper = probePaper({ repoRoot, paperId })
  if (!canRecordShipOutcome(paper, { repoRoot, paperId })) {
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
  const qaReceipt = readJson(path.join(dir, 'qa-accepted.json'))
  const publicationReceipt = readJson(path.join(dir, 'locally-published.json'))
  const recordsRetry = isShipFailed(paper)
  writeFileSync(
    filePath,
    `${JSON.stringify({
      schemaVersion: 'nck1-import-shipped-v1',
      paperId,
      shippedAt,
      command: shipCommand({
        paperId,
        ownerSaid: recordsRetry ? 'retry-ship' : 'ship',
      }),
      ...(paper.universal ? {
        approvalId: qaReceipt.approvalId,
        revisionId: qaReceipt.revisionId,
        sourceDigest: qaReceipt.sourceDigest,
        candidateDigest: qaReceipt.candidateDigest,
        visibleStructureDigest: qaReceipt.visibleStructureDigest,
        analysisDigest: qaReceipt.analysisDigest,
        bundleDigest: qaReceipt.bundleDigest,
        assetVersion: publicationReceipt.assetVersion,
        versionName: publicationReceipt.versionName,
        canonicalPublicationDigest: publicationReceipt.canonicalPublicationDigest,
      } : {}),
    }, null, 2)}\n`,
  )
  if (recordsRetry) rmSync(path.join(dir, 'blocked.json'), { force: true })
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
  if (!probesReady(paper, { repoRoot, paperId })) {
    return {
      ok: false,
      code: 'not_ready_to_ship',
      paper,
      message: `拒绝写 ship_failed：${paperId} 未具备 latest + ai-answer-check + qa-accepted + locally-published。`,
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

export function parseOwnerSaid(argv) {
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

function reviewServiceCredentials(kind = 'agent') {
  const origin = String(process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || '').replace(/\/$/, '')
  const tokenVariable = kind === 'shipping'
    ? 'QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN'
    : 'QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN'
  const token = String(process.env[tokenVariable] || '')
  if (!/^https?:\/\//.test(origin) || !token) {
    throw new Error(
      `universal 卷上线复核需要 QUESTION_BANK_IMPORT_OPS_ORIGIN 与 ${tokenVariable}`,
    )
  }
  return { origin, token }
}

async function reviewServiceRequest(pathname, init = {}, credentialKind = 'agent') {
  const { origin, token } = reviewServiceCredentials(credentialKind)
  const response = await fetch(`${origin}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(
      `${body?.code || 'IMPORT_REVIEW_UNAVAILABLE'}: ${body?.error || `HTTP ${response.status}`}；拒绝上线`,
    )
  }
  return response.json()
}

async function fetchWebReviewStatus(paperId) {
  return reviewServiceRequest(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`,
  )
}

export async function acquireShippingGuard(paperId, approval) {
  if (!approval) throw new Error('当前网页认可不存在；拒绝获取上线 guard')
  const result = await reviewServiceRequest(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}/shipping-guards`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        approvalId: approval.approvalId,
        revisionId: approval.revisionId,
        sourceDigest: approval.sourceDigest,
        candidateDigest: approval.candidateDigest,
        visibleStructureDigest: approval.visibleStructureDigest,
        analysisDigest: approval.analysisDigest,
        bundleDigest: approval.bundleDigest,
      }),
    },
    'shipping',
  )
  return result.guard
}

export async function releaseShippingGuard(paperId, guardId) {
  return reviewServiceRequest(
    `/api/import-agent-reviews/papers/${encodeURIComponent(paperId)}`
      + `/shipping-guards/${encodeURIComponent(guardId)}`,
    { method: 'DELETE' },
    'shipping',
  )
}

export async function evaluateShipWithCurrentReview({ repoRoot, paperId, ownerSaid = null }) {
  const universal = isUniversalPaper({ repoRoot, paperId })
  const webReviewStatus = universal
    ? await fetchWebReviewStatus(paperId)
    : null
  return {
    ...evaluateShip({ repoRoot, paperId, ownerSaid, webReviewStatus }),
    requiresShippingGuard: universal,
    webReviewStatus,
  }
}

function printCheck(result) {
  const stream = result.ok ? process.stdout : process.stderr
  stream.write(`${result.message}\n`)
  stream.write('\n跑前必须摊开：\n')
  stream.write(`${result.disclosure}\n`)
  if (result.ok) {
    process.stdout.write(
      `\n下一步（本清单不执行）：${result.command}\n`
        + '成功后：node scripts/import-pipeline/ship-checklist.mjs record-shipped <paperId>\n'
        + '失败后：node scripts/import-pipeline/ship-checklist.mjs record-failed <paperId>\n',
    )
  }
}

async function main(argv = process.argv.slice(2)) {
  const [sub, paperId, ...rest] = argv
  const repoRoot = resolveRepoRoot()
  if (!sub || sub === '--help' || sub === '-h') {
    console.error(
      'Usage:\n'
        + '  node scripts/import-pipeline/ship-checklist.mjs check <paperId> --owner-said-ship\n'
        + '  node scripts/import-pipeline/ship-checklist.mjs check <paperId> --owner-said-retry-ship\n'
        + '  node scripts/import-pipeline/ship-checklist.mjs record-shipped <paperId>\n'
        + '  node scripts/import-pipeline/ship-checklist.mjs record-failed <paperId> [--note <one-line>]\n'
        + '本清单不执行 push；仅只读核对 Review 服务，不做生产写入。',
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
    const result = await evaluateShipWithCurrentReview({
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

const cliSubs = new Set(['check', 'record-shipped', 'record-failed', '--help', '-h'])
const entryBase = process.argv[1] ? path.basename(process.argv[1]) : ''
if (cliSubs.has(process.argv[2]) || (entryBase === 'ship-checklist.mjs' && !process.argv[2])) {
  main().catch((error) => {
    console.error(`拒绝 push：${error.message}`)
    process.exitCode = 1
  })
}
