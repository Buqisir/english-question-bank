import { createHmac, timingSafeEqual } from 'node:crypto'

const SCHEMA_VERSION = 'eqbank-source-intake-wakeup-v1'
const SUBMISSION_ID = /^submission-[a-f0-9-]{36}$/
const SUBMISSION_DIGEST = /^sha256:[a-f0-9]{64}$/
const EXPECTED_KEYS = ['event', 'schemaVersion', 'submissionDigest', 'submissionId']
const IMPORT_PROJECT_ID = '72c5d9ea-c2e7-42e8-b51e-0b22b9b23732'
const IMPORT_PROJECT_REF = 'user_01M10H0ESEN0415NA8H878PCXJ/english-question-bank-import'

export const description = 'Creates or resumes one private project Orb for a verified source intake.'

export function parseSourceIntakeWakeup(body) {
  let payload
  try {
    payload = JSON.parse(Buffer.from(body).toString('utf8'))
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (Object.keys(payload).sort().join('\n') !== EXPECTED_KEYS.join('\n')) return null
  if (payload.schemaVersion !== SCHEMA_VERSION || payload.event !== 'source_intake.queued') {
    return null
  }
  if (!SUBMISSION_ID.test(payload.submissionId)) return null
  if (!SUBMISSION_DIGEST.test(payload.submissionDigest)) return null
  return {
    submissionId: payload.submissionId,
    submissionDigest: payload.submissionDigest,
  }
}

export function validSourceIntakeSignature(body, signature, secret) {
  if (!secret) return true
  if (!/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  const actualBytes = Buffer.from(signature)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes)
}

export function sourceIntakeAgentPrompt({ submissionId, submissionDigest }) {
  return [
    'A verified Owner source-intake submission is queued in english-question-bank.',
    `Submission ID: ${submissionId}`,
    `Expected submission digest: ${submissionDigest}`,
    '',
    'Work in this project Orb repository checkout and preserve unrelated changes.',
    'Follow docs/import/agent-contract.md. Preserve legacy and analyzed-package profiles. Keep this coordinator and its lease in place; stop on any validator failure.',
    'First run source-intake.mjs status <submissionId> --paper-id <paperId>, then use its explicit continue command to perform only verified claim/download/init/source-materialization steps. Read the single JSON result and stop at its blocker or source_ready state.',
    'The CLI sends this thread’s AMP_THREAD_ID on every lease operation; never copy the source files or claim receipt to another thread.',
    'Do not send needs-owner or handoff merely because automation stopped; report the exact pending decision unless this task explicitly includes and semantically justifies that remote transition.',
    'After download, inspect the immutable submission snapshot mode. For listening_supplement, use its exact targetPaperId and hydrate that existing Review paper; never invent a new paperId. For analyzed_package corrections use the exact targetPaperId; for a new package or new_paper choose a valid new paperId.',
    'The continue command must keep analyzed_package on deterministic package preparation and must never invoke OCR, extraction, or model fallback. For raw-source listening review, inspect the bound ASR/content evidence and explicitly finalize-listening with a genuine import_agent review; never fabricate pass evidence. OCR confirmation remains Owner-only: report that precise access blocker, never impersonate the Owner or bypass confirmation.',
    'New raw-source workspaces use public-paper-v1: do not dispatch the nine teaching analyses. After source review, prepare and verify both paragraph-summaries-v1.json and public-search-metadata-v1.json with review.mjs prepare-summaries/verify-summaries and prepare-search-metadata/finalize-search-metadata/verify-search-metadata. For either explicit generation request, use one built-in Low thread with agent_mode: low, features: [], explicit Import project, and only that request. Use Low configuration as provided by Amp; do not pin a model or reasoning effort. Never transfer claim receipts or submission workspaces. If Low is unavailable, stop; do not substitute another mode, enable fast, or call Oracle/Task for generation.',
    'Do not edit the Owner draft, invent answers, approve review, publish locally, ship, deploy, mutate production, or create a replacement coordinator thread.',
  ].join('\n')
}

function importOpsSettings() {
  const origin = String(process.env.QUESTION_BANK_IMPORT_OPS_ORIGIN || '')
    .trim()
    .replace(/\/$/, '')
  const token = String(process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN || '')
  return {
    origin: /^https?:\/\//.test(origin) ? origin : '',
    token,
  }
}

async function workerApi(settings, submissionId, operation, body, signal) {
  const response = await fetch(
    `${settings.origin}/api/import-agent-source-intakes/${encodeURIComponent(submissionId)}`
      + `/orb-worker/${operation}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${settings.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    },
  )
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Source-intake worker API ${operation} failed (${response.status} ${result?.code || 'unknown'})`)
  }
  return result?.worker
}

function assertWorkerResponse(worker, payload, expectedAction = null) {
  if (
    !worker
    || worker.submissionId !== payload.submissionId
    || worker.submissionDigest !== payload.submissionDigest
    || (expectedAction && worker.action !== expectedAction)
  ) {
    throw new Error('Source-intake worker API returned a mismatched identity')
  }
  return worker
}

async function appendPrompt(thread, payload) {
  await thread.appendUserMessage({
    type: 'user-message',
    content: sourceIntakeAgentPrompt(payload),
  }, { steer: true })
}

export default async function sourceIntakeWakeupPlugin(amp) {
  if (process.env.QUESTION_BANK_SOURCE_INTAKE_PLUGIN_ENABLED !== '1') {
    amp.logger.log('Source-intake wakeup is disabled; no webhook was registered.')
    return
  }

  const webhookSecret = String(
    process.env.QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_SECRET || '',
  )
  const settings = importOpsSettings()
  if (!settings.origin || !settings.token) {
    amp.logger.log('Source-intake wakeup is enabled but its private Import Ops settings are missing.')
    return
  }
  if (String(process.env.AMP_PROJECT_ID || '').trim() !== IMPORT_PROJECT_ID) {
    amp.logger.log(`Source-intake wakeup requires Amp Project ${IMPORT_PROJECT_REF}; no webhook or worker agent was created.`)
    return
  }

  const agent = amp.getBuiltinAgent('low')
  const registration = await amp.createWebhook({
    key: 'eqbank-source-intake-queued-v1',
    headers: ['x-eqbank-signature'],
    handler: async (event, context) => {
      const signature = event.headers['x-eqbank-signature'] || ''
      const payload = parseSourceIntakeWakeup(event.body)
      if (!payload || !validSourceIntakeSignature(event.body, signature, webhookSecret)) {
        context.logger.log('Dropped an invalid source-intake wakeup event.')
        return
      }
      if (context.signal.aborted) return
      const webhookEventId = String(event.id || '').trim()
      if (!webhookEventId) {
        context.logger.log('Dropped a source-intake wakeup event without a delivery identity.')
        return
      }

      const reserved = assertWorkerResponse(await workerApi(
        settings,
        payload.submissionId,
        'reserve',
        {
          submissionDigest: payload.submissionDigest,
          webhookEventId,
        },
        context.signal,
      ), payload)
      if (reserved.action === 'busy') return
      if (reserved.action === 'resume') {
        if (!reserved.ampThreadId) {
          throw new Error('Bound source-intake worker has no Amp thread identity')
        }
        await appendPrompt(amp.threads.get(reserved.ampThreadId), payload)
        return
      }
      if (reserved.action !== 'create' || !reserved.reservationToken) {
        throw new Error('Source-intake worker reservation action is invalid')
      }

      const thread = await agent.createThread({
        executor: 'orb',
        features: [],
        multiplayerTTLSeconds: null,
        visibility: 'private',
      })
      const binding = assertWorkerResponse(await workerApi(
        settings,
        payload.submissionId,
        'bind',
        {
          submissionDigest: payload.submissionDigest,
          reservationToken: reserved.reservationToken,
          ampThreadId: thread.id,
        },
        context.signal,
      ), payload)
      if (binding.ampThreadId !== thread.id || binding.state !== 'bound') {
        throw new Error('Source-intake worker bind did not confirm the created Amp thread')
      }
      await appendPrompt(thread, payload)
    },
  })

  amp.registerCommand(
    'source-intake-webhook-url',
    {
      title: '复制题源队列 Webhook URL',
      category: '题源 Agent',
      description: '仅在显式调用时显示私有 capability URL，供后台服务配置。',
    },
    async (context) => {
      await context.ui.input({
        title: '题源队列 Webhook URL',
        helpText: '这是私有凭据。复制到后台私有环境后关闭，不要写入 Git、日志或聊天。',
        initialValue: registration.url,
        submitButtonText: '关闭',
      })
    },
  )
}
