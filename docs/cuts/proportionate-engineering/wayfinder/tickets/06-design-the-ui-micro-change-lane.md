# Design the UI micro-change lane

Status: done
Claim: 019fc243-90fb-7980-ba36-2b9d3cfa2204
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

## Resolution

Evidence packet: Codex task `019fc243-90fb-7980-ba36-2b9d3cfa2204`, read-only
at `19cc7ef5e8bf446c269343c03bf3285390d2cce8`; packet result PASS. Direct radius
and motion verifiers were observed passing (`2 checks` and `43 PASS / 0 FAIL`)
only as availability evidence, not as proof of a simulated diff.

Decision:

- **Split** presentation into atomic CSS, local presentation, and shared/high-
  risk presentation by actual Interface and consumer fan-out, not file path or
  LOC. Local copy/spacing/typography/motion may use the light lane when one
  page/state and all dependencies are closed.
- **Keep** diff/dependency classification, affected app build and direct
  verifier, exact target-page real-click/screenshot evidence, accessibility
  proof when implicated, and user-visible Owner QA.
- **Downgrade** the separate light visual sanity-review action by merging it
  into the exact target-page browser/screenshot inspection; it owns no unique
  surviving mutant.
- **Delete** backend full suite, schema/authority versioning, independent dual-
  axis review, and any new ledger/approval/verifier for a qualifying local
  micro-change.
- **Escalate** new selectors/behavior/state/URL/responsive structure; shared
  tokens or public UI Modules; focus/ARIA/keyboard/contrast/reduced-motion;
  PaperSurface; Print/PDF/export; domain/schema/server/auth/persistence; or
  unknown/cross-cut dependencies to their existing risk route.

Ticket 11 owns the executable UI route. Moving local selectors out of
`App.css` is non-blocking P2 locality work.
