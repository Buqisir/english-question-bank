import { createHmac } from 'node:crypto'

const WEBHOOK_SCHEMA = 'eqbank-source-intake-wakeup-v1'

function webhookPayload(submission) {
  return {
    schemaVersion: WEBHOOK_SCHEMA,
    event: 'source_intake.queued',
    submissionId: submission.id,
    submissionDigest: submission.submissionDigest,
  }
}

export function createSourceIntakeNotifier({
  webhookUrl = '',
  webhookSecret = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
} = {}) {
  return {
    async notify(submission) {
      if (!webhookUrl) return { state: 'skipped', reason: 'not_configured' }
      const body = JSON.stringify(webhookPayload(submission))
      const headers = { 'content-type': 'application/json' }
      if (webhookSecret) {
        headers['x-eqbank-signature'] = `sha256=${createHmac('sha256', webhookSecret)
          .update(body)
          .digest('hex')}`
      }
      try {
        const response = await fetchImpl(webhookUrl, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!response.ok) {
          return { state: 'failed', reason: `http_${response.status}` }
        }
        return { state: 'sent' }
      } catch (error) {
        return {
          state: 'failed',
          reason: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed',
        }
      }
    },
  }
}

export { WEBHOOK_SCHEMA }
