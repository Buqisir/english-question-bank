# Source-intake wakeup plugin

`source-intake-wakeup.js` is the optional wakeup layer for the Owner source-intake queue.
SQLite remains authoritative: a missed, duplicated, or delayed webhook cannot create a second
active claim or a second bound worker.

The plugin is inert by default. Activating it is a separate shared-state operation and requires
current Owner approval. Enable it only in the dedicated owning Orb thread, not in every local Amp
client. Before loading it, add these as private Amp Project Secrets so both the plugin and each new
project Orb receive them without storing or displaying their values:

- `QUESTION_BANK_SOURCE_INTAKE_PLUGIN_ENABLED=1`
- `QUESTION_BANK_IMPORT_OPS_ORIGIN=<private Import Ops HTTPS origin>`
- `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN=<least-privilege source-intake Agent token>`
- `QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_SECRET=<shared HMAC secret>` (recommended)

After an approved plugin reload, explicitly run the command-palette action
`题源 Agent: 复制题源队列 Webhook URL`. Put the returned capability URL in the API server’s
private `QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_URL`; configure the same HMAC secret as
`QUESTION_BANK_SOURCE_INTAKE_WEBHOOK_SECRET`. Never commit or log any of those values.

The server reserves each immutable submission before the plugin creates an empty private project
Orb. The plugin durably binds the returned Amp thread id before appending the first prompt. A crash
before bind therefore leaves only an inert, unprompted Orb; a repeated delivery resumes the one
bound thread. `scripts/import-pipeline/source-intake.mjs` sends `AMP_THREAD_ID` on every claim and
lease operation. The Agent token cannot approve Review content or promote a paper. No import runs
inside the 30-second webhook handler.

Creating the secrets, enabling/reloading the plugin, and configuring the webhook are shared-state
operations that remain disabled until separately authorized by the Owner.

## GitHub shadow CI Orb

`github-ci-wakeup.js` is an inert-by-default shadow CI wakeup for one dedicated private project
Orb thread. A verified GitHub delivery is atomically written to that Orb's private mode-0600 disk
queue before the 30-second webhook handler starts a background queue drainer and returns. Plugin
startup also starts a drainer, so a process death leaves a durable item for recovery rather than an
unprocessed thread message. Blocking kernel `flock` holders drain the queue serially; concurrent
launchers wait instead of dropping work in a lock race. The webhook never depends on an LLM turn
to wake or interpret the event.

The controller records one atomic private receipt per `(workflowVersion, testedSHA)`, so Amp's
at-least-once delivery cannot execute an already reported run again. Orb pause cannot make a live
kernel lock look stale, and process death releases it without an old owner being able to remove a
successor's lock. A failed drain keeps its queue item for the next plugin load or delivery.

The allowlist accepts same-repository pull requests into `main` on `opened`, `synchronize`,
`reopened`, and `ready_for_review`, plus pushes to `refs/heads/main`. It verifies GitHub's raw-body
`X-Hub-Signature-256`, ignores PR title/body text, and rejects SHA drift. For PRs, the trusted
checkout verifies GitHub's exact test-merge SHA and ordered base/head parents, matching the existing
Actions workflow rather than testing the head in isolation. It then passes a one-use read-only Git
bundle—not a repository credential—to the runner before `verify:all` and the existing GitHub E2E
commands. Candidate code executes as the separate locked `eqb-ci` Unix user under an empty
allowlisted environment; Amp Project Secrets and the commit-status token stay in the trusted
controller process.

Activation is a later shared-state operation requiring current Owner approval. Configure these
private Amp Project settings, then load the plugin only in the dedicated owning Orb thread:

- `QUESTION_BANK_AMP_CI_PLUGIN_ENABLED=1`
- `QUESTION_BANK_AMP_CI_GITHUB_WEBHOOK_SECRET=<high-entropy GitHub webhook HMAC secret>`
- `QUESTION_BANK_AMP_CI_GITHUB_STATUS_TOKEN=<fine-grained token limited to Commit statuses: write>`

After an approved plugin load, explicitly run `CI Orb: 复制 GitHub 影子 CI Webhook URL` and put the
private capability URL in one GitHub repository webhook that sends only Pull requests and Push
events, using the same HMAC secret. Never commit or log the URL or either secret. The status context
is `Amp Orb Verify (shadow)`: it must remain non-required while GitHub Actions `Verify` stays the
sole merge/release authority. Compare 10–20 paired runs before a separate Owner decision about any
required-check change.
