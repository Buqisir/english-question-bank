#!/usr/bin/env node
// Staged, resumable driver for the Droid fast import path (docs/import/droid-fast-path.md).
// Review commands follow the worktree binding (.amp/import-review-origin): a loopback origin
// uses the local runtime, any other origin is that Review reached with the import_agent account.
// It never promotes; `submit` is the only step that uploads a Candidate. Each stage runs the
// existing CLI gates in dependency order, overlaps independent machine work, and stops where an
// agent judgement is required. Finished steps are skipped on rerun.
//
//   prep <paperId> [--audio <file>] [--proofreaders 7] [-- <universal-nck1 init args>]
//   after-proofread <paperId> [--issues-resolved]
//   finish <paperId> [--large-complete-page-limit 13] [--large-no-listening-page-limit 11] [--economy-page-limit 9] through frozen PDFs and their contact sheets
//   submit <paperId>                 after PDF QA: push the Candidate, then Screen tiles
//   report <paperId> --screen "<what was checked>" --pdf "<what was checked>"
//   status <paperId>
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync,
  readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { digestJson, sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { buildNck1ReviewProjection, loadNck1ReviewSource, importNck1ReviewCandidate } from '../../server/import-review/revisionProjection.mjs'
import { sourceReferenceCellContinuations, refreshSourceReferenceCellContinuations } from '../../server/paper-import/sourceReferenceCellContinuation.mjs'
import { assertSourceReferenceAdmission } from '../../server/paper-import/sourceReferenceAdmission.mjs'
import {
  PAPER_PAGINATION_PLAN_FILE_NAME, validatePaperPaginationPlan, productPlanVersion, productPlanAuthorization,
} from '../../server/paper-import/paginationPlan.mjs'
import { ECONOMY_NINE_PAGE_OWNER_DATE, ECONOMY_NINE_PAGE_RULE, canRetryEconomyNinePages, importEconomyPageLimit, importLargePageLimits } from './lib-economy-page-allowance.mjs'
import { LARGE_PAGE_LIMIT_AUTHORIZATION, EXTENDED_PAGE_LIMIT_AUTHORIZATION } from '../../server/paper-import/pdfPageLimits.mjs'
import { trailingHeadingHints, trailingHeadingMessage } from './trailing-heading-guard.mjs'
import { declareFastListening, fastProductSet } from './lib-fast-products.mjs'
import { assertImportSubmissionReady } from './lib-import-submit-gate.mjs'
import { LISTENING_SEGMENT_RULE } from './lib-listening-segment-rule.mjs'
import { answerKeyValuesMatch } from './lib-answer-key-comparison.mjs'
import { OCR_SOURCE_REFERENCES_PRODUCER_VERSION } from './ocr-source-references-version.mjs'
import { sourceReferenceProducerVersion } from '../../server/paper-import/sourceReferenceSemantics.mjs'
import { normalizeMaterializationNumbering } from './materialization-numbering.mjs'
import { retainOwnerListening } from './lib-finish-owner-listening.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const scripts = path.join(root, 'scripts/import-pipeline')
const ASR_VENV = process.env.EQB_ASR_VENV || path.join(os.homedir(), '.local/share/eqbank-listening-asr')
const ASR_MODEL = process.env.EQB_ASR_MODEL || path.join(os.homedir(),
  '.cache/huggingface/hub/models--Systran--faster-whisper-small.en/snapshots/d1d751a5f8271d482d14ca55d9e2deeebbae577f')
// In-process projections (pagination merge) and every child share the page-replay cache.
process.env.EQB_OCR_RASTER_CACHE_DIR ||= path.join(os.homedir(), '.cache/eqbank/ocr-raster-v1')
const env = {
  ...process.env,
  PATH: [path.join(ASR_VENV, 'bin'), path.dirname(process.execPath), process.env.PATH].join(':'),
}
const AGENT_KEYCHAIN_SERVICE = 'eqbank-import-agent'

function reviewTarget() {
  const binding = path.join(root, '.amp/import-review-origin')
  const origin = existsSync(binding) ? readFileSync(binding, 'utf8').trim() : ''
  if (!origin || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/u.test(origin)) return { local: true }
  return { local: false, origin: new URL(origin).origin, username: process.env.QUESTION_BANK_IMPORT_OPS_AGENT_USERNAME || 'droid-import' }
}
const target = reviewTarget()
const reviewEnv = target.local ? env : {
  ...env,
  QUESTION_BANK_IMPORT_OPS_ORIGIN: target.origin,
  QUESTION_BANK_IMPORT_OPS_AGENT_USERNAME: target.username,
  QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: '',
}

class Stop extends Error {}

function fail(message) {
  throw new Error(message)
}

function option(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeJson(file, value, flag = 'w') {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function tail(text, lines = 25) {
  return String(text).trim().split('\n').slice(-lines).join('\n')
}

function lastJson(text) {
  for (let index = text.indexOf('{'); index !== -1; index = text.indexOf('{', index + 1)) {
    try {
      return JSON.parse(text.slice(index).trim())
    } catch {
      // keep looking for the start of the final JSON document
    }
  }
  return null
}

function context(paperId) {
  if (!/^paper-[a-z0-9-]+$/u.test(paperId || '')) fail('paperId must look like paper-…')
  const work = path.join(root, 'imports/ocr-proofread', paperId)
  const fast = path.join(work, 'fast')
  const statePath = path.join(fast, 'state.json')
  return {
    paperId,
    paperDir: path.join(scripts, 'papers', paperId),
    work,
    fast,
    logs: path.join(fast, 'logs'),
    statePath,
    state: existsSync(statePath) ? readJson(statePath) : { paperId, steps: {}, background: {}, data: {} },
  }
}

function save(ctx) {
  writeJson(ctx.statePath, ctx.state)
}

function say(message) {
  console.log(message)
}

async function step(ctx, name, fn) {
  const done = ctx.state.steps[name]
  if (done?.finishedAt) {
    say(`= ${name}（已完成，${done.seconds}s）`)
    return done.result
  }
  const started = Date.now()
  const entry = { startedAt: new Date(started).toISOString() }
  if (name === 'push') {
    entry.attemptId = randomUUID()
    mkdirSync(ctx.fast, { recursive: true })
    // Append before updating state: an interruption must invalidate older receipts.
    appendFileSync(path.join(ctx.fast, 'push-attempts.jsonl'), `${JSON.stringify({ paperId: ctx.paperId, ...entry })}\n`)
  }
  ctx.state.steps[name] = entry
  save(ctx)
  const result = await fn()
  const seconds = Math.round((Date.now() - started) / 100) / 10
  ctx.state.steps[name] = { ...ctx.state.steps[name], finishedAt: new Date().toISOString(), seconds, result: result ?? null }
  save(ctx)
  appendFileSync(path.join(ctx.fast, 'timeline.txt'), `${ctx.state.steps[name].finishedAt} ${name} ${seconds}s\n`)
  say(`✓ ${name} ${seconds}s`)
  return result
}

function cli(script, ...args) {
  return [path.join(scripts, script), ...args]
}

// Runs one repository CLI; full output goes to fast/logs/<label>.log, the parsed final JSON
// document is returned. `review` routes the command to the bound Review target.
function run(ctx, label, args, { review = false } = {}) {
  const viaLocal = review && target.local
  const argv = viaLocal ? [path.join(scripts, 'local-review.mjs'), 'run', '--', process.execPath, ...args] : args
  const pushAttempt = label === 'push' ? { ...ctx.state.steps.push } : null
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, { cwd: root, env: review ? reviewEnv : env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      const log = path.join(ctx.logs, pushAttempt ? `push-${pushAttempt.attemptId}.log` : `${label}.log`)
      mkdirSync(ctx.logs, { recursive: true })
      const header = pushAttempt ? `${JSON.stringify({ type: 'fast-push-attempt-v1', paperId: ctx.paperId, ...pushAttempt })}\n` : ''
      const footer = pushAttempt ? `\n${JSON.stringify({ type: 'fast-push-exit-v1', attemptId: pushAttempt.attemptId, code, signal: child.signalCode })}\n` : ''
      writeFileSync(log, `${header}$ ${args.map((arg) => path.relative(root, arg) || arg).join(' ')}\n${out}\n--- stderr\n${err}${footer}`, pushAttempt ? { flag: 'wx' } : {})
      if (code === 0) resolve(lastJson(out) ?? { stdout: out.trim() })
      else reject(new Error(`${label} 失败（exit ${code}），日志 ${path.relative(root, log)}\n${tail(err || out)}`))
    })
  })
}

function background(ctx, name, command, args) {
  mkdirSync(ctx.logs, { recursive: true })
  const log = path.join(ctx.logs, `${name}.log`)
  const fd = openSync(log, 'a')
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', fd, fd] })
  child.unref()
  ctx.state.background[name] = { pid: child.pid, log, startedAt: new Date().toISOString(), command, args }
  save(ctx)
  return child
}

// Three editions paginate concurrently, each loading a ~30 MB print document; under that load
// Chromium's 30 s setContent "load" wait has timed out while the same edition passes alone.
const TRANSIENT_RENDER_FAILURE = /page\.setContent: Timeout \d+ms exceeded/u

async function waitBackground(ctx, name, finished) {
  let job = ctx.state.background[name]
  if (!job) fail(`后台任务 ${name} 没有启动`)
  while (alive(job.pid) && !finished()) await sleep(2000)
  while (alive(job.pid)) await sleep(500)
  if (!finished() && !job.retried && job.command && TRANSIENT_RENDER_FAILURE.test(tail(readFileSync(job.log, 'utf8')))) {
    say(`↻ ${name} 页面加载超时，单独重跑一次`)
    background(ctx, name, job.command, job.args)
    job = ctx.state.background[name] = { ...ctx.state.background[name], retried: true }
    save(ctx)
    while (alive(job.pid) && !finished()) await sleep(2000)
    while (alive(job.pid)) await sleep(500)
  }
  if (!finished()) fail(`后台任务 ${name} 未完成，日志 ${path.relative(root, job.log)}\n${tail(readFileSync(job.log, 'utf8'))}`)
}

function materializationPath(ctx) {
  return path.join(ctx.paperDir, 'materialization/nck1-source-materialization-v1.json')
}

function hasListening(ctx) {
  return productSet(ctx).hasListening
}

function productSet(ctx, projection = null) {
  return fastProductSet(projection?.config || readJson(path.join(ctx.paperDir, 'config.json')),
    projection ? projection.paginationSlotBindings.filter(entry => entry.familyContractId === 'listening').length : undefined)
}

function archive(ctx, file, label = '') {
  if (!existsSync(file)) return
  const target = path.join(ctx.work, 'superseded', `${new Date().toISOString().replace(/[:.]/gu, '-')}-${label}${path.basename(file)}`)
  mkdirSync(path.dirname(target), { recursive: true })
  renameSync(file, target)
}

// ---------- prep ----------

async function restartLocalReview(ctx) {
  const localReview = path.join(scripts, 'local-review.mjs')
  spawnSync(process.execPath, [localReview, 'down'], { cwd: root, env, encoding: 'utf8' })
  await run(ctx, 'local-review-up', [localReview, 'up'])
}

function startAsr(ctx, { tag = null, extent = ['--whole-file'] } = {}) {
  const playback = path.join(ctx.paperDir, 'materialization/listening-audio/playback.mp3')
  if (!tag) {
    const name = 'asr-apple-v2'
    const out = path.join(ctx.fast, name)
    const completed = path.join(out, 'completed.json')
    if (existsSync(completed) && readJson(completed).audioSha256 === sha256(readFileSync(playback))) return [name]
    if (!alive(ctx.state.background[name]?.pid)) background(ctx, name, 'python3', [
      path.join(scripts, 'asr-slot.py'), 'python3', path.join(scripts, 'transcribe-listening-apple.py'), playback, out,
    ])
    return [name]
  }
  const original = readdirSync(path.join(ctx.paperDir, 'source')).find((name) => name.startsWith('listening-audio'))
  if (!original) fail('找不到 source/listening-audio.*')
  const names = []
  for (const vad of [true, false]) {
    const name = `asr-${vad ? 'vad' : 'novad'}${tag ? `-${tag}` : ''}`
    names.push(name)
    const out = path.join(ctx.fast, name)
    if (existsSync(path.join(out, 'completed.json'))) continue
    archive(ctx, out)
    // The original recording is the immutable input binding; Materialization keeps changing
    // during the run and the script refuses inputs that change underneath it.
    background(ctx, name, path.join(ASR_VENV, 'bin/python'), [
      path.join(scripts, 'asr-slot.py'), path.join(ASR_VENV, 'bin/python'),
      path.join(scripts, 'transcribe-listening-windows.py'), playback, path.join(ctx.paperDir, 'source', original), out,
      '--model-snapshot', ASR_MODEL, '--language', 'en', ...extent, ...(vad ? ['--vad'] : []),
    ])
  }
  return names
}

function startFigureDetection(ctx) {
  if (env.EQB_OVIS_FIGURE === 'off' || alive(ctx.state.background['ovis-figure']?.pid)) return
  const python = env.EQB_OVIS_FIGURE_PYTHON || path.join(os.homedir(), '.local/share/eqbank-ocr/bin/python')
  try {
    background(ctx, 'ovis-figure', python, [
      path.join(scripts, 'asr-slot.py'), python, path.join(scripts, 'ocr-figure-detect.py'),
      '--pages', path.join(ctx.work, 'trace.json'),
      '--output', path.join(ctx.fast, 'figure-candidates.json'),
    ]).on('error', (error) => say(`Ovis shadow 后台启动失败：${error.message}`))
  } catch (error) {
    say(`Ovis shadow 后台启动失败：${error.message}`)
  }
}

// Re-transcribes a sub-range with shifted window boundaries, for groups whose first reading
// straddles a 5-second window overlap and drifts in both full-file runs.
async function asrExtra(ctx, args) {
  const start = Number(option(args, '--start'))
  const end = Number(option(args, '--end'))
  const tag = option(args, '--tag')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !/^[a-z0-9]+$/u.test(tag || '')) {
    fail('Usage: fast-import.mjs asr-extra <paperId> --start <s> --end <s> --tag <a-z0-9>')
  }
  const names = startAsr(ctx, { tag, extent: ['--start', String(start), '--end', String(end)] })
  for (const name of names) {
    await waitBackground(ctx, name, () => existsSync(path.join(ctx.fast, name, 'completed.json')))
  }
  const windows = readJson(path.join(ctx.fast, names[1], 'completed.json')).windows
  say(JSON.stringify({ tag, start, end, windows: windows.length,
    evidencePaths: names.map((name) => `listening-review-evidence/${name.slice(4)}-window-NNN.json`) }, null, 2))
}

function proofreadPlan(ctx, workers) {
  const pages = readJson(path.join(ctx.work, 'trace.json')).pages
    .map((page) => ({ key: page.key, weight: page.words.length + 60 }))
  const total = pages.reduce((sum, page) => sum + page.weight, 0)
  const groups = [[]]
  let filled = 0
  for (const page of pages) {
    if (filled >= total / workers && groups.length < workers) {
      groups.push([])
      filled = 0
    }
    groups.at(-1).push(page.key)
    filled += page.weight
  }
  return groups.map((keys) => ({
    pages: keys,
    outputs: [
      ...keys.map((key) => path.join(ctx.work, 'drafts', `${key}.json`)),
      path.join(ctx.work, 'source-flags', `${keys[0]}.json`),
    ],
    prompt: [
      `在 worktree ${root} 校对 OCR。paperId ${ctx.paperId}，只负责页 ${keys.join(', ')}。`,
      `按 scripts/import-pipeline/ocr-proofread-rules.md，对照 imports/ocr-proofread/${ctx.paperId}/pages/<页键>.png 原图，`,
      `逐页修改 imports/ocr-proofread/${ctx.paperId}/drafts/<页键>.json；再按规则“顺带记录”一节写`,
      `imports/ocr-proofread/${ctx.paperId}/source-flags/${keys[0]}.json（pages 填 ${JSON.stringify(keys)}）。`,
      `自检：PATH="${path.dirname(process.execPath)}:$PATH" node scripts/import-pipeline/ocr-proofread.mjs compile ${ctx.paperId} --pages ${keys.join(',')}`,
      '只写上述文件，不联网，不运行其他写命令。完成后按规则“完成后回报”简短回报。',
    ].join('\n'),
  }))
}

async function prep(ctx, args) {
  const separator = args.indexOf('--')
  const initArgs = separator === -1 ? [] : args.slice(separator + 1)
  const own = separator === -1 ? args : args.slice(0, separator)
  const audio = option(own, '--audio')
  const declaration = option(own, '--listening')
  // Validate before init writes anything; absence of audio is never a declaration.
  declareFastListening({}, declaration, audio)
  const workers = Number(option(own, '--proofreaders') || 7)
  await step(ctx, 'init', async () => {
    if (existsSync(path.join(ctx.paperDir, 'config.json'))) return { existing: true }
    if (!initArgs.length) fail('新卷需要在 -- 之后给出 universal-nck1 init 参数')
    await run(ctx, 'init', cli('universal-nck1.mjs', 'init', ctx.paperId, ...initArgs))
    return { initialized: true }
  })
  await step(ctx, 'source-listening', () => {
    const file = path.join(ctx.paperDir, 'config.json')
    const config = readJson(file)
    const next = declareFastListening(config, declaration, audio)
    if (next !== config) writeJson(file, next)
    return { listening: next.listening ?? 'present' }
  })
  declareFastListening(readJson(path.join(ctx.paperDir, 'config.json')), declaration, audio)
  await step(ctx, 'audio-ocr-review', async () => {
    const jobs = [run(ctx, 'ocr-evidence', cli('ocr-proofread.mjs', 'evidence', ctx.paperId))
      .then(() => startFigureDetection(ctx))]
    if (target.local) jobs.push(restartLocalReview(ctx))
    if (audio) {
      jobs.push(run(ctx, 'stage-audio', cli('universal-nck1.mjs', 'stage-listening-audio', ctx.paperId, '--audio', path.resolve(audio)))
        .then(() => startAsr(ctx)))
    }
    await Promise.all(jobs)
    return { listening: Boolean(audio) }
  })
  // Also resume detection when prep reuses an already completed evidence step.
  startFigureDetection(ctx)
  await step(ctx, 'worksheets', () => run(ctx, 'worksheets', cli('ocr-proofread.mjs', 'worksheets', ctx.paperId)))
  const plan = await step(ctx, 'round1-plan', async () => {
    const workersPlan = proofreadPlan(ctx, workers)
    writeJson(path.join(ctx.fast, 'round1.json'), workersPlan)
    return { workers: workersPlan.length }
  })
  const workersPlan = readJson(path.join(ctx.fast, 'round1.json'))
  say(`\n第一轮：并行派发 ${plan.workers} 个 worker（complexity medium），提示词如下；全部完成后运行 after-proofread。`)
  for (const [index, worker] of workersPlan.entries()) say(`\n--- worker ${index + 1}（${worker.pages.join(', ')}）\n${worker.prompt}`)
}

// ---------- after-proofread ----------

function readFlags(ctx) {
  const dir = path.join(ctx.work, 'source-flags')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
    .map((name) => ({ name, ...readJson(path.join(dir, name)) }))
}

function applySubtitlesAndCheckWatermarks(ctx) {
  const flags = readFlags(ctx)
  const file = materializationPath(ctx)
  const materialization = readJson(file)
  const wanted = flags.flatMap((flag) => flag.subtitles || [])
  const edits = []
  const missing = []
  for (const subtitle of wanted) {
    const text = String(subtitle.text || '').trim()
    let hit = false
    materialization.groups.forEach((group, groupIndex) => (group.blocks || []).forEach((block, blockIndex) => {
      // A seven-choice blank can stand in a subtitle position; workers flag it as `__39__`.
      const blockText = (block.content || []).map((item) => item.kind === 'blank_ref'
        ? `__${String(item.blankId).split(':').at(-1)}__` : item.text || '').join('').trim()
      if (block.kind !== 'paragraph' || blockText !== text) return
      hit = true
      if (block.role === 'subtitle') return
      edits.push({ target: `/groups/${groupIndex}/blocks/${blockIndex}`, change: `role ${block.role || 'body'}→subtitle`,
        reason: `篇内独立小标题“${text}”，校对 worker 对照原页标出；按卷面结构标为 subtitle，文字未改。` })
      block.role = 'subtitle'
    }))
    if (!hit) missing.push(text)
  }
  if (missing.length) throw new Stop(`以下小标题在 Materialization 段落中找不到完全相同的文字，请人工处理后重跑：\n${missing.join('\n')}`)
  if (edits.length) {
    writeFileSync(file, `${JSON.stringify(materialization, null, 2)}\n`)
    const logPath = path.join(ctx.work, 'materialization-edits.json')
    const log = existsSync(logPath) ? readJson(logPath) : { paperId: ctx.paperId, edits: [] }
    log.edits.push(...edits)
    writeJson(logPath, log)
  }
  const text = readFileSync(file, 'utf8').toLowerCase()
  const leaks = [...new Set(flags.flatMap((flag) => flag.watermarks || []))]
    .filter((mark) => String(mark).trim() && text.includes(String(mark).trim().toLowerCase()))
  if (leaks.length) throw new Stop(`Materialization 里仍有水印文字：${leaks.join('、')}`)
  return { subtitles: edits.length, watermarksChecked: flags.flatMap((flag) => flag.watermarks || []).length }
}

function answerCheck(ctx, verified) {
  const materialization = readJson(materializationPath(ctx))
  const expected = [...(materialization.listening?.answers || []), ...(materialization.answers || [])]
  const transcribed = Object.assign({}, ...readFlags(ctx).map((flag) => flag.answers || {}))
  const entries = expected.map((answer) => ({
    number: answer.canonicalNumber,
    answerKey: answer.value,
    transcribed: transcribed[String(answer.canonicalNumber)] ?? null,
  }))
  const missing = entries.filter((entry) => entry.transcribed === null).map((entry) => entry.number)
  const mismatches = entries.filter((entry) => entry.transcribed !== null
    && !answerKeyValuesMatch(entry.transcribed, entry.answerKey))
  writeJson(path.join(ctx.work, 'handoff/qa/answer-key-comparison.json'), {
    paperId: ctx.paperId, method: 'proofreader-page-transcription-vs-answerKey', compared: entries.length,
    missing, mismatches, entries })
  if (missing.length || mismatches.length) {
    throw new Stop(`答案核对未通过：缺 ${missing.join(',') || '无'}；不一致 ${mismatches.map((entry) =>
      `${entry.number}: key=${entry.answerKey} 原页=${entry.transcribed}`).join('；') || '无'}。对照答案页原图处理后重跑。`)
  }
  writeJson(path.join(ctx.paperDir, 'signals/ai-answer-check.json'), {
    ok: true, checkedAt: new Date().toISOString(), method: 'source-markings-vs-answerKey', paperId: ctx.paperId,
    sourceDigest: verified.sourceDigest, candidateDigest: verified.candidateDigest })
  return { compared: entries.length }
}

export function splitSummaries(ctx, parts) {
  const request = readJson(path.join(ctx.fast, 'summaries-request.json'))
  const weight = (group) => group.targets.reduce((sum, target) => sum + JSON.stringify(target.content).length, 0)
  const buckets = Array.from({ length: Math.min(parts, request.groups.length) }, () => ({ groups: [], weight: 0 }))
  for (const group of [...request.groups].sort((left, right) => weight(right) - weight(left))) {
    const lightest = buckets.reduce((best, bucket) => (bucket.weight < best.weight ? bucket : best))
    lightest.groups.push(group)
    lightest.weight += weight(group)
  }
  return buckets.map((bucket, index) => {
    const file = path.join(ctx.fast, 'summaries-parts', `request-${index + 1}.json`)
    const groups = request.groups.filter((group) => bucket.groups.includes(group))
    writeJson(file, { ...request, groups })
    // Authored parts are reused by ID across redo; a recompile that changed paragraphs (e.g. a
    // text run restored from a figure) leaves a part citing old IDs, so it moves aside for rewrite.
    const part = path.join(ctx.fast, 'summaries-parts', `part-${index + 1}.json`)
    if (existsSync(part)) {
      const ids = (groupList) => groupList.flatMap((group) => (group.targets || group.paragraphs)
        .map((item) => `${group.groupId} ${item.paragraphId}`)).sort().join('\n')
      if (ids(readJson(part).groups || []) !== ids(groups)) archive(ctx, part)
    }
    return { file, groups: bucket.groups.length, targets: bucket.groups.reduce((sum, group) => sum + group.targets.length, 0) }
  })
}

function startPagination(ctx, candidateDigest, editions = productSet(ctx).editions, economyPageLimit = ctx.state.data.economyPageLimit ?? 8) {
  const limits = { ...importLargePageLimits(ctx.state.data), economyPageLimit }
  for (const edition of editions) {
    const limit = limits[`${edition === 'economy8' ? 'economy' : edition}PageLimit`]
    const out = path.join(ctx.fast, 'pagination', edition)
    const report = path.join(out, 'report.json')
    const previous = existsSync(report) ? readJson(report) : null
    if (previous?.status === 'success' && previous.candidateDigest === candidateDigest
      && previous.selectedPlan?.targetPages === limit) continue
    archive(ctx, out)
    mkdirSync(out, { recursive: true })
    // One process per edition: the Chromium pool renders serially inside a process.
    background(ctx, `pagination-${edition}`, process.execPath, cli('review.mjs', 'pagination-qa', ctx.paperId,
      '--edition', edition, '--auto', '--output', out,
      ...(limit === ({ economy8: 9, largeComplete: 13, largeNoListening: 11 })[edition]
        || limit === ({ economy8: 10, largeComplete: 14, largeNoListening: 12 })[edition]
        ? [({ economy8: '--economy-page-limit', largeComplete: '--large-complete-page-limit', largeNoListening: '--large-no-listening-page-limit' })[edition], String(limit)] : [])))
  }
}

function listeningGroups(ctx) {
  const request = readJson(path.join(ctx.fast, 'listening-review-request.json'))
  const transcript = request.transcript || readJson(materializationPath(ctx)).listening.transcript
  return [...transcript].sort((left, right) => Math.min(...left.questionNumbers) - Math.min(...right.questionNumbers))
    .map((group) => group.segmentId)
}

function round2Prompts(ctx) {
  const prompts = []
  const relative = (file) => path.relative(root, file)
  for (const part of ctx.state.data.summaryParts) {
    const index = path.basename(part.file).match(/\d+/u)[0]
    prompts.push({ label: `摘要 ${index}`, outputs: [path.join(ctx.fast, 'summaries-parts', `part-${index}.json`)], prompt: [
      `在 worktree ${root} 写段落摘要。读 ${relative(part.file)}：其中 prompt 是写作要求，outputSchema 是结构，groups 是本分片的题组（${part.groups} 组 ${part.targets} 段）。`,
      `把结果写到 ${relative(path.join(ctx.fast, 'summaries-parts', `part-${index}.json`))}，格式为 {"groups":[{"groupId":…,"paragraphs":[{"paragraphId":…,"summary":…}]}]}，`,
      '只含本分片的题组，每个 target 一条，paragraphId 原样照抄。只写这个文件，不联网，不运行写命令。完成后回报段数和拿不准之处。',
    ].join('\n') })
  }
  prompts.push({ label: '检索 metadata', outputs: [path.join(ctx.fast, 'search-metadata-authored.json')], prompt: [
    'topicLabels、facetKey、route、features 只能从 request 的 controlledValues 原样复制。',
    '语法分类返工以整道题为单位，允许依据答案和原句重新判断 facetKey、role、route、features；错误路径只定位问题，不锁定已有 facet。不得把未知 route 自动映射到近义 route，不得新增词表值。',
    `在 worktree ${root} 写公开检索 metadata。读 ${relative(path.join(ctx.fast, 'search-metadata-request.json'))}，按其中说明与结构`,
    `写 ${relative(path.join(ctx.fast, 'search-metadata-authored.json'))}。只写这个文件，不联网，不运行 finalize 或其他写命令。完成后回报题组数。`,
  ].join('\n') })
  return prompts
}

export async function runOcrReview(ctx, generationPlan = null, execute = run) {
  const operationPath = path.join(ctx.fast, 'ocr-generation-operation.json')
  const sealed = generationPlan ? { reused: false } : await execute(ctx, 'reuse-ocr', cli('review.mjs', 'reuse-ocr-confirmation', ctx.paperId,
    '--input', path.join(ctx.work, 'proofread-input.json')), { review: true })
  if (sealed.reused) {
    say(`= 复用已封存 OCR（${sealed.revisionId}）`)
    return sealed
  }
  const pushed = await execute(ctx, 'push-ocr', cli('review.mjs', 'push-ocr', ctx.paperId,
    ...(generationPlan ? ['--ocr-generation-plan', path.resolve(generationPlan)] : [])), { review: true })
  const revisionId = pushed.revisionId
  if (!revisionId) fail('push-ocr 没有返回 revisionId')
  if (generationPlan) writeJson(operationPath, { ...readJson(operationPath), revisionId })
  await execute(ctx, 'proofread-ocr', cli('review.mjs', 'proofread-ocr', ctx.paperId, '--revision', revisionId,
    '--input', path.join(ctx.work, 'proofread-input.json')), { review: true })
  await execute(ctx, 'pull-ocr', cli('review.mjs', 'pull-ocr-confirmation', ctx.paperId, '--revision', revisionId), { review: true })
  if (generationPlan) {
    writeJson(operationPath, { ...readJson(operationPath), completedAt: new Date().toISOString() })
    rmSync(path.join(ctx.fast, 'ocr-generation.lock'), { recursive: true })
  }
  return { revisionId }
}

async function afterProofread(ctx, args) {
  const generationPlan = option(args, '--ocr-generation-plan')
  const operationPath = path.join(ctx.fast, 'ocr-generation-operation.json')
  if (existsSync(path.join(ctx.fast, 'ocr-generation.lock'))
    || (existsSync(operationPath) && !readJson(operationPath).completedAt)) {
    fail('OCR_GENERATION_RECONCILIATION_REQUIRED: 新代操作未闭合；保留计划、日志与操作记录，先只读 status 对账，不重放上传')
  }
  if (hasListening(ctx) && !existsSync(path.join(ctx.paperDir, 'materialization/listening-audio/playback.mp3'))) {
    fail('来源有听力但缺播放音频；请补齐音频。原卷无听力须在 prep 显式声明 --listening absent-by-exam-design')
  }
  if (generationPlan) await startOcrGeneration(ctx, generationPlan)
  await step(ctx, 'flags-present', () => {
    const covered = new Set(readFlags(ctx).flatMap((flag) => flag.pages || []))
    const missing = readJson(path.join(ctx.work, 'trace.json')).pages.map((page) => page.key).filter((key) => !covered.has(key))
    if (missing.length) throw new Stop(`这些页还没有 source-flags：${missing.join(', ')}`)
    return { pages: covered.size }
  })
  await step(ctx, 'compile', () => run(ctx, 'compile', cli('ocr-proofread.mjs', 'compile', ctx.paperId)))
  await step(ctx, 'ocr-review', () => runOcrReview(ctx, generationPlan))
  await step(ctx, 'materialize', async () => {
    await run(ctx, 'materialize', cli('universal-nck1.mjs', 'materialize', ctx.paperId))
    return { issues: (readJson(materializationPath(ctx)).issues || []).length }
  })
  await step(ctx, 'chinese-numbering', () => {
    // An old cached spelling/build must be invalidated before changing its input.
    const later = STEP_ORDER.slice(STEP_ORDER.indexOf('chinese-numbering') + 1)
    if (later.some(name => ctx.state.steps[name])
      && normalizeMaterializationNumbering(readJson(materializationPath(ctx))).changes.length) {
      throw new Stop(`中文编号标准化需要重建下游：after-proofread ${ctx.paperId} --redo-from chinese-numbering`)
    }
    return run(ctx, 'chinese-numbering', cli('ocr-proofread.mjs', 'numbering', ctx.paperId))
  })
  const materialization = readJson(materializationPath(ctx))
  const trailingHeadings = trailingHeadingHints(materialization)
  if (trailingHeadings.length) throw new Stop(trailingHeadingMessage(trailingHeadings))
  const issues = materialization.issues || []
  if (issues.length && !args.includes('--issues-resolved')) {
    throw new Stop(`Materialization 有 ${issues.length} 条 issues，需要主 Agent 对照原页处理并记入 materialization-edits.json，然后加 --issues-resolved 重跑：\n${
      issues.map((item) => JSON.stringify(item)).join('\n')}`)
  }
  await step(ctx, 'presentation', () => run(ctx, 'presentation', cli('ocr-proofread.mjs', 'presentation', ctx.paperId)))
  await step(ctx, 'figure-sizes', async () => {
    const { changes } = await run(ctx, 'figure-sizes', cli('ocr-proofread.mjs', 'figure-sizes', ctx.paperId))
    if (changes.length) {
      const logPath = path.join(ctx.work, 'materialization-edits.json')
      const log = existsSync(logPath) ? readJson(logPath) : { paperId: ctx.paperId, edits: [] }
      log.edits.push(...changes.map((change) => ({
        target: `/media[mediaId=${change.mediaId}]/presentation/widthRatio`,
        reason: `OCR producer 默认图宽 ${change.from}；按原页裁图宽 ${change.cropWidth} ÷ 该页正文宽 ${change.bodyWidth} 还原为 ${change.to}（与 DOCX 图宽比例同口径）。`,
      })))
      writeJson(logPath, log)
    }
    return { changes: changes.length }
  })
  await step(ctx, 'subtitles-watermarks', () => applySubtitlesAndCheckWatermarks(ctx))
  await step(ctx, 'spelling', async () => {
    const request = path.join(ctx.fast, 'spelling-request.json')
    const current = sha256(readFileSync(materializationPath(ctx)))
    if (existsSync(request) && readJson(request).report?.materializationSha256 !== current) archive(ctx, request)
    if (!existsSync(request)) await run(ctx, 'prepare-spelling', cli('review.mjs', 'prepare-spelling', ctx.paperId, '--output', request))
    const review = path.join(ctx.fast, 'spelling-review.json')
    archive(ctx, review)
    const built = await run(ctx, 'spelling-auto', cli('text-review-parts.mjs', 'auto', request,
      '--flags', path.join(ctx.work, 'source-flags'), '--output', review, '--paper-dir', ctx.paperDir))
    await run(ctx, 'finalize-spelling', cli('review.mjs', 'finalize-spelling', ctx.paperId, '--input', review))
    await run(ctx, 'verify-spelling', cli('review.mjs', 'verify-spelling', ctx.paperId))
    return { unchanged: built.unchanged, correct: built.correct, uncertain: built.uncertain, mechanical: built.mechanical }
  })
  const verified = await step(ctx, 'verify', async () => {
    const result = await run(ctx, 'verify', cli('universal-nck1.mjs', 'verify', ctx.paperId))
    return { sourceDigest: result.sourceDigest, candidateDigest: result.candidateDigest, groups: result.groups, assertions: result.assertions }
  })
  await step(ctx, 'answer-check', () => answerCheck(ctx, verified))
  await step(ctx, 'build', () => run(ctx, 'build', cli('universal-nck1.mjs', 'build', ctx.paperId)))
  await step(ctx, 'round2-requests', async () => {
    const summaries = path.join(ctx.fast, 'summaries-request.json')
    const metadata = path.join(ctx.fast, 'search-metadata-request.json')
    for (const file of [summaries, metadata, path.join(ctx.fast, 'listening-review-request.json')]) archive(ctx, file)
    await run(ctx, 'prepare-summaries', cli('review.mjs', 'prepare-summaries', ctx.paperId, '--output', summaries))
    await run(ctx, 'prepare-search-metadata', cli('review.mjs', 'prepare-search-metadata', ctx.paperId, '--output', metadata))
    ctx.state.data.summaryParts = splitSummaries(ctx, 3)
    if (hasListening(ctx)) {
      await run(ctx, 'prepare-listening-review', cli('review.mjs', 'prepare-listening-review', ctx.paperId,
        '--output', path.join(ctx.fast, 'listening-review-request.json')))
      const segments = listeningGroups(ctx)
      const half = Math.ceil(segments.length / 2)
      ctx.state.data.listeningParts = [segments.slice(0, half), segments.slice(half)].filter((part) => part.length)
    }
    save(ctx)
    return { summaryParts: ctx.state.data.summaryParts.length, listeningParts: ctx.state.data.listeningParts?.length ?? 0 }
  })
  if (hasListening(ctx)) {
    const cached = ctx.state.steps['asr-apple-rule-v2']
    if (cached?.finishedAt) {
      const attempt = cached.result?.attempt
      const ruleFile = attempt && path.join(attempt, 'rule-result.json')
      const inputFile = attempt && path.join(attempt, 'input.json')
      if (!ruleFile || !existsSync(ruleFile)
        || readJson(ruleFile).schemaVersion !== 'listening-local-result-v2'
        || readJson(ruleFile).rule.version !== LISTENING_SEGMENT_RULE.version
        || !existsSync(inputFile)
        || readJson(inputFile).ruleCodeSha256 !== sha256(readFileSync(path.join(scripts, 'lib-listening-segment-rule.mjs')))) {
        throw new Stop(`听力缓存属于历史规则；保留旧证据，用当前规则重算（不运行 ASR）：\n`
          + `fast-import.mjs after-proofread ${ctx.paperId} --redo-from asr-apple-rule-v2`
          + ` --listening-replay-attempt ${attempt || '<保留的 attempt 目录>'}`)
      }
    }
    await step(ctx, 'asr-apple-rule-v2', async () => {
      const replayAttempt = option(args, '--listening-replay-attempt')
      if (args.includes('--listening-replay-attempt') && (!replayAttempt || replayAttempt.startsWith('--'))) {
        fail('--listening-replay-attempt 需要保留的 attempt 目录；未启动 ASR')
      }
      for (const name of replayAttempt ? [] : startAsr(ctx)) {
        const ready = () => existsSync(path.join(ctx.fast, name, 'completed.json'))
          && readJson(path.join(ctx.fast, name, 'completed.json')).audioSha256
            === sha256(readFileSync(path.join(ctx.paperDir, 'materialization/listening-audio/playback.mp3')))
        if (!ready()) await waitBackground(ctx, name, ready)
      }
      const primary = replayAttempt ? null : readJson(path.join(ctx.fast, 'asr-apple-v2/completed.json'))
      const result = await run(ctx, 'listening-segment-v2', cli('listening-segment.mjs',
        '--paper-dir', ctx.paperDir, '--request', path.join(ctx.fast, 'listening-review-request.json'),
        ...(replayAttempt ? ['--replay-attempt', path.resolve(replayAttempt)] : ['--apple-evidence', primary.evidence]),
        '--output', path.join(ctx.fast, 'listening-segment-attempts')))
      ctx.state.data.listeningSegmentAttempt = result
      // An old cached installation must not survive a fresh stricter rule run.
      // Preserve the old sidecar and require finish to install this attempt.
      delete ctx.state.steps['listening-review']
      archive(ctx, path.join(ctx.paperDir, 'listening-review-v1.json'))
      save(ctx)
      return result
    })
  }
  const prompts = round2Prompts(ctx)
  writeJson(path.join(ctx.fast, 'round2.json'), prompts)
  say(`\n第二轮：并行派发 ${prompts.length} 个 worker（complexity medium）。全部完成后运行 finish。`)
  for (const { label, prompt } of prompts) say(`\n--- ${label}\n${prompt}`)
}

// ---------- finish ----------

function economyFailure(ctx, edition) {
  const file = path.join(ctx.fast, 'pagination', edition, 'failure-report.json')
  return edition === 'economy8' && existsSync(file) && canRetryEconomyNinePages(readJson(file), {
    paperId: ctx.paperId, candidateDigest: ctx.state.steps['pagination-run']?.result?.candidateDigest,
    pageLimit: ctx.state.data.economyPageLimit ?? 8,
  })
}

async function mergePagination(ctx) {
  const reports = {}
  const { editions } = productSet(ctx)
  // pagination-run stays completed after a failed finish, so a resumed finish would only re-read
  // the dead job; an edition whose job exited without a report is started again instead.
  const job = (edition) => ctx.state.background[`pagination-${edition}`]
  const orphaned = editions.filter((edition) => job(edition) && !alive(job(edition).pid)
    && !existsSync(path.join(ctx.fast, 'pagination', edition, 'report.json'))
    && !economyFailure(ctx, edition))
  if (orphaned.length) {
    say(`↻ 分页 ${orphaned.join(', ')} 的进程已退出且没有报告，重新启动`)
    startPagination(ctx, ctx.state.steps['pagination-run'].result.candidateDigest, orphaned)
  }
  for (const edition of editions) {
    const file = path.join(ctx.fast, 'pagination', edition, 'report.json')
    try {
      if (ctx.state.background[`pagination-${edition}`]) await waitBackground(ctx, `pagination-${edition}`, () => existsSync(file))
    } catch (error) {
      if (!economyFailure(ctx, edition)) throw error
    }
    if (economyFailure(ctx, edition)) {
      if (ctx.state.steps.push?.startedAt) fail('已开始送审的卷不可原地更改省纸页数')
      const failure = path.join(ctx.fast, 'pagination/economy8/failure-report.json')
      const retained = path.join(ctx.fast, 'pagination/economy8-eight-page-failure.json')
      copyFileSync(failure, retained)
      say('↻ 省纸 8 页确定无法排入，自动重跑 9 页上限')
      startPagination(ctx, ctx.state.steps['pagination-run'].result.candidateDigest, ['economy8'], 9)
      await waitBackground(ctx, 'pagination-economy8', () => existsSync(file))
      const report = readJson(file)
      if (report.status !== 'success' || report.selectedPlan?.targetPages !== 9) fail('省纸 9 页分页失败')
      ctx.state.data.economyPageLimit = 9
      ctx.state.data.economyPageLimitAuthorization = {
        rule: ECONOMY_NINE_PAGE_RULE, at: new Date().toISOString(), eightPageFailure: path.relative(root, retained),
      }
      save(ctx)
    }
    if (!existsSync(file)) fail(`${edition} 分页没有产出 report.json`)
    reports[edition] = readJson(file)
    if (reports[edition].status !== 'success') fail(`${edition} 分页失败，见 ${path.relative(root, file)}`)
  }
  const projection = buildNck1ReviewProjection(ctx.paperDir, { requireAnalyses: true })
  productSet(ctx, projection)
  const stale = editions.filter((edition) => reports[edition].candidateDigest !== projection.candidateDigest)
  if (stale.length) fail(`分页报告绑定的 Candidate 已过期：${stale.join(', ')}；删除对应目录后重跑 finish`)
  const largeLimits = importLargePageLimits(ctx.state.data)
  for (const edition of editions.filter(value => value.startsWith('large'))) {
    if (reports[edition].selectedPlan.targetPages !== largeLimits[`${edition}PageLimit`]) fail(`${edition} 分页报告与本卷授权上限不一致`)
  }
  if (reports.economy8.selectedPlan.targetPages !== (ctx.state.data.economyPageLimit ?? 8)) {
    fail('省纸分页报告与本卷 fast state 页数不一致')
  }
  const sourceHasListening = projection.paginationSlotBindings.some((entry) => entry.familyContractId === 'listening')
  const binding = { paperId: projection.paperId, sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest }
  // Same assembly as `review.mjs pagination-qa --auto --save-plan` run once per edition.
  const selectedEditions = Object.fromEntries(editions.map((edition) => [edition, reports[edition].selectedPlan]))
  const schemaVersion = productPlanVersion(selectedEditions)
  const plan = validatePaperPaginationPlan({
    schemaVersion, ...productPlanAuthorization(schemaVersion, selectedEditions),
    ...binding,
    editions: Object.fromEntries(editions.map((edition) => [edition, reports[edition].selectedPlan])),
  }, { ...binding, slotBindings: projection.paginationSlotBindings, sourceHasListening })
  const target = path.join(ctx.paperDir, PAPER_PAGINATION_PLAN_FILE_NAME)
  writeFileSync(`${target}.tmp`, `${stableStringify(plan)}\n`)
  renameSync(`${target}.tmp`, target)
  return Object.fromEntries(editions.map((edition) => [edition, {
    pages: reports[edition].pageCount, searched: reports[edition].searchedCandidates }]))
}

async function installSummaries(ctx) {
  const request = readJson(path.join(ctx.fast, 'summaries-request.json'))
  const authored = new Map()
  for (const part of ctx.state.data.summaryParts) {
    const file = path.join(ctx.fast, 'summaries-parts', `part-${path.basename(part.file).match(/\d+/u)[0]}.json`)
    if (!existsSync(file)) fail(`缺少摘要分片 ${path.relative(root, file)}`)
    for (const group of readJson(file).groups) authored.set(group.groupId, group)
  }
  const missing = request.groups.filter((group) => !authored.has(group.groupId)).map((group) => group.groupId)
  if (missing.length) fail(`摘要缺少题组：${missing.join(', ')}`)
  const output = path.join(ctx.paperDir, request.outputFile || 'paragraph-summaries-v1.json')
  archive(ctx, output)
  writeJson(output, {
    schemaVersion: 'paragraph-summaries-v1', paperId: request.paperId, sourceDigest: request.sourceDigest,
    candidateDigest: request.candidateDigest,
    groups: request.groups.map((group) => ({ groupId: group.groupId, paragraphs: authored.get(group.groupId).paragraphs })),
  }, 'wx')
  await run(ctx, 'verify-summaries', cli('review.mjs', 'verify-summaries', ctx.paperId))
  return { groups: request.groups.length, paragraphs: request.groups.reduce((sum, group) => sum + group.targets.length, 0) }
}

async function installListening(ctx) {
  const result = ctx.state.data.listeningSegmentAttempt
  if (!result?.review || !existsSync(result.review)) fail('缺少听力分段规则结果；先运行 after-proofread')
  const report = readJson(result.review)
  const retained = await retainOwnerListening({
    paperDir: ctx.paperDir, attempt: result.attempt, report,
    verify: () => run(ctx, 'verify-listening', cli('review.mjs', 'verify-listening-review', ctx.paperId)),
    log: say,
  })
  if (retained) return retained
  for (const file of report.evidence) {
    const source = path.join(result.attempt, file.path)
    const target = path.join(ctx.paperDir, file.path)
    const bytes = readFileSync(source)
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.byteLength) fail(`听力证据已变化：${file.path}`)
    mkdirSync(path.dirname(target), { recursive: true })
    if (existsSync(target)) {
      if (sha256(readFileSync(target)) !== file.sha256) fail(`不可覆盖旧听力证据：${file.path}`)
    } else writeFileSync(target, bytes, { flag: 'wx' })
  }
  await run(ctx, 'finalize-listening', cli('review.mjs', 'finalize-listening-review', ctx.paperId, '--input', result.review))
  await run(ctx, 'verify-listening', cli('review.mjs', 'verify-listening-review', ctx.paperId))
  return { groups: report.groups.length, usable: report.groups.filter(g => g.decision === 'usable').length,
    evidence: report.evidence.length, ruleVersion: readJson(path.join(result.attempt, 'rule-result.json')).rule.version }
}

export async function sourceReferences(ctx, execute = run) {
  const outline = await execute(ctx, 'references', cli('ocr-proofread.mjs', 'references', ctx.paperId))
  const request = path.join(ctx.fast, 'source-references-request.json')
  archive(ctx, request)
  const draft = readJson(path.join(ctx.work, 'source-references-draft.json'))
  const cellContinuation = sourceReferenceCellContinuations(draft).length > 0
  await execute(ctx, 'answer-products-prepare', cli('answer-products.mjs', 'prepare', '--paper-dir', ctx.paperDir,
    '--output', request, ...(cellContinuation ? ['--adjacent-cell-sidecar', path.join(ctx.work, 'source-references-draft.json')]
      : draft.schemaVersion === 'source-references-v5' ? ['--figure-exclusions']
      : draft.schemaVersion === 'source-references-v4' ? ['--scoring-figures']
      : draft.schemaVersion === 'source-references-v3' ? ['--figures']
      : draft.schemaVersion === 'source-references-v2' ? ['--structured-scoring'] : [])))
  const prepared = readJson(request)
  const template = prepared.template
  // Prepare may retain only an exactly bound existing review; it never fills
  // reviewer/finding/verdict. Pending relations stop before finalize or freeze.
  if (cellContinuation && prepared.adjacentPageCellContinuationRequest.status !== 'review_record_retained') {
    throw new Stop(`相邻页评分格续接待独立双页原图审核：${request}；填写 proposal 中的实际 review 后保存到 source-references-draft.json，再恢复 finish`)
  }
  const input = path.join(ctx.fast, 'source-references-input.json')
  archive(ctx, input)
  writeJson(input, cellContinuation ? prepared.adjacentPageCellContinuationRequest.proposal
    : { ...draft, sourceDigest: template.sourceDigest, candidateDigest: template.candidateDigest,
      materializationDigest: template.materializationDigest })
  archive(ctx, path.join(ctx.paperDir, 'source-references-v1.json'))
  await execute(ctx, 'answer-products-finalize', cli('answer-products.mjs', 'finalize', '--paper-dir', ctx.paperDir,
    '--input', input, '--output', path.join(ctx.paperDir, 'source-references-v1.json')))
  return { producerVersion: outline.producerVersion, outline: outline.outline }
}

function screenAccount() {
  if (!target.local) {
    const password = execFileSync('security', ['find-generic-password', '-a', target.username, '-s', AGENT_KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\n$/u, '')
    return { appOrigin: target.origin, username: target.username, password }
  }
  const localReview = path.join(scripts, 'local-review.mjs')
  const status = lastJson(spawnSync(process.execPath, [localReview, 'status'], { cwd: root, env, encoding: 'utf8' }).stdout)
  const owner = lastJson(spawnSync(process.execPath, [localReview, 'owner', '--username', 'localqa'], { cwd: root, env, encoding: 'utf8' }).stdout)
  if (!status?.appOrigin || !owner?.passwordFile) return null
  return { appOrigin: status.appOrigin, username: 'localqa', password: readFileSync(owner.passwordFile, 'utf8').trim() }
}

async function screenTiles(ctx, revisionId, qa) {
  const account = screenAccount()
  if (!account) return { skipped: 'local Review 或本地 Owner 不可用' }
  const url = `${account.appOrigin}/?view=paper-browse&paperId=${ctx.paperId}&reviewRevision=${revisionId}`
  const { chromium } = createRequire(path.join(root, 'server/package.json'))('playwright-core')
  // Chromium sends the same post-quantum key share that review.mjs avoids (see its tls note).
  const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--disable-features=PostQuantumKyber'] })
  const full = path.join(qa, 'screen-full.png')
  // A single reset connection (net::ERR_CONNECTION_CLOSED) otherwise blocks a paper already submitted.
  const visit = (page, target) => page.goto(target, { waitUntil: 'networkidle' }).catch(async (error) => {
    if (!/net::ERR_/u.test(error.message)) throw error
    await page.waitForTimeout(3000)
    return page.goto(target, { waitUntil: 'networkidle' })
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    await visit(page, `${account.appOrigin}/`)
    const username = page.locator('input[autocomplete="username"]')
    // The form renders only after the session probe answers; count() alone races it.
    if (await username.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
      await username.fill(account.username)
      await page.locator('input[autocomplete="current-password"]').fill(account.password)
      // The page is already idle, so waiting for networkidle would let the next goto cancel the login.
      const [login] = await Promise.all([
        page.waitForResponse((response) => response.url().includes('/api/auth/login')),
        page.keyboard.press('Enter'),
      ])
      if (!login.ok()) return { skipped: `${account.username} 登录失败（HTTP ${login.status()}）` }
      await username.waitFor({ state: 'detached' })
    }
    await visit(page, url)
    if (await page.locator('input[autocomplete="username"]').count()) return { skipped: 'Screen 仍停在登录页' }
    // PaperFontGate shows its notice only after networkidle, then swaps in the paper once fonts load;
    // waiting for the notice to detach can pass before it ever appears.
    const rendered = await page.waitForFunction(() => document.fonts.status === 'loaded'
      && !document.body.innerText.includes('正在加载试卷字体') && document.body.innerText.length > 2000,
    null, { timeout: 90000 }).then(() => true, () => false)
    if (!rendered) return { skipped: 'Screen 90 秒内未渲染出卷面' }
    await page.waitForTimeout(1500)
    await page.screenshot({ path: full, fullPage: true })
  } finally {
    await browser.close()
  }
  for (const name of readdirSync(qa)) if (name.startsWith('screen-tile-')) rmSync(path.join(qa, name))
  execFileSync('magick', [full, '-crop', '1280x1500', '+repage', path.join(qa, 'screen-tile-%02d.png')])
  return { url, tiles: readdirSync(qa).filter((name) => name.startsWith('screen-tile-')).length }
}

function pdfContactSheets(ctx) {
  const qa = path.join(ctx.work, 'handoff/qa')
  mkdirSync(qa, { recursive: true })
  const temp = mkdtempSync(path.join(os.tmpdir(), 'eqb-fast-qa-'))
  try {
    for (const product of productSet(ctx).products) {
      const pdf = path.join(ctx.paperDir, 'products', `${product}.pdf`)
      execFileSync('pdftoppm', ['-r', '28', '-png', pdf, path.join(temp, product)])
      const pages = readdirSync(temp).filter((name) => name.startsWith(`${product}-`))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })).map((name) => path.join(temp, name))
      // Plain append instead of `montage`, which needs a resolvable default font.
      const rows = []
      for (let index = 0; index < pages.length; index += 6) {
        rows.push('(', ...pages.slice(index, index + 6), '-bordercolor', '#9a9a9a', '-border', '6', '+append', ')')
      }
      execFileSync('magick', [...rows, '-background', '#9a9a9a', '-gravity', 'west', '-append',
        path.join(qa, `contact-${product}.png`)])
      execFileSync('pdftotext', ['-layout', pdf, path.join(qa, `${product}.txt`)])
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
  return { dir: path.relative(root, qa) }
}

function referencesCurrent(ctx) {
  // This is only a cache probe. Old/partial artifacts are stale, never an
  // admission success or a reason to block the guarded native rebuild.
  try {
    const references = ctx.state.steps['source-references']
    const draftPath = path.join(ctx.work, 'source-references-draft.json')
    const finalizedPath = path.join(ctx.paperDir, 'source-references-v1.json')
    const hasDraft = existsSync(draftPath)
    const draft = hasDraft ? readJson(draftPath) : null
    const finalized = existsSync(finalizedPath) ? readJson(finalizedPath) : null
    if (!Array.isArray(finalized?.groups) || (hasDraft && !Array.isArray(draft?.groups))) return false
    if (sourceReferenceCellContinuations(draft).length || sourceReferenceCellContinuations(finalized).length) {
      const loaded = loadNck1ReviewSource(ctx.paperDir)
      const imported = importNck1ReviewCandidate(ctx.paperDir, loaded)
      if (!imported.candidate || imported.issues.length) return false
      const input = { materialization: loaded.materialization, sourceInput: loaded.sourceInput,
        sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest }
      const refreshed = refreshSourceReferenceCellContinuations(
      { ...input, producerVersion: finalized.producerVersion }, draft ?? finalized)
      if (refreshed.pending || digestJson(refreshed.sidecar) !== digestJson(finalized)) return false
      assertSourceReferenceAdmission({ ...input, sidecar: finalized })
    }
    // Any supported historical producer version is a cache hit as generated;
    // only missing/unsupported versions or a changed binding force a rebuild.
    // The draft/finalized pair keeps its declared version; the step marker
    // must agree with it.
    if (hasDraft && finalized.producerVersion !== draft.producerVersion) return false
    const declared = finalized.producerVersion ?? draft?.producerVersion
    if (!declared || references?.result?.producerVersion !== declared) return false
    return Boolean(references?.finishedAt && sourceReferenceProducerVersion(finalized))
  } catch { return false }
}

function reconciliationOrigin() {
  if (!target.local) return target.origin
  const state = readJson(path.join(root, 'imports/local-review/state.json'))
  const url = new URL(state.apiOrigin)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) fail('Local Review origin invalid')
  return url.origin
}

function failureDetails(bytes) {
  const text = bytes.toString('utf8')
  let parsed
  try { parsed = JSON.parse(text) } catch { /* Review CLI error lines are also supported. */ }
  const matches = [...text.matchAll(/^(?:HTTP\s+)?([45]\d\d)\s+([A-Z][A-Z0-9_]+)(?:\s|$)/gmu)]
  const found = matches.map(m => ({ httpStatus: Number(m[1]), errorCode: m[2] }))
  if (parsed && Number.isInteger(parsed.httpStatus ?? parsed.statusCode)
    && typeof parsed.errorCode === 'string') {
    found.push({ httpStatus: parsed.httpStatus ?? parsed.statusCode, errorCode: parsed.errorCode })
  }
  if (found.length !== 1 || found[0].httpStatus < 400 || found[0].httpStatus > 599
    || !/^[A-Z][A-Z0-9_]+$/u.test(found[0].errorCode)) fail('UNKNOWN: 失败证据缺少唯一明确的 HTTP 4xx/5xx 和错误 code')
  return found[0]
}

function latestPushAttempt(ctx, push) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(push?.attemptId || '')) fail('UNKNOWN: push 缺少尝试身份')
  const lines = readFileSync(path.join(ctx.fast, 'push-attempts.jsonl'), 'utf8').trim().split('\n')
  const attempts = lines.map(line => JSON.parse(line))
  const last = attempts.at(-1)
  if (!last || last.paperId !== ctx.paperId || last.attemptId !== push.attemptId || last.startedAt !== push.startedAt
    || attempts.filter(item => item.attemptId === push.attemptId).length !== 1
    || digestJson(readJson(ctx.statePath).steps?.push) !== digestJson(push)) fail('UNKNOWN: push 不是最新尝试')
}

function attemptFailure(ctx, push, file, bytes) {
  try {
    latestPushAttempt(ctx, push)
    if (path.resolve(file) !== path.resolve(ctx.logs, `push-${push.attemptId}.log`)) fail('日志路径不符')
    const lines = bytes.toString('utf8').trim().split('\n')
    const header = JSON.parse(lines[0]), exit = JSON.parse(lines.at(-1))
    if (header.type !== 'fast-push-attempt-v1' || header.paperId !== ctx.paperId
      || header.attemptId !== push.attemptId || header.startedAt !== push.startedAt
      || exit.type !== 'fast-push-exit-v1' || exit.attemptId !== push.attemptId
      || !Number.isInteger(exit.code) || exit.code === 0 || exit.signal !== null) fail('尝试结果不符')
    return failureDetails(bytes)
  } catch (error) { fail(`UNKNOWN: 不能证明失败证据属于最新 push：${error.message}`) }
}

// The append-only attempt history takes precedence over the legacy push marker.
// A newer or malformed record makes the observation unusable.
function zeroCandidateAttempt(ctx, push, file, observedAt) {
  if (digestJson(readJson(ctx.statePath).steps?.push) !== digestJson(push)) fail('UNKNOWN: push 状态已变化')
  const history = path.join(ctx.fast, 'push-attempts.jsonl')
  if (existsSync(history)) {
    const lines = readFileSync(history, 'utf8').trim().split('\n')
    const attempts = lines.map(line => JSON.parse(line))
    const last = attempts.at(-1)
    if (!last || last.paperId !== ctx.paperId || last.startedAt !== push.startedAt
      || !last.attemptId || last.attemptId !== push.attemptId) fail('UNKNOWN: push 不是最新尝试')
  } else if (push.attemptId) fail('UNKNOWN: push 尝试记录缺失')
  const expected = push.attemptId ? `push-${push.attemptId}.log` : 'push.log'
  if (path.resolve(file) !== path.resolve(ctx.logs, expected)) fail('UNKNOWN: push 日志路径不符')
  const started = Date.parse(push.startedAt), observed = Date.parse(observedAt)
  if (!Number.isFinite(started) || !Number.isFinite(observed) || observed - started <= 30 * 60 * 1000) {
    fail('UNKNOWN: 最后一次 push 未超过 30 分钟')
  }
}

function statusObservation(raw, paperId, startedAt) {
  const status = JSON.parse(raw)
  if (status.paperId !== paperId || !Array.isArray(status.revisions)
    || !Object.hasOwn(status, 'latest') || !Object.hasOwn(status, 'latestRevisionId')) fail('UNKNOWN: Review status 不完整或 paperId 不匹配')
  if ((status.latest?.id ?? null) !== (status.latestRevisionId ?? null)
    || (status.latest && !status.revisions.some(revision => revision.id === status.latest.id))
    || (status.revisions.length > 0 && !status.latest)) fail('UNKNOWN: Review latest 不一致')
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) fail('UNKNOWN: push startedAt 无效')
  const candidates = []
  for (const revision of status.revisions) {
    if (!revision || revision.paperId !== paperId || !revision.id || !['candidate', 'ocr'].includes(revision.reviewKind)
      || typeof revision.state !== 'string') fail('UNKNOWN: Review revision 不完整')
    if (revision.reviewKind !== 'candidate') continue
    if (revision.state === 'uploading' && !revision.finalizedAt) {
      candidates.push({ id: revision.id, state: revision.state, finalizedAt: null })
      continue
    }
    const finalized = Date.parse(revision.finalizedAt)
    if (!Number.isFinite(finalized)) fail('UNKNOWN: Candidate 缺少有效 finalizedAt')
    fail('SOURCE_REFERENCES_RECONCILIATION_REQUIRED: 已存在 finalize 的 Candidate')
  }
  return { latestRevisionId: status.latestRevisionId, latest: status.latest && {
    id: status.latest.id, reviewKind: status.latest.reviewKind, state: status.latest.state,
  }, candidates }
}

function reconciliationReceipt(ctx, origin) {
  const push = ctx.state.steps.push
  if (!push?.startedAt || push.finishedAt) return false
  try {
    const dir = path.join(ctx.fast, 'push-reconciliation')
    for (const name of readdirSync(dir).filter(name => /^receipt-[0-9a-f]{64}\.json$/u.test(name))) {
      const receipt = readJson(path.join(dir, name))
      if (name !== `receipt-${digestJson(receipt).slice(7)}.json` || receipt.schema !== 'fast-push-reconciliation-v1'
        || receipt.paperId !== ctx.paperId || receipt.origin !== origin || receipt.pushStartedAt !== push.startedAt
        || receipt.pushDigest !== digestJson(push) || digestJson(receipt.pushRecord) !== receipt.pushDigest) continue
      const failure = readFileSync(receipt.failurePath)
      const snapshot = readFileSync(path.join(dir, receipt.failureSnapshot))
      const statusBytes = readFileSync(path.join(dir, receipt.statusReceipt))
      if (sha256(failure) !== receipt.failureSha256 || sha256(snapshot) !== receipt.failureSha256
        || sha256(statusBytes) !== receipt.statusReceiptSha256) continue
      const statusReceipt = JSON.parse(statusBytes)
      if (statusReceipt.origin !== origin || statusReceipt.paperId !== ctx.paperId
        || !Number.isFinite(Date.parse(statusReceipt.observedAt))
        || sha256(statusReceipt.response) !== statusReceipt.responseSha256) continue
      const observation = statusObservation(statusReceipt.response, ctx.paperId, push.startedAt)
      if (stableStringify(observation) !== stableStringify(receipt.observation)) continue
      if (receipt.method === 'zero-candidate') {
        zeroCandidateAttempt(ctx, push, receipt.failurePath, statusReceipt.observedAt)
        if (observation.candidates.length !== 0) continue
      } else if (stableStringify(attemptFailure(ctx, push, receipt.failurePath, failure)) !== stableStringify(receipt.failure)) continue
      return true
    }
  } catch { return false }
  return false
}

function reconciledPush(ctx) {
  try { return reconciliationReceipt(ctx, reconciliationOrigin()) } catch { return false }
}

export async function reconcilePush(ctx, failurePath, { readStatus, origin } = {}) {
  const push = ctx.state.steps.push
  if (!push?.startedAt || push.finishedAt || !Number.isFinite(Date.parse(push.startedAt))) fail('需要未完成的 push 记录')
  if (!failurePath) fail('reconcile-push 需要 --failure-receipt <路径>')
  const file = path.resolve(failurePath)
  const failureBytes = readFileSync(file)
  let failure, method
  try {
    failure = attemptFailure(ctx, push, file, failureBytes)
  } catch {
    method = 'zero-candidate'
    zeroCandidateAttempt(ctx, push, file, new Date().toISOString())
  }
  origin ||= reconciliationOrigin()
  const statusReader = readStatus || (() => {
    const args = cli('review.mjs', 'status', ctx.paperId, '--raw-response')
    const argv = target.local ? [path.join(scripts, 'local-review.mjs'), 'run', '--', process.execPath, ...args] : args
    const result = spawnSync(process.execPath, argv, { cwd: root, env: reviewEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    if (result.error || result.status !== 0 || result.signal) fail(`UNKNOWN: Review status 失败 ${result.error?.message || result.stderr || ''}`)
    return result.stdout
  })
  let raw
  try { raw = await statusReader() } catch (error) { fail(`UNKNOWN: Review status 失败：${error.message}`) }
  if (typeof raw !== 'string') fail('UNKNOWN: Review status 响应无效')
  const dir = path.join(ctx.fast, 'push-reconciliation')
  mkdirSync(dir, { recursive: true })
  const id = randomUUID()
  const statusName = `status-${id}.json`, failureName = `failure-${id}.bin`
  const statusReceipt = { paperId: ctx.paperId, origin, observedAt: new Date().toISOString(),
    responseSha256: sha256(raw), response: raw }
  writeJson(path.join(dir, statusName), statusReceipt, 'wx')
  let observation
  try { observation = statusObservation(raw, ctx.paperId, push.startedAt) } catch (error) {
    fail(`UNKNOWN: Review status 无法对账：${error.message}`)
  }
  // Fail closed if another process changed the in-memory or persisted push while status was read.
  if (method === 'zero-candidate') {
    zeroCandidateAttempt(ctx, push, file, statusReceipt.observedAt)
    if (observation.candidates.length) fail('UNKNOWN: 已存在 Candidate')
  } else latestPushAttempt(ctx, push)
  writeFileSync(path.join(dir, failureName), failureBytes, { flag: 'wx' })
  const receipt = { schema: 'fast-push-reconciliation-v1', paperId: ctx.paperId, origin,
    pushStartedAt: push.startedAt, pushDigest: digestJson(push), pushRecord: structuredClone(push), failurePath: file,
    failureSnapshot: failureName, failureSha256: sha256(failureBytes), ...(method ? { method } : { failure }),
    statusReceipt: statusName, statusReceiptSha256: sha256(readFileSync(path.join(dir, statusName))), observation }
  const receiptPath = path.join(dir, `receipt-${digestJson(receipt).slice(7)}.json`)
  writeJson(receiptPath, receipt, 'wx')
  return { receipt: receiptPath, ...receipt }
}

export async function reconcileOcrGeneration(ctx, failurePath, { readStatus, origin } = {}) {
  const operationPath = path.join(ctx.fast, 'ocr-generation-operation.json')
  if (!existsSync(operationPath)) fail('UNKNOWN: OCR operation 缺失')
  const initialOperation = readFileSync(operationPath)
  return withOcrReconcileLock(ctx, async () => {
    if (!existsSync(operationPath) || !readFileSync(operationPath).equals(initialOperation)) fail('UNKNOWN: OCR operation 已变化')
    const lock = path.join(ctx.fast, 'ocr-generation.lock')
    if (!existsSync(operationPath)) fail('UNKNOWN: OCR operation 缺失')
    const operationBytes = readFileSync(operationPath)
    const op = JSON.parse(operationBytes), plan = op.plan
    if ((!existsSync(lock) && op.completedAt) || op.revisionId
      || plan?.schemaVersion !== 'fast-ocr-generation-plan-v1' || plan.paperId !== ctx.paperId
      || !plan.expectedBaseRevisionId || !/^sha256:[a-f0-9]{64}$/u.test(plan.evidenceDigest || '')
      || !Number.isFinite(Date.parse(op.startedAt))) fail('UNKNOWN: OCR operation 无法安全闭合')
    if (!failurePath || path.resolve(failurePath) !== path.resolve(ctx.logs, 'push-ocr.log')) fail('UNKNOWN: push-ocr 日志路径不符')
    const bytes = readFileSync(failurePath), lines = bytes.toString('utf8').split('\n')
    const prefix = `$ scripts/import-pipeline/review.mjs push-ocr ${ctx.paperId} --ocr-generation-plan `
    if (!lines[0].startsWith(prefix) || !lines.includes('--- stderr')
      || statSync(failurePath).mtimeMs < Date.parse(op.startedAt)) fail('UNKNOWN: push-ocr 日志与操作不符')
    const loggedPlan = lines[0].slice(prefix.length)
    if (!loggedPlan || digestJson(readJson(path.resolve(root, loggedPlan))) !== digestJson(plan)) fail('UNKNOWN: push-ocr 计划不符')
    const logText = bytes.toString('utf8')
    const statusLines = [...logText.matchAll(/^(?:HTTP\s+)?[1-5]\d\d(?:\s|$)/gmu)]
    if (statusLines.length !== 1 || /fetch\s+failed|econnreset|etimedout|timeout|socket|abort(?:ed)?|\b5\d\d\b/iu.test(logText)) {
      fail('UNKNOWN: 失败日志含不明确的网络、超时或 HTTP 状态')
    }
    const failure = failureDetails(Buffer.from(lines.slice(lines.indexOf('--- stderr') + 1).join('\n')))
    if (![400, 409, 422].includes(failure.httpStatus)) fail('UNKNOWN: HTTP 状态不允许闭合 OCR operation')
    origin ||= reconciliationOrigin()
    if (plan.origin !== origin) fail('UNKNOWN: Review origin 与计划不符')
    const statusReader = readStatus || (() => {
      const args = cli('review.mjs', 'status', ctx.paperId, '--raw-response')
      const argv = target.local ? [path.join(scripts, 'local-review.mjs'), 'run', '--', process.execPath, ...args] : args
      const result = spawnSync(process.execPath, argv, { cwd: root, env: reviewEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      if (result.error || result.status !== 0 || result.signal) fail(`UNKNOWN: Review status 失败 ${result.error?.message || result.stderr || ''}`)
      return result.stdout
    })
    const status = JSON.parse(await statusReader())
    if (status.paperId !== ctx.paperId || status.latestRevisionId !== plan.expectedBaseRevisionId
      || status.latest?.id !== status.latestRevisionId || !Array.isArray(status.revisions)
      || !status.revisions.some(revision => revision?.id === status.latestRevisionId)
      || status.revisions.some(revision => !revision || revision.paperId !== ctx.paperId || !revision.id
        || !revision.manifest || typeof revision.candidateDigest !== 'string'
        || [revision.candidateDigest, revision.evidenceDigest, revision.manifest.candidateDigest,
          revision.manifest.evidenceDigest].includes(plan.evidenceDigest))) fail('UNKNOWN: Review status 不完整或已有新修订')
    if (!readFileSync(operationPath).equals(operationBytes) || !readFileSync(failurePath).equals(bytes)) fail('UNKNOWN: 对账期间证据发生变化')
    const now = new Date().toISOString()
    writeJson(operationPath, { ...op, rejectedAt: now, rejection: { status: failure.httpStatus,
      code: failure.errorCode, receiptSha256: sha256(bytes) }, reconciledAt: now })
    archive(ctx, operationPath)
    if (existsSync(lock)) rmSync(lock, { recursive: true })
    return { reconciledAt: now, status: failure.httpStatus, code: failure.errorCode }
  })
}

async function withOcrReconcileLock(ctx, action) {
  const lock = path.join(ctx.fast, 'ocr-generation-reconcile.lock')
  try { mkdirSync(lock, { mode: 0o700 }) } catch (error) {
    if (error.code === 'EEXIST') fail('OCR_GENERATION_RECONCILIATION_REQUIRED: 对账或新代启动正在进行')
    throw error
  }
  try { return await action() } finally { rmdirSync(lock) }
}

function assertReferencesMutable(ctx) {
  const submitted = ['push', 'local-preview', 'screen', 'local-screen']
    // An unfinished upload is Candidate-specific UNKNOWN evidence until reconciled.
    .some(name => ctx.state.steps[name] && (name !== 'push' || !reconciledPush(ctx)))
  const retained = ['signals/review-restore.json', 'canonical-evidence/web-review-approval-v1.json', 'signals/qa-accepted.json',
    'signals/locally-published.json'].some(file => existsSync(path.join(ctx.paperDir, file)))
    || existsSync(path.join(ctx.work, 'handoff/evidence.json'))
  const initialization = path.join(ctx.paperDir, 'signals/source-intake-initialization.json')
  const hasBase = existsSync(initialization) && readJson(initialization).baseRevisionId
  // OCR and Candidate uploads share upload-timeline.jsonl; it proves neither kind.
  // Local rebuilds do not contact Review. Submission retains its existing bound transaction.
  if (submitted || retained || hasBase || ctx.state.data.candidateRevisionId || ctx.state.data.revisionId
    || ctx.state.data.baseRevisionId
    || ctx.state.data.localReport || ctx.state.data.status === 'local_ready') {
    throw Object.assign(new Error('SOURCE_REFERENCES_RECONCILIATION_REQUIRED: '
      + '已有本地 Candidate、push 或 preview 记录，禁止自动重建源参考；保留封存副本，在既有持锁 Review 绑定事务内只读对账。'),
    { code: 'SOURCE_REFERENCES_RECONCILIATION_REQUIRED' })
  }
}

export function assertReferenceProductsReady(ctx) {
  if (!referencesCurrent(ctx)) throw Object.assign(new Error(
    'SOURCE_REFERENCES_FINISH_REQUIRED: 源参考版本缺失、不受支持或绑定不一致；先运行 finish 并重新目检 PDF，再送审。'),
  { code: 'SOURCE_REFERENCES_FINISH_REQUIRED' })
  // A completion marker alone cannot prove that QA followed this reference generation.
  let previous = -Infinity
  for (const name of ['source-references', 'pagination-run', 'pagination-plan', 'freeze', 'pdf-qa']) {
    const entry = ctx.state.steps[name]
    const started = Date.parse(entry?.startedAt), finished = Date.parse(entry?.finishedAt)
    if (!Number.isFinite(started) || !Number.isFinite(finished) || started < previous || finished < started) {
      throw Object.assign(new Error(
        `SOURCE_REFERENCES_QA_REQUIRED: ${name} 未在本次源参考之后完成；先运行 finish ${ctx.paperId} --redo-from ${name} 并重新目检 PDF，再送审。`),
      { code: 'SOURCE_REFERENCES_QA_REQUIRED' })
    }
    previous = finished
  }
}

// Stage overrides keep the orchestration testable without launching rendering or Review writes.
export async function finish(ctx, args, { referenceStages = {} } = {}) {
  // Check Candidate-only local evidence before any state/log or product write.
  if (!referencesCurrent(ctx)) {
    assertReferencesMutable(ctx)
    redoFrom(ctx, 'source-references')
  }
  for (const [flag, edition, expected] of [
    ['--large-complete-page-limit', 'largeComplete', ['13', '14']],
    ['--large-no-listening-page-limit', 'largeNoListening', ['11', '12']],
  ]) {
    if (!args.includes(flag)) continue
    const requestedLimit = option(args, flag)
    if (!expected.includes(requestedLimit)) fail(`${flag} 只接受显式授权值 ${expected.join(' 或 ')}`)
    if (!productSet(ctx).editions.includes(edition)) fail(`${edition} 不属于本卷产品`)
    const key = `${edition}PageLimit`
    if (ctx.state.data[key] === Number(requestedLimit)) continue
    if (ctx.state.steps.push?.startedAt) fail('已开始送审的卷不可原地更改页数授权')
    if (Object.entries(ctx.state.background).some(([name, job]) => name.startsWith('pagination-') && alive(job.pid))) fail('分页仍在运行；待其退出后再修改授权')
    for (const name of ['pagination-run', 'pagination-plan', 'freeze', 'pdf-qa']) delete ctx.state.steps[name]
    archive(ctx, path.join(ctx.fast, 'pagination', edition))
    archive(ctx, path.join(ctx.paperDir, 'products'))
    delete ctx.state.background[`pagination-${edition}`]
    ctx.state.data[key] = Number(requestedLimit)
    ctx.state.data[`${key}Authorization`] = {
      // +1 ceilings stay under BUB-138; the +2 tier is the BUB-168 allowance.
      ...(Number(requestedLimit) === Number(expected[1]) ? EXTENDED_PAGE_LIMIT_AUTHORIZATION : LARGE_PAGE_LIMIT_AUTHORIZATION),
      recordedAt: new Date().toISOString(), pageLimit: Number(requestedLimit),
    }
    save(ctx)
  }
  const supplied = args.includes('--economy-page-limit')
  const requested = option(args, '--economy-page-limit')
  if (supplied && !['9', '10'].includes(requested)) fail('--economy-page-limit 只接受显式授权值 9 或 10')
  const limit = importEconomyPageLimit(ctx.paperId, supplied ? Number(requested) : ctx.state.data.economyPageLimit)
  if (limit !== (ctx.state.data.economyPageLimit ?? 8)) {
    if (ctx.state.steps.push?.startedAt) fail('已开始送审的卷不可原地更改省纸授权')
    const job = ctx.state.background['pagination-economy8']
    if (job && alive(job.pid)) fail('省纸分页仍在运行；待其退出后再修改授权')
    for (const name of ['pagination-run', 'pagination-plan', 'freeze', 'pdf-qa']) delete ctx.state.steps[name]
    archive(ctx, path.join(ctx.fast, 'pagination/economy8'))
    archive(ctx, path.join(ctx.paperDir, 'products'))
    delete ctx.state.background['pagination-economy8']
    ctx.state.data.economyPageLimit = limit
    ctx.state.data.economyPageLimitAuthorization = {
      ownerAuthorizedOn: ECONOMY_NINE_PAGE_OWNER_DATE, recordedAt: new Date().toISOString(), pageLimit: limit,
      ...(limit === 10 ? { basis: 'BUB-168' } : {}),
    }
    save(ctx)
  }
  await step(ctx, 'summaries', () => installSummaries(ctx))
  await step(ctx, 'search-metadata', async () => {
    await run(ctx, 'finalize-search-metadata', cli('review.mjs', 'finalize-search-metadata', ctx.paperId,
      '--input', path.join(ctx.fast, 'search-metadata-authored.json')))
    await run(ctx, 'verify-search-metadata', cli('review.mjs', 'verify-search-metadata', ctx.paperId))
    return { ok: true }
  })
  if (hasListening(ctx)) await step(ctx, 'listening-review', () => installListening(ctx))
  await step(ctx, 'ocr-correction-report', async () => {
    const entries = await run(ctx, 'report-entries', cli('ocr-proofread.mjs', 'report-entries', ctx.paperId))
    archive(ctx, path.join(ctx.paperDir, 'agent-ocr-correction-report-v2.json'))
    await run(ctx, 'finalize-ocr-report', cli('review.mjs', 'finalize-ocr-correction-report', ctx.paperId,
      '--input', path.join(ctx.work, 'ocr-correction-entries.json')))
    return { entries: entries.entries ?? null, skipped: entries.skipped?.length ?? null }
  })
  // Confirmed answer figures require their admitted v3 sidecar before the
  // pagination projection can load the Candidate.
  const stages = {
    'source-references': () => sourceReferences(ctx),
    'pagination-run': () => {
      const projection = buildNck1ReviewProjection(ctx.paperDir, { requireAnalyses: true })
      const { candidateDigest } = projection
      productSet(ctx, projection)
      startPagination(ctx, candidateDigest)
      return { candidateDigest }
    },
    'pagination-plan': () => mergePagination(ctx),
    freeze: async () => {
      const frozen = await run(ctx, 'freeze', cli('freeze-products.mjs', '--paper-dir', ctx.paperDir, '--parallel'))
      return Object.fromEntries(frozen.files.map((file) => [path.basename(file.path, '.pdf'), file.pageCount]))
    },
    'pdf-qa': () => pdfContactSheets(ctx),
    ...referenceStages,
  }
  for (const [name, produce] of Object.entries(stages)) await step(ctx, name, produce)
  const qa = ctx.state.steps['pdf-qa'].result
  const steps = ctx.state.steps
  say('\n待主 Agent 目检 PDF：')
  say(`- ${productSet(ctx).products.length} 份 PDF 缩略总览：${qa.dir}/contact-{${productSet(ctx).products.join(',')}}.png；文字版 ${qa.dir}/<产品>.txt`)
  say(`- 写作源参考分段：${JSON.stringify(steps['source-references'].result.outline)}`)
  say(`- 拼写审查：${JSON.stringify(steps.spelling.result)}；页数：${JSON.stringify(steps.freeze.result)}`)
  say(`没有阻塞问题再送审：fast-import.mjs submit ${ctx.paperId}（目标 ${target.local ? '本地 Review' : target.origin}）`)
}

// The Candidate upload. Under the batch submission rule it runs only after PDF QA found nothing
// blocking; `--resolves` carries Owner issues fixed by this revision.
export async function submit(ctx, args) {
  assertReferenceProductsReady(ctx)
  // Always re-read before a possibly cached push step; no preview/submit bypass.
  const gate = assertImportSubmissionReady(ctx.paperDir)
  if (gate.pendingOwnerListening?.length) {
    say('\n以下听力段保持非 usable 送审，待 Owner 听：')
    for (const group of gate.pendingOwnerListening) {
      say(`- ${group.segmentId}（题 ${group.questionNumbers.join('、')}）：${group.reason}`)
    }
    say(`生成听核包：node scripts/import-pipeline/listening-owner-review-pack.mjs ${ctx.paperId} --output <仓库外新目录>`)
  }
  const localPreview = args.includes('--local-preview')
  if (!localPreview && ctx.state.steps.push && !ctx.state.steps.push.finishedAt && !reconciledPush(ctx)) {
    fail('SOURCE_REFERENCES_RECONCILIATION_REQUIRED: 未完成的 push 须先只读对账，禁止重放')
  }
  if (localPreview && !target.local) fail('preview-local 只允许已绑定的 loopback Review，禁止访问生产')
  if (!ctx.state.steps['pdf-qa']?.finishedAt) fail('先运行 finish，并在 PDF 目检后再送审')
  const resolves = option(args, '--resolves')
  const pushed = await step(ctx, localPreview ? 'local-preview' : 'push', async () => {
    const result = await run(ctx, localPreview ? 'local-preview' : 'push', cli('review.mjs', 'push', ctx.paperId, ...(resolves ? ['--resolves', resolves] : [])), { review: true })
    return { revisionId: result.revisionId, state: result.state ?? result.status ?? null, target: target.local ? 'local' : target.origin }
  })
  const qa = path.join(ctx.work, 'handoff/qa')
  const screen = await step(ctx, localPreview ? 'local-screen' : 'screen', async () => {
    try {
      return await screenTiles(ctx, pushed.revisionId, qa)
    } catch (error) {
      return { skipped: tail(error.message, 3) }
    }
  })
  say(`\n${localPreview ? '已建立本机隔离预览' : '已送审'} ${pushed.revisionId}（${pushed.target}）。`)
  say(`- Screen：${screen.tiles ? `${path.relative(root, qa)}/screen-tile-NN.png（共 ${screen.tiles} 张）${screen.url}` : `未自动截图（${screen.skipped}）`}`)
  say(`抽查 Screen 后运行：fast-import.mjs report ${ctx.paperId}${localPreview ? ' --local-only' : ''} --screen "<抽查了什么>" --pdf "<看了什么>"`)
}

// ---------- report ----------

function fileEntry(evidenceDir, file) {
  return { path: path.relative(evidenceDir, file), sha256: sha256(readFileSync(file)) }
}

async function report(ctx, args) {
  const screenNote = option(args, '--screen')
  const pdfNote = option(args, '--pdf')
  if (!screenNote || !pdfNote) fail('report 需要 --screen 与 --pdf 说明主 Agent 实际看了什么')
  const steps = ctx.state.steps
  const localOnly = args.includes('--local-only')
  if (localOnly && !target.local) fail('本地报告只允许 loopback Review')
  const pushed = steps[localOnly ? 'local-preview' : 'push']?.result
  const screen = steps[localOnly ? 'local-screen' : 'screen']?.result
  if (!pushed?.revisionId || !screen?.url || !screen.tiles) fail('缺少本次精确 revision 的实际 Screen 截图')
  const handoff = path.join(ctx.work, 'handoff')
  const evidencePath = path.join(handoff, 'evidence.json')
  const now = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z')
  const paper = (name) => path.join(ctx.paperDir, name)
  const selection = productSet(ctx, buildNck1ReviewProjection(ctx.paperDir, { requireAnalyses: true }))
  const selectedProducts = selection.products
  const products = selectedProducts.map((product) => paper(`products/${product}.pdf`))
  const qa = (name) => path.join(handoff, 'qa', name)
  const edits = existsSync(path.join(ctx.work, 'materialization-edits.json'))
    ? readJson(path.join(ctx.work, 'materialization-edits.json')).edits : []
  const compile = steps.compile.result
  const listening = steps['listening-review']?.result
  const screenFiles = readdirSync(path.join(handoff, 'qa')).filter((name) => name.startsWith('screen-tile-')).sort().map(qa)
  const check = (detail, files) => ({ status: 'pass', checkedAt: now, detail, files: files.filter(existsSync).map((file) => fileEntry(handoff, file)) })
  const evidence = {
    schemaVersion: selection.hasListening ? 'preprocessing-handoff-evidence-v4' : 'preprocessing-handoff-evidence-v5',
    paperId: ctx.paperId,
    sourceDigest: steps.verify.result.sourceDigest,
    candidateDigest: steps.verify.result.candidateDigest,
    pdfs: selectedProducts.map((edition, index) => ({ edition, ...fileEntry(handoff, products[index]) })),
    screen: { url: screen.url, revisionId: pushed.revisionId },
    checks: {
      ocr: check(`扫描源共 ${readJson(path.join(ctx.work, 'trace.json')).pages.length} 页，Tesseract OCR 后由导题 Agent 对照原图逐行校对（${compile.items} 条，${compile.textCorrections} 处文字修正，${compile.uncertain} 处存疑）；${localOnly ? '本机隔离' : ''}服务器 proofread/pull 收据已绑定（${steps['ocr-review'].result.revisionId}）。可精确定位的识别修正写入更正报告。`,
        [path.join(ctx.work, 'proofread-input.json'), paper('agent-ocr-correction-report-v2.json')]),
      sourceExtraction: check(`Materialization 由服务器 producer 从确认文本生成；Agent 编辑 ${edits.length} 处，逐条记录在编辑日志。写作源参考按答案卷行几何重建段落。`,
        [path.join(ctx.work, 'materialization-edits.json'), paper('source-references-v1.json')]),
      answerTranscription: check(`校对 worker 对照答案页原图逐题抄录，与答案键比对 ${steps['answer-check'].result.compared}/${steps['answer-check'].result.compared} 一致，无 AI 解题。`,
        [qa('answer-key-comparison.json'), paper('signals/ai-answer-check.json')]),
      ...(listening ? { listeningPlayback: check(`Apple SpeechAnalyzer 主转写，失败组 Whisper 单次复核；按 ${listening.ruleVersion} 判定，${listening.groups} 组中 ${listening.usable} 组 usable，保留 ${listening.evidence} 份证据。仅为 ASR 与源文比对的教师导航结论，不是直接听审、逐字或全录音认证。`,
        [paper('listening-review-v1.json')]) } : !selection.hasListening ? {
        listeningPlayback: { status: 'not_applicable', detail: '来源明确声明原卷设计无听力，Canonical 听力题组为零，不执行音频与 ASR 步骤。' },
      } : {}),
      screenVisual: check(screenNote, screenFiles),
      pdfContent: check(`${selectedProducts.length} 份冻结 PDF：${selectedProducts.map((product) => `${product} ${steps.freeze.result[product]} 页`).join('、')}。${pdfNote}`,
        [...products, qa('contact-answerOnly.png')]),
      pdfVisual: check(`${selectedProducts.length} 份 PDF 全部页面低分辨率缩略总览。${pdfNote}`,
        [...products, ...selectedProducts.map((product) => qa(`contact-${product}.png`))]),
    },
  }
  archive(ctx, evidencePath)
  writeJson(evidencePath, evidence)
  const output = path.join(handoff, '校正报告与预处理完成表.md')
  archive(ctx, output)
  await run(ctx, 'preprocessing-report', cli('review.mjs', 'preprocessing-report', ctx.paperId,
    '--evidence', evidencePath, '--output', output), { review: true })
  if (localOnly) {
    ctx.state.data.status = 'local_ready'
    ctx.state.data.localReport = path.relative(root, output)
    save(ctx)
  }
  const total = Object.values(steps).reduce((sum, entry) => sum + (entry.seconds || 0), 0)
  say(JSON.stringify({ ok: true, evidence: path.relative(root, evidencePath), report: path.relative(root, output),
    revisionId: pushed.revisionId, status: localOnly ? 'local_ready' : 'reported', machineSeconds: Math.round(total) }, null, 2))
}

function status(ctx) {
  const background = Object.fromEntries(Object.entries(ctx.state.background)
    .map(([name, job]) => [name, alive(job.pid) ? 'running' : 'exited']))
  say(JSON.stringify({
    steps: Object.fromEntries(Object.entries(ctx.state.steps).map(([name, entry]) => [name, entry.finishedAt ? `${entry.seconds}s` : 'started'])),
    background,
  }, null, 2))
}

const STEP_ORDER = [
  'flags-present', 'compile', 'ocr-review', 'materialize', 'chinese-numbering', 'presentation', 'figure-sizes', 'subtitles-watermarks',
  'spelling', 'verify', 'answer-check', 'build', 'round2-requests', 'asr-wait', 'asr-apple-rule-v2',
  'summaries', 'search-metadata', 'listening-review', 'ocr-correction-report', 'source-references', 'pagination-run',
  'pagination-plan', 'freeze', 'pdf-qa', 'local-preview', 'local-screen', 'push', 'screen',
]

// Forgets a step and everything after it, for re-deriving digest-bound outputs after an
// upstream Materialization edit; authored round-2 parts are keyed by IDs and are reused.
function redoFrom(ctx, name) {
  const index = STEP_ORDER.indexOf(name)
  if (index === -1) fail(`--redo-from 只接受：${STEP_ORDER.join(', ')}`)
  const redoPagination = index <= STEP_ORDER.indexOf('pagination-run')
  const paginationJobs = Object.entries(ctx.state.background).filter(([key]) => key.startsWith('pagination-'))
  if (redoPagination && paginationJobs.some(([, job]) => alive(job.pid))) fail('分页仍在运行；待其退出后再重做')
  // Retain PDF QA for the superseded products, without moving upstream answer checks or Screen tiles.
  const qa = path.join(ctx.work, 'handoff/qa')
  if (index <= STEP_ORDER.indexOf('pdf-qa') && existsSync(qa)) {
    for (const file of readdirSync(qa)) {
      if (/^(?:contact-(?:largeComplete|largeNoListening|economy8|answerOnly)\.png|(?:largeComplete|largeNoListening|economy8|answerOnly)\.txt)$/u.test(file)) {
        archive(ctx, path.join(qa, file))
      }
    }
  }
  for (const later of STEP_ORDER.slice(index)) {
    // The old push remains the binding until a later actual push starts.
    if (later === 'push' && reconciledPush(ctx)) continue
    delete ctx.state.steps[later]
  }
  if (index <= STEP_ORDER.indexOf('asr-apple-rule-v2')) delete ctx.state.data.listeningSegmentAttempt
  delete ctx.state.data.status
  delete ctx.state.data.localReport
  if (redoPagination) {
    archive(ctx, path.join(ctx.fast, 'pagination'))
    for (const [key] of paginationJobs) delete ctx.state.background[key]
  }
  // A retained listening review pins its Candidate digest and makes the projection refuse the
  // re-derived Candidate, so installed sidecars of forgotten steps move aside up front.
  for (const [owner, file] of [['summaries', 'paragraph-summaries-v1.json'], ['search-metadata', 'public-search-metadata-v1.json'],
    ['listening-review', 'listening-review-v1.json'], ['ocr-correction-report', 'agent-ocr-correction-report-v2.json'],
    ['source-references', 'source-references-v1.json'], ['pagination-plan', PAPER_PAGINATION_PLAN_FILE_NAME], ['freeze', 'products']]) {
    if (STEP_ORDER.indexOf(owner) >= index) archive(ctx, path.join(ctx.paperDir, file))
  }
  // The producer cache is keyed by its inputs, not its code: after a producer fix the cached
  // output would come back unchanged unless output, receipt, review and media move aside.
  const produced = path.join(ctx.paperDir, 'materialization')
  // Staged OCR evidence is immutable, so a recompile (e.g. a newly marked figure) starts a new OCR
  // generation: the old evidence, confirmation and receipts move aside and push-ocr creates a new
  // revision, which supersedes the old one in Review. Source bytes are unchanged and kept.
  if (STEP_ORDER.indexOf('compile') >= index) {
    for (const file of [path.join(produced, 'nck1-ocr-source-evidence-v1.json'), path.join(produced, 'nck1-ocr-source-confirmation-v1.json'),
      path.join(produced, 'agent-proofreading-receipt.json'), path.join(ctx.paperDir, 'signals', 'agent-proofreading-receipt.json')]) archive(ctx, file)
  }
  const receipt = path.join(produced, 'nck1-ocr-materialization-producer-receipt-v1.json')
  if (STEP_ORDER.indexOf('materialize') >= index && existsSync(receipt)) {
    for (const file of readJson(receipt).mediaFiles || []) archive(ctx, path.join(ctx.paperDir, file.path))
    for (const name of ['nck1-source-materialization-v1.json', 'nck1-ocr-materialization-review-v1.json']) archive(ctx, path.join(produced, name))
    archive(ctx, receipt)
  }
  save(ctx)
}

export async function requestedRedo(ctx, name) {
  // An explicit redo must not erase submission evidence before finish sees it.
  if (STEP_ORDER.includes(name) && (!referencesCurrent(ctx)
    || STEP_ORDER.indexOf(name) <= STEP_ORDER.indexOf('pdf-qa')
    || (ctx.state.steps.push && STEP_ORDER.indexOf(name) <= STEP_ORDER.indexOf('push')))) {
    assertReferencesMutable(ctx)
  }
  redoFrom(ctx, name)
}

export async function startOcrGeneration(ctx, planPath, checkPlan = async () => run(ctx, 'check-ocr-generation',
  cli('review.mjs', 'check-ocr-generation', ctx.paperId, '--ocr-generation-plan', path.resolve(planPath)), { review: true })) {
  return withOcrReconcileLock(ctx, async () => {
    assertReferencesMutable(ctx)
    const operationPath = path.join(ctx.fast, 'ocr-generation-operation.json')
    if (existsSync(operationPath) && !readJson(operationPath).completedAt) fail('OCR_GENERATION_RECONCILIATION_REQUIRED: 已有未闭合新代操作；先只读对账，勿自动重放')
    if (!ctx.state.steps.compile?.finishedAt) fail('显式新代要求先完成 compile 并审查计划，不在执行计划时重新 compile')
    const plan = readJson(path.resolve(planPath))
    await checkPlan()
    for (const [file, digest] of [
      ['signals/agent-proofreading-receipt.json', plan.baseReceiptDigest],
      ['materialization/nck1-ocr-source-confirmation-v1.json', plan.baseConfirmationDigest],
    ]) {
      const installed = path.join(ctx.paperDir, file)
      if (existsSync(installed) && digestJson(readJson(installed)) !== digest) fail('本地旧 OCR 安装与计划不符；保留证据并对账')
    }
    // Use the existing publication-operation lock convention: retain it on
    // failure and never infer that a response loss means no remote mutation.
    mkdirSync(path.join(ctx.fast, 'ocr-generation.lock'), { mode: 0o700 })
    if (existsSync(operationPath)) archive(ctx, operationPath)
    writeJson(operationPath, { plan, startedAt: new Date().toISOString() }, 'wx')
    const stateSnapshot = path.join(ctx.work, 'superseded', `ocr-generation-${digestJson(plan).slice(7)}-state.json`)
    if (existsSync(stateSnapshot)) archive(ctx, stateSnapshot, 'prior-')
    writeJson(stateSnapshot, ctx.state, 'wx')
    redoFrom(ctx, 'ocr-review')
    for (const [index, file] of [
      path.join(ctx.paperDir, 'signals/agent-proofreading-receipt.json'),
      path.join(ctx.paperDir, 'materialization/nck1-ocr-source-confirmation-v1.json'),
      path.join(ctx.paperDir, 'materialization/agent-proofreading-receipt.json'),
      path.join(ctx.paperDir, 'canonical-evidence'),
      path.join(ctx.work, 'ocr-correction-entries.json'),
      path.join(ctx.work, 'materialization-edits.json'),
      ...['summaries-parts', 'search-metadata-authored.json', 'spelling-request.json', 'spelling-review.json',
        'round2.json'].map(file => path.join(ctx.fast, file)),
    ].entries()) archive(ctx, file, `ocr-generation-${index}-`)
    // Retain old listening attempt directories as evidence; redoFrom forgets
    // their binding so the existing rule creates a new attempt for the new input.
  })
}

// Source-relationship edits start after producer/presentation. Reuse the
// existing redo archive and Candidate/submission guards, retaining sealed OCR.
// No OCR generation, push/reuse or CAS behavior changes here.
export async function invalidateParagraphJoinDownstream(paperId, expectedMaterializationSha256) {
  const ctx = context(paperId)
  if (sha256(readFileSync(materializationPath(ctx))) !== expectedMaterializationSha256) {
    fail('Paragraph join Materialization changed after plan validation')
  }
  assertReferencesMutable(ctx)
  await requestedRedo(ctx, 'spelling')
  const retained = path.join(ctx.work, 'superseded',
    `${new Date().toISOString().replace(/[:.]/gu, '-')}-paragraph-join-materialization.json`)
  mkdirSync(path.dirname(retained), { recursive: true })
  copyFileSync(materializationPath(ctx), retained)
  archive(ctx, path.join(ctx.paperDir, 'spelling-review-v1.json'))
  archive(ctx, path.join(ctx.paperDir, 'canonical-evidence'))
  // Joins change paragraph meaning while preserving IDs; require fresh authoring
  // instead of the matching-ID reuse intentionally retained by ordinary redo.
  for (const file of ['summaries-parts', 'search-metadata-authored.json', 'round2.json']) {
    archive(ctx, path.join(ctx.fast, file))
  }
  return { retained, invalidatedFrom: 'spelling' }
}

// Explanation decisions change only reference capture, not the source Candidate
// or upstream authored summaries. Archive all reference drafts/inputs so old
// reference content cannot be installed with freshly bound digests.
export function assertExplanationFigureMutable(paperId, sourcePaths = {}) {
  const ctx = { ...context(paperId), ...sourcePaths }
  const stateFile = path.join(ctx.fast, 'state.json')
  ctx.state = existsSync(stateFile) ? readJson(stateFile) : { paperId, steps: {}, background: {}, data: {} }
  const operation = path.join(ctx.fast, 'ocr-generation-operation.json')
  if (existsSync(path.join(ctx.fast, 'ocr-generation.lock'))
    || (existsSync(operation) && !readJson(operation).completedAt)) {
    fail('OCR_GENERATION_RECONCILIATION_REQUIRED: unresolved OCR operation; retain evidence')
  }
  assertReferencesMutable(ctx)
}

export async function invalidateExplanationFigureDownstream(paperId, expectedMaterializationSha256) {
  const ctx = context(paperId)
  if (sha256(readFileSync(materializationPath(ctx))) !== expectedMaterializationSha256) {
    fail('Explanation figure Materialization changed during validation')
  }
  assertExplanationFigureMutable(paperId)
  await requestedRedo(ctx, 'source-references')
  for (const file of [path.join(ctx.work, 'source-references-draft.json'),
    path.join(ctx.fast, 'source-references-request.json'), path.join(ctx.fast, 'source-references-input.json')]) archive(ctx, file)
  return { invalidatedFrom: 'source-references' }
}

const [command, paperId, ...args] = process.argv.slice(2)
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) try {
  const ctx = context(paperId)
  if (args.includes('--ocr-generation-plan') && (command !== 'after-proofread' || args.includes('--redo-from'))) {
    fail('--ocr-generation-plan 仅用于 after-proofread，不能与 --redo-from 合用')
  }
  if (args.includes('--ocr-generation-plan') && (!option(args, '--ocr-generation-plan')
    || option(args, '--ocr-generation-plan').startsWith('--'))) fail('--ocr-generation-plan requires <plan.json>')
  const operationPath = path.join(ctx.fast, 'ocr-generation-operation.json')
  if (['reconcile-push', 'reconcile-ocr-generation'].includes(command) && (args.length !== 2 || args[0] !== '--failure-receipt' || !args[1] || args[1].startsWith('--'))) {
    fail(`Usage: fast-import.mjs ${command} <paperId> --failure-receipt <路径>`)
  }
  if ((existsSync(path.join(ctx.fast, 'ocr-generation.lock'))
    || (existsSync(operationPath) && !readJson(operationPath).completedAt)) && !['status', 'reconcile-ocr-generation'].includes(command)) {
    fail('OCR_GENERATION_RECONCILIATION_REQUIRED: 新代操作未闭合；仅可只读 status 对账，禁止重放或 redo')
  }
  if (option(args, '--redo-from')) await requestedRedo(ctx, option(args, '--redo-from'))
  if (command === 'prep') await prep(ctx, args)
  else if (command === 'after-proofread') await afterProofread(ctx, args)
  else if (command === 'plan-ocr-generation') {
    const output = option(args, '--output'), reason = option(args, '--reason')
    if (!output || !reason) fail('plan-ocr-generation requires --reason and --output')
    say(JSON.stringify(await run(ctx, 'plan-ocr-generation', cli('review.mjs', 'plan-ocr-generation', ctx.paperId,
      '--reason', reason, '--output', path.resolve(output)), { review: true }), null, 2))
  }
  else if (command === 'finish') await finish(ctx, args)
  else if (command === 'reconcile-push') say(JSON.stringify(await reconcilePush(ctx, option(args, '--failure-receipt')), null, 2))
  else if (command === 'reconcile-ocr-generation') say(JSON.stringify(await reconcileOcrGeneration(ctx, option(args, '--failure-receipt')), null, 2))
  else if (command === 'submit') await submit(ctx, args)
  else if (command === 'preview-local') await submit(ctx, [...args, '--local-preview'])
  else if (command === 'report') await report(ctx, args)
  else if (command === 'status') status(ctx)
  else if (command === 'asr-extra') await asrExtra(ctx, args)
  else fail('Usage: fast-import.mjs <prep|after-proofread|finish|submit|reconcile-push|report|status|asr-extra> <paperId> …')
} catch (error) {
  if (error instanceof Stop) {
    console.error(`\n需要处理：${error.message}`)
    process.exitCode = 2
  } else {
    console.error(error.message)
    process.exitCode = 1
  }
}
