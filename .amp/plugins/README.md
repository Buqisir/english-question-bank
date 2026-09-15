# Project plugins

CI/Ship authority is native GitHub Actions under ADR-0026 and
`docs/agents/github-actions-cutover.md`. The Ship watcher below only reports
native Actions results; it does not execute CI or supply merge authority.
The GitHub CI Orb section retains legacy implementation history: do not
load/reload that CI plugin or resume its queue. Deleting a source file does
not prove a remote registration has been disabled.

## Native Actions Ship watcher

`ship-check-watcher.js` registers `ship_watch_check({pullRequest, head})`,
`ship_watch_main({head})` and `ship_cancel_check_watch({})`. Ship registers its
PR wait explicitly, then its exact-main wait after merge. Pushing alone does
not register a watcher. Each thread has one active PR or main wait. Repeating
the same target shares the original startup result, timer and deadline; a
different target requires cancelling the old wait first.
The target thread comes from the invocation context, never a tool argument.
Repository, App `15368`, and `Verify` at `.github/workflows/verify.yml` are fixed.
It validates natural PR or main push events, latest run/attempt, exact head,
suite and both `verify`/`e2e` jobs, with two stable terminal reads. It performs only GitHub
GETs using the existing `gh` authentication, every 45 seconds (no overlapping reads),
for at most 60 minutes. Head drift, PR closure, cancellation and disposal stop
the wait; it never follows a new head or modifies/reruns CI.

GitHub can return empty `pull_requests` associations even for natural PR runs.
The workflow therefore generates `Verify PR #<number> head <SHA>` from event
fields, not the editable PR title. The watcher uses that routing metadata and
the PR head branch when associations are empty; contradictory associations
are rejected. This metadata routes hints only, not merge authority. Legacy
runs with neither association nor explicit routing identity remain unknown.

A confirmed latest terminal run produces one best-effort `appendUserMessage`
without steering. Ship must recheck live identity and authority after waking.
Unsuccessful notices include failed job/step summaries and the run-attempt link,
marked as untrusted GitHub data. Deadline expiry also produces a best-effort
notice, not a CI failure or authorization to rerun.
Private mode-0600 records under `.scratch/ship-check-watcher/` claim before append;
an ambiguous append is not retried. There is no outbox, scheduler, automatic restart
recovery, or exactly-once transport guarantee: crashes can miss notifications.
An explicit restart may wait again, but an existing terminal claim is not resent.
Loading this plugin does not register a webhook or start a watcher. Load only this
plugin, never reload the CI plugin to enable it. Verify with
`node scripts/verify-ship-check-watcher.mjs`.

## NCK1 staged-analysis agent

`nck1-analysis-agent.js` registers `nck1_analyze_group` for the paper-import
coordinator. It deliberately fixes one worker configuration instead of reusing
one conversation:

- model: `xai/grok-4.6`;
- reasoning effort: `xhigh`;
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

New coordinators explicitly use `xai/grok-4.6` with `xhigh` reasoning, inheriting
Medium's orchestration prompt and tools, not its automatic model selection.
Neither plugin implements a fallback model. Provider routing and subscription
billing remain Amp-controlled and need a real-run usage check. Existing bound
threads resume unchanged; this configuration applies to newly created workers.

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

`github-ci-wakeup.js` is the dedicated private-project CI webhook controller.
A verified natural GitHub delivery is atomically written to that Orb's private mode-0600 disk
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
test-merge execution semantics rather than testing the head in isolation. GitHub PR payload merge SHAs may be null
or stale, so every signed PR delivery durably queues only its base/head/PR identity before any
network lookup. The background controller resolves the current `refs/pull/<number>/merge`, accepts
it only when its two parents exactly match the signed delivery's base and head, and never substitutes
the head SHA. It then passes a one-use read-only Git bundle—not a repository credential—
to the runner. Main v4 always starts two separate candidate checkouts concurrently: Fast runs
the six existing GitHub E2Es and Full runs `verify:all`. PR v7 uses ADR-0025's installed trusted
policy, not the candidate planner, to require Fast or Fast+Full; reduced PR Fast also runs exact-base
`verify:changed`. Missing/invalid private `pr-policy.json` selects always-full. Before
the lanes, the trusted controller POSTs the sole authoritative exact-name `Amp Orb Verify` Check as
`in_progress` under App ID `4835036` (`eqb-amp-ci-authoritative-checks`) and PATCHes the
receipt-bound same Check ID after required lanes settle. PR Checks attach to stable head, while execution
remains on the exact merge. Complete-history base ancestry in head and equal merge/head trees
are required before lanes run; strict/up-to-date main protection with no bypass must stay enabled.
PR `external_id` is `v7-pr:<number>:<headSha>:<baseSha>:<testedSha>:<policyDigest>:<naturalDeliveryId>`;
the tested commit binds its verified tree without exceeding GitHub's 255-byte identity limit.
pushes retain `v4:<testedSha>:<naturalDeliveryId>` on exact main. Discovery, manual, rerequest, forced diagnostics, Commit
Statuses, and human reports cannot publish or replace the authoritative Check.
Candidate code executes as the separate locked `eqb-ci` Unix user under an empty allowlisted
environment; Amp Project Secrets and the App credential stay in the trusted controller process.

Normal Ship reads the exact-SHA Check directly on GitHub. The original High
thread only hosts the webhook/controller infrastructure; Low is invoked only
for requested troubleshooting. No Focused/Low per-Ship report, agent turn, or
private-receipt lookup is part of the normal gate.

Activation and authority changes are shared-state operations requiring current Owner approval.
For an explicitly approved **single registration-only load**, the owning host may exclusively
create `.scratch/amp-orb-ci/registration-only.once` (or the corresponding trusted state directory)
with mode `0600` and exact contents `skip-startup-recovery-once\n` (a trailing LF).
Create it only under the existing `runner.lock` maintenance exclusion after confirming no active
or waiting controller; snapshot actual installed bytes and preserve every queue/receipt.
The plugin validates this local intent before registration, retains it if registration fails,
and consumes it after successful registration/command setup, returning before startup queue inspection.
Invalid/unreadable intent or failed consumption aborts rather than draining. Do not blindly retry
an ambiguous load: inspect the marker and runtime evidence first; marker absence alone is not proof
of the server binding. The next unmarked load performs normal startup recovery.
This does **not** pause natural signed webhook deliveries: the unchanged handler still enqueues
and launches the drainer, which can process historical queue entries. Do not use it as a general
maintenance pause or move/hide/delete queues. Same-key registration is not proof that an unknown
previous server binding can be precisely rolled back. Only the explicitly designated CI host loads
this plugin; development/review threads must not load it or create this intent.

Configure these private Amp Project settings, then load the plugin only in the dedicated owning Orb
thread:

- `QUESTION_BANK_AMP_CI_PLUGIN_ENABLED=1`
- `QUESTION_BANK_AMP_CI_GITHUB_WEBHOOK_SECRET=<high-entropy GitHub webhook HMAC secret>`
- `QUESTION_BANK_AMP_CI_GITHUB_APP_ID=4835036`
- `QUESTION_BANK_AMP_CI_GITHUB_APP_INSTALLATION_ID=<numeric installation ID>`
- `QUESTION_BANK_AMP_CI_GITHUB_APP_PRIVATE_KEY=<private App PEM>`

There is no status-token or `QUESTION_BANK_AMP_CI_GITHUB_CHECKS_ENABLED`
fallback. Do not create the App, provision these settings, or reload from
repository code.
The versioned Check `external_id` above binds its target; uncertain creation is reconciled only
through one unique exact external ID, and crash recovery PATCHes the same private-receipt Check ID
without rerunning Fast or Full. PR `v7-pr` run IDs isolate older receipts and bind PR/head/base/tree/policy;
equivalent merge rebuilds reuse the original immutable Check. Live freshness is required again
before create, execute, completion, PATCH and recovery; stale results durably become `superseded`,
never success. Unknown API state defers with evidence retained. Check output records
head/base/tested identities, policy, required lanes, duration, PASS/SKIP/FAIL,
and clean state—not a signature or independent proof. No Ed25519 attestor or signed envelope exists.

After an approved plugin load, explicitly run `CI Orb: 复制 GitHub CI Webhook URL` and put the
private capability URL in one GitHub repository webhook that sends only Pull requests and Push
events, using the same HMAC secret. Never commit or log the URL or either secret. The executable
branch-protection cutover is coordinator-owned at `docs/agents/app-ci-cutover.md`; this README does
not claim it is complete.
