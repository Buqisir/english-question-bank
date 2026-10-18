import { performance } from 'node:perf_hooks'

// Operational telemetry only: never part of a revision, digest, or receipt.
export function reviewUploadMetrics(operation, identity, phases, metrics = {}) {
  Object.assign(metrics, {
    operation, outcome: 'running', failedStage: null,
    durationsMs: Object.fromEntries(phases.map(name => [name, 0])), totalMs: 0,
  })
  const started = performance.now()
  let checkpoint = started
  let current = phases[0]
  function phase(name) {
    const now = performance.now()
    metrics.durationsMs[current] += now - checkpoint
    current = name
    checkpoint = now
  }
  return {
    phase,
    finish(error = null) {
      const ended = performance.now()
      metrics.durationsMs[current] += ended - checkpoint
      metrics.totalMs = ended - started
      metrics.outcome = error ? 'failed' : 'succeeded'
      metrics.failedStage = error ? current : null
      if (error) error.metrics = metrics
      console.info(JSON.stringify({ event: 'import-review-upload', ...identity, metrics }))
      return metrics
    },
  }
}
