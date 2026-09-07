# Ship one task to `main`

Commit and Ship only the current task. Follow root `AGENTS.md` and preserve
unrelated work. Use the current task-branch PR route; this prompt does not
activate Custom Ship or change branch protection. An Owner Goal to ship/merge
covers branch push, PR, verification and merge without repeated approval.
Stop at the PR if the Goal requests review only. Deployment is not implied.

## 1. Establish the candidate

1. Inspect the worktree, current branch, diff, and commits. Require every change
   to belong to the one bounded task in this thread. Do not stash, discard, or
   absorb unrelated work.
2. If currently on local `main`, create a short descriptive task branch before
   committing. Commit the current task with the repository's one-line commit
   style. If work is already committed, keep it only when the branch is one
   task; do not rewrite published history merely to consolidate commits.
3. Run `git fetch origin`, then `git rebase origin/main`. Resolve only within
   the Goal, preserving unrelated behavior; ask at the Goal boundary, not merely
   because Git reports a conflict.
4. A PR may contain multiple commits belonging to this same Owner Goal. Require
   all commits to remain in scope and use squash merge so main receives one
   independently revertible commit without unrelated behavior.
5. Capture the candidate file list from
   `git diff --name-only origin/main...HEAD` and require
   `git status --porcelain` to be empty.

Any rebase, conflict resolution, amendment, or advance of `origin/main`
invalidates all earlier classification and verification evidence.

## 2. Classify before choosing the route

Run the existing classifier against the complete file set by passing every path
as its own argument:

```bash
node scripts/verify-ci.mjs --plan-json \
  --changed-file <path-1> --changed-file <path-2>
```

When a route is unclear, also classify each path. Record the machine `risk`
and apply the stronger review/verification overrides in `AGENTS.md`, including
governance files even when Markdown reports `no-changes`.

## 3. Revalidate the exact rebased commit

Run on the post-rebase commit:

```bash
pnpm -C app verify:changed -- --base-ref origin/main
```

Also run the task's focused behavioral or user-flow check. UI work requires a
real click through the exact affected page and state. Shared-renderer work
requires `pnpm -C app verify:paper` plus affected real Screen/Print/PDF checks.
Follow every stronger final gate in `AGENTS.md`. A high-risk candidate also
requires the relevant review, `pnpm -C app verify:all`, and related E2E before
the PR is ready to merge.

Investigate failures; `SKIP` and baseline `FAIL` are not `PASS`. A baseline
classification requires the same command and failure on clean `origin/main`
with equivalent fixtures, runtime and dependencies. Preserve those failures
in the report; never weaken assertions or remove data to make them green.
Such local fixture failures do not waive the required successful App Check.
After verification, require `git status --porcelain` to remain empty and HEAD
to remain the classified same-Goal candidate.

## 4. Deliver through the PR

When explicitly waiting for a pending Check, optionally call `ship_watch_check`
with the fixed PR number and current head in this Ship thread. It polls read-only
every 45 seconds, stops after 60 minutes or PR/head drift, and sends at most one
best-effort terminal notice. Cancel with `ship_cancel_check_watch`; no schedule or
CI-host handoff is needed. A notice is not approval: on wake, freshly read the open
PR/head and latest exact-App/name Check, then perform all identity/policy gates
below. Never reuse an older green Check or infer new Ship/deployment authorization.
Read/append failure leaves CI unchanged; inspect GitHub directly, never rerun CI
just to obtain a notification. Plugin restart does not automatically resume waits.

Push the task branch without force and open one PR into `main`, reporting risk,
review and verification evidence. Before an authorized merge, require the
pinned App ID `4835036`'s successful exact-name `Amp Orb Verify` Check for the
PR's current head with ADR-0025's `v7-pr` identity recording PR number,
head/base/tested SHA, policy digest and natural delivery; verify the tested tree. Validate
the required lanes and policy in the Check output; Full `not-required/by-policy`
is not PASS. During this migration only, the pre-installation always-full v5
Check is valid for the installation gate, not evidence of reduced-lane acceptance.
Require strict/up-to-date protection without bypass; do not require a
new Check merely because GitHub rebuilt an equivalent test-merge SHA. Fetch and
verify the candidate/base are still the
reviewed ones; if `origin/main` advanced, rebase and repeat validation.
Squash merge without bypassing protection, then resolve the actual merged `main` SHA
and parent. An unmerged PR has no post-Ship SHA to hand off.

## 5. Machine evidence

Read the successful `Amp Orb Verify` Check directly on GitHub and include its
URL, immutable Check ID, App ID `4835036`, and exact tested SHA with the delivery
report. For PRs query the current head and validate the `v7-pr` binding (including
recorded tested commit's ordered parents and tree); for main
query the exact main SHA and v4 identity. Private
receipt retrieval is not part of normal Ship:

```text
sha: <40-hex>
parent: <40-hex>
risk: <machine risk, plus any explicit override>
files: <complete changed-file list>
summary: <one paragraph>
verified: <each command and PASS/SKIP, with totals and every SKIP reason>
```

Do not send routine Focused/Low handoffs or wait for their reports. The former
High thread only hosts CI infrastructure; Low is for requested troubleshooting,
not a per-Ship reporter. The webhook/controller writes the Check without an
agent turn. No human CI handoff, reply, or wait is a merge or deployment gate. A pending,
failed, wrong-SHA, malformed, or ambiguous App Check fails closed. Deployment
reads only the exact `Amp Orb Verify` Check from configured
`QUESTION_BANK_DEPLOY_AMP_CHECK_APP_ID`; legacy authority-mode configuration is
rejected.
