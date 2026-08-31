---
name: importing-nck1-papers
description: "Imports and resumes NCK1 English exam papers through the online source ledger, a bound Amp Project Orb, Source Materialization, web Owner Review, exact revisions, and explicit single-paper promotion. Use automatically when the Owner asks to 导题、继续某套卷、查看导题状态、处理审核反馈、重新提交 revision、上线某卷，or mentions an import submissionId or paperId; do not use for ordinary question-bank editing."
---

# Importing NCK1 Papers

Run the repository's NCK1 import loop from its current durable state. The Owner
describes the outcome; do not make them remember pipeline commands.

## Start from the durable control plane

1. Read `docs/import/agent-contract.md` before changing import data.
2. When the task names a source-ledger `submissionId`, use
   `scripts/import-pipeline/source-intake.mjs`. Claim, download, initialize, and
   hand off only that immutable submission. The CLI sends the runtime
   `AMP_THREAD_ID`; never move its claim receipt or source files to another
   thread.
3. Recheck the downloaded byte length and SHA-256 against the server snapshot.
   Keep the finite lease alive with `heartbeat`. If sources are incomplete or
   ambiguous, call `needs-owner` with the factual blocker and stop.
4. Choose a `paperId` only for a complete source set, then run source-intake
   `init` and `handoff`. Both receipts must bind the same submission id/digest,
   Amp thread id, and paper id.
5. Once a `paperId` exists, run:

   ```bash
   node scripts/import-pipeline/review.mjs preflight <paperId>
   ```

6. Treat its JSON `state` and `blockers` as the import resume point. Do
   not run a later-stage command because files merely appear to exist.
7. Before source-ledger or Review access, require both
   `QUESTION_BANK_IMPORT_OPS_ORIGIN` and
   `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN`. Never print the token.

The online source ledger is the default entry. When the Owner instead explicitly
provides off-ledger local files, collect the source roles, truthful name and
provenance required by the contract. Confirm one writer owns the paper before
initializing; do not synthesize a ledger record.

## Use the Orb compute lane deliberately

Automatic source-intake threads already use a private Project Orb and inherit
that Amp Project's default Orb size. The plugin API cannot choose an Orb size per
created thread. A dedicated import Project should therefore default to
`a1.xxlarge` when scanned PDFs or ordered page images are routine; never reuse
the CI or deployment Orb for an import.

Before source-heavy processing, run the universal environment preflight and
record the actual CPU capacity without printing secrets:

```bash
node scripts/import-pipeline/universal-nck1.mjs preflight
node -e "const os=require('node:os'); console.log(JSON.stringify({availableParallelism:os.availableParallelism(),memoryGiB:Math.round(os.totalmem()/2**30)}))"
```

Treat native DOCX and PDFs with a reliable text layer as the standard lane.
Treat scanned or partial-text PDFs, ordered page images, page rasterization,
OCR evidence, media extraction, and repeated Screen/Print/PDF checks as the
high-compute lane. Sixteen available processors confirm the intended
`a1.xxlarge` capacity; fewer processors are an efficiency warning, not a reason
to weaken a content gate, move the bound claim, or duplicate the import.

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
| `materializing` | Continue immutable source capture and Source Materialization. Produce and validate all nine staged analyses (reading A–D, seven choices, cloze, grammar fill, application, continuation), run universal `verify` and `build`, complete AI Answer Transcription Check, then submit a new review revision. |
| `awaiting_review` | Report the current revision and stop for Owner QA. Do not create another identical revision merely to look busy. |
| `changes_requested` | Read current issues with `review.mjs status`; reply, correct local Materialization, rerun `verify` / `build`, then `push --resolves <current issue ids>`. Never modify a finalized revision. |
| `approved` | Stop. Approval is not publication. Ignore compatibility-only local `accept` / `publish` suggestions for Review-backed production papers. Wait for a later, current Owner `上线 <paperId>` command. |
| promotion `publishing` | Report the active guard/receipt and stop. Retry requires a current Owner `重试上线 <paperId>` command. |
| promotion `failed` | Report the exact failure and stop. Retry requires a current Owner `重试上线 <paperId>` command. |
| promotion `published` | Report the receipt, vN, and digests. Do not republish or redeploy. |
| `failed` | Report every blocker. Repair only the named local/review problem; rerun preflight before resuming. |

`rendererStale` is a `changes_requested` resume: submit the same current Candidate
as a fresh immutable revision under the current renderer. An old local approval
or publication receipt never authorizes resubmission or promotion after a newer
Review revision exists. Use `review.mjs status <paperId>` for the server's exact
approval and promotion state; old local `locally_published` / `shipped` receipts
are historical compatibility evidence, not the Review-backed production path.

## Promote only after a new Owner command

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
- Before every `review.mjs push`, run
  `node scripts/import-pipeline/review.mjs verify-analyses <paperId>`. It must
  validate all nine staged inputs and their deterministic five-sidecar Screen
  projection. Missing, partial, or conflicting analysis fails closed; never
  hand the Owner a revision whose Screen says `解析未发布`.
- Correct options come only from the authoritative answer source captured by
  Materialization. AI may explain those answers but must never solve or replace
  them. Never fabricate analysis sidecars or make PaperAsset the semantic
  authority.
- Owner QA must inspect the AI-derived teaching analysis on the real `/ops/`
  Screen before approval. The immutable revision binds the nine input bytes and
  projected analysis digest; server promotion must preserve that exact approved
  projection.
- Never run Review-backed local `accept` / `publish` as a production step, use
  `pull-run-push.mjs push`, add an Owner assertion flag without the matching
  current words, or expose a web publish button.
- Never acquire/release a shipping guard, deploy, or mutate production unless
  the Owner's current message explicitly authorizes that exact action. An old
  message, Review approval, preflight output, or this skill is not authorization.
- Stop on missing credentials, ambiguous paper identity, another writer, source
  incompleteness, stale receipts, or unresolved Owner issues. Do not bypass a
  gate to keep the workflow moving.

## Report to the Owner

Lead with the paperId and current state. State what changed, what the Owner can
review in `/ops/`, and the exact stop condition. Mention commands only when they
help diagnose or audit the result; normally execute them on the Owner's behalf.
