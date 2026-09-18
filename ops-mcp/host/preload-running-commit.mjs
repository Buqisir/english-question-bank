import { recordRunningCommit } from './record-running-commit.mjs'
// Do not preload the writer in child Node processes. Installation requires no
// pre-existing NODE_OPTIONS; never discard unrelated options.
if (process.env.NODE_OPTIONS === '--import=/usr/local/lib/eqb-provenance/preload-running-commit.mjs') {
  delete process.env.NODE_OPTIONS
}
// Observability failure must not take down the website. Old evidence cannot
// validate against a new systemd InvocationID; Ops will return unknown + reason.
try {
  recordRunningCommit()
} catch (error) {
  console.error(`EQB running commit provenance unavailable: ${error.message}`)
}
