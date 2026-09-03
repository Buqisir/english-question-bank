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

Amp now supports project Orb threads through
`Agent.createThread({ executor: 'orb' })`, returns `thread.id`, and can resume a
known thread through `amp.threads.get(threadID).appendUserMessage(...)`. Project
Secrets are injected into project Orbs without entering Git or prompts.

## Decision

The default wakeup target is a private project Orb thread. The source-intake DB
persists one worker binding for an immutable `(submissionId, submissionDigest)`:

- webhook event id and a finite reservation;
- Amp thread id after binding;
- paper id after handoff;
- lifecycle timestamps and the last safe worker state.

The plugin reserves first, creates an empty Orb thread second, binds its returned
thread id third, and only then appends the fixed import prompt. A retry resumes
the bound thread. If the plugin dies after thread creation but before binding,
the unprompted thread is inert; a later delivery may replace the expired
reservation without creating a second active worker. A stale reservation token
cannot bind or receive a prompt.

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

- Duplicate webhook events may append an idempotent resume prompt to one bound
  thread, but cannot create two active workers for one submission.
- Pause/resume and failed turns are recovered by re-notifying the same bound
  thread; the finite source claim lease remains the work-ownership backstop.
- An unbound empty Amp thread can exist after the narrow create/bind crash
  window. It has no prompt, source bytes, or lease and is deliberately harmless.
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
