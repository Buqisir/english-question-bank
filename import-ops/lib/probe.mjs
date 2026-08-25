import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

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

export const WRITING_ANALYSIS_KEYS = ['application', 'continuation']
const PAPER_ID_PATTERN = /^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/u

export function isOpsVisible(probes) {
  const hasSignal =
    Boolean(probes.blocked) ||
    probes.aiCheck ||
    probes.qaAccepted ||
    probes.shipped ||
    Boolean(probes.helpNeeded)
  if (probes.latest) return hasSignal
  return hasSignal || Boolean(probes.format2Stop) || Boolean(probes.format2Qa) || probes.source || probes.groups || (probes.config && probes.analyses)
}

export function statusOf(probes) {
  if (probes.shipped) return 'shipped'
  if (probes.blocked) return 'failed'
  if (probes.qaAccepted && probes.latest && probes.aiCheck) return 'ready_to_ship'
  if (probes.latest && probes.aiCheck) return 'awaiting_qa'
  if (probes.format2Stop?.lifecycle === 'importing') return 'importing'
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

function urlPathEndsWith(value, suffix) {
  try {
    return new URL(value).pathname.endsWith(suffix)
  } catch {
    return false
  }
}

function hasSource(paperDir, format2Stop) {
  return (
    existsSync(path.join(paperDir, 'source.docx')) ||
    existsSync(path.join(paperDir, 'source', 'paper.pdf')) ||
    existsSync(path.join(paperDir, 'source', 'answers.pdf')) ||
    Boolean(format2Stop)
  )
}

function format2StopOf(receipt, paperId) {
  if (
    !receipt
    || receipt._invalid
    || receipt.schemaVersion !== 'format2-import-job-receipt-v1'
    || receipt.result?.schemaVersion !== 'format2-import-job-result-v1'
    || receipt.result?.paperId !== paperId
    || receipt.result?.lifecycle !== 'importing'
    || receipt.result?.stopReason?.code !== 'exact_teacher_confirmation_required'
  ) return null
  const comparison = receipt.result.humanEntryPoints?.comparison
  if (
    comparison?.href !== `/papers/${paperId}/format2-comparison`
    || !/^sha256:[a-f0-9]{64}$/u.test(comparison?.packageDigest)
    || receipt.result.artifacts?.candidatePackage?.packageDigest !== comparison.packageDigest
  ) return null
  return {
    lifecycle: receipt.result.lifecycle,
    stopCode: receipt.result.stopReason.code,
    packageDigest: comparison.packageDigest,
    comparisonEntryPoint: comparison.href,
    resumeInstruction: `Resume this Job with exact visual package ${comparison.packageDigest}.`,
  }
}

function format2QaOf(receipt, paperId) {
  if (
    !receipt
    || receipt._invalid
    || receipt.schemaVersion !== 'format2-import-job-receipt-v1'
    || receipt.result?.schemaVersion !== 'format2-import-job-result-v1'
    || receipt.result?.paperId !== paperId
    || receipt.result?.lifecycle !== 'awaiting_qa'
    || receipt.result?.stopReason?.code !== 'owner_qa_required'
    || receipt.result?.canonicalPublication?.paperId !== paperId
    || receipt.result?.canonicalPublication?.reloads?.screen?.disposition !== 'ready'
    || receipt.result?.canonicalPublication?.reloads?.printPdf?.disposition !== 'ready'
  ) return null
  const entryPoints = receipt.result.humanEntryPoints
  const qaArtifacts = receipt.result.artifacts?.qa
  const artifacts = [
    ['studentPrint', '/student-print', 'text/html'],
    ['teacherPrint', '/teacher-print', 'text/html'],
    ['pdf', '/student-pdf', 'application/pdf'],
  ]
  if (
    entryPoints?.firstFocusState?.paperId !== paperId
    || entryPoints?.service?.command !== 'PORT=5173 bash scripts/dev.sh'
    || entryPoints?.service?.appOrigin !== 'http://127.0.0.1:5173'
    || entryPoints?.service?.qaArtifactCommand !== 'node import-ops/server.mjs'
    || entryPoints?.service?.qaArtifactOrigin !== 'http://127.0.0.1:8790'
    || entryPoints?.screen?.kind !== 'url'
    || entryPoints?.screen?.method !== 'GET'
    || typeof entryPoints?.screen?.href !== 'string'
    || artifacts.some(([key, pathnameSuffix, mediaType]) => {
      const artifact = entryPoints?.[key]
      return artifact?.kind !== 'artifact_url'
        || artifact?.method !== 'GET'
        || !urlPathEndsWith(artifact?.href, pathnameSuffix)
        || !/^sha256:[a-f0-9]{64}$/u.test(artifact?.sha256)
        || !Number.isInteger(artifact?.byteLength)
        || artifact.byteLength < 1
        || artifact?.mediaType?.startsWith(mediaType) !== true
    })
    || typeof entryPoints?.gateSummary !== 'string'
    || entryPoints?.qaAcceptance?.identity?.paperId !== paperId
    || entryPoints?.qaAcceptance?.identity?.jobId !== receipt.result.jobId
    || entryPoints?.qaAcceptance?.identity?.publicationDigest
      !== receipt.result.canonicalPublication.publicationDigest
    || entryPoints?.qaAcceptance?.identity?.qaArtifactsManifestDigest !== digestJson(qaArtifacts)
    || entryPoints?.qaAcceptance?.expectedReceipt?.qaArtifactsManifestDigest !== digestJson(qaArtifacts)
    || artifacts.some(([key]) => (
      entryPoints?.[key]?.sha256 !== qaArtifacts?.[key]?.sha256
      || entryPoints?.[key]?.byteLength !== qaArtifacts?.[key]?.byteLength
      || entryPoints?.[key]?.mediaType !== qaArtifacts?.[key]?.mediaType
    ))
  ) return null
  return {
    lifecycle: 'awaiting_qa',
    publication: structuredClone(receipt.result.canonicalPublication),
    entryPoints: structuredClone(entryPoints),
  }
}

function format2QaAcceptanceIsValid(qaAccepted, format2Qa) {
  if (!qaAccepted || qaAccepted._invalid || !format2Qa) return false
  const expected = format2Qa.entryPoints.qaAcceptance?.expectedReceipt
  if (!expected || qaAccepted.acceptedAt === undefined) return false
  return typeof qaAccepted.acceptedAt === 'string'
    && Number.isFinite(Date.parse(qaAccepted.acceptedAt))
    && Object.entries(expected).every(([key, value]) => qaAccepted[key] === value)
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

function writingAnalysisCount(paperDir) {
  return WRITING_ANALYSIS_KEYS.filter((key) => (
    existsSync(path.join(paperDir, `analysis-${key}.json`))
  )).length
}

export function probePaper({ repoRoot, paperId }) {
  const paperDir = path.join(repoRoot, 'scripts/import-pipeline/papers', paperId)
  const signalsDir = path.join(paperDir, 'signals')
  const latestDir = path.join(repoRoot, 'app/public/paper-assets', paperId, 'latest')
  const config = readJsonIfPresent(path.join(paperDir, 'config.json'))
  const blocked = readJsonIfPresent(path.join(signalsDir, 'blocked.json'))
  const helpNeeded = readJsonIfPresent(path.join(signalsDir, 'help-needed.json'))
  const aiCheck = readJsonIfPresent(path.join(signalsDir, 'ai-answer-check.json'))
  const qaAcceptedReceipt = readJsonIfPresent(path.join(signalsDir, 'qa-accepted.json'))
  const shipped = readJsonIfPresent(path.join(signalsDir, 'shipped.json'))
  const format2ReceiptPath = path.join(paperDir, 'job', 'current.json')
  const format2ReceiptPresent = existsSync(format2ReceiptPath)
  const format2Receipt = readJsonIfPresent(format2ReceiptPath)
  const format2Stop = format2StopOf(format2Receipt, paperId)
  const format2Qa = format2QaOf(format2Receipt, paperId)
  const qaAccepted = format2ReceiptPresent
    ? format2QaAcceptanceIsValid(qaAcceptedReceipt, format2Qa)
    : Boolean(qaAcceptedReceipt) && !qaAcceptedReceipt._invalid
  const counts = analysisCounts(paperDir)
  const writingCount = writingAnalysisCount(paperDir)
  const format3 = Boolean(config) && !config._invalid && String(config.format) === '3'
  const writingPublished = existsSync(path.join(latestDir, 'analyses', 'writing-analysis-v1.json'))
  const probes = {
    paperId,
    paperName:
      (config && !config._invalid && config.provenance && config.provenance.paperName) ||
      (format2Receipt && !format2Receipt._invalid && format2Receipt.result?.provenance?.paperName) ||
      paperId,
    source: hasSource(paperDir, format2Stop || format2Qa),
    config: Boolean(config) && !config._invalid,
    groups: existsSync(path.join(paperDir, 'groups.json')),
    analyzeCount: counts.analyze,
    analysisCount: counts.analysis,
    analyses: counts.analyze === ANALYSIS_KEYS.length && counts.analysis === ANALYSIS_KEYS.length,
    format3,
    writingAnalysisCount: writingCount,
    writingAnalyses: writingCount === WRITING_ANALYSIS_KEYS.length,
    writingPublished,
    writingReady: format3
      ? ((existsSync(latestDir) && statSync(latestDir).isDirectory())
        ? writingPublished
        : writingCount === WRITING_ANALYSIS_KEYS.length)
      : true,
    aiCheck: Boolean(aiCheck) && aiCheck.ok === true,
    latest: existsSync(latestDir) && statSync(latestDir).isDirectory(),
    qaAccepted,
    shipped: Boolean(shipped) && !shipped._invalid,
    blocked: blocked && !blocked._invalid ? blocked : null,
    helpNeeded: helpNeeded && !helpNeeded._invalid ? helpNeeded : null,
    format2Stop,
    format2Qa,
    mtimeMs: Math.max(
      mtimeMs(path.join(paperDir, 'config.json')),
      mtimeMs(path.join(paperDir, 'groups.json')),
      mtimeMs(path.join(signalsDir, 'blocked.json')),
      mtimeMs(path.join(signalsDir, 'ai-answer-check.json')),
      mtimeMs(path.join(signalsDir, 'qa-accepted.json')),
      mtimeMs(path.join(signalsDir, 'shipped.json')),
      mtimeMs(path.join(signalsDir, 'help-needed.json')),
      mtimeMs(path.join(paperDir, 'job', 'current.json')),
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

export function format2ComparisonFile({ repoRoot, paperId }) {
  if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(paperId)) return null
  const paperDir = path.join(repoRoot, 'scripts/import-pipeline/papers', paperId)
  const receipt = readJsonIfPresent(path.join(paperDir, 'job', 'current.json'))
  if (!format2StopOf(receipt, paperId)) return null
  const relativePath = receipt?.result?.artifacts?.comparison?.relativePath
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) return null
  const resolved = path.resolve(paperDir, relativePath)
  const paperRoot = `${path.resolve(paperDir)}${path.sep}`
  if (!resolved.startsWith(paperRoot) || !existsSync(resolved)) return null
  const expectedDigest = receipt?.result?.artifacts?.comparison?.sha256
  try {
    if (
      !statSync(resolved).isFile()
      || !/^sha256:[a-f0-9]{64}$/u.test(expectedDigest)
      || sha256(new Uint8Array(readFileSync(resolved))) !== expectedDigest
    ) return null
  } catch {
    return null
  }
  return resolved
}

export function format2QaArtifactFile({ repoRoot, paperId, artifactName }) {
  if (!PAPER_ID_PATTERN.test(paperId)) return null
  const routeToKey = {
    'student-print': 'studentPrint',
    'teacher-print': 'teacherPrint',
    'student-pdf': 'pdf',
  }
  const key = routeToKey[artifactName]
  const paperDir = path.join(repoRoot, 'scripts/import-pipeline/papers', paperId)
  const receipt = readJsonIfPresent(path.join(paperDir, 'job', 'current.json'))
  const qa = format2QaOf(receipt, paperId)
  const qaArtifacts = receipt?.result?.artifacts?.qa
  const support = Array.isArray(qaArtifacts?.support)
    ? qaArtifacts.support.find((candidate) => candidate.fileName === artifactName)
    : null
  const artifact = key ? qaArtifacts?.[key] : support
  const entry = key ? qa?.entryPoints?.[key] : artifact
  if (
    !qa
    || (!key && (!support || path.basename(artifactName) !== artifactName))
    || artifact?.sha256 !== entry?.sha256
    || artifact?.byteLength !== entry?.byteLength
    || artifact?.mediaType !== entry?.mediaType
    || typeof artifact?.relativePath !== 'string'
    || path.isAbsolute(artifact.relativePath)
  ) return null
  const resolved = path.resolve(paperDir, artifact.relativePath)
  if (!resolved.startsWith(`${path.resolve(paperDir)}${path.sep}`)) return null
  try {
    const bytes = readFileSync(resolved)
    if (
      !statSync(resolved).isFile()
      || bytes.byteLength !== artifact.byteLength
      || sha256(new Uint8Array(bytes)) !== artifact.sha256
    ) return null
    return { filePath: resolved, mediaType: artifact.mediaType, bytes }
  } catch {
    return null
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
  if (paper.format2Qa) {
    const withOrigin = (entry) => ({
      ...entry,
      href: new URL(entry.href, `${origin}/`).toString(),
    })
    const points = paper.format2Qa.entryPoints
    return {
      screen: withOrigin(points.screen).href,
      studentPrint: withOrigin(points.studentPrint),
      teacherPrint: withOrigin(points.teacherPrint),
      pdf: withOrigin(points.pdf),
      firstFocusState: points.firstFocusState,
      gateSummary: points.gateSummary,
      service: points.service,
      qaAcceptance: points.qaAcceptance,
      note: 'Format 2 Job 已准备同一 Canonical Paper 的 exact Screen / Student Print / Teacher Print / PDF QA 入口；本后台不写 Owner QA 收据。',
    }
  }
  const screen = `${origin}/?view=paper-browse&paperId=${encodeURIComponent(paper.paperId)}`
  if (!paper.latest) {
    return {
      screen: null,
      studentPrint: null,
      teacherPrint: null,
      pdf: null,
      note: '本地尚未 publish（无 latest），Screen / Print 入口不可用。',
    }
  }
  return {
    screen,
    studentPrint: screen,
    teacherPrint: `${screen}&lecture=1`,
    pdf: screen,
    note: 'Screen 打开消费端整卷预览。Student / Teacher Print 走同一消费端共享渲染：将该卷入草稿卷后切换学生版 / 教师版。本后台不另造卷面、不对答案。',
  }
}
