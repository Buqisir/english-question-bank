import { createHmac, timingSafeEqual } from 'node:crypto'

const SCHEMA_VERSION = 'eqbank-source-intake-wakeup-v1'
const SUBMISSION_ID = /^submission-[a-f0-9-]{36}$/
const SUBMISSION_DIGEST = /^sha256:[a-f0-9]{64}$/
const EXPECTED_KEYS = ['event', 'schemaVersion', 'submissionDigest', 'submissionId']

export const description = 'Wakes a private Mac runner when an Owner queues a verified source intake.'

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
    'Work in the runner’s existing repository checkout and preserve unrelated changes.',
    'Use scripts/import-pipeline/source-intake.mjs to list, atomically claim, download, and recheck this submission before following docs/import/agent-contract.md.',
    'If the material is incomplete or ambiguous, release it with the needs-owner command and a concise structured reason.',
    'If it is usable, choose a valid paperId, run the explicit source-intake init command, continue through the existing NCK1 import contract, and call source-intake handoff only after the local paper workspace has been initialized.',
    'Do not edit the Owner draft, invent answers, approve review, publish locally, ship, deploy, mutate production, or create another thread.',
  ].join('\n')
}

export default async function sourceIntakeWakeupPlugin(amp) {
  if (process.env.QUESTION_BANK_SOURCE_INTAKE_PLUGIN_ENABLED !== '1') {
    amp.logger.log('Source-intake wakeup is disabled; no webhook was registered.')
    return
  }

  const runnerId = String(process.env.QUESTION_BANK_SOURCE_INTAKE_RUNNER_ID || '').trim()
  const webhookSecret = String(
    process.env.QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_SECRET || '',
  )
  if (!runnerId) {
    amp.logger.log('Source-intake wakeup is enabled but its private runner setting is missing.')
    return
  }

  const agent = amp.getBuiltinAgent('medium')
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

      const thread = await agent.createThread({
        executor: { type: 'runner', id: runnerId },
        features: [],
        show: false,
        visibility: 'private',
      })
      await thread.appendUserMessage({
        type: 'user-message',
        content: sourceIntakeAgentPrompt(payload),
      })
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
