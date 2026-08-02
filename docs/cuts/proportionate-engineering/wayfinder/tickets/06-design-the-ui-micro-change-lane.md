# Design the UI micro-change lane

Status: open
Claim: unclaimed
Blocked by: Freeze the burden baseline and risk language
Next on PASS: parallel join handoff
Parallel frontier: not-applicable
Parallel join: `docs/cuts/proportionate-engineering/wayfinder/tickets/08-decide-the-p0-p1-reform-set.md`
Terminal: no
Type: research
Priority: P0
Execution: repository-read-only; no repository or same-worktree writes
Map: `docs/cuts/proportionate-engineering/wayfinder/map.md`

## Question

### Hypothesis and evidence target

Color, spacing, typography, radius, copy, local presentation, and small motion
changes are escalated by ticket or file proximity rather than actual seam
impact. Trace representative micro-changes through current workflow and define
a durable lightweight route plus explicit escalation predicates.

### Affected files and surfaces

App styling and local presentation modules, component checks, lint/typecheck,
UI authorities, screenshot/real-click/Owner-QA practice, PaperSurface anchors,
print/export styles, shared tokens, and animation accessibility.
Repository-read-only: return a structured evidence packet; make no file, claim,
status, resolution, branch, commit, or same-worktree change.

### Exact decision to return

Which changes qualify; which affected lint/typecheck/component checks and
target-page real-click/screenshot/Owner QA apply; and exactly when a shared,
public, PaperSurface, print/export, domain, schema, server, auth, persistence,
or accessibility seam forces escalation?

### Classification candidates

Keep, downgrade, delete, deepen seam, or split local from shared presentation.

### Named failure and deletion test

Prevent visual regression, broken interaction, inaccessible motion, and hidden
shared-contract impact. Delete backend/full-suite/version/review ceremony when
the target-page and affected-component checks catch all realistic local mutants
and dependency tracing proves no high-risk seam changed.

### Risk tier and why

P0 for workflow relief, normally low product risk; escalation remains high when
the actual seam is shared or affects public paper correctness.

### Dependencies, parallelism, and write conflicts

Baseline first; explicitly parallel-safe with Tickets 02–05 and 07 because all
six are repository-read-only. Ticket 08 alone records and closes their results.

### Fresh task size and route

One fresh context, 40–60K tokens. Sol Medium.

### Acceptance evidence

- Positive and negative examples with dependency proof.
- Minimal check matrix and escalation decision table.
- One simulated local change avoids backend suite/schema/version/dual-axis
  review while retaining target-page real-click evidence.
