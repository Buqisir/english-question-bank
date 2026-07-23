# Agent Instructions

This repository builds the English Question Bank workbench at `eqbank.cc`.
`AGENTS.md` is the single source of truth for current project rules.
`CLAUDE.md` points here instead of duplicating them.

Historical cut records may describe older PM / PA / DEV / CR / RM relays,
Auto-Next, subagent dispatch, or `agent-entrypoint.md`. They are evidence of
how earlier work ran, not instructions for new work.

## Matt-native collaboration

The owner is the orchestrator. Agents do bounded work; they do not manage a
team or create the next top-level task.

### The default path

Use `Ask Matt` as the router when the right flow is unclear.

1. A small, clear, local, reversible change stays in the current task:
   understand it, implement it, verify it, review it, commit it.
2. A normal feature starts with `/grill-with-docs`. Keep grilling, `/to-spec`,
   and `/to-tickets` in one planning context while it remains sharp.
3. Work each implementation ticket in a fresh top-level task with `/implement`.
   One task owns one ticket. `/implement` may use `/tdd` and `/code-review` as
   those skills specify, then commits the result.
4. A huge, foggy effort starts with `/wayfinder`. Charting the map is one task;
   every decision ticket gets its own fresh task. When the frontier is empty,
   return to `/to-spec`, `/to-tickets`, and `/implement`.
5. Hard bugs enter through `/diagnosing-bugs`; raw incoming requests enter
   through `/triage`; architecture health work enters through
   `/improve-codebase-architecture`.

Wayfinder is exceptional. Do not use it for a feature that can be understood
and planned in one healthy context.

### Manual task boundary

- Never call `create_thread`, `fork_thread`, `spawn_agent`, or an equivalent
  mechanism to create the next top-level phase.
- Never turn a successor phase into a subagent.
- The owner manually opens every new top-level task after the current task has
  finished.
- A Matt skill or product runbook may use bounded internal workers only when it
  explicitly requires them. `/research` may use a background researcher and
  `/code-review` may use independent Standards and Spec reviewers. They report
  back to the current task; they cannot become a successor, supervise later
  work, or own the initiative.
- Do not invent PM, PA, verification, CR, QA, or RM relay roles around ordinary
  work. Add an independent review task only when the risk rules below require
  one.

### Final-message contract

Finish with a short result summary and exactly one exit:

When the next step needs a new top-level task, put
`请新开顶层任务，并将下面代码块直接粘贴：` outside the fence. The copyable
block starts directly with `Worktree:`:

```text
Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <exact path | not applicable>
Ticket: <exact path | not applicable>
Fixed point: <commit | not applicable>
Model: <model>
Effort: <low | medium | high | xhigh | max | ultra>
Prompt:
<complete copyable prompt>
```

If the next instruction belongs in the current task:

```text
Next：留在当前任务
Prompt:
<complete copyable prompt>
```

If the initiative is finished, end with:

```text
DONE
```

Do not merely name a skill or ticket in a new-task block. Include the exact
artifact, worktree, branch, expected commit, and prompt so the owner does not
have to remember routing details.

Fill every task-applicable Spec, Ticket, and Fixed point anchor. Use
`not applicable` only when an anchor genuinely does not apply; repeat the exact
paths and commits so the owner does not have to find or remember them.

Human QA is the one intentional pause. Give the owner a checklist of at most
five actions and wait in the same task:

```text
Next：等待人工 QA
Worktree: <absolute path>
Branch: <branch>
Expected HEAD: <commit>
Spec: <exact path | not applicable>
Ticket: <exact path | not applicable>
Fixed point: <commit | not applicable>
QA checklist: <inline 3-5 checks or exact path>
Prompt:
请按以上清单完成 owner QA。完成后回复“QA 完成”；若失败，逐条描述实际结果。
```

After `QA 完成`, return the next copyable instruction or `DONE`.

### Context hygiene

- Conversation is working memory; files and git are durable memory.
- Multi-session work lives under `docs/cuts/<feature>/` as `spec.md`,
  `tickets/`, optional Wayfinder artifacts, research assets, and QA evidence.
  `.scratch/` is same-session scratch only.
- A multi-ticket initiative uses one explicit feature worktree sequentially.
  Before handing off, commit the current result, leave the worktree clean, and
  put its exact path, branch, and HEAD in `Next`. Only one top-level task writes
  that worktree at a time.
- Do not compact mid-phase. If the agent repeats settled questions, forgets
  scope, rereads the same files without progress, confuses the current ticket,
  or discusses process more than product, use `/handoff` and stop.
- Do not treat a numeric context-window estimate as a hard threshold. The
  behavior above is the stop signal.

### Model guidance

`docs/agents/model-routing.md` gives recommendations, not a dispatch state
machine. Planning and independent review use the stronger reasoning route;
ordinary research and implementation use the economical route. Put the
recommendation in `Next`; the owner selects it when opening the task.

## Risk and release

Process strength follows actual risk, not diff size or anxiety.

- Small and reversible: `/implement` in the current task is enough.
- Normal feature: spec when needed, tickets when multi-session, one fresh
  `/implement` task per ticket, then owner QA if user-visible.
- High risk: schema or data-contract semantics, migrations, permissions,
  authentication, persistence, PaperSurface anchors, print / PDF / DOCX,
  production configuration, cross-cut architecture, or an irreversible
  decision. Record the decision in the spec or ADR and run one fresh top-level
  `/code-review` against a fixed point before shipping.
- A prototype already accepted point-by-point by the owner is the visual
  contract. Preserve its layout, interaction, content granularity, and data
  mapping; do not quietly reinterpret it in implementation.

Before merging to `main`:

- the implementation task must have run the narrowest relevant checks;
- a high-risk change must have passed its independent top-level review;
- a user-visible change must have passed real browser QA and owner QA;
- `pnpm -C app run verify:all` or the PR CI must prove the full suite;
- after merge, confirm the `main` CI run is green;
- update `docs/STATUS.md` in at most five lines for material releases.

There is no standing separate verification task, RM artifact gate, live-state
file, dispatch ledger, or automatic successor. Missing or stale evidence is
handled by rerunning the needed check, not by creating another role.

Prefer behavioral verification at a public seam. New source-regex assertions
are a last resort. Before deleting shared CSS, inventory every producer of each
class name and inspect naming collisions.

## Working memory

Harness memory is session-scoped and is never the source of project state.
Durable decisions live in tracked files, commits, or ADRs. `docs/STATUS.md` is
the project-state summary. Never store secrets, private student data, full
copyrighted passages, or account/session information in reusable memory.

## Product posture

- Preserve the core model:
  `Source -> Passage -> Question Group -> Question -> Paper Set -> Export`.
- Prefer teacher-operable workflows over abstract completeness.
- The product is launched with invite-only login, owner/member roles,
  per-user data isolation, a global AI daily limit, one HK host, and R2 backup.
  Current server facts live in
  `docs/cuts/launch-deploy/go-live-record.md`.
- Do not run `scripts/pull-run-push.mjs` against production or change
  production configuration unless that record is current.
- Content production belongs in the backend agent and import/authoring
  pipeline. The website consumes content: find, read, assemble, export. Do not
  restore website import UI.
- Paper import starts at `docs/import/agent-runbook.md` and follows
  `docs/product/nck1-paper-standard.md`.
- Open Design is for visual prototypes. Production code belongs under `app/`.

## Product and teaching boundaries

- Read `docs/steering/README.md` and the relevant steering note before product
  or UI decisions.
- Before showing AI-derived information, name the teacher task it serves.
  “The data exists” is not a product reason.
- Paper authoring, PaperSurface, print/export, and import display obey
  `docs/product/exam-paper-format-standards.md`.
- PaperSurface insight defaults to a short passage map. Dense vocabulary,
  grammar, evidence, difficulty, or AI diagnostic dashboards require a
  separate product justification.
- Evidence and classroom usability come before feature excitement.
- Preserve passage-first teaching flow.
- AI suggestions require human confirmation.
- Student versions hide answers and explanations; teacher versions include
  them for review and teaching.

## Browser and owner QA

- User-visible changes require real-click browser QA. Static verification is
  not browser QA.
- Local browser QA uses `qa-local-owner` against the worktree's own gitignored
  database. Never place production QA credentials in scripts.
- Throwaway QA scripts stay in session scratch. Durable behavior contracts may
  live under `docs/cuts/<feature>/qa/`.
- The owner has final product and visual acceptance and may veto a shipped
  direction.

## UI boundary

- UI direction follows `PRODUCT.md` and
  `docs/agents/ui-collaboration.md`.
- Do not change domain, schema, adapters, PaperSurface, server code, verify
  scripts, paper assets, or print/export behavior as a side effect of visual
  polish.
- Contract-file writes remain guarded by
  `.claude/hooks/guard-contract-files.mjs`. Only unlock them when the accepted
  spec assigns that scope.

## Repository facts

- The remote is named `github`, not `origin`.
- `app/` uses pnpm; `server/` uses npm.
- A fresh worktree runs `bash scripts/setup-worktree.sh` before implementation.
- Use one-line commit messages: scope plus one clear sentence.
- Preserve unrelated user changes in dirty worktrees.

## Matt source

The current collaboration router is `Ask Matt`. Matt skills are supplied by the
user's global skill collection; this repository does not vendor copies because
vendored copies drift. If a named skill is unavailable in a harness, follow the
equivalent natural-language flow in
`docs/steering/codex-matt-workflow.md`; never install infrastructure
automatically.

The Coding Brain knowledge source is
`/Users/huangxuewei/Coding Brain/wiki/overview.md`. It is advisory and local;
remote agents must not depend on the absolute path.
