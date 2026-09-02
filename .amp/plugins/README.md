# Project plugins

## NCK1 staged-analysis agent

`nck1-analysis-agent.js` registers `nck1_analyze_group` for the paper-import
coordinator. It deliberately fixes one worker configuration instead of reusing
one conversation:

- model: `openai/gpt-5.6-sol`;
- reasoning effort: `medium`;
- tools: none;
- context: one new child thread per invocation;
- input: one source group, that group's authoritative answers, its tracked
  output contract, and the shared teaching doctrine;
- output: a small provenance envelope whose `analysis` member is the generated
  JSON object; actual model identity is stamped and invented reviewer/time
  fields are removed; the tool never writes files.

Application and Continuation calls must use the tracked composed contracts from
`buildApplicationStagedAnalysisContract` and
`buildNarrativeContinuationStagedAnalysisContract`. The plugin rejects either
writing group's base prompt without its staged packaging contract.

The unique paper writer validates `result.analysis` through the existing
type-specific validator before saving the corresponding staged file. Grammar
Fill first runs `stampGrammarFillDerivedFields`, then validates. The writer must
not pass a whole paper to this tool. Model changes are explicit code changes,
not per-call options. Run `node scripts/verify-nck1-analysis-agent-plugin.mjs`
after changing this boundary.

## Source-intake wakeup plugin

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

### Import worker Orb size

The plugin API's `createThread` contract accepts `executor: 'orb'` but no per-thread `orbSize`.
Automatic import workers therefore inherit the Amp Project's default Orb size. Run this plugin in
a dedicated import Project whose default is `a1.xxlarge` when scanned PDFs and ordered page images
are expected; changing the default affects only new threads and does not resize an existing worker.
Keep the import Project separate from the dedicated CI and deployment Orbs so their credentials,
lifecycle, and workload remain isolated. The `importing-nck1-papers` skill checks actual processor
capacity and uses bounded parallelism only for independent page work; paper state transitions stay
single-writer. A smaller-than-expected worker may be slower but must not weaken gates or move a
bound source-intake claim to another thread.

Creating the secrets, enabling/reloading the plugin, and configuring the webhook are shared-state
operations that remain disabled until separately authorized by the Owner.

## GitHub CI Orb

`github-ci-wakeup.js` is an inert-by-default CI wakeup for one dedicated private project
Orb thread. A verified GitHub delivery is atomically written to that Orb's private mode-0600 disk
queue before the 30-second webhook handler starts a background queue drainer and returns. Plugin
startup starts a drainer only when that queue already contains recovery work, so an empty automatic
plugin load does not require an early Orb keepalive lease. If a recovery lease is temporarily
unavailable, initialization keeps the webhook registered and the queue intact for a later delivery
instead of unloading the plugin. Blocking kernel `flock` holders drain the queue serially;
concurrent launchers wait instead of dropping work in a lock race. The webhook never depends on an
LLM turn to wake or interpret the event. The plugin hands the controller to a detached, unreferenced
child process using the setup-owned `$HOME/.local/node-24/bin/node` (the plugin runtime executable
is Amp, not Node) so returning from the webhook callback cannot reap it; a bounded private
`launcher.json` records the latest spawn/error/exit metadata without capturing output or environment
values. A scoped Orb keepalive lease spans every webhook-triggered child process and is released
exactly once when it settles, so a ten-minute verification cannot be paused immediately after the
webhook handler returns.

The controller records one atomic private receipt per `(workflowVersion, testedSHA)`, so Amp's
at-least-once delivery cannot execute an already reported run again. Orb pause cannot make a live
kernel lock look stale, and process death releases it without an old owner being able to remove a
successor's lock. A temporarily unresolved merge ref keeps its queue item for the next plugin load
or delivery without blocking later queued work.
Before creating the isolated checkout bundle, the trusted controller completes a shallow Orb clone
once; otherwise a merge commit can omit its second-parent objects and must fail before verification.

The allowlist accepts same-repository pull requests into `main` on `opened`, `synchronize`,
`reopened`, and `ready_for_review`, plus pushes to `refs/heads/main`. It verifies GitHub's raw-body
`X-Hub-Signature-256`, ignores PR title/body text, and rejects SHA drift. For PRs, the trusted
checkout verifies GitHub's exact test-merge SHA and ordered base/head parents, matching the existing
Actions workflow rather than testing the head in isolation. GitHub PR payload merge SHAs may be null
or stale, so every signed PR delivery durably queues only its base/head/PR identity before any
network lookup. The background controller resolves the current `refs/pull/<number>/merge`, accepts
it only when its two parents exactly match the signed delivery's base and head, and never substitutes
the head SHA. It then passes a one-use read-only Git bundle—not a repository credential—
to the runner. Workflow v3 starts two separate candidate checkouts concurrently: the Fast lane runs
the six existing GitHub E2E commands on isolated ports, while the Full lane runs `verify:all`. The
informational `Amp Orb Verify (fast)` status reports as soon as E2E settles. The aggregate `Amp Orb
Verify` status waits for both lanes and fails if either lane fails or either tracked checkout drifts.
Candidate code executes as the separate locked `eqb-ci` Unix user under an empty allowlisted
environment; Amp Project Secrets and the commit-status token stay in the trusted controller process.

Activation and authority changes are shared-state operations requiring current Owner approval.
Configure these private Amp Project settings, then load the plugin only in the dedicated owning Orb
thread:

- `QUESTION_BANK_AMP_CI_PLUGIN_ENABLED=1`
- `QUESTION_BANK_AMP_CI_GITHUB_WEBHOOK_SECRET=<high-entropy GitHub webhook HMAC secret>`
- `QUESTION_BANK_AMP_CI_GITHUB_STATUS_TOKEN=<fine-grained token limited to Commit statuses: write>`

After an approved plugin load, explicitly run `CI Orb: 复制 GitHub CI Webhook URL` and put the
private capability URL in one GitHub repository webhook that sends only Pull requests and Push
events, using the same HMAC secret. Never commit or log the URL or either secret. Branch protection
temporarily requires hosted `verify` and `e2e` while Amp bug
`amp_bug_0uiggF5jWG6i6iaB72BATT` blocks this webhook's public ingress. Both Orb contexts are
informational during the rollback; ADR-0022 defines the proof required before they can regain merge
authority.
