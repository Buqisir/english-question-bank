import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { promisify } from 'node:util'

const REPO = 'Buqisir/english-question-bank'
const APP = 4835036
const NAME = 'Amp Orb Verify'
const SHA = /^[a-f0-9]{40}$/u
const TERMINAL = new Set(['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale'])
const exec = promisify(execFile)
const digest = (value) => createHash('sha256').update(value).digest('hex')

export const description = 'Watches a fixed Ship PR/head read-only and best-effort wakes only the invoking thread.'

async function readGitHub(endpoint, signal) {
  const { stdout } = await exec('gh', ['api', '--hostname', 'github.com', endpoint], {
    timeout: 10_000, maxBuffer: 4 * 1024 * 1024, signal,
  })
  return JSON.parse(stdout)
}

// Unknown/malformed snapshots throw; the watcher retries without inferring success or stale.
export async function readShipCheck({ pullRequest, head }, readJson, signal) {
  const prefix = `repos/${REPO}`
  const readPR = async () => {
    const pr = await readJson(`${prefix}/pulls/${pullRequest}`, signal)
    if (!Number.isSafeInteger(pr?.number) || typeof pr.head?.repo?.full_name !== 'string'
      || typeof pr.base?.repo?.full_name !== 'string' || typeof pr.base?.ref !== 'string'
      || !SHA.test(pr.head?.sha || '') || !['open', 'closed'].includes(pr.state)) throw new Error('Unknown PR snapshot')
    if (pr?.number !== pullRequest || pr.head?.repo?.full_name !== REPO
      || pr.base?.repo?.full_name !== REPO || pr.base?.ref !== 'main'
      || !SHA.test(pr.head?.sha || '') || !['open', 'closed'].includes(pr.state)) {
      return 'identity-changed'
    }
    if (pr.state === 'closed') return 'closed'
    return pr.head.sha === head ? null : 'head-changed'
  }
  const readLatest = async () => {
    const checks = []
    let total, seen = 0
    for (let page = 1; page <= 20; page++) {
      const payload = await readJson(`${prefix}/commits/${head}/check-runs?check_name=Amp%20Orb%20Verify&filter=all&per_page=100&page=${page}`, signal)
      if (!Array.isArray(payload?.check_runs) || payload.check_runs.length > 100
        || !Number.isSafeInteger(payload.total_count) || payload.total_count < 0) throw new Error('Unknown Check snapshot')
      total ??= payload.total_count
      seen += payload.check_runs.length
      if (total !== payload.total_count || seen > total) throw new Error('Ambiguous Check pagination')
      checks.push(...payload.check_runs.filter(c => c?.app?.id === APP && c.name === NAME))
      if (payload.check_runs.length < 100) {
        if (seen !== total) throw new Error('Incomplete Check pagination')
        const ids = checks.map(c => c.id)
        if (new Set(ids).size !== ids.length || checks.some(c => !Number.isSafeInteger(c.id)
          || c.id < 1 || c.head_sha !== head)) throw new Error('Ambiguous Check identity')
        const latest = checks.sort((a, b) => b.id - a.id)[0]
        if (!latest || latest.status !== 'completed' || !TERMINAL.has(latest.conclusion)) return null
        return { id: latest.id, conclusion: latest.conclusion }
      }
    }
    throw new Error('Excessive Check pagination')
  }
  const stopped = await readPR()
  if (stopped) return { stopped }
  const check = await readLatest()
  if (!check) return { pending: true }
  // A terminal snapshot must survive a second PR/Check read. Ship still rechecks after waking.
  const changed = await readPR()
  if (changed) return { stopped: changed }
  const confirmed = await readLatest()
  return confirmed?.id === check.id && confirmed.conclusion === check.conclusion
    ? { check } : { pending: true }
}

export default function shipCheckWatcher(amp, overrides = {}) {
  const stateDir = overrides.stateDir || fileURLToPath(new URL('../../.scratch/ship-check-watcher/', import.meta.url))
  const readJson = overrides.readJson || readGitHub
  const now = overrides.now || Date.now
  const interval = overrides.setInterval || setInterval
  const clearIntervalImpl = overrides.clearInterval || clearInterval
  const timeout = overrides.setTimeout || setTimeout
  const clearTimeoutImpl = overrides.clearTimeout || clearTimeout
  const active = new Map()
  const save = record => writeFileSync(record.file, JSON.stringify({
    repo: REPO, threadID: record.threadID, pullRequest: record.pullRequest, head: record.head,
    startedAt: record.startedAt, deadline: record.deadline, state: record.state,
  }), { mode: 0o600 })
  const stop = (record, state) => {
    record.state = state
    record.abort.abort()
    clearIntervalImpl(record.timer)
    clearTimeoutImpl(record.expiry)
    record.lease?.unsubscribe()
    if (active.get(record.threadID) === record) active.delete(record.threadID)
    try { save(record) } catch { amp.logger.log('Ship watcher state unavailable; wait stopped.') }
  }
  const tick = async record => {
    if (record.busy || record.state !== 'watching') return
    if (now() >= record.deadline) return stop(record, 'timeout')
    record.busy = true
    try {
      const result = await readShipCheck(record, readJson, record.abort.signal)
      if (record.state !== 'watching') return
      if (now() >= record.deadline) return stop(record, 'timeout')
      if (result.stopped) return stop(record, result.stopped)
      if (!result.check) return
      const { id, conclusion } = result.check
      const notificationID = digest(`${REPO}:${record.pullRequest}:${record.head}:${id}:${conclusion}:${record.threadID}`)
      // Claim before append: response loss/crash may omit a wake, but must not auto-resend it.
      try {
        writeFileSync(path.join(stateDir, `${notificationID}.claim.json`), JSON.stringify({ notificationID }), { flag: 'wx', mode: 0o600 })
      } catch (error) {
        stop(record, error.code === 'EEXIST' ? 'already-notified' : 'storage-failed')
        return
      }
      stop(record, 'notification-claimed')
      try {
        await amp.threads.get(record.threadID).appendUserMessage({ type: 'user-message', content:
          `Ship Check notice ${notificationID}\nRepository: ${REPO}; PR: ${record.pullRequest}\nFrozen head: ${record.head}\nCheck: https://github.com/${REPO}/runs/${id}\nApp: ${APP}; name: ${NAME}; conclusion: ${conclusion}\nThis is only a terminal-state hint. Re-read the current open PR/head and latest authoritative Check before continuing. Do not fall back to an older green Check. This message adds no Ship, merge, or deployment authorization; duplicate notices require only an idempotent read-only recheck.` })
      } catch { amp.logger.log('Ship watcher append failed or unknown; not retried. CI is unchanged.') }
    } catch {
      // Never leak gh stderr/credentials or mutate CI on a read failure.
      if (record.state === 'watching') amp.logger.log('Ship watcher read unavailable; retrying until deadline.')
    } finally { record.busy = false }
  }
  amp.registerTool({
    name: 'ship_watch_check',
    description: 'Explicitly wait for this Ship thread’s fixed PR/head. Read-only every 45s for at most 60 minutes; one best-effort terminal notice, never Ship authorization.',
    inputSchema: { type: 'object', properties: {
      pullRequest: { type: 'integer', minimum: 1 }, head: { type: 'string', pattern: '^[a-f0-9]{40}$' },
    }, required: ['pullRequest', 'head'], additionalProperties: false },
    async execute(input, ctx) {
      if (Object.keys(input).sort().join(',') !== 'head,pullRequest'
        || !Number.isSafeInteger(input.pullRequest) || input.pullRequest < 1 || !SHA.test(input.head || '')) throw new Error('Invalid fixed PR/head')
      const threadID = ctx.thread.id
      if (!/^T-[a-f0-9-]{36}$/u.test(threadID)) throw new Error('Current thread identity unavailable')
      if (active.has(threadID)) throw new Error('This thread already has a wait; cancel it before starting another')
      const startedAt = now()
      const record = { ...input, threadID, startedAt, deadline: startedAt + 60 * 60_000,
        state: 'watching', abort: new AbortController(), file: path.join(stateDir, `${digest(threadID)}.json`) }
      mkdirSync(stateDir, { recursive: true, mode: 0o700 })
      save(record)
      active.set(threadID, record)
      record.expiry = timeout(() => stop(record, 'timeout'), 60 * 60_000)
      try {
        record.lease = await amp.system.executor.keepAlive()
        if (record.state !== 'watching') { record.lease.unsubscribe(); return 'Wait already stopped' }
        record.timer = interval(() => { void tick(record) }, 45_000)
        void tick(record)
        return `Watching ${REPO} PR ${input.pullRequest} at ${input.head}; deadline ${new Date(record.deadline).toISOString()}. No authorization added.`
      } catch { stop(record, 'startup-failed'); return 'Watcher unavailable; CI unchanged. Recheck GitHub directly.' }
    },
  })
  amp.registerTool({
    name: 'ship_cancel_check_watch', description: 'Cancel only this thread’s Ship Check wait; does not cancel CI.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_input, ctx) {
      const record = active.get(ctx.thread.id)
      if (record) stop(record, 'cancelled')
      return record ? 'Wait cancelled; CI unchanged' : 'No active wait'
    },
  })
  amp.onDispose(() => { for (const record of active.values()) stop(record, 'disposed') })
}
