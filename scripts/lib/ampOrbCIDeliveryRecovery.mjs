import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { validateAmpOrbCIQueueInput } from './ampOrbCI.mjs'

const REPOSITORY = 'Buqisir/english-question-bank'
const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const SHA = /^[a-f0-9]{40}$/u
const PR_ACTIONS = new Set(['opened', 'ready_for_review', 'reopened', 'synchronize'])
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1_000
const OBSERVATION_MS = 10 * 60 * 1_000
const ACCEPTANCE_GRACE_MS = 2 * 60 * 1_000
const MAX_REQUESTS_PER_GUID = 2
const MAX_REQUESTS_PER_RUN = 2
const TERMINAL_REASONS = new Set([
  'durable-local-acceptance',
  'late-durable-local-acceptance',
  'redelivery-outcome-unknown',
  'ambiguous-redelivery-history',
  'delivery-history-truncated',
  'http-success-without-local-acceptance',
  'unowned-redelivery-history',
  'non-retryable-delivery-failure',
  'redelivery-budget-exhausted',
  'delivery-identity-changed',
  'redelivery-request-rejected',
])

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
}

function readJson(filePath) {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function atomicWriteJson(filePath, value) {
  ensurePrivateDirectory(path.dirname(filePath))
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  } finally {
    closeSync(descriptor)
  }
  renameSync(temporary, filePath)
  chmodSync(filePath, 0o600)
}

function validDeliverySummary(delivery) {
  return Number.isSafeInteger(delivery?.id)
    && delivery.id > 0
    && GUID.test(delivery.guid || '')
    && Number.isFinite(Date.parse(delivery.delivered_at))
    && typeof delivery.redelivery === 'boolean'
    && Number.isSafeInteger(delivery.status_code)
    && typeof delivery.event === 'string'
    && (delivery.action === null || typeof delivery.action === 'string')
}

function allowedDelivery(delivery) {
  return delivery.event === 'push'
    ? delivery.action === null
    : delivery.event === 'pull_request' && PR_ACTIONS.has(delivery.action)
}

function validDetailedIdentity(delivery) {
  if (!validDeliverySummary(delivery) || !allowedDelivery(delivery)) return false
  const payload = delivery.request?.payload
  if (payload?.repository?.full_name !== REPOSITORY) return false
  if (delivery.event === 'push') {
    return payload.ref === 'refs/heads/main'
      && payload.deleted === false
      && SHA.test(payload.after || '')
      && SHA.test(payload.before || '')
  }
  return payload.action === delivery.action
    && Number.isSafeInteger(payload.number)
    && payload.number > 0
    && payload.pull_request?.head?.repo?.full_name === REPOSITORY
    && payload.pull_request?.base?.repo?.full_name === REPOSITORY
    && payload.pull_request?.base?.ref === 'main'
    && SHA.test(payload.pull_request?.head?.sha || '')
    && SHA.test(payload.pull_request?.base?.sha || '')
}

function retryAfterAt(delivery, now) {
  if (delivery.status_code !== 429) return now
  const headers = delivery.response?.headers
  const raw = headers?.['retry-after'] ?? headers?.['Retry-After']
  if (typeof raw !== 'string' || !/^\d+$/u.test(raw)) return now + 60_000
  return now + Math.max(1, Number(raw)) * 1_000
}

function acceptedDelivery(stateDir, delivery) {
  const { guid } = delivery
  const acceptedPath = path.join(stateDir, 'accepted-deliveries', `${guid}.json`)
  const accepted = readJson(acceptedPath)
  if (existsSync(acceptedPath)) {
    const valid = accepted?.schemaVersion === 'amp-orb-ci-accepted-delivery-v1'
      && accepted.deliveryId === guid
      && accepted.event === delivery.event
      && ['pull_request', 'push'].includes(accepted.event)
      && SHA.test(accepted.sha || '')
      && SHA.test(accepted.baseSha || '')
      && (accepted.event === 'pull_request'
        ? Number.isSafeInteger(accepted.pullRequestNumber) && accepted.pullRequestNumber > 0
        : accepted.pullRequestNumber === null)
    if (!valid) throw new Error('Amp Orb CI accepted delivery evidence is invalid')
    return true
  }
  const queuePath = path.join(stateDir, 'queue', `${guid}.json`)
  const queued = readJson(queuePath)
  if (!existsSync(queuePath)) return false
  const input = validateAmpOrbCIQueueInput(queued?.input)
  if (queued?.schemaVersion !== 'amp-orb-ci-queue-v1'
    || input.deliveryId !== guid
    || input.event !== delivery.event) {
    throw new Error('Amp Orb CI queued delivery evidence is invalid')
  }
  return true
}

function ledgerPath(stateDir, guid) {
  return path.join(stateDir, 'delivery-recovery', `${guid}.json`)
}

function writeLedger(stateDir, record) {
  atomicWriteJson(ledgerPath(stateDir, record.guid), record)
  return record
}

function baseRecord(delivery, now) {
  return {
    schemaVersion: 'amp-orb-ci-delivery-recovery-v1',
    guid: delivery.guid,
    event: delivery.event,
    action: delivery.action,
    firstObservedAt: new Date(now).toISOString(),
    requests: [],
  }
}

function validRecoveryRecord(record, guid) {
  if (record?.schemaVersion !== 'amp-orb-ci-delivery-recovery-v1'
    || record.guid !== guid
    || !allowedDelivery(record)
    || !Number.isFinite(Date.parse(record.firstObservedAt))
    || !Array.isArray(record.requests)
    || record.requests.length > MAX_REQUESTS_PER_GUID) return false
  if (record.requests.some((request, index) =>
    request?.sequence !== index + 1
    || !Number.isSafeInteger(request.sourceDeliveryId)
    || request.sourceDeliveryId < 1
    || !Number.isFinite(Date.parse(request.sourceDeliveredAt))
    || !Number.isFinite(Date.parse(request.requestedAt))
    || request.state !== 'unknown')) return false
  if (record.terminalAt !== undefined) {
    return ['accepted', 'manual-required'].includes(record.state)
      && Number.isFinite(Date.parse(record.terminalAt))
      && TERMINAL_REASONS.has(record.reason)
  }
  return record.state === 'redelivery-unknown' && record.requests.length > 0
}

function activeGlobalBackoff(stateDir, now) {
  const statusPath = path.join(stateDir, 'delivery-recovery-status.json')
  const status = readJson(statusPath)
  if (!existsSync(statusPath)) return null
  if (status?.state === undefined) {
    const validSummary = status?.schemaVersion === 'amp-orb-ci-delivery-recovery-status-v1'
      && Number.isFinite(Date.parse(status.recordedAt))
      && Number.isSafeInteger(status.scanned)
      && status.scanned >= 0
      && Number.isSafeInteger(status.requests)
      && status.requests >= 0
      && status.outcomes !== null
      && typeof status.outcomes === 'object'
      && !Array.isArray(status.outcomes)
    if (!validSummary) throw new Error('Amp Orb CI delivery recovery status is invalid')
    return null
  }
  if (status.schemaVersion !== 'amp-orb-ci-delivery-recovery-status-v1'
    || status.state !== 'blocked'
    || !['permission-denied', 'rate-limited', 'api-unavailable', 'invalid-configuration'].includes(status.code)
    || !Number.isFinite(Date.parse(status.recordedAt))
    || !Number.isFinite(Date.parse(status.nextAttemptAt))) {
    throw new Error('Amp Orb CI delivery recovery status is invalid')
  }
  return Date.parse(status.nextAttemptAt) > now ? status : null
}

function attemptsAfterIntent(deliveries, intent) {
  return deliveries
    .filter((delivery) => delivery.guid === intent.guid
      && delivery.redelivery
      && delivery.id !== intent.sourceDeliveryId
      && Date.parse(delivery.delivered_at) > Date.parse(intent.requestedAt))
    .sort((left, right) => Date.parse(right.delivered_at) - Date.parse(left.delivered_at))
}

function terminalRecord(record, state, now, reason) {
  return {
    ...record,
    state,
    reason,
    terminalAt: new Date(now).toISOString(),
  }
}

export async function recoverAmpOrbCIDeliveries({
  stateDir,
  listDeliveries,
  getDelivery,
  redeliver,
  now = () => Date.now(),
} = {}) {
  if (!stateDir || ![listDeliveries, getDelivery, redeliver].every((value) => typeof value === 'function')) {
    throw new Error('Amp Orb CI delivery recovery dependencies are missing')
  }
  const started = now()
  const globalBackoff = activeGlobalBackoff(stateDir, started)
  if (globalBackoff) {
    return {
      results: [{ outcome: 'global-backoff', code: globalBackoff.code }],
      summary: {
        ...globalBackoff,
        scanned: 0,
        requests: 0,
        outcomes: { 'global-backoff': 1 },
      },
    }
  }
  const listing = await listDeliveries({ since: new Date(started - LOOKBACK_MS).toISOString(), maxPages: 3 })
  const listed = listing?.deliveries
  if (!Array.isArray(listed) || listed.some((delivery) => !validDeliverySummary(delivery))) {
    throw new Error('GitHub webhook delivery listing is invalid')
  }
  if (typeof listing.complete !== 'boolean') throw new Error('GitHub webhook delivery listing completeness is invalid')
  const recent = listed.filter((delivery) => Date.parse(delivery.delivered_at) >= started - LOOKBACK_MS)
  const byGuid = new Map()
  for (const delivery of recent) {
    if (!allowedDelivery(delivery)) continue
    const group = byGuid.get(delivery.guid) || []
    group.push(delivery)
    byGuid.set(delivery.guid, group)
  }
  const recoveryDir = path.join(stateDir, 'delivery-recovery')
  ensurePrivateDirectory(recoveryDir)
  for (const file of readdirSync(recoveryDir).filter((name) => name.endsWith('.json'))) {
    const match = /^([a-f0-9-]+)\.json$/iu.exec(file)
    if (!match || !GUID.test(match[1])) throw new Error('Amp Orb CI delivery recovery filename is invalid')
    if (!byGuid.has(match[1])) byGuid.set(match[1], [])
  }
  const results = []
  let requestsThisRun = 0
  for (const [guid, deliveries] of [...byGuid].sort(([left], [right]) => left.localeCompare(right))) {
    const recordExists = existsSync(ledgerPath(stateDir, guid))
    let record = readJson(ledgerPath(stateDir, guid))
    if (recordExists && !validRecoveryRecord(record, guid)) {
      throw new Error('Amp Orb CI delivery recovery ledger is invalid')
    }
    const identity = deliveries[0] || record
    if (acceptedDelivery(stateDir, { guid, event: identity.event })) {
      if (record && !record.terminalAt) record = writeLedger(stateDir, terminalRecord(record, 'accepted', started, 'durable-local-acceptance'))
      results.push({ guid, outcome: 'accepted' })
      continue
    }
    if (record?.terminalAt) {
      results.push({ guid, outcome: record.state })
      continue
    }
    const needsRecovery = record !== null || deliveries.some((delivery) =>
      delivery.redelivery || RETRYABLE_STATUS.has(delivery.status_code))
    if (!listing.complete && needsRecovery) {
      record = writeLedger(
        stateDir,
        terminalRecord(record || baseRecord(deliveries[0], started), 'manual-required', started, 'delivery-history-truncated'),
      )
      results.push({ guid, outcome: 'manual-required' })
      continue
    }
    const priorIntent = record?.requests?.at(-1)
    let source = null
    if (priorIntent) {
      const observed = attemptsAfterIntent(deliveries, { ...priorIntent, guid })
      if (observed.length > 1) {
        record = writeLedger(stateDir, terminalRecord(record, 'manual-required', started, 'ambiguous-redelivery-history'))
        results.push({ guid, outcome: 'manual-required' })
        continue
      }
      if (observed.length === 0) {
        if (started - Date.parse(priorIntent.requestedAt) >= OBSERVATION_MS) {
          record = writeLedger(stateDir, terminalRecord(record, 'manual-required', started, 'redelivery-outcome-unknown'))
          results.push({ guid, outcome: 'manual-required' })
        } else {
          results.push({ guid, outcome: 'pending-observation' })
        }
        continue
      }
      source = observed[0]
      if (source.status_code >= 200 && source.status_code <= 399) {
        if (started - Date.parse(source.delivered_at) >= ACCEPTANCE_GRACE_MS) {
          record = writeLedger(stateDir, terminalRecord(record, 'manual-required', started, 'http-success-without-local-acceptance'))
          results.push({ guid, outcome: 'manual-required' })
        } else {
          results.push({ guid, outcome: 'pending-local-acceptance' })
        }
        continue
      }
    } else {
      const unownedRedelivery = deliveries.find((delivery) => delivery.redelivery)
      if (unownedRedelivery) {
        record = writeLedger(
          stateDir,
          terminalRecord(baseRecord(unownedRedelivery, started), 'manual-required', started, 'unowned-redelivery-history'),
        )
        results.push({ guid, outcome: 'manual-required' })
        continue
      }
      source = [...deliveries]
        .filter((delivery) => !delivery.redelivery && RETRYABLE_STATUS.has(delivery.status_code))
        .sort((left, right) => Date.parse(right.delivered_at) - Date.parse(left.delivered_at))[0] || null
      if (!source) continue
      record = baseRecord(source, started)
    }
    if (!RETRYABLE_STATUS.has(source.status_code)) {
      record = writeLedger(stateDir, terminalRecord(record, 'manual-required', started, 'non-retryable-delivery-failure'))
      results.push({ guid, outcome: 'manual-required' })
      continue
    }
    if (record.requests.length >= MAX_REQUESTS_PER_GUID) {
      record = writeLedger(stateDir, terminalRecord(record, 'manual-required', started, 'redelivery-budget-exhausted'))
      results.push({ guid, outcome: 'manual-required' })
      continue
    }
    if (requestsThisRun >= MAX_REQUESTS_PER_RUN) {
      results.push({ guid, outcome: 'run-budget-deferred' })
      continue
    }
    const detailed = await getDelivery(source.id)
    if (!validDetailedIdentity(detailed)
      || detailed.id !== source.id
      || detailed.guid !== guid
      || detailed.status_code !== source.status_code
      || detailed.delivered_at !== source.delivered_at
      || detailed.redelivery !== source.redelivery
      || detailed.event !== source.event
      || detailed.action !== source.action
      || detailed.event !== record.event
      || detailed.action !== record.action) {
      record = writeLedger(stateDir, terminalRecord(record, 'manual-required', started, 'delivery-identity-changed'))
      results.push({ guid, outcome: 'manual-required' })
      continue
    }
    if (started < retryAfterAt(detailed, Date.parse(source.delivered_at))) {
      results.push({ guid, outcome: 'backoff' })
      continue
    }
    if (acceptedDelivery(stateDir, { guid, event: source.event })) {
      record = writeLedger(stateDir, terminalRecord(record, 'accepted', started, 'late-durable-local-acceptance'))
      results.push({ guid, outcome: 'accepted' })
      continue
    }
    const intentTime = now()
    const intent = {
      sequence: record.requests.length + 1,
      sourceDeliveryId: source.id,
      sourceDeliveredAt: source.delivered_at,
      requestedAt: new Date(intentTime).toISOString(),
      state: 'unknown',
    }
    record = writeLedger(stateDir, { ...record, state: 'redelivery-unknown', requests: [...record.requests, intent] })
    requestsThisRun += 1
    let response
    try {
      response = await redeliver(source.id)
    } catch {
      // Transport loss may follow an accepted POST. The durable intent remains
      // UNKNOWN until a distinct later GitHub attempt proves its outcome.
      results.push({ guid, outcome: 'redelivery-unknown' })
      continue
    }
    if (response?.status !== 202) {
      const code = [401, 403, 404].includes(response?.status)
        ? 'permission-denied' : response?.status === 429 ? 'rate-limited' : 'api-unavailable'
      recordAmpOrbCIDeliveryRecoveryFailure({ stateDir, code, now: () => intentTime })
      throw new Error(`GitHub webhook redelivery failed (${response?.status ?? 'unknown'})`)
    }
    results.push({ guid, outcome: 'redelivery-unknown' })
  }
  const outcomes = {}
  for (const result of results) outcomes[result.outcome] = (outcomes[result.outcome] || 0) + 1
  const summary = {
    schemaVersion: 'amp-orb-ci-delivery-recovery-status-v1',
    recordedAt: new Date(started).toISOString(),
    scanned: recent.length,
    requests: requestsThisRun,
    outcomes,
  }
  atomicWriteJson(path.join(stateDir, 'delivery-recovery-status.json'), summary)
  return { results, summary }
}

export function recordAmpOrbCIDeliveryRecoveryFailure({ stateDir, code, now = () => Date.now() } = {}) {
  if (!['permission-denied', 'rate-limited', 'api-unavailable', 'invalid-configuration'].includes(code)) {
    throw new Error('Invalid Amp Orb CI delivery recovery failure')
  }
  const recordedAt = now()
  const status = {
    schemaVersion: 'amp-orb-ci-delivery-recovery-status-v1',
    recordedAt: new Date(recordedAt).toISOString(),
    state: 'blocked',
    code,
    nextAttemptAt: new Date(recordedAt + (code === 'rate-limited' ? 15 * 60_000 : 6 * 60 * 60_000)).toISOString(),
  }
  atomicWriteJson(path.join(stateDir, 'delivery-recovery-status.json'), status)
  return status
}

export function createGitHubRepositoryWebhookDeliveryClient({ hookId, getAccessToken, fetchImpl = fetch } = {}) {
  if (!Number.isSafeInteger(hookId) || hookId < 1 || typeof getAccessToken !== 'function' || typeof fetchImpl !== 'function') {
    throw new Error('GitHub webhook delivery client dependencies are missing')
  }
  const request = async (suffix, options = {}) => {
    const token = await getAccessToken()
    if (typeof token !== 'string' || !token) throw new Error('GitHub webhook recovery credential is missing')
    return fetchImpl(`https://api.github.com/repos/${REPOSITORY}/hooks/${hookId}/deliveries${suffix}`, {
      ...options,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2026-03-10',
      },
    })
  }
  return Object.freeze({
    async listDeliveries({ since, maxPages }) {
      const found = []
      let cursor = null
      let complete = false
      for (let page = 0; page < maxPages; page += 1) {
        const response = await request(`?per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
        if (response.status !== 200) throw new Error(`GitHub webhook delivery list failed (${response.status})`)
        const rows = await response.json()
        if (!Array.isArray(rows)) throw new Error('GitHub webhook delivery list response is invalid')
        found.push(...rows)
        if (rows.length < 100 || rows.some((row) => Date.parse(row.delivered_at) < Date.parse(since))) {
          complete = true
          break
        }
        const nextLink = String(response.headers.get('link') || '')
          .split(',')
          .find((part) => /;\s*rel="next"/u.test(part))
          ?.match(/<([^>]+)>/u)?.[1]
        if (!nextLink) {
          complete = true
          break
        }
        const next = new URL(nextLink)
        cursor = next.searchParams.get('cursor')
        if (!cursor) throw new Error('GitHub webhook delivery next cursor is invalid')
      }
      return { deliveries: found, complete }
    },
    async getDelivery(id) {
      const response = await request(`/${id}`)
      if (response.status !== 200) throw new Error(`GitHub webhook delivery read failed (${response.status})`)
      return response.json()
    },
    async redeliver(id) {
      const response = await request(`/${id}/attempts`, { method: 'POST' })
      return { status: response.status }
    },
  })
}

export function ampOrbCIDeliveryRecoveryLockInvocation({ stateDir, scriptPath, args = [], nodePath = process.execPath } = {}) {
  ensurePrivateDirectory(stateDir)
  const lockPath = path.join(stateDir, 'delivery-recovery.lock')
  closeSync(openSync(lockPath, 'a', 0o600))
  chmodSync(lockPath, 0o600)
  return {
    command: '/usr/bin/flock',
    args: ['--no-fork', '--nonblock', '--conflict-exit-code', '75', lockPath, nodePath, scriptPath, ...args],
  }
}
