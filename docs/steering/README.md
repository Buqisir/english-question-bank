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

### Codex × Matt workflow

File: `codex-matt-workflow.md`

Use for multi-task cuts, Wayfinder routing, or Auto-Next. It defines the
context-topology axis and one-way relay lifecycle; it never waives the risk
gates in `AGENTS.md` and `cut-workflow-protocol.md`.

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
- Risk tiers, upgrade triggers, QA, artifacts, handoffs, and size gates are
  defined here; current roles, models, and execution sequence are only in the
  `AGENTS.md` Dispatch map.
- PA follows the `AGENTS.md` Dispatch map: Large or irreversible work requires
  fresh PA before DEV. Only the PA-lite downgrade cases listed there may apply;
  the reason is recorded in the plan header and reviewed by CR.
- Medium / Large require fresh CR and its `cr.md` before the RM artifact gate;
  CR-lite is only a Small-cut PM cold read.
- `plan.md` is the default Medium / Large route; add an entrypoint only when the
  routing conditions in the protocol require one.
- The owner is PO and final product QA, not code reviewer.
- Treat GitHub `main` and PR heads as the shared truth. The active relay role
  verifies and records the remote state required by its own gate; an exited
  predecessor does not re-consume that evidence.
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

Use when creating a fresh independently addressable PA task.

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
  memory; large cuts commit `cut-note.md` before closeout (RM gate).

### DEV completion protocol

File: `dev-completion-protocol.md`

Use for DEV subagent completion reports on file-changing work.

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

Real-click browser QA runs on local Chrome / headless Playwright and
captures evidence (screenshots / snapshots / assertions).

Static verify is not browser QA for user-visible changes.

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
