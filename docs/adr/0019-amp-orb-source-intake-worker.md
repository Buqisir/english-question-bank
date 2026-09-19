# ADR-0019: Amp Project Orb 是题源队列的默认 worker

- Status: Accepted for repository implementation (2026-08-30 task scope)
- Production activation: requires a later direct Owner approval
- Upstream: ADR-0015, ADR-0016, ADR-0018

## Context

ADR-0018 made the source-intake SQLite queue authoritative and treated the Amp
webhook as best-effort wakeup. Its first implementation targeted one stable Mac
runner and relied on claim leases to stop duplicate imports, but it did not
persist the Amp thread identity. Amp webhooks are delivered at least once and
`event.id` is the documented idempotency key, so a repeated delivery could
create several threads even though only one could claim.

The plugin's `Agent.createThread({ executor: 'orb' })` cannot select a project.
An Import-controller delivery was observed creating an ordinary-project worker;
registration ownership is not a worker-project guarantee. The supported agent
tool `create_thread` accepts an explicit project. A bootstrap-only probe verified
the intended Import project and native Low definition without touching intake.
Project Secrets are injected into project Orbs without entering Git or prompts.

## Decision

The default wakeup target is a private project Orb thread. The source-intake DB
persists one worker binding for an immutable `(submissionId, submissionDigest)`:

- webhook event id and a finite reservation;
- Amp thread id after binding;
- paper id after handoff;
- lifecycle timestamps and the last safe worker state.

The plugin only wakes the fixed Import controller. The controller uses the
dispatch CLI to persist a private reservation journal, reserve once, persist a
one-shot create intent, then invoke `create_thread` with native Low, no features,
and the explicit Import project. The bootstrap turn runs but receives no source
assignment. Before bind, exported metadata must prove private visibility, the
exact project ID, native Low, and empty features. A read-only worker-status API
reconciles binding before a one-shot assignment is issued. Neither model nor
reasoning effort is pinned; the Owner controls Low configuration.

Duplicate deliveries do not recreate workers or automatically resume existing
bindings. Unknown create/reserve/bind/send results retain their evidence; no
automatic replay is permitted. The journal uses per-submission flock and atomic,
fsync'd private records. Loss of the controller or journal requires an explicit
recovery decision, not reservation replacement. The detailed procedure is in
`docs/import/agent-contract.md`. Deploy and verify the additive read-only API
before activating this flow; a repository merge alone does not activate it.

The spawned Orb reads the import-agent token from an Amp Project Secret and uses
only the existing minimal API. It sends its runtime `AMP_THREAD_ID`; once a
worker binding exists, claim, lease operations, `needs_owner`, and handoff must
match that thread. The CLI still revalidates the immutable submission manifest,
every file byte length and SHA-256 after download, and local bytes before init
and handoff.

The website remains the control plane and fact source. The Orb never receives
the whole Import Ops DB, never opens it directly, and never obtains approval or
publication authority.

## Consequences

- Duplicate webhook events may append controller wakeups, but the journal issues
  creation and assignment at most once. This is not exactly-once delivery: a lost
  assignment response can require manual read-only reconciliation.
- Existing failed/paused bindings are not migrated, replaced, or automatically
  resumed. The finite source claim lease remains the work-ownership backstop.
- An unbound bootstrap thread can exist after the create/bind crash window. It
  has a running bootstrap turn but no source assignment, source bytes, or lease.
- The fixed-controller guard prevents new Import workers from installing another
  handler for the shared registration. Unloading an old handler does not delete
  its durable registration or invalidate its capability URL.
- `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN` is designed as a Project Secret, but
  enabling the plugin, installing that secret, and registering the production
  webhook are separate shared-state actions.
- The Mac runner setting is retired from the default path. No permanent runner
  is required.

## Rejected alternatives

- **Use claim only and allow duplicate threads:** wastes agents and loses the
  durable submission/thread audit identity.
- **Create then bind and immediately prompt:** a crash before bind can leave an
  untracked active worker.
- **Copy or mount the Import Ops DB in every Orb:** expands authority, breaks the
  website fact-source boundary, and makes recovery ambiguous.
- **Run an LLM from `/ops/`:** violates ADR-0015/0016 and gives the web process
  production behavior it does not own.
