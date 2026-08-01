# Agent Instructions

This repository builds the English Question Bank workbench at `eqbank.cc`.
`AGENTS.md` is the single source of truth for current project rules.
`CLAUDE.md` points here instead of duplicating them.

Historical cut records are evidence, not instructions for current work.

## Safety and scope

- Work only inside the worktree, branch, fixed point, spec, and ticket named by
  the owner. Verify them before writing.
- Preserve unrelated changes. Do not stash, clean, reset, rebase, merge, or
  delete another task's work.
- Do not add unrequested features or revive historical initiatives.
- Conversation is working memory. Durable scope, decisions, and evidence live
  in tracked specs, tickets, ADRs, and commits.
- Never store secrets, account data, private student data, or full copyrighted
  passages in reusable memory.

## Default development path

Use `Ask Matt` when routing is unclear.

1. Small, clear, reversible work stays in the current task: understand,
   implement, verify, review, and commit.
2. A normal feature uses `/grill-with-docs`, `/to-spec`, and `/to-tickets` in
   one planning context, then one fresh `/implement` task per ticket.
3. A huge, foggy effort uses `/wayfinder`, then fresh `/to-spec` and
   `/to-tickets` tasks plus owner ticket-granularity approval before any fresh
   `/implement` task; by default the owner creates each task.
4. Hard bugs enter through `/diagnosing-bugs`; raw requests through `/triage`;
   architecture health work through `/improve-codebase-architecture`.

Wayfinder is exceptional. Do not use it for work that fits one healthy
planning context.

## Manual owner boundary

The owner is the orchestrator, and manual owner dispatch remains the default.
An ordinary task does bounded work and never creates, opens, runs, supervises,
forks, or spawns the next top-level task. A bounded worker is allowed only when
the active skill or runbook explicitly requires one, and it must report back
to the current task.

`dispatch` means creating, opening, running, or supervising a successor task;
ordinary tasks are forbidden to dispatch. `handoff` means generating the
complete, copyable instruction that lets the owner open the declared
successor; a completed non-terminal ticket must provide it.

普通任务不得创建、打开或执行后继任务；但只要 initiative 尚未闭合，就必须
生成并返回唯一后继任务的完整 handoff。“不得开始下一票”不得解释为“不得生成
下一票 handoff”。

The sole agent-side dispatch exception is an owner-explicit invocation of
`$coordinate-eqb-wayfinder` for an already-charted EQB Wayfinder initiative
with a validated durable phase frontier. That coordinator stays
repository-read-only and creates exactly one fresh top-level peer at a time in
the same saved worktree.

Detailed task-boundary, attachment, blocker, and handoff rules have one owner:
`docs/agents/dispatch-protocols.md`. It also owns the closed phase state
machine, implementation gates, pause/resume rules, and successor routing.
Tracked path and receipt/ticket field schema live in
`docs/agents/issue-tracker.md`; the current model table lives in
`docs/agents/model-routing.md`; testing cadence lives in
`docs/agents/testing-cadence.md`; owner QA has the separate single owner
`docs/agents/owner-qa-handoff-template.md`. The global coordinator executes
those project authorities without restating them. The full new-task template
exists only in `dispatch-protocols.md`.

## Deterministic completion exit

Every final response contains a short result and exactly one legal exit:

| Initiative state | Required exit |
| --- | --- |
| Current ticket still has work that can finish here | `Next：留在当前任务` |
| Current ticket is complete and a required successor remains | Complete new top-level task handoff matching `Next on PASS` |
| The page is provisioned and waiting for owner acceptance | Canonical owner-QA handoff |
| All tickets, review, owner QA, and release closeout are complete | `DONE` |

`Terminal: no` makes `DONE` and “wait for the owner to arrange the next step”
illegal. A result-only final is invalid. Before answering, read the ticket's
`Terminal` and `Next on PASS`; do not infer a successor from conversation when
the durable route exists.

Implementation and fix handoffs attach `$implement`. Initial independent
reviews and focused re-reviews attach `$code-review`. Only claim a skill was
invoked in the current task when it was active or owner-attached. A verified
explicit-only skill may still be referenced for a future handoff. The detailed
availability rules and the only attachment-first template are in
`docs/agents/dispatch-protocols.md`.

Keep a ticket's implementation, TDD, ordinary Standards + Spec review, fixes,
and commit in the same top-level task. Do not hand ordinary TDD or review back
to the owner as separate work.

## Worktrees and durable context

- Multi-ticket initiatives use one explicit feature worktree sequentially.
  Only one top-level task writes it at a time.
- Before handoff, commit the bounded result, leave the worktree in the allowed
  state, and report the exact absolute path, branch, and HEAD.
- Store multi-session work under `docs/cuts/<feature>/` as `spec.md`,
  `tickets/`, optional Wayfinder artifacts, research, and QA evidence.
  `.scratch/` is same-session scratch only.
- If context remains sharp, continue the current ticket. If it does not,
  compact valuable context or make a bounded handoff.

## Risk, review, and release

Process strength follows actual risk.

`docs/agents/testing-cadence.md` is the single owner of general test scheduling.
Specs and tickets may require stricter proof, but may not weaken its gates.

- Small and reversible: `/implement` in the current task is enough.
- Normal feature: use a spec when needed, tickets when multi-session, and owner
  QA when user-visible.
- High risk includes schema or data-contract semantics, migrations,
  permissions, authentication, persistence, PaperSurface anchors, print/PDF/
  DOCX, production configuration, cross-cut architecture, and irreversible
  decisions. Record the decision and run one fresh top-level `$code-review`
  lineage against a fixed point before shipping.
- An owner-accepted prototype is the visual contract. Preserve its layout,
  interaction, content granularity, and data mapping.

Before merging to `main`:

- run the narrowest relevant checks;
- pass the required independent review for high-risk work;
- pass real-browser and owner QA for user-visible work;
- satisfy the closure cadence in `docs/agents/testing-cadence.md`;
- after merge, confirm `main` CI is green;
- update `docs/STATUS.md` in at most five lines for material releases.

An initial independent review uses the implementation base as fixed point. A
focused re-review uses the previously reviewed HEAD and checks only prior Must
Fixes, the fix diff, and direct regressions. One fresh review means one review
lineage. Once no Must Fix remains, proceed to QA or release rather than opening
another full review.

Prefer behavioral verification at a public seam. Source-regex assertions are a
last resort. Before deleting shared CSS, inventory every producer and naming
collision.

## Owner QA

User-visible changes require real-click browser QA. The task sending the QA
handoff must provision and open the exact checkable state; the owner does not
start services, find fixtures or URLs, reconstruct state, or choose a
worktree. Follow `docs/agents/owner-qa-handoff-template.md`.

Local QA uses `qa-local-owner` with the worktree's gitignored database. Keep
throwaway scripts in session scratch; durable behavior contracts may live
under `docs/cuts/<feature>/qa/`. The owner has final product and visual
acceptance.

## Product boundaries

- Preserve `Source -> Passage -> Question Group -> Question -> Paper Set ->
  Export`.
- Prefer teacher-operable workflows and passage-first teaching flow.
- AI-derived information must serve a named teacher task and require human
  confirmation.
- Student versions hide answers and explanations; teacher versions include
  them.
- Paper authoring, PaperSurface, print/export, and import display follow
  `docs/product/exam-paper-format-standards.md`.
- PaperSurface insight defaults to a short passage map. Dense diagnostics need
  separate product justification.
- Content production belongs in the backend agent/import pipeline. The website
  consumes content; do not restore website import UI.
- Paper import starts at `docs/import/agent-runbook.md` and follows
  `docs/product/nck1-paper-standard.md`.
- Open Design is for prototypes. Production UI belongs under `app/`.

Read `docs/steering/README.md` and the relevant steering note before product or
UI decisions. UI direction follows `PRODUCT.md` and
`docs/agents/ui-collaboration.md`. Visual polish must not alter domain, schema,
adapters, PaperSurface, server code, paper assets, or print/export behavior.
Contract-file writes remain guarded by
`.claude/hooks/guard-contract-files.mjs`.

## Production posture

The product is live with invite-only login, owner/member roles, per-user data
isolation, a global AI daily limit, one HK host, and R2 backup. Current server
facts live in `docs/cuts/launch-deploy/go-live-record.md`. Do not run
`scripts/pull-run-push.mjs` against production or change production
configuration unless that record is current and the task authorizes it.

## Repository facts

- Remote: `github` (not `origin`).
- `app/` uses pnpm; `server/` uses npm.
- Fresh worktree setup: `bash scripts/setup-worktree.sh`.
- Commit messages are one line: scope plus one clear sentence.
- Preserve unrelated changes in dirty worktrees.

## Matt source

Matt skills come from the owner's global collection; the repository does not
vendor copies. `Ask Matt` is the current router. A non-Codex harness must
declare `NATURAL-LANGUAGE FALLBACK` before following
`docs/steering/codex-matt-workflow.md`; never install infrastructure
automatically.

The advisory Coding Brain source is
`/Users/huangxuewei/Coding Brain/wiki/overview.md`; remote agents must not
depend on that absolute path.
