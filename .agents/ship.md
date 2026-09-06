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
   task; consolidate commits only when they are demonstrably that same task.
3. Run `git fetch origin`, then `git rebase origin/main`. Resolve only within
   the Goal, preserving unrelated behavior; ask at the Goal boundary, not merely
   because Git reports a conflict.
4. Require exactly one non-merge commit in `origin/main..HEAD`. Confirm that it
   can be safely reverted without reverting unrelated behavior. Otherwise do
   not Ship.
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
Such local fixture failures do not waive the required successful Hosted gates.
After verification, require `git status --porcelain` to remain empty and HEAD
to remain the classified one-commit candidate.

## 4. Deliver through the PR

Push the task branch without force and open one PR into `main`, reporting risk,
review and verification evidence. Before an authorized merge, require no
unresolved current Focused CI failure and successful Hosted `verify` and `e2e`
on the PR's current test merge. Fetch and verify the candidate/base are still
the reviewed ones; if `origin/main` advanced, rebase and repeat validation.
Merge without bypassing protection, then resolve the actual merged `main` SHA
and parent. An unmerged PR has no post-Ship SHA to hand off.

## 5. Handoff

Output and send the same block to the configured long-lived Focused CI thread
(`T-01a06542-0449-767c-a74e-f047ed0c6e12`), asking it to report `PASS` or
`FAIL` back to the development thread from the automatic controller's private
receipt and GitHub evidence. The Focused agent turn must not run a second Full
suite, manually start/drain/reload the controller, or write GitHub status or
Check state:

```text
FOCUSED-CI HANDOFF
sha: <40-hex>
parent: <40-hex>
risk: <machine risk, plus any explicit override>
files: <complete changed-file list>
summary: <one paragraph>
verified: <each command and PASS/SKIP, with totals and every SKIP reason>
```

Do not claim handoff if delivery did not occur, and do not archive the
development thread before Focused CI replies. A pending SHA must not be
deployed. Focused CI `FAIL` pauses every later Ship and should recommend a
revert; it never performs one. Even Focused CI `PASS` does not replace the
Deployment gate: its default remains exact-main, non-manual hosted `verify` and
`e2e` from numeric `github-actions` App ID `15368`, workflow ID `282244920`,
attempt 1, and one Check Suite. ADR-0025's App modes remain disabled until a
separate Owner-authorized activation.
