import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

// Run the exact documented read-only command offline, rather than a second
// implementation of its credential/time classification.
export async function verifyReviewRolloutObservation(pass) {
  const document = readFileSync(new URL('../../docs/cuts/review-content-binding/rollout.md', import.meta.url), 'utf8')
  const source = document.match(/<<'JS'\n([\s\S]*?)\nJS\n/)[1]
  const revisionId = 'rev-72139a1b-56e4-4e70-a97d-df595300c217'
  const compatibility = {
    result: 'equal', reasonCode: 'CONTENT_EQUAL', pending: false,
    targetBuildId: `sha256:${'a'.repeat(64)}`, attemptNo: 1,
    subjectDigest: 'sha256:24d9c91ce48eaf7664ac90721dbe281cf6ce0c88d4b55c7b43a3e004c85bc595',
    checkedAt: '2026-10-21T01:04:00Z', eligible: true, guard: 'content_binding', fallback: false,
  }
  const deploymentStartedAt = '2026-10-21T01:00:00Z'
  const trafficReopenedAt = '2026-10-21T01:05:00Z'
  async function observe({ kind = 'canary', change = {}, latestRevisionId = revisionId, httpOk = true,
    startedAt = deploymentStartedAt } = {}) {
    let requests = 0, output
    await runInNewContext(`(async () => { ${source}\n })()`, {
      process: { env: { EQB_OBSERVE: kind, EQB_DEPLOY_STARTED_AT: startedAt,
        QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN: 'offline-synthetic-token' } },
      AbortSignal,
      console: { log: value => { output = JSON.parse(value) } },
      fetch: async (url, options) => {
        requests++
        assert.equal(options.headers.authorization, 'Bearer offline-synthetic-token')
        assert.equal(options.method, undefined, 'observation defaults to GET')
        assert.match(url, /\/api\/import-agent-reviews(?:\/papers\/paper-mock-zj-ningbo-2026-mar)?$/)
        return { ok: httpOk, status: httpOk ? 200 : 503,
          json: async () => ({ latestRevisionId, compatibility: { ...compatibility, ...change },
            subjectBackfill: {}, papers: [{ paperId: 'paper-mock-zj-ningbo-2026-mar',
              reviewKind: 'candidate', state: 'awaiting_review', latestRevisionId,
              compatibility: { ...compatibility, ...change } }] }) }
      },
    })
    assert.equal(requests, 1, 'one serial GET, without retries or writes')
    return output
  }
  assert(Date.parse(compatibility.checkedAt) < Date.parse(trafficReopenedAt))
  assert.equal((await observe()).comparisonEvidence, 'DEPLOYMENT_WINDOW_EQUAL')
  pass('documented canary accepts a persisted current-target equal completed before traffic reopens')
  assert.equal((await observe({ change: { checkedAt: '2026-10-20T23:00:00Z' } })).comparisonEvidence, 'REUSED_VERIFIED_EQUAL')
  assert.equal((await observe({ change: { checkedAt: '2026-10-21T01:06:00Z' } })).comparisonEvidence, 'DEPLOYMENT_WINDOW_EQUAL')
  pass('same-target valid earlier equal is explicitly reused; later equal is classified by receipt startedAt')
  for (const change of [
    { result: 'different' }, { reasonCode: 'NOT_CHECKED' }, { pending: true },
    { eligible: false }, { guard: 'legacy_renderer' }, { fallback: true },
    { subjectDigest: `sha256:${'b'.repeat(64)}` }, { targetBuildId: null },
    { attemptNo: 0 }, { checkedAt: null }, { checkedAt: 'invalid' },
  ]) assert.equal((await observe({ change })).comparisonEvidence, 'NOT_VERIFIED_EQUAL', JSON.stringify(change))
  await assert.rejects(observe({ latestRevisionId: 'superseded' }), /Canary superseded/)
  await assert.rejects(observe({ httpOk: false }), /Observation HTTP 503/)
  await assert.rejects(observe({ startedAt: 'invalid' }), /EQB_DEPLOY_STARTED_AT/)
  assert.equal((await observe({ kind: 'list' })).count, 1)
  pass('offline observation rejects unverified equal, superseded revision and HTTP errors; list remains read-only')
}
