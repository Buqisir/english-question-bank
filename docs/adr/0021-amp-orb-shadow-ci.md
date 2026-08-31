# ADR-0021: 专用 Amp Orb 先作为 GitHub Verify 的影子 CI

- Status: Accepted for repository implementation (2026-08-31 task scope)
- Live activation: requires a later direct Owner approval
- Authority replacement: not approved; GitHub Actions `Verify` remains required

## Context

The repository's release suite now runs resource-aware verification with eight
jobs on a 16-core Amp Orb. A controlled comparison measured `verify:all` at
618.60 seconds on that Orb versus 1249.98 seconds with one local job, while the
current GitHub-hosted four-core `verify` job remains about 19 minutes. Amp
plugins can own durable webhooks, but handlers have a 30-second deadline and
at-least-once delivery. Candidate branches must also never receive Import Ops,
promotion, deploy, or GitHub status credentials.

## Decision

One dedicated private project Orb thread owns both the GitHub webhook and a
serial CI queue. The plugin validates GitHub HMAC-SHA256 over the raw body and
accepts only:

- same-repository pull requests into `main` on `opened`, `synchronize`,
  `reopened`, or `ready_for_review`;
- non-deleted pushes to `refs/heads/main`.

Only validated repository, event, exact status/head SHA, exact GitHub test-merge
SHA, base SHA, delivery id, and pull request number enter a private mode-0600
filesystem queue. Pull-request title, body, commits, sender text, and all other
payload data never become instructions or reach an LLM. The webhook atomically
enqueues before launching a queue drainer and returning within its deadline.
Plugin startup also launches a drainer, so a process death leaves recoverable
work on disk. No worker thread is created; the owning 16-core Orb runs one suite
at a time.

The trusted controller uses `(workflowVersion, exact tested SHA)` as the durable
run identity. Private mode-0600 receipts bind both the tested and status SHAs and
move through `running -> verified -> reported`. A repeated delivery is a no-op
after `reported`; a crash during execution re-runs the exact tested SHA; a crash
after verification but before the GitHub status write retries only that write.
One kernel-owned blocking `flock` spans each complete queue-drain process.
Concurrent launchers wait and then rescan the durable queue instead of dropping
an event in a lock-release race. The lock survives Orb pause without becoming
stale and is released automatically after process death. There is no user-space
stale owner that can delete a successor's lock. A queue item is removed only
after its controller call reaches a reported or cached outcome.

The trusted controller fetches the exact candidate ref through the owning
project checkout's existing read credential. Pull requests fetch GitHub's exact
`refs/pull/<number>/merge`, verify its SHA and both ordered base/head parents
against the signed delivery, and therefore test the same merge candidate that
the existing `pull_request` Actions workflow checks out. Pushes require the
status and tested SHAs to be identical. The controller exports only that tested
commit/base history as a one-use Git bundle. The unprivileged runner receives
the read-only bundle but no repository credential. Candidate setup,
`verify:all`, and the six existing GitHub E2E commands run as a separate locked
`eqb-ci` Unix user under `env -i` with only tool/cache variables. No Amp Project
Secret, GitHub token, user home, production credential, DB, or deploy capability
enters that process. Fork pull requests are rejected in V1. Tracked checkout
drift after verification is a failure. A missing, unknown, or process-exit-
contradicting sandbox result marker is a controller error, never a green run.

The trusted controller alone writes the commit status
`Amp Orb Verify (shadow)` to the PR head/push status SHA through GitHub's
commit-status API. Its fine-grained token has only repository `Commit statuses:
write`; repository read authority remains confined to the owning project
checkout.
The webhook HMAC and status token are distinct Amp Project Secrets. The plugin
is inert unless all settings and the explicit enable flag are present.

## Rollout and authority

Repository implementation, real plugin load, Project Secret installation,
GitHub webhook creation, and branch-protection changes are separate actions.
No live action is implied by this ADR. After activation, the shadow result is
compared with GitHub Actions for 10–20 code-bearing PR/main runs, including
failure and recovery cases. GitHub Actions remains the sole required release
gate during this period. Making the Orb context required, reducing GitHub jobs,
or changing deploy gates needs a later direct Owner decision backed by paired
reliability and timing evidence plus a rollback plan.

## Consequences

- Duplicate GitHub/Amp delivery cannot multiply full-suite work for one SHA.
- An idle agent or failed LLM wakeup cannot strand CI work because the plugin
  launches the filesystem-backed controller directly.
- Orb pause retains the kernel lock; process death releases it and leaves a
  recoverable queue item or receipt state.
- A transient final GitHub API failure does not rerun an already completed
  suite.
- Same-repository candidate code can use network and shared content-addressed
  dependency caches, but cannot read controller credentials. Supporting fork
  PRs requires a stronger disposable sandbox and is deliberately deferred.
- The dedicated Orb saves hosted-runner wall time only after empirical parity;
  it does not silently become a release authority.

## Rejected alternatives

- **Immediately replace GitHub Actions:** removes the independent baseline
  before reliability is measured.
- **Create one Orb thread per delivery:** introduces duplicate-thread and
  create/bind crash windows while competing for the same 16 cores.
- **Append a fixed prompt to the owning thread:** `appendUserMessage` durably
  appends and can steer a busy turn, but the API does not promise to start an
  idle agent; activation proved that a queued message can remain unprocessed.
- **Run verification inside the 30-second webhook handler:** violates Amp's
  documented handler deadline and retry contract.
- **Pass the status token through a scrubbed same-user environment:** another
  same-UID process can still inspect controller state; a separate Unix user is
  the minimum acceptable boundary.
- **Accept fork PR code in V1:** persistent caches and a long-lived Orb are not
  a sufficient hostile-code sandbox.

## References

- Amp plugin API: `createWebhook` durable at-least-once delivery and 30-second
  handler deadline (`amp plugins show-docs`).
- GitHub: [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).
- GitHub: [Commit statuses REST API](https://docs.github.com/en/rest/commits/statuses).
