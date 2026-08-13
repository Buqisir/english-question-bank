import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const LABELS = {
  queued: '排队',
  importing: '导入中',
  awaiting_qa: '待 QA',
  ready_to_ship: '可上线',
  shipped: '已上线',
  failed: '失败',
}

export const ANALYSIS_KEYS = [
  'reading-a',
  'reading-b',
  'reading-c',
  'reading-d',
  'seven',
  'cloze',
  'grammar',
]

export function isOpsVisible(probes) {
  const hasSignal =
    Boolean(probes.blocked) ||
    probes.aiCheck ||
    probes.qaAccepted ||
    probes.shipped ||
    Boolean(probes.helpNeeded)
  if (probes.latest) return hasSignal
  return hasSignal || probes.source || probes.groups || (probes.config && probes.analyses)
}

export function statusOf(probes) {
  if (probes.shipped) return 'shipped'
  if (probes.blocked) return 'failed'
  if (probes.qaAccepted && probes.latest && probes.aiCheck) return 'ready_to_ship'
  if (probes.latest && probes.aiCheck) return 'awaiting_qa'
  if (probes.config) return 'importing'
  return 'queued'
}

function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return { _invalid: true, path: filePath }
  }
}

function mtimeMs(filePath) {
  if (!existsSync(filePath)) return 0
  try {
    return statSync(filePath).mtimeMs
  } catch {
    return 0
  }
}

function hasSource(paperDir) {
  return (
    existsSync(path.join(paperDir, 'source.docx')) ||
    existsSync(path.join(paperDir, 'source', 'paper.pdf')) ||
    existsSync(path.join(paperDir, 'source', 'answers.pdf'))
  )
}

function analysisCounts(paperDir) {
  let analyze = 0
  let analysis = 0
  for (const key of ANALYSIS_KEYS) {
    if (existsSync(path.join(paperDir, `analyze-${key}-combined.txt`))) analyze += 1
    if (existsSync(path.join(paperDir, `analysis-${key}.json`))) analysis += 1
  }
  return { analyze, analysis }
}

export function probePaper({ repoRoot, paperId }) {
  const paperDir = path.join(repoRoot, 'scripts/import-pipeline/papers', paperId)
  const signalsDir = path.join(paperDir, 'signals')
  const latestDir = path.join(repoRoot, 'app/public/paper-assets', paperId, 'latest')
  const config = readJsonIfPresent(path.join(paperDir, 'config.json'))
  const blocked = readJsonIfPresent(path.join(signalsDir, 'blocked.json'))
  const helpNeeded = readJsonIfPresent(path.join(signalsDir, 'help-needed.json'))
  const aiCheck = readJsonIfPresent(path.join(signalsDir, 'ai-answer-check.json'))
  const qaAccepted = readJsonIfPresent(path.join(signalsDir, 'qa-accepted.json'))
  const shipped = readJsonIfPresent(path.join(signalsDir, 'shipped.json'))
  const counts = analysisCounts(paperDir)
  const probes = {
    paperId,
    paperName:
      (config && !config._invalid && config.provenance && config.provenance.paperName) ||
      paperId,
    source: hasSource(paperDir),
    config: Boolean(config) && !config._invalid,
    groups: existsSync(path.join(paperDir, 'groups.json')),
    analyzeCount: counts.analyze,
    analysisCount: counts.analysis,
    analyses: counts.analyze === ANALYSIS_KEYS.length && counts.analysis === ANALYSIS_KEYS.length,
    aiCheck: Boolean(aiCheck) && aiCheck.ok === true,
    latest: existsSync(latestDir) && statSync(latestDir).isDirectory(),
    qaAccepted: Boolean(qaAccepted) && !qaAccepted._invalid,
    shipped: Boolean(shipped) && !shipped._invalid,
    blocked: blocked && !blocked._invalid ? blocked : null,
    helpNeeded: helpNeeded && !helpNeeded._invalid ? helpNeeded : null,
    mtimeMs: Math.max(
      mtimeMs(path.join(paperDir, 'config.json')),
      mtimeMs(path.join(paperDir, 'groups.json')),
      mtimeMs(path.join(signalsDir, 'blocked.json')),
      mtimeMs(path.join(signalsDir, 'ai-answer-check.json')),
      mtimeMs(path.join(signalsDir, 'qa-accepted.json')),
      mtimeMs(path.join(signalsDir, 'shipped.json')),
      mtimeMs(path.join(signalsDir, 'help-needed.json')),
      mtimeMs(latestDir),
    ),
  }
  const status = statusOf(probes)
  return {
    ...probes,
    status,
    statusLabel: LABELS[status],
    gatesGreen: probes.latest && probes.aiCheck && !probes.blocked,
    visible: isOpsVisible(probes),
  }
}

export function listPaperIds(repoRoot) {
  const papersRoot = path.join(repoRoot, 'scripts/import-pipeline/papers')
  if (!existsSync(papersRoot)) return []
  return readdirSync(papersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

export function listOpsPapers(repoRoot) {
  return listPaperIds(repoRoot)
    .map((paperId) => probePaper({ repoRoot, paperId }))
    .filter((paper) => paper.visible)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export function homeLists(papers) {
  return {
    awaitingQa: papers.filter((paper) => paper.status === 'awaiting_qa'),
    failed: papers.filter((paper) => paper.status === 'failed'),
    recent: papers,
  }
}

export function shipPrompt(paper) {
  if (paper.status === 'ready_to_ship') {
    return { kind: 'ship', say: `上线 ${paper.paperId}` }
  }
  if (paper.status === 'failed' && paper.blocked?.code === 'ship_failed') {
    return { kind: 'retry', say: `重试上线 ${paper.paperId}` }
  }
  if (paper.status === 'shipped') {
    return { kind: 'done', say: null }
  }
  return { kind: 'not_ready', say: null }
}

export function qaLinks(paper, appOrigin) {
  const origin = appOrigin.replace(/\/$/, '')
  const screen = `${origin}/?view=paper-browse&paperId=${encodeURIComponent(paper.paperId)}`
  if (!paper.latest) {
    return {
      screen: null,
      studentPrint: null,
      teacherPrint: null,
      note: '本地尚未 publish（无 latest），Screen / Print 入口不可用。',
    }
  }
  return {
    screen,
    studentPrint: screen,
    teacherPrint: `${screen}&lecture=1`,
    note: 'Screen 打开消费端整卷预览。Student / Teacher Print 走同一消费端共享渲染：将该卷入草稿卷后切换学生版 / 教师版。本后台不另造卷面、不对答案。',
  }
}
