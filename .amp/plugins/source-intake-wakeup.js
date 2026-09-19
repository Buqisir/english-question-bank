import { createHmac, timingSafeEqual } from 'node:crypto'

const SCHEMA_VERSION = 'eqbank-source-intake-wakeup-v1'
const SUBMISSION_ID = /^submission-[a-f0-9-]{36}$/
const SUBMISSION_DIGEST = /^sha256:[a-f0-9]{64}$/
const EXPECTED_KEYS = ['event', 'schemaVersion', 'submissionDigest', 'submissionId']
const IMPORT_PROJECT_ID = '72c5d9ea-c2e7-42e8-b51e-0b22b9b23732'
const IMPORT_PROJECT_REF = 'user_01M10H0ESEN0415NA8H878PCXJ/english-question-bank-import'
const IMPORT_CONTROLLER_THREAD_ID = 'T-01a057c0-ecc9-745c-aaa7-a51dddb22306'

export const description = 'Wakes the fixed Import dispatcher for verified source intake; never creates an Orb in the webhook.'

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

export function sourceIntakeDispatchPrompt(payload, eventId) {
  return [
    'Verified source-intake dispatch wakeup. This is not permission to import in the controller.',
    JSON.stringify({ ...payload, webhookEventId: eventId }),
    'Follow docs/import/agent-contract.md explicit-project dispatch procedure. Run source-intake-dispatch.mjs prepare with this submission/digest/event, then inspect status.',
    'Only after begin-create returns a create_thread request may you execute that exact request once. It specifies built-in Low, features: [], and the Import project. The bootstrap receives no source assignment.',
    'Bind the returned thread via the dispatch CLI, which verifies exported project/mode/privacy. Then run status; only startable:true permits take-assignment. Send the returned assignment once to its exact boundIdentity. A lost take-assignment or send response requires read-only reconciliation, not another send. Do not reconstruct an assignment manually.',
    'On duplicate, busy, unknown, lost response, wrong project or paused task: stop and reconcile read-only. Never recreate/rebind a worker or replay a mutation. Respect existing Owner pauses. Do not claim, download, import or promote in this controller.',
  ].join('\n')
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

  if (process.env.AMP_THREAD_ID !== IMPORT_CONTROLLER_THREAD_ID) {
    amp.logger.log('Source-intake wakeup is restricted to the fixed Import controller; no webhook registered.')
    return
  }
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

      await amp.threads.get(IMPORT_CONTROLLER_THREAD_ID).appendUserMessage({
        type: 'user-message',
        content: sourceIntakeDispatchPrompt(payload, webhookEventId),
      }, { steer: true })
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
