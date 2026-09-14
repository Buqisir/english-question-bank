# Ship one task to main

Follow `AGENTS.md`. An Owner Ship Goal covers the bounded task's commits, normal
branch push, PR, verification and protected squash merge. It does not authorize
deployment, force push, bypass or changing branch protection. During the Actions
cutover follow `docs/agents/github-actions-cutover.md`; source changes alone do
not activate new protection.

## Prepare the exact candidate

1. Preserve unrelated work. Use a task branch, never commit directly on main.
2. Fetch origin and synchronize with latest `origin/main`. Do not rewrite a
   published branch merely to consolidate commits. Resolve only in-scope conflicts.
3. Classify all changed paths with `node scripts/verify-ci.mjs --plan-json
   --changed-file <path>` (repeat the flag). Apply high-risk overrides from AGENTS.
4. Require a clean worktree and record the exact candidate head/base. Rebase,
   conflict resolution or a new base invalidates prior affected verification.
5. Run the affected checks and required independent review. Full and six E2E
   results from this exact candidate's natural Actions run may satisfy the
   corresponding final gate; do not run another Full just to duplicate it.
   Keep genuinely local-only or visual verification separate. SKIP is not PASS.

## Push, inspect Actions, merge

Push normally and open/update the task PR. `.github/workflows/verify.yml` runs
from natural `pull_request` events. Use GitHub Actions/Checks directly; do not
register an Amp watcher, wake a CI thread, or request private receipts.

Before merge, verify:

- The PR remains open/non-draft, targets this repository's main, and its current
  head is the reviewed commit and contains the latest main.
- The natural `pull_request` run belongs to this repository and the fixed
  `.github/workflows/verify.yml` workflow, not another workflow with matching names.
- The run is for the current PR/head, uses GitHub's test merge, and the tested
  merge has the expected base/head parents and tree. Re-read base/head before merge.
- The latest attempt and its `verify` and `e2e` jobs are completed/success, and
  their check-runs belong to the GitHub Actions App. Missing, skipped, cancelled,
  pending or failed jobs do not pass. An older success cannot override a newer
  pending/failed attempt. A manual/local diagnostic is not natural CI authority.
- Strict/up-to-date protection requires both checks, with bypass/force/deletion
  restrictions preserved. Do not infer protection settings from an API 403.

Squash merge through ordinary protection with the expected head. If the response
is unknown, read the PR/merge/main facts before any retry. Do not use admin bypass.

For explicitly requested monitoring, poll GitHub read-only at a sensible cadence.
CI itself does not need a live agent. A notification is not merge authorization.
Diagnose failures before any authorized GitHub rerun; retain failed attempts.

## Verify main and report

Resolve the resulting main SHA and parent. Wait for that exact commit's natural
`push` run of the same workflow: latest attempt, both jobs completed/success.
For a serial batch, do not update the next PR until this gate succeeds.

Report linked PR/commit/run/check IDs, exact head/base/main/parent, machine risk,
changed paths, review evidence, checks with PASS/SKIP/FAIL and limitations, and
protection readback (or its explicit limitation). Do not imply an unmerged PR
has a main SHA, or that successful CI deployed the website.

The Deployment Orb uses the exact-main GitHub Actions reader and rechecks main
before dispatch. Never substitute an Amp Check, commit status, human report or
older run for the required native workflow evidence.
