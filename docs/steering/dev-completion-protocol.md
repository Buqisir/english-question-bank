---
inclusion: auto
---

# DEV completion protocol

Scope: applies to implementation work in the
`Buqisir/english-question-bank` repository, whoever performs it as the direct
DEV role (or permitted role-internal assistance) — the completion contract does
not downgrade.
Authoritative — agents must follow this protocol unless the user
overrides it inline for a specific task.

This document was written in response to the agreed rule口径
("DEV 完工默认开 PR、@me、报告里给链接") so GitHub notification
emails fire reliably for every shippable change. The owner relies
on those emails as the primary signal that work is ready for review.

For an Auto-Next cut, a DEV task's required completion is durable result and
one fresh non-implementing verification successor under the entrypoint's
write-hold/release protocol. It must not push, open a PR, merge, or wait for
that successor unless the cut explicitly grants those later release actions.

---

## 1. Default flow (must)

When a DEV task produces shippable changes, the agent MUST,
in this exact order, before considering the task complete:

0. Start from the requested baseline:
   - fetch / sync the latest target branch specified in the prompt
   - confirm required merge commits or PR baselines are present
   - STOP and report if the baseline cannot be verified
1. `git commit` with a clear, scoped message
2. Push the branch to GitHub (local `git` / `gh`; remote name is
   `github`)
3. Open a PR against `main`
   - never push directly to `main` / `master`
4. Provide the PR URL in the completion report
5. @-mention the repo owner so GitHub notification email fires
   - mention in the PR body OR in the completion report (either is fine)
   - default handle: `@Buqisir`

The PR step is what actually triggers the GitHub email — pushing a
branch alone does not. Skipping any of steps 3–5 means the owner
will not get a stable email signal.

## 2. Exceptions (do NOT open a PR)

Skip step 3 (and therefore steps 4–5 for a PR URL — give a branch URL
instead) ONLY when the task is explicitly tagged with one of:

- `branch-only` — push a branch, no PR
- `no-pr` — same intent, alternate spelling
- `spike-only` — exploratory work, no integration intent
- `plan-only` — planning artifacts, code may not even be committed
- `review-only` — only inspecting existing code, no edits expected
- `auto-next` — durable result plus one fresh verification successor under the
  entrypoint release protocol; do not push, open a PR, merge, or wait for that
  successor

When the exception applies, the completion report still must give
the branch URL in the form
`https://github.com/Buqisir/english-question-bank/tree/<branch>`.

## 3. Report-style tasks (PA / CR / QA / RM)

Pure report tasks do NOT default to opening a PR:

- PA — product / planning analysis reports
- CR — code review reports
- QA — quality / verification reports
- RM — release management reports

EXCEPTION to the exception: if the report task actually modified
files in the repo (e.g. updated steering, edited docs, changed verify
scripts, added a checklist), then the default flow in §1 applies —
commit, push, open PR, @ owner.

A useful rule of thumb: did `git status` show modified or untracked
files at the end of the task? If yes → §1 default flow. If no →
report-only, no PR.

## 4. Completion report contract

Every DEV completion report MUST include the following fields, in
this order, wrapped in exactly one fenced `text` code block, with no
prose outside the fence. Put differently: no prose outside the
fence.

Recommended maximum: 60 lines. The report is a review handoff, not a
terminal transcript.

Use `docs/agents/dev-completion-report-template.md` as the canonical
template.

1. PR URL (or branch URL if a §2 exception applies)
2. Branch name
3. Commit hash (short SHA is fine)
4. Baseline / sync confirmation
   - latest branch used
   - required merge commit or PR head confirmed
   - note any sync problem that blocked or changed the work
5. Changed Files
   - exact changed file paths, not only folders
6. Verify script results
   - which scripts were run
   - pass / fail count for each
   - identify any pre-existing known mismatches (e.g. the C3-class
     scope-guard mismatch in `verify-paper-surface-module-v1.mjs`)
7. What was NOT run, and why
   - e.g. "did not run app dev server because Linux sandbox forbids
     long-running processes" or "did not run pnpm install because
     package files are out of scope"
8. Forbidden Scopes confirmed unchanged
   - explicitly list the scopes that the task spec marked off-limits
     and confirm none of them were touched
9. Browser QA still required (when applicable)
   - if the change affects a visible surface, list what the owner
     should sight-check in the browser

10. Known Risks / Expected False Positives
   - short list, or `none`

11. PO QA checklist link (when applicable)
   - for visible PaperSurface / Paper Intelligence cuts, link the
     relevant QA contract or checklist, e.g.
     `docs/product/paper-surface-c5b-po-qa-contract.md`

Hard report rules:

- No prose outside the fence.
- Do not paste raw verify output.
- Use verify summaries only: script name, pass/fail counts, and a short
  note for any expected false positive.
- No raw command logs.
- No tool-by-tool implementation diary.
- Include exact changed files, not only folders.
- If browser QA is required, state what was clicked and what passed.
- If browser QA was not run or is not applicable, say why.
- Static verify is not browser QA for visible PaperSurface changes.
- Link the relevant PO QA checklist when the cut touches a visual
  surface.
- Keep known risks short and explicit. Do not bury them in prose.

The report should be self-contained — the owner should be able to
read it, click the PR link, and review without going back to chat
history.

## 5. Notification etiquette

- Always @ the owner once per PR creation. Do not @ in every
  follow-up comment; that creates notification noise.
- If the PR fails CI or the owner requests changes, push the fix
  to the same branch (the existing PR receives the update); do
  not open a new PR for follow-up commits unless the original PR
  was merged or closed.
- If a verify script has a pre-existing known failure mode (e.g.
  the v1 module scope-guard), call it out in the completion report
  rather than silently letting it look like new breakage.

## 6. Branch naming convention

Recommended pattern, matching existing PRs in this repo:

- `<issue>-<slug>` for issue-driven work, e.g.
  `c3-6-papersurface-evidence-kind-color-semantics`
- `agent-<area>-<slug>` for agent-internal protocol / steering /
  tooling changes, e.g. `agent-steering-dev-completion-protocol`

Avoid:

- pushing to `main` directly
- reusing a branch whose PR has already been merged or closed

## 7. When in doubt

If the task spec is ambiguous about whether a PR should be opened,
default to opening one. The owner can always close a PR; they
cannot retroactively summon a notification email for a branch that
was never PR'd.
