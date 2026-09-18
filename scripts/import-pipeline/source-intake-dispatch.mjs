#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { acquireSourceIntakeLock } from './source-intake-lease.mjs'
import { sourceIntakeAgentPrompt } from '../../.amp/plugins/source-intake-wakeup.js'

export const IMPORT_PROJECT_ID = '72c5d9ea-c2e7-42e8-b51e-0b22b9b23732'
export const IMPORT_PROJECT_REF = 'user_01M10H0ESEN0415NA8H878PCXJ/english-question-bank-import'
const SUBMISSION = /^submission-[a-f0-9-]{36}$/
const DIGEST = /^sha256:[a-f0-9]{64}$/
const THREAD = /^T-[a-f0-9-]{36}$/
const BOOTSTRAP = 'You are an empty Import worker. Perform no source-intake or source operations. Do not claim, download, inspect, or publish anything. Wait for the controller to send an assignment.'

function blocked(reason, journal = null) {
  return { state: 'blocked', reason, ...(journal?.candidateThreadId ? { candidateThreadId: journal.candidateThreadId } : {}) }
}

function safeApiError(error) {
  const status = Number(error?.status || 0)
  return new Error(`Source intake API failed${status ? ` (${status})` : ''}; reconcile read-only`)
}

function assertThreadMetadata(value, threadId) {
  const meta = value?.meta
  const id = value?.id
  if (id !== threadId) throw new Error('Exported thread identity does not match the candidate')
  if (meta?.projectID !== IMPORT_PROJECT_ID) throw new Error('Candidate thread is not in the fixed Import project')
  if (!Array.isArray(meta?.features) || meta.features.length !== 0) throw new Error('Candidate thread features are not empty')
  if (meta?.visibility !== 'private') throw new Error('Candidate thread is not private')
  if (meta?.agentMode !== 'low') throw new Error('Candidate thread is not Low mode')
  if (meta?.agent || meta?.agentSelection || meta?.threadAgent) {
    throw new Error('Candidate thread does not use built-in Low')
  }
  return true
}

function privateWrite(filePath, value) {
  const directory = path.dirname(filePath)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  const fd = openSync(temporary, 'r')
  try { fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(temporary, filePath)
  const parent = openSync(directory, 'r')
  try { fsyncSync(parent) } finally { closeSync(parent) }
}

export function createSourceIntakeDispatcher({
  root = path.resolve(import.meta.dirname, '../../.scratch/source-intake-dispatch'),
  controllerThreadId = process.env.AMP_THREAD_ID,
  controllerProjectId = process.env.AMP_PROJECT_ID,
  now = () => new Date(),
  api = defaultApi,
  exportThread = (threadId) => {
    try {
      return JSON.parse(execFileSync('amp', ['threads', 'export', threadId], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000,
      }))
    } catch { throw new Error('Cannot verify candidate thread metadata') }
  },
} = {}) {
  function guard(submissionId) {
    if (!SUBMISSION.test(submissionId || '')) throw new Error('A valid submissionId is required')
    if (!THREAD.test(controllerThreadId || '')) throw new Error('A valid controller AMP_THREAD_ID is required')
    if (controllerProjectId !== IMPORT_PROJECT_ID) throw new Error('Controller is not in the fixed Import project')
    if (controllerThreadId !== 'T-01a057c0-ecc9-745c-aaa7-a51dddb22306') {
      throw new Error('Dispatch is restricted to the fixed Import controller')
    }
  }
  const file = (id) => path.join(root, id, 'dispatch.json')
  const lockFile = (id) => path.join(root, id, 'dispatch.lock')
  function read(id) {
    if (!existsSync(file(id))) return null
    let value
    try { value = JSON.parse(readFileSync(file(id), 'utf8')) }
    catch { throw new Error('Cannot read private dispatch journal; preserve it for reconciliation') }
    if (value?.submissionId !== id || value.controllerThreadId !== controllerThreadId) {
      throw new Error('Dispatch journal owner does not match this controller')
    }
    return value
  }
  async function locked(id, operation) {
    guard(id)
    mkdirSync(path.dirname(file(id)), { recursive: true, mode: 0o700 })
    chmodSync(path.dirname(file(id)), 0o700)
    const lock = await acquireSourceIntakeLock(lockFile(id))
    try { return await operation() } finally { await lock.release() }
  }
  async function prepare(submissionId, digest, eventId) {
    return locked(submissionId, async () => {
      if (!DIGEST.test(digest || '')) throw new Error('A valid immutable submission digest is required')
      if (!String(eventId || '').trim()) throw new Error('A webhook event identity is required')
      const prior = read(submissionId)
      if (prior && prior.digest !== digest) throw new Error('Dispatch digest does not match retained submission')
      if (prior) return prior.state === 'reserved' ? publicState(prior) : blocked(`Existing dispatch is ${prior.state}`, prior)
      let journal = { schemaVersion: 'source-intake-dispatch-v1', submissionId, digest,
        eventId, controllerThreadId, projectId: IMPORT_PROJECT_ID, state: 'reserving' }
      privateWrite(file(submissionId), journal)
      let response
      try { response = await api('reserve', submissionId, { submissionDigest: digest, webhookEventId: eventId }) }
      catch (error) {
        journal = { ...journal, state: 'reserve_unknown' }; privateWrite(file(submissionId), journal)
        throw safeApiError(error)
      }
      const worker = response?.worker
      if (worker?.submissionId !== submissionId || worker?.submissionDigest !== digest) {
        journal = { ...journal, state: 'reserve_unknown' }; privateWrite(file(submissionId), journal)
        throw new Error('Reserve response does not match immutable submission')
      }
      if (worker.action !== 'create' || !worker.reservationToken) {
        journal = { ...journal, state: worker.action === 'resume' ? 'resume' : 'blocked',
          ...(worker.ampThreadId ? { candidateThreadId: worker.ampThreadId } : {}) }
      } else {
        journal = { ...journal, state: 'reserved', reservationToken: worker.reservationToken,
          reservationExpiresAt: worker.reservationExpiresAt }
      }
      privateWrite(file(submissionId), journal)
      return publicState(journal)
    })
  }
  async function beginCreate(submissionId) {
    return locked(submissionId, async () => {
      let journal = read(submissionId)
      if (!journal) return blocked('Dispatch is not prepared')
      if (journal.state !== 'reserved') return blocked(`Dispatch is ${journal.state}`, journal)
      if (!Number.isFinite(Date.parse(journal.reservationExpiresAt)) || new Date(journal.reservationExpiresAt) <= now()) {
        journal = { ...journal, state: 'reservation_expired' }; privateWrite(file(submissionId), journal)
        return blocked('Reservation expired', journal)
      }
      journal = { ...journal, state: 'creating' }; privateWrite(file(submissionId), journal)
      return { state: 'creating', request: { tool: 'create_thread', arguments: {
        agent_mode: 'low', features: [], executor: 'orb', intent: 'delegation', project: IMPORT_PROJECT_REF,
        prompt: BOOTSTRAP,
      } } }
    })
  }
  async function bind(submissionId, threadId) {
    return locked(submissionId, async () => {
      if (!THREAD.test(threadId || '')) throw new Error('A valid candidate thread id is required')
      let journal = read(submissionId)
      if (!journal || journal.state !== 'creating') return blocked('Dispatch is not awaiting a candidate; reconcile with status, never replay bind', journal)
      if (journal.candidateThreadId && journal.candidateThreadId !== threadId) return blocked('A different candidate is already retained', journal)
      journal = { ...journal, candidateThreadId: threadId }; privateWrite(file(submissionId), journal)
      assertThreadMetadata(exportThread(threadId), threadId)
      journal = { ...journal, state: 'binding', candidateThreadId: threadId }; privateWrite(file(submissionId), journal)
      let response
      try { response = await api('bind', submissionId, { submissionDigest: journal.digest,
        reservationToken: journal.reservationToken, ampThreadId: threadId }) }
      catch (error) {
        journal = { ...journal, state: 'bind_unknown' }; privateWrite(file(submissionId), journal)
        throw safeApiError(error)
      }
      if (response?.worker?.state !== 'bound' || response.worker.ampThreadId !== threadId
        || response.worker.submissionId !== submissionId
        || response.worker.submissionDigest !== journal.digest) {
        journal = { ...journal, state: 'bind_failed' }; privateWrite(file(submissionId), journal)
        return blocked('Bind response did not confirm the retained candidate', journal)
      }
      journal = { ...journal, state: 'bound' }; privateWrite(file(submissionId), journal)
      return publicState(journal)
    })
  }
  async function status(submissionId) {
    guard(submissionId)
    const journal = read(submissionId)
    if (!journal) return { local: { state: 'unprepared' }, remote: { state: 'unknown' }, startable: false }
    let remote
    try { remote = (await api('status', submissionId, { submissionDigest: journal.digest }, { readOnly: true }))?.worker }
    catch { return { local: publicState(journal), remote: { state: 'unknown' }, startable: false } }
    if (remote?.submissionId !== submissionId || remote?.submissionDigest !== journal.digest) {
      return { local: publicState(journal), remote: { state: 'unknown' }, startable: false, blocker: 'Remote identity mismatch' }
    }
    const candidate = journal.candidateThreadId
    if (['bound', 'binding', 'bind_unknown'].includes(journal.state)
      && remote?.state === 'bound' && candidate && remote.ampThreadId === candidate) {
      try { assertThreadMetadata(exportThread(candidate), candidate) } catch (error) {
        return { local: publicState(journal), remote, startable: false, blocker: error.message }
      }
      return { local: publicState(journal), remote, startable: true, boundIdentity: {
        submissionId, submissionDigest: journal.digest, ampThreadId: candidate,
      } }
    }
    return { local: publicState(journal), remote: remote || { state: 'unknown' }, startable: false,
      ...(remote?.state === 'bound' ? { blocker: 'Remote binding does not match retained candidate' } : {}) }
  }
  async function takeAssignment(submissionId) {
    return locked(submissionId, async () => {
      const verified = await status(submissionId)
      if (!verified.startable) return blocked('No verified new binding is awaiting assignment')
      const journal = read(submissionId)
      // Record before returning the prompt: a lost response must not cause a second send.
      privateWrite(file(submissionId), { ...journal, state: 'assignment_issued' })
      return { state: 'assignment_issued', boundIdentity: verified.boundIdentity,
        assignment: sourceIntakeAgentPrompt({ submissionId, submissionDigest: journal.digest }) }
    })
  }
  return { prepare, beginCreate, bind, status, takeAssignment }
}

function publicState(journal) {
  return { state: journal.state, submissionId: journal.submissionId, digest: journal.digest,
    reservationExpiresAt: journal.reservationExpiresAt || null,
    ampThreadId: journal.state === 'bound' ? journal.candidateThreadId : null }
}

async function defaultApi(action, submissionId, body) {
  const origin = String(process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || '').replace(/\/$/, '')
  const token = String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || '')
  if (!/^https?:\/\//.test(origin) || !token) throw new Error('SOURCE_INTAKE_CONFIGURATION_INVALID')
  const status = action === 'status'
  const pathname = `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}/orb-worker${status
    ? `?submissionDigest=${encodeURIComponent(body.submissionDigest)}` : `/${action}`}`
  const response = await fetch(`${origin}${pathname}`, { method: status ? 'GET' : 'POST', headers: {
    authorization: `Bearer ${token}`, ...(status ? {} : { 'content-type': 'application/json' }),
  }, signal: AbortSignal.timeout(15_000), ...(status ? {} : { body: JSON.stringify(body) }) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error('SOURCE_INTAKE_API_FAILED'), { status: response.status, code: result?.code })
  return result
}

async function main() {
  const [command, submissionId, ...args] = process.argv.slice(2)
  const option = (name) => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1] }
  const dispatcher = createSourceIntakeDispatcher()
  const result = command === 'prepare' ? await dispatcher.prepare(submissionId, option('--digest'), option('--event'))
    : command === 'begin-create' ? await dispatcher.beginCreate(submissionId)
      : command === 'bind' ? await dispatcher.bind(submissionId, option('--thread'))
        : command === 'status' ? await dispatcher.status(submissionId)
          : command === 'take-assignment' ? await dispatcher.takeAssignment(submissionId)
            : (() => { throw new Error('Usage: source-intake-dispatch.mjs prepare|begin-create|bind|status|take-assignment submission ...') })()
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
}
