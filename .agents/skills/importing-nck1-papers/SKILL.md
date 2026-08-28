---
name: importing-nck1-papers
description: "Imports and resumes NCK1 English exam papers through Source Materialization, web QA feedback, revision resubmission, exact Owner approval, and local publication. Use automatically when the Owner asks to 导题、继续某套卷、查看导题状态、处理审核反馈、重新提交 revision、认可后本地发布，or mentions an import paperId; do not use for ordinary question-bank editing."
---

# Importing NCK1 Papers

Run the repository's NCK1 import loop from its current durable state. The Owner
describes the outcome; do not make them remember pipeline commands.

## Start every invocation with preflight

1. Read `docs/import/agent-contract.md` before changing import data.
2. Resolve the exact `paperId`. Never infer one when multiple papers could match.
3. Run:

   ```bash
   node scripts/import-pipeline/review.mjs preflight <paperId>
   ```

4. Treat the JSON `state`, `blockers`, and `next.action` as the resume point. Do
   not run a later-stage command because files merely appear to exist.
5. Before review submission or any later action, require both
   `QUESTION_BANK_IMPORT_OPS_ORIGIN` and
   `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN`. Never print the token.

For a brand-new import with no `paperId`, collect the three inputs named in the
contract: absolute source paths with roles, paperId, and truthful paper name /
provenance. Confirm one writer owns that paper directory before initializing.

## Resume by state

| State | Agent action |
| --- | --- |
| `materializing` | Continue immutable source capture and Source Materialization. Run universal `verify` and `build`, complete AI Answer Transcription Check, then submit a new review revision. |
| `awaiting_review` | Report the current revision and stop for Owner QA. Do not create another identical revision merely to look busy. |
| `changes_requested` | Read current issues with `review.mjs status`; reply, correct local Materialization, rerun `verify` / `build`, then `push --resolves <current issue ids>`. Never modify a finalized revision. |
| `approved` | Follow `next.action`: run `accept` when the exact local QA receipt is not current, then rerun preflight; run `publish` only when preflight says `publish_local`, then rerun preflight. |
| `locally_published` | Stop and inspect the incomplete publication closure. Do not delete receipts, overwrite `latest`, or force a second version. |
| `ready_to_ship` | Report that local publication is ready and stop. Approval and local publication are not deployment authorization. |
| `shipped` | Report completion; do not republish or redeploy. |
| `failed` | Report every blocker. Repair only the named local/review problem; rerun preflight before resuming. |

`rendererStale` is a `changes_requested` resume: submit the same current Candidate
as a fresh immutable revision under the current renderer. An old local approval
or publication receipt never authorizes `accept`, `publish`, or shipping after a
newer Review revision exists.

## Non-negotiable boundaries

- Never handwrite or edit `qa-accepted.json`, `locally-published.json`,
  `shipped.json`, Teacher Confirmation, Canonical request, or Review DB rows.
- Never overwrite a finalized revision. Corrections always become a new revision
  and name the issues they resolve.
- Never fabricate analysis sidecars or make PaperAsset the semantic authority.
- Never run `pull-run-push.mjs`, add `--owner-said-ship`, acquire a shipping
  guard, deploy, or mutate production unless the Owner's current message
  explicitly says `上线 <paperId>` (or `重试上线 <paperId>` for `ship_failed`).
- Even with that current command, first require `ready_to_ship`, read the go-live
  record, disclose the whole-database/additive-assets blast radius, and run the
  separate ship checklist. Preflight itself always reports
  `production.pushAllowed: false` and never grants authorization.
- Stop on missing credentials, ambiguous paper identity, another writer, source
  incompleteness, stale receipts, or unresolved Owner issues. Do not bypass a
  gate to keep the workflow moving.

## Report to the Owner

Lead with the paperId and current state. State what changed, what the Owner can
review in `/ops/`, and the exact stop condition. Mention commands only when they
help diagnose or audit the result; normally execute them on the Owner's behalf.
