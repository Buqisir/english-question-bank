---
inclusion: auto
---

# Agent steering index

This folder contains project-specific operating rules for
`Buqisir/english-question-bank`.

Agents should read this index before PM / PA / DEV / CR / QA / RM work,
then open the steering note that matches the task. These notes are
product rules, not casual suggestions.

---

## Required steering notes

### Product scope discipline

File: `product-scope-discipline.md`

Use for product, UI, PaperSurface, insight, evidence, difficulty, and
teacher-workbench decisions.

Hard rule:

- Ask which teacher task a feature belongs to before showing it.
- Do not show data merely because the report already contains it.
- Push back when dense AI diagnostics would crowd the current surface.
- Move, backlog, or cut useful-but-misplaced features.

PaperSurface default:

- PaperSurface insight is a short passage map, not an AI difficulty
  dashboard.
- Dense diagnostics such as vocabulary load, grammar load, evidence
  difficulty, dot/bar systems, long key-chunk lists, and AI difficulty
  dashboards need a separate workflow justification.

### Cut workflow

File: `cut-workflow-protocol.md`

Use for small, medium, and large product / engineering cuts, especially
PaperSurface, Paper Intelligence, data-model, or multi-agent work.

Hard rule:

- Pick process by risk tier, not anxiety.
- Small cuts use:
  `Sync -> fix/DEV -> verify -> CR-lite -> RM`.
- Medium cuts use:
  `Sync -> 阿澈 PM grill -> plan.md -> 小川 PA (pa.md)
  -> 阿澈 PM compression -> 小川 DEV -> 小川 CR-lite
  -> browser QA -> PO QA -> 小川 RM`.
- Large cuts use:
  `Sync -> 阿澈 PM grill -> Canvas/mockups -> 小川 PA / optional
  external second PA -> 阿澈 PM compression -> 小川 DEV -> 小川 CR-lite
  -> 阿澈 Big CR / browser QA -> PO QA -> 小川 RM -> Cut Note`.
- Current named-agent assignment:
  - 阿澈 owns PM, plan compression, UI direction / polish, Big CR, and
    medium / large RM artifact gates.
  - 小川 owns PA, DEV, routine CR-lite, and RM / release execution.
  - For medium / large RM, 小川 may execute the merge only after 阿澈 runs
    the RM artifact gate and final sanity check.
  - PM and PA should not be the same person by default. If one agent must
    cover both, record the exception and self-review risk in `plan.md`.
  - Either agent may cover another role when quota or availability
    requires, but role contracts and gates do not downgrade.
- The owner is PO and final product QA, not code reviewer.
- External high-reasoning agents are exception tools for large-cut second
  PA, direction checks, and occasional Big CR. 小川 owns routine PA by
  default.
- Treat GitHub `main` and PR heads as the shared truth. Outside reports
  are not truth until 阿澈 verifies remote state.
- Use `docs/cuts/_templates/pa-prompt-template.md` and
  `docs/cuts/_templates/big-cr-prompt-template.md` when a PA / Big CR
  handoff needs durable repo-routed instructions; do not hand-write
  repeated prompt boilerplate.
- PA / Big CR agents may escalate instead of producing partial reports
  with `CONTEXT INSUFFICIENT`, `BRANCH CONFLICT`, `SPEC CONTRADICTS`,
  or `SCOPE UNCLEAR`.
- Stop if mockups do not converge after 2 rounds, or if PA leaves more
  than 3 unresolved PO decisions.
- Before RM merge for medium / large cuts, run the artifact gate in
  `cut-workflow-protocol.md`; missing required artifacts stop the merge.
- If the owner asks to bypass a required workflow gate, stop and push
  back; do not treat the instruction as an ad hoc override.

### PA persona

File: `docs/agents/pa-persona.md`

Use only when asking an external high-reasoning agent to act as PA.

Hard rule:

- PA is not DEV and must not write code.
- PA exists to find wrong-direction implementation risk before DEV
  starts building.
- PA must read `docs/agents/review-levels.md`,
  `docs/steering/cut-workflow-protocol.md`, and
  `docs/steering/product-scope-discipline.md`.
- PA must output verdict, product principle, exact model, Must Fix,
  Must Fix -> `plan.md` disposition checklist, Should Watch, allowed /
  forbidden files, static verify, browser QA, DEV readiness, and at most
  3 open PO decisions.

### UI mockup before DEV

File: `ui-mockup-before-dev-protocol.md`

Use before important UI, layout, visual hierarchy, rail, drawer,
popover, side-panel, or PaperSurface workspace changes.

Hard rule:

- Generate and discuss 2-4 proportional mockups before DEV when the
  decision depends on spatial proportion or visual trust.
- Turn the chosen mockup into hard implementation constraints.

### Cut note protocol

File: `cut-note-protocol.md`

Use after large cuts, Must Fixes, Browser QA decisions, PA / CR / RM
direction changes, or any bug that should appear in the daily product
log.

Hard rule:

- Record a short Cut Note immediately instead of relying on long chat
  memory or the 22:30 daily summary.

### DEV completion protocol

File: `dev-completion-protocol.md`

Use for 小川 DEV and, only by explicit owner request, external DEV
handoffs that change files.

Hard rule:

- Completion reports are review handoffs, not terminal transcripts.
- Wrap the entire report in exactly one fenced `text` block with no
  prose outside.
- Keep the report short: PR URL, branch, commit, baseline, changed
  files, verify summaries, browser QA, forbidden scopes, known risks,
  and PO QA checklist link when applicable.
- Do not paste raw verify logs. Summarize script names and pass/fail
  counts.

---

## PM pushback standard

PM should not merely agree with the user when a proposal risks product
noise.

Push back when:

- the feature is impressive but not tied to the current teacher task
- UI keeps needing width, overflow, z-index, or breakpoint hacks to fit
- PaperSurface starts competing with the A4 paper
- the design begins to look like an AI dashboard instead of a teacher
  workbench
- the user wants to show all available diagnostics because the data
  exists

Recommended question:

> What is the teacher trying to do right now, and does this feature help
> that task immediately?

If the answer is weak, recommend shrinking, moving, backlogging, or
cutting the feature.

---

## Browser QA posture

The Codex in-app browser may be used for PO-facing QA, live visual
checks, and browser verification the user explicitly wants to watch.

If the in-app browser times out, shows stale state, or cannot prove the
claim, fall back to local Chrome/headless Playwright and capture the
evidence there.

Static verify is not browser QA for user-visible PaperSurface changes.

---

## Current PaperSurface product taste

The paper remains primary. AI support should be useful, quiet, and one
gesture away.

For the current PaperSurface insight work:

- keep passage insight lightweight
- prefer paragraph structure and teaching orientation
- avoid full AI diagnostic panels inside the paper page
- consider "按 AI 难度找题" or another dedicated workflow for difficulty
  systems

When in doubt, choose task clarity over feature richness.
