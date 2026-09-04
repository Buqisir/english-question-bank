# Ship one task to `main`

Commit and Ship only the current task. Follow root `AGENTS.md` and preserve
unrelated work. This prompt may push an eligible low- or medium-risk task to
`main`; it must route every high-risk task through a PR instead.

## 1. Establish the candidate

1. Inspect the worktree, current branch, diff, and commits. Require every change
   to belong to the one bounded task in this thread. Do not stash, discard, or
   absorb unrelated work.
2. If currently on local `main`, create a short descriptive task branch before
   committing. Commit the current task with the repository's one-line commit
   style. If work is already committed, keep it only when the branch is one
   task; consolidate commits only when they are demonstrably that same task.
3. Run `git fetch origin`, then `git rebase origin/main`. Stop and ask before
   resolving any conflict that changes behavior.
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

When a route is unclear, also run the same command separately for that path.
Record the machine-produced `risk`; do not replace it with intuition. Apply the
more conservative result and these repository overrides:

- Direct Ship is eligible for `ui-micro`, `ordinary-local-feature`,
  `known-shape-paper-data`, and `single-paper-import` after their required
  checks pass.
- `shared-renderer-contract` is eligible only after the shared-renderer gate in
  `AGENTS.md`, including affected real Screen/Print/PDF verification.
- `auth-persistence-migration`, `mixed-high-risk-fallback`,
  `unknown-fallback`, and `git-diff-fallback` must use a PR.
- A PR is also mandatory for `.github/workflows/`, `scripts/verify-ci.mjs`,
  `.agents/setup`, `.agents/ship.md`, the Ship/verification rules in
  `AGENTS.md`, any path covered by the authoritative
  `EQB_PERSISTENCE_AUTHORITY_PATHS` or `EQB_HOST_CONFIGURATION_PATHS` arrays,
  destructive migrations, authentication/authorization, user-data deletion or
  bulk mutation, breaking public schema/API changes, a candidate that cannot
  be reverted as one commit, or any clearly high-risk change.

Never treat Markdown's machine `no-changes` result as an override of the named
governance-file rules.

## 3. Revalidate the exact rebased commit

Run on the post-rebase commit:

```bash
pnpm -C app verify:changed -- --base-ref origin/main
```

Also run the task's focused behavioral or user-flow check. UI work requires a
real click through the exact affected page and state. Shared-renderer work
requires `pnpm -C app verify:paper` plus affected real Screen/Print/PDF checks.
Follow every stronger final gate in `AGENTS.md`. A mandatory-PR candidate also
requires the relevant review, `pnpm -C app verify:all`, and related E2E before
the PR is ready to merge.

Stop on any failure. `SKIP` is not `PASS`; record what was not exercised and
why. Do not dismiss a failure as pre-existing unless the same command fails on
an otherwise equivalent clean `origin/main` checkout without this commit.
After verification, require `git status --porcelain` to remain empty and HEAD
to remain the classified one-commit candidate.

## 4. Deliver through the classified route

For a mandatory-PR candidate, do not push to `main`. Push the task branch
without force, open a PR into `main`, report the explicit high-risk reason and
verification evidence, and do not merge. Hosted `verify` and `e2e` on the PR's
current test merge must both pass before merge. An unmerged PR has no exact
post-Ship `main` SHA, so do not send a Focused CI handoff yet.

For a direct-Ship candidate, require no unresolved current Focused CI failure.
Fetch once more immediately before pushing. If `origin/main` advanced, restart
at rebase, then repeat classification and all verification. Otherwise run only:

```bash
git push origin HEAD:main
```

If the push is rejected as non-fast-forward, restart the entire fetch/rebase,
cleanliness, classification, and verification sequence. Never force-push
`main`. After success, require the remote `refs/heads/main` SHA to equal local
HEAD exactly.

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
