# CR-lite — process-tuning

Reviewer: fresh CR-lite (cold-read, no DEV context). Baseline: `main` (a4c2443).
Branch: `cut/process-tuning` @ bba3302. PR #242.

Recommendation: **APPROVE** (0 Must Fix, 2 Should Watch).

## Changed Scope

Docs + one verify script only. `git diff main...HEAD --name-only`:

- `AGENTS.md`
- `docs/cuts/_templates/{README,decisions,plan,external-review-report}.md`
  (external-review-report.md deleted)
- `docs/cuts/process-tuning/plan.md`
- `docs/steering/{README,cut-note-protocol,cut-workflow-protocol,dev-completion-protocol}.md`
- `scripts/verify-architecture-housekeeping.mjs`

Zero runtime files: `git diff main...HEAD --name-only | grep -E '^app/|\.tsx?$|schema|\.sql|migration'`
returns nothing. `git diff --check` clean. Matches the plan's docs-only declaration.

## Core question: were any gates deleted? No.

Every "一个不动" gate from `plan.md` verified present in the rewritten text
(file:line):

- RM artifact gate — `docs/steering/cut-workflow-protocol.md:262-291`
- verify-ci same-cut registration + main CI green confirm (11-red incident) —
  `AGENTS.md:70-77`
- PR size gate (3,500 lines / 15 runtime files + exception path) —
  `docs/steering/cut-workflow-protocol.md:161-179`
- PA / DEV / CR fresh-context independence —
  `docs/steering/cut-workflow-protocol.md:363-364` + `AGENTS.md:27-29`
- Hard brake A (max 2 mockup rounds) —
  `docs/steering/cut-workflow-protocol.md:386-390`
- Hard brake B (PA > 3 PO decisions → no DEV) —
  `docs/steering/cut-workflow-protocol.md:412-415` + `AGENTS.md:294`
- Owner process brake — `docs/steering/cut-workflow-protocol.md:318-341` +
  `AGENTS.md:292-299`
- Browser QA non-negotiable ("three separate times") — `AGENTS.md:215-219` +
  `docs/steering/cut-workflow-protocol.md:358-360, 471-480`
- Super Teacher Boundary — present in `AGENTS.md` (section retained, unchanged)
- product-scope-discipline — `docs/steering/product-scope-discipline.md` untouched
- Instruction-budget clause (~500 条数) — `AGENTS.md:241`
- Subagent pin-model discipline — `AGENTS.md:24-26` + protocol §2 tier note
- PreToolUse contract-file hook — `AGENTS.md:325-326`

## Removed housekeeping assertions: dead relics only

The 5 removed asserts in `verify-architecture-housekeeping.mjs` all key on
now-dead artifacts, none protect a live rule:

- `external review template exists` → external-review-report.md deleted
- `workflow protocol asks external review for token metadata` → external-review relic
- `workflow protocol requires decisions sync status` ("Open review items") →
  freshness ritual (killed, item #1)
- `decisions template includes sync status fields` → freshness ritual
- external-review-template block (baseline/cost + decision-sync + verify-handoff) →
  deleted template

Guard still passes with real coverage: `node scripts/verify-architecture-housekeeping.mjs`
→ 73 passed, 0 failed. It is registered in `scripts/verify-ci.mjs:25`, so it runs
in real CI (not a hand-only green).

## New provisions match plan

- PA-by-irreversibility (not tier) — `docs/steering/cut-workflow-protocol.md:392-399`,
  `AGENTS.md:42-47`; PA-lite downgrade reason in plan header + CR must review it.
- plan two-tier 硬契约 / 参考实现 — `docs/cuts/_templates/plan.md` (rewritten).
- verify behavioral-assertion-first + same-cut regex retirement, no bulk cleanup —
  `AGENTS.md:79-83` + `docs/cuts/_templates/plan.md` Verification section.
- kratos read-only historical archive (harness auto-memory is working memory) —
  `AGENTS.md` "Working memory" section.

## Cross-reference integrity

- `external-review-report.md` refs remaining: only in `docs/cuts/H2-*`,
  `I0-*`, `H6-*` — historical cut archives, explicitly excluded by the plan
  ("归档文件除外"). No dangling ref in live steering / AGENTS / templates.
- `Last synced` / `Open review items` refs in live docs: none.
- Codex / Gemini / external-DEV / kratos-write refs in `AGENTS.md` +
  `docs/steering/` + `docs/cuts/_templates/`: none (only the AGENTS.md:14-15
  read-as-hat clause, which is intentional).

## Findings

### Must Fix

None.

### Should Watch

1. **Relic purge is incomplete in `docs/agents/`.** `docs/agents/pa-persona.md`,
   `review-levels.md`, `cr-persona.md`, and `dev-completion-report-template.md`
   still carry the retired 阿澈/小川 two-person split, "external high-reasoning
   PA", and Codex wording (e.g. `pa-persona.md:13-16,25,105`,
   `review-levels.md:10-14,23,75`, `dev-completion-report-template.md:3,6`).
   These files are **not in the plan's owner-approved inventory** (the inventory
   scoped AGENTS.md + steering notes + templates; it named only
   `docs/agents/external-agents.md` as an archive to keep). They are also softened
   by the `AGENTS.md:12` "Current Operating Reality overrides conflicting role
   text" clause. Does not block this merge (out of assigned scope, no gate lost),
   but a future cut reading `pa-persona.md` cold could be misled — worth a
   follow-up docs-relic cut.

2. **Hard-rules numbering gap in `docs/cuts/_templates/README.md`.** After
   deleting the "External Agent Rule" section, the numbered Hard Rules list jumps
   8 → 10 (old #9 "RM merge stops…" survived as the new #8). Cosmetic; the RM-stop
   rule itself is intact. Renumber in the follow-up cut.

## Self-Review Blind Spots

- I judged `docs/agents/*.md` as out-of-scope from the plan's inventory wording
  ("AGENTS.md / steering notes"). If the owner intended "活性条文" to include the
  persona files, SW-1 becomes a plan-completeness gap rather than a follow-up —
  an owner call, not a CR block.
- I could not run `pnpm -C app run verify:all` to completion: this fresh worktree
  has no `app/node_modules` (tsc: command not found, exit 127) — an environment
  artifact, not a diff defect. A docs-only diff cannot break tsc, and the
  load-bearing doc guard (housekeeping, which scans doc references) passes 73/0.
  I did not independently confirm the other ~70 non-doc verify scripts stay green,
  but none of them read the changed files.

## Verification Evidence

- `node scripts/verify-cut-artifacts.mjs docs/cuts/process-tuning medium` →
  PASS 2, FAIL 0.
- `node scripts/verify-architecture-housekeeping.mjs` → 73 passed, 0 failed.
- Housekeeping guard registered in `scripts/verify-ci.mjs:25` (runs in CI).
- `git diff main...HEAD --check` → clean.
- `pnpm -C app run verify:all` → aborted at build/typecheck (exit 127,
  `tsc: command not found`, `node_modules` missing in worktree — env, not code).

## Failure / Attack Angle

The real risk of a relic-purge cut is a **silently loosened gate hidden inside a
large reflow** — 410 lines shifted in cut-workflow-protocol.md make it easy to
drop a threshold (e.g. weaken "> 3 PO decisions", drop "at most 2 mockup rounds",
or soften "static verify never substitutes for browser QA") while the diff reads
as pure prose cleanup. I checked each numeric / hard threshold against the plan's
untouched list at file:line and confirmed every one survives verbatim. Second
angle: a deleted verify assertion that was actually protecting a live rule — I
confirmed all 5 removed asserts key on deleted/renamed artifacts, and the guard
still exits 0 with 73 live asserts. Third: dangling refs to the deleted
external-review-report.md that would break a future reader — confirmed the only
survivors are in historical cut archives the plan explicitly exempts.

## Residual Risk

Low. Docs-only, no gate lost, no runtime touch. The residual is the incomplete
`docs/agents/` purge (SW-1): a future agent reading a persona file directly could
follow stale two-person orchestration, mitigated (not eliminated) by the AGENTS.md
override clause.
