---
name: importing-nck1-papers
description: "Imports and resumes NCK1 papers locally from explicit Owner requests in Amp, through Source Materialization, Screen/PDF preview, exact revisions and separately authorized publication. Use when the Owner asks to 导题、继续某套卷、查看导题状态、处理审核反馈、重新提交 revision、上线某卷，or names an import submissionId or paperId; not for ordinary question-bank editing."
---

# Importing NCK1 Papers

Run the repository's NCK1 import loop from its current durable state. The Owner
describes the outcome; do not make them remember pipeline commands.

Amp is the sole communication and import-start entry. Webhook automatic intake
and dispatch are retired. Start new work only from an explicit Owner request,
using the contract's off-ledger file path. Before submitting a production Candidate,
wait for the Owner's explicit Amp confirmation that this version may enter web
review. Preparation/import permission alone does not authorize that submission.
The Owner then opens the exact Screen from the compact website review list and
clicks `发布到题库` to approve and publish that version. The server records both
intents and executes publication; the import Agent stops at `awaiting_review`.
Amp confirmation to send for review is never publication permission.
Keep historical ledger records, bindings, leases and UNKNOWN evidence intact;
never treat an old notification as permission to resume them.

## Local execution and fast start

Import preparation, OCR, audio processing, summaries, metadata and rendering
run on the Owner's local machine. Continue the existing local paper thread and
worktree; do not select the dedicated Import Project or create/resume an Orb.
One writer owns each paper. This changes execution routing, not model selection,
source identity, historical claims or production authorization.

If an independent worker is necessary, use `executor: runner`, a live local
`runner_id` and an allowed `working_directory`; omit `project` and `orb_size`.
Never fall back to Orb when the local runner is unavailable. Reuse a suitable
local Low thread for summaries/metadata, with `features: []`; otherwise prepare
a separate local worktree with matching code before dispatch. Do not create a
thread merely to reach the checkout already executing the task. Concurrent
workers must have disjoint write surfaces, never two writers in one worktree.

Keep source bytes and immutable receipts in the paper workspace, never in this
skill. Preserve verified local inputs and shared dependency targets. Check the
actual local toolchain before processing; do not run Linux Orb setup scripts
on macOS or install/upgrade dependencies midway through a paper to hide failure.
Keep CLI, schemas, renderer and validators at the same explicitly identified
version. Messages do not transfer files or uncommitted code between workspaces.

Local Review uses fresh operational database copies, local credentials and a
verified loopback origin. Never run a preserved backup in place or reuse an old
Orb launcher, PID or inherited origin. Historical ledger bindings remain evidence,
not permission to move a lease or resume a remote writer.

## Deliver the real preview and report in chat

Smoke-check and share the exact managed portal URL
`/?view=paper-browse&paperId=<id>&reviewRevision=<id>`, not the portal root or OPS.
Use the real website renderer and ordinary authentication; never insert tokens
in the URL. Confirm login preserves the complete route, exact Candidate identity,
first visible state, Screen and required PDF editions before handing it over.
Do not render or request PDFs again when preserved exact-version QA suffices.

Send OCR corrections in Amp chat: source page/item, original OCR, confirmed text,
reason, and unresolved uncertainty. Distinguish OCR repairs from evidenced source
spelling/layout errors. Summarize long reports and attach details if needed;
do not make another report portal. `before` must match the immutable historical
OCR receipt, not an older cleaned materialization. Keep the machine-bound report
in the Candidate even though the Owner reads its explanation in chat.

## New public-paper profile (primary path)

New raw-source workspaces use `public-paper-v1`. Preserve complete source-backed
questions, authoritative answers, numbering, media and locators. After source
review, run `review.mjs prepare-summaries <paperId> --output <request.json>`.
It works before the sidecar exists and emits exact IDs/digests, schema, prompt,
full target groups, authoritative answers and paragraph targets. If generation
is needed, send only this request to one built-in `low` thread with `features: []`;
do not make a model call implicitly. Save its JSON as `paragraph-summaries-v1.json`
and run `review.mjs verify-summaries <paperId>`. Then run the implemented compact
metadata sequence: `prepare-search-metadata <paperId> --output <request.json>`,
send that explicit request to one built-in `low` thread with `features: []` when
generation is needed, `finalize-search-metadata <paperId> --input <authored.json>`,
and `verify-search-metadata <paperId>`. The required files are
`paragraph-summaries-v1.json` and `public-search-metadata-v1.json`.

Use Low's own Amp-provided model and reasoning configuration, without a custom
model/effort pin or a duplicate agent mode. Keep local runner execution and
`features: []`. If Low is unavailable, stop without mode fallback or Oracle/Task calls.
Existing bound coordinators retain their identity and configuration.

The agent handles OCR transcription checks and reports listening evidence scope.
For a legacy ASR listening blocker, inspect bound evidence and explicitly `finalize-listening`
with a genuine `import_agent` review; never manufacture a passing result.
For current public-paper OCR, use the genuine Agent `proofread-ocr` route and
pull its immutable receipt as described in `docs/import/agent-contract.md`.
Owner sees a correction report, not an OCR checklist. Record OCR recognition
repairs and source spelling/layout errors with before/after and source location;
do not use OCR receipts to rewrite source content. Source-text review v3 follows
`docs/import/agent-contract.md`: correct clear spelling errors, obvious grammar
errors, repeated ordinary spaces, and the narrowly specified English dash/curly
double-quote spacing, but do not polish awkward English or make uncertain meaning
substitutions. Preserve hyphens, numeric ranges and Chinese punctuation; do not
insert spaces between closing quotes and punctuation. Keep original source and historical review
records unchanged; record exact categorized edits in a new bound review. Report
in Chinese with original English excerpts; remaining doubts do not block import.
Finalize the current
Candidate-bound report before submission. Never fabricate missing historical
reports or present an old OCR-stage result as current Candidate text.

Do not dispatch the nine teaching analyses for this profile. Do not create
teaching prose, highlights, embeddings or metadata outside the compact request.
Summarize only
prose body paragraphs in grounded Chinese; gapped passages may use authoritative
answers for comprehension without changing source. Review and explicit promotion
remain separate boundaries. Legacy absent-profile workspaces, listening
supplements hydrated from Review, and external analyzed packages preserve their
existing profile, analyses and approval identity. Never silently migrate them.

The teaching doctrine remains the legacy/curated-analysis path; do not
delete or replace its files or prompts.

## Name, exam date and four products

Read `docs/product/paper-pdf-products-v1.md` and the format standards before
preparing products. The Owner supplies source files and exam year/month; derive
source roles, paper identity and the complete formal name from the question
paper's heading. Do not use filenames, answer-book titles, invented prefixes or
AI-polished names. Preserve heading text and locators; report genuine ambiguity
or conflicting dates, not routine extraction work.

Pass `--year <Owner year> --month <Owner month>` to `universal-nck1.mjs init`
or `attach-answers`. These integers are independent Source metadata, carried
through Review, publication and website indexing; never infer them from a name,
school year or import time. Missing new-paper dates mean preparation is incomplete.
Historical missing months stay unknown; never manufacture a day or backfill January.

Current products are exactly `largeComplete` (12pt/19.5pt, at most12 A4 pages),
`largeNoListening` (same size, at most10), `economy8` (strict8; bounded fallback
to10.5pt/18pt) and `answerOnly` (12pt/19.5pt, natural pagination, reference-v2).
The first three contain no answers, writing references or transcripts. Student/
Teacher are not product choices; preserve their internal roles and exact historical
replay, without treating a teacher export as an answer booklet.

Use the contract's18pt/27pt source name,8pt gap and independent20pt subject title.
The accepted long-name direction is single-line PDF fitting by reducing title
size, without shortening or distorting text. The14pt floor is still proposed
and generic fitting is not wired: do not call it approved or implemented.
Screen keeps its separate24px/36px responsive name layout.

Capture every source writing reference in `source-references-v1.json`, bound to
this paper, Source, Candidate, materialization and original source locators.
Use `answer-products.mjs prepare` / `finalize` as documented; its `--output`
must be a new path. Preserve all source labels, paragraphs and variants; no
AI answers or model essays. Missing source and unfinished capture are distinct.

After source review, summaries, metadata, waveform and pagination are ready,
run `node scripts/import-pipeline/freeze-products.mjs --paper-dir <workspace>`
before Review push. New workspaces require the four frozen products and
`products/manifest-v1.json`; these bind all non-product input bytes, exact name
and exam date. Existing products are never overwritten: repair in a new working
copy and revision, then freeze once. Reuse exact byte/visual evidence while
its inputs remain valid; do not rerender unchanged PDFs just for handoff.

Publication is separate: only the exact approved revision may archive reviewed
files to private local/R2 content-addressed storage and bind its inventory to
the publication. Website Screen/download reads by paperId, publicationDigest
and edition, never mutable latest or render-on-miss. Storage failure/UNKNOWN
needs read-only reconciliation, not blind replay or a backend fallback.
R2, production configuration and deployment are not activated by this skill.
PDF repair creates a new reviewed publication; retain old versions and links.

## Preserve the legacy teaching path

Only for absent-profile / external analyzed-package teaching work, read and
follow `reference/legacy-teaching-workflow.md` before generation. It retains
the complete staged contracts, Low + fast delegation, validators, doctrine and
fixed benchmark. Do not run that path for new `public-paper-v1` imports.

## Start from the durable control plane

1. Read `docs/import/agent-contract.md` before changing import data.
2. When the task names a source-ledger `submissionId`, use
   `node scripts/import-pipeline/source-intake.mjs status <submissionId>`;
   no `paperId` is needed before claim. Follow its `nextCommand` using bounded
   `continue`; claim, download, initialize, and hand off only that immutable
   submission. The CLI sends the runtime
   `AMP_THREAD_ID`; never move its claim receipt or source files to another
   thread.
3. Recheck the downloaded byte length and SHA-256 against the server snapshot.
   Use the returned `lease.renewalCommand` before source/audio review and at
   least every 10 minutes while claimed. Expiry or unknown outcomes require
   read-only reconciliation, not automatic reclaim. If sources are incomplete
   or ambiguous, call `needs-owner` with the factual blocker and stop.
4. Let the CLI resolve identity: raw `new_paper` defaults to `paper-<submission
   UUID>`; a new analyzed package uses its own `package.json.paperId`; a
   supplement/correction uses the immutable `targetPaperId`. Never hunt an
   as-yet-uncreated paper in Review or choose a replacement ID on retry.
   For `listening_supplement`, `init`
   hydrates the latest finalized Candidate from Review, and the supplement must
   contain exactly one MP3 and no duplicate question or answer documents.
5. Follow the offered `handoffCommand` after verified initialization, before
   summary/metadata generation or Review push/waits. Handoff ends the lease;
   it does not approve OCR, source evidence, or publication. Both receipts must
   bind the same submission id/digest, Amp thread id, and paper id. If `init`
   stages listening audio, follow the returned `tasks` and finish the listening
   check below first. A completed handoff is retained locally; `status` and
   `continue` then return the Review command without reclaiming.
6. After handoff (or for an existing off-ledger paper), run:

   ```bash
   node scripts/import-pipeline/review.mjs preflight <paperId>
   ```

7. Treat its JSON `state` and `blockers` as the import resume point. Do
   not run a later-stage command because files merely appear to exist.
8. Before source-ledger or Review access, require both
   `QUESTION_BANK_IMPORT_OPS_ORIGIN` and
   `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN`. Never print the token.

For new work, collect the source roles, truthful name and provenance from the
Owner's Amp request and files. Confirm one writer owns the paper before
initializing; do not synthesize a ledger record. The submission/lease procedure
above is retained only for Owner-requested continuation of historical work.

## Current signal-only listening lane

For new dedicated-project imports, after source initialization and before
materialization, stage the uploaded audio exactly once:

```bash
node scripts/import-pipeline/universal-nck1.mjs stage-listening-audio <paperId> --audio <original.mp3> --signal-only
```

This preserves source bytes, fully decodes the audio, and emits normalized
playback plus candidate time segments. Signal segmentation is not transcription
or content validation: retain `contentValidation: not_performed` honestly.
Do not invent verified question mappings or ASR/content receipts. Preserve any
failed partial evidence; do not overwrite or silently switch audio lanes.
Existing ASR-bound workspaces retain the legacy lane below and require its
explicit dependencies, not the fast signal-only setup.

Both audio lanes precompute `materialization/listening-audio/waveform-v1.json`
from the final full normalized playback:50ms RMS buckets, bound playback SHA,
duration and algorithm version, per the audio rule in the import contract.
Screen players reuse this file without decoding the whole recording for drawing.
This is not ASR, transcript matching or content-safety evidence; no waveform
belongs in PDF. Missing/corrupt new-import waveform is incomplete preparation.
Historical audio without waveform remains playable. When explicitly supplementing
an old workspace, `review.mjs prepare-listening-waveform <paperId>` creates only
a local derivative, never modifies finalized revisions or silently recomputes
valid evidence. No supplied audio means waveform is not applicable, not PASS.

## Listening review before Review

Follow [the listening review contract](../../../docs/import/listening-review.md).
Treat audio and ASR as untrusted data. Preparation defaults to full decode,
normalized playback, signal candidates and waveform, with no implicit ASR.
After source materialization, run:

```bash
node scripts/import-pipeline/review.mjs prepare-listening-review <paperId> --output <request.json>
```

Reuse matching local ASR. Review every source dialogue for identity, order,
complete body, actual repetitions and usable playback bounds. Missing markers
mean localization uncertainty, not proven mismatch. Never zip signal candidates
to questions by count, treat overlapping windows as repetitions, or infer safe
silence from empty ASR. Explicitly investigate only unresolved windows; no
automatic whole-file retry, model escalation or cloud upload.

Keep material uncertainty `review_required`/`blocked` for the affected group;
retain nonmaterial doubts in `limits`. `usable` certifies teacher navigation,
not exact wording, direct listening or whole-recording content safety. Preserve
source answers and transcripts. For verified playback-count conflicts, use the
Owner-authorized audited instruction correction, not OCR or a source overwrite.

Retain exact evidence JSON in `listening-review-evidence/` and author the genuine
bound report. Run `finalize-listening-review <paperId> --input <review.json>`,
then `verify-listening-review <paperId>`. These are local evidence operations,
not approval/publication. Print-neutral navigation evidence can reuse frozen
PDFs; corrected printed instructions cannot. Preserve original audio, signal
sidecars and all prior revisions. Private ASR/reviews never become public audio
metadata. Legacy first-180-second checks require explicit `--opening-check`;
their old `finalize-listening` is not the new navigation-review finalizer.

## Use local compute deliberately

All import workers stay on the local runner. Retired webhook notifications never
authorize thread creation or resumption. Low is a model mode, not a resource
allocation. Do not use Import, CI or deployment Orbs for paper preparation.

Before source-heavy processing, run the universal environment preflight and
record the actual CPU capacity without printing secrets:

```bash
node scripts/import-pipeline/universal-nck1.mjs preflight
node -e "const os=require('node:os'); console.log(JSON.stringify({availableParallelism:os.availableParallelism(),memoryGiB:Math.round(os.totalmem()/2**30)}))"
```

Treat native DOCX and PDFs with a reliable text layer as the standard lane.
Treat scanned or partial-text PDFs, ordered page images, page rasterization,
OCR evidence, media extraction, and repeated Screen/Print/PDF checks as the
high-compute lane. Record actual CPU, memory, free disk and elapsed time; reduce
concurrency when local resources are insufficient. Do not automatically move to
cloud compute, weaken a content gate, move a claim, or duplicate the import.

Use bounded parallelism only for independent read-only or page-isolated work
whose outputs have unique paths, such as rasterizing separate pages or checking
separate OCR pages. Keep capacity for the Agent and system tools. Materialization,
`verify`, `build`, revision submission, lease transitions, handoff, and promotion
remain serial under the one paper writer. CPU makes local document work faster;
it does not make AI judgment more authoritative, permit AI-derived answers, or
replace page-by-page visual verification.

## Resume by state

| State | Agent action |
| --- | --- |
| `materializing` | Continue immutable source capture and Source Materialization, run universal `verify` and `build`, and complete AI Answer Transcription Check. For `public-paper-v1`, prepare/finalize/verify per-body-paragraph summaries and compact public search metadata; do not create teaching analyses, highlights, embeddings, or metadata beyond that request. Only legacy absent-profile / external `analyzed_package` workspaces produce and validate all nine staged analyses. Report readiness in Amp; submit a Candidate only after explicit permission to send this version for web review. |
| `awaiting_review` | Report the current revision and stop for Owner QA. Do not create another identical revision merely to look busy. |
| `changes_requested` | Read current issues with `review.mjs status`; reply, correct local Materialization, rerun `verify` / `build`, then obtain renewed Amp permission to send for review before `push --resolves <current issue ids>`. Never modify a finalized revision. Owner verifies fixes on the website before publishing. |
| `approved` | Stop. Approval alone is not publication. Ignore compatibility-only local `accept` / `publish` suggestions for Review-backed production papers. The Owner can publish from the website; do not automatically call promotion. |
| promotion `publishing` | Report the active guard/receipt and stop. Retry requires a current Owner `重试上线 <paperId>` command. |
| promotion `failed` | Report the exact failure and stop. Retry requires a current Owner `重试上线 <paperId>` command. |
| promotion `published` | Report the receipt, vN, and digests. Do not republish or redeploy. |
| `failed` | Report every blocker. Repair only the named local/review problem; rerun preflight before resuming. |

`rendererStale` is a `changes_requested` resume: after explicit permission to send
for review, submit the same current Candidate under the current renderer. An old local approval
or publication receipt never authorizes resubmission or promotion after a newer
Review revision exists. Use `review.mjs status <paperId>` for the server's exact
approval and promotion state; old local `locally_published` / `shipped` receipts
are historical compatibility evidence, not the Review-backed production path.

## Website publication and retained legacy recovery

The normal route is the Owner-only `/ops/` list: paper-name links open the exact
Screen directly, `退回修改` records revision-bound feedback, and `发布到题库`
expresses final approval plus publication. No three-column Owner workbench,
separate grant page or Agent redemption is required. Keep immutable evidence and
history; do not remove underlying safeguards while simplifying the website.
Do not click the publish button on the Owner's behalf merely because they allowed
submission. A publishing/failed/UNKNOWN operation still requires read-only
reconciliation and explicitly authorized recovery, never an automatic retry.

The following capability/ship-token routes are retained only for an explicitly
authorized legacy or recovery transaction, not as daily steps after web review.

When the server has the separately activated scoped-publication route, after an
explicit Owner instruction for the previewed paper/revision use:

```bash
node scripts/import-pipeline/review.mjs request-publication <paperId> --revision <exact-preview-id>
node scripts/import-pipeline/review.mjs publication-status <paperId>
node scripts/import-pipeline/review.mjs redeem-publication <paperId>
```

The first command returns a small authenticated Owner confirmation page, outside
OPS. Layout approval and one-time publication delegation are separate actions.
Complete ordinary website login at the exact preview first. For a local origin,
share the returned confirmation path on that same managed website portal, never
the raw loopback API URL; `/api/` uses the existing website proxy.
For authorized isolated preview, bind `QUESTION_BANK_IMPORT_REVIEW_OWNER_ORIGIN`
to that exact portal origin; keep `QUESTION_BANK_PUBLIC_ORIGIN` on the matching
local app for server-side rendering. Never accept arbitrary forwarded origins.
Only redeem after the exact grant is recorded; chat wording alone cannot create
server-authenticated authority. The route is default-off and requires controlled
server activation; never enable it or distribute a ship token to make import work.
`AMP_THREAD_ID` is audit metadata, not authenticated thread identity. The security
boundary is the Agent principal plus the per-request secret, retained privately
by the originating thread. Never print, attach or transfer that secret.

On response loss, inspect `publication-status`; consumed replay is read-only and
does not retry publication. `request-publication ... --new-request` may archive
the old capability only after server-confirmed expiry/revocation or a completed
published operation. Never renew a consumed publishing/failed/UNKNOWN operation.
Preserve locks and evidence after interruption; reconcile before recovery.
Each new request needs fresh Owner delegation. A trusted Amp-to-server identity
bridge is still required for fully chat-only authorization.

The retained privileged recovery/legacy path below is not the routine credential
for dedicated import threads.

Web approval always stops the import worker. Only when the Owner's current
message explicitly says `上线 <paperId>` may the Agent run:

```bash
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-ship
```

The command first displays the current approval/revision/digests using the
low-authority Agent token, then invokes the server with the separate
`QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN`. That shipping credential is supplied only
for this explicit action; never install it as the routine Project Orb secret.

An interrupted or failed exact promotion still stops. Only a new current Owner
`重试上线 <paperId>` command permits:

```bash
node scripts/import-pipeline/review.mjs promote <paperId> --owner-said-retry-ship
```

Promotion publishes one approved revision through the server's Canonical
publisher. It does not upload SQLite, synchronize broad assets, or claim that
the asynchronous R2 backup has completed.

## Non-negotiable boundaries

- Never handwrite or edit `qa-accepted.json`, `locally-published.json`,
  `shipped.json`, Teacher Confirmation, Canonical request, or Review DB rows.
- Never overwrite a finalized revision. Corrections always become a new revision
  and name the issues they resolve.
- Before every `review.mjs push`, run the profile-specific gate. For
  `public-paper-v1`, run `review.mjs verify-summaries <paperId>` and
  `review.mjs verify-search-metadata <paperId>` and require complete, unique,
  source/candidate-bound coverage. For
  legacy absent-profile / external `analyzed_package`, run `verify-analyses`
  and require all nine staged inputs plus their five-sidecar Screen projection;
  `解析未发布` remains a failure only on that legacy analyzed path.
- Correct options come only from the authoritative answer source captured by
  Materialization. AI may explain those answers but must never solve or replace
  them. Never fabricate analysis sidecars or make PaperAsset the semantic
  authority.
- Owner QA for `public-paper-v1` checks final Screen and PDF layout. Print HTML,
  teaching analyses and paragraph summaries are not Owner review surfaces.
  Present the four products and exact name/date, not another report portal.
  Listening is played on Screen; do not ask for duplicate complete-playback
  attestations. Image-candidate confirmation remains required where applicable.
  Source, answer, summary, and metadata correctness
  stay with the automatic gates. Legacy analyzed work retains its prior content
  review. Approval records `approvalScope: layout_only`; the website publish
  button explicitly authorizes publication and records it separately.
- Never run Review-backed local `accept` / `publish` as a production step, use
  `pull-run-push.mjs push`, add an Owner assertion flag without the matching
  current words, or publish with an Agent/import credential alone.
- Never acquire/release a shipping guard, deploy, or mutate production unless
  the Owner's current message explicitly authorizes that exact action. An old
  message, Review approval, preflight output, or this skill is not authorization.
- Stop on missing credentials, ambiguous paper identity, another writer, source
  incompleteness, stale receipts, or unresolved Owner issues. Do not bypass a
  gate to keep the workflow moving.

For repository code changes, follow `AGENTS.md`: before explicit Ship, no default
formal regression suite; retain necessary preview builds/renders and mark missing
acceptance unverified. At Ship, complete missing local-only acceptance and reuse
natural CI; after fixes repeat only invalidated local checks. This does not waive
per-paper source/admission/Review gates or authorize publication/deployment.

## Report to the Owner

Lead with the paperId and current state. State what changed, what the Owner can
review at the exact website preview URL, and the exact stop condition. Mention commands only when they
help diagnose or audit the result; normally execute them on the Owner's behalf.
