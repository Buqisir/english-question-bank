#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const IMPORT_PROJECT_ID = '72c5d9ea-c2e7-42e8-b51e-0b22b9b23732'
export const IMPORT_PROJECT_REF = 'user_01M10H0ESEN0415NA8H878PCXJ/english-question-bank-import'
const SUBMISSION = /^submission-[a-f0-9-]{36}$/
const DIGEST = /^sha256:[a-f0-9]{64}$/

// Retain read-only reconciliation of old journals, including UNKNOWN outcomes.
// Never renew reservations, bind workers, or issue assignments from this entrypoint.
export function createSourceIntakeDispatcher({
  root = path.resolve(import.meta.dirname, '../../.scratch/source-intake-dispatch'),
  controllerThreadId = process.env.AMP_THREAD_ID,
  controllerProjectId = process.env.AMP_PROJECT_ID,
  api = defaultApi,
} = {}) {
  const retired = async () => ({ state: 'blocked', reason: 'automatic_intake_retired', startable: false })
  async function status(submissionId) {
    if (!SUBMISSION.test(submissionId || '')) throw new Error('A valid submissionId is required')
    if (controllerProjectId !== IMPORT_PROJECT_ID
      || controllerThreadId !== 'T-01a057c0-ecc9-745c-aaa7-a51dddb22306') {
      throw new Error('Historical dispatch status is restricted to the fixed Import controller')
    }
    const file = path.join(root, submissionId, 'dispatch.json')
    if (!existsSync(file)) return { local: { state: 'unprepared' }, remote: { state: 'unknown' }, startable: false }
    let journal
    try { journal = JSON.parse(readFileSync(file, 'utf8')) }
    catch { throw new Error('Cannot read private dispatch journal; preserve it for reconciliation') }
    if (journal?.submissionId !== submissionId || journal.controllerThreadId !== controllerThreadId
      || !DIGEST.test(journal.digest || '')) {
      throw new Error('Dispatch journal identity does not match this controller')
    }
    const local = {
      state: journal.state, submissionId, digest: journal.digest,
      reservationExpiresAt: journal.reservationExpiresAt || null,
      ampThreadId: journal.candidateThreadId || null,
    }
    const result = { local, remote: { state: 'unknown' }, startable: false, reason: 'automatic_intake_retired' }
    let worker
    try { worker = (await api('status', submissionId, { submissionDigest: journal.digest }, { readOnly: true }))?.worker }
    catch { return result }
    if (worker?.submissionId !== submissionId || worker?.submissionDigest !== journal.digest) {
      return { ...result, blocker: 'Remote identity mismatch' }
    }
    return { ...result, remote: {
      state: worker.state, submissionId, submissionDigest: worker.submissionDigest,
      ampThreadId: worker.ampThreadId || null, reservationExpiresAt: worker.reservationExpiresAt || null,
    } }
  }
  return { prepare: retired, beginCreate: retired, bind: retired, status, takeAssignment: retired }
}

async function defaultApi(_action, submissionId, body) {
  const origin = String(process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || '').replace(/\/$/, '')
  const token = String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || '')
  if (!/^https?:\/\//.test(origin) || !token) throw new Error('SOURCE_INTAKE_CONFIGURATION_INVALID')
  const pathname = `/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}/orb-worker?submissionDigest=${encodeURIComponent(body.submissionDigest)}`
  const response = await fetch(`${origin}${pathname}`, {
    method: 'GET', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error('SOURCE_INTAKE_API_FAILED')
  return response.json()
}

async function main() {
  const [command, submissionId] = process.argv.slice(2)
  const dispatcher = createSourceIntakeDispatcher()
  if (command !== 'status') throw new Error('Automatic intake is retired. Only status <submissionId> remains for reconciliation.')
  process.stdout.write(`${JSON.stringify(await dispatcher.status(submissionId))}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
}
