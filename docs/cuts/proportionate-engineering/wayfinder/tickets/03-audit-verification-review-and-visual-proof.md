# Audit verification, review, and visual proof

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

The 140-verifier portfolio contains monoliths, duplicated full-suite triggers,
mirrored semantics, source-regex assertions, repeated adversarial fixtures,
review recursion, and per-item Screen/Print/PDF evidence that can be replaced by
tests at deeper public Interfaces plus representative or anomaly-triggered
canaries. Inventory by named failure, runtime when observed, fixture fan-out,
public seam, and current trigger.

### Affected files and surfaces

`scripts/verify-*.mjs`, package/CI entrypoints, review/testing authorities,
PaperSurface and Screen/Print/PDF verifiers and QA evidence, especially the
18,975-line import-pilot verifier and other largest scripts. Repository-read-
only: return a structured evidence packet; make no file, claim, status,
resolution, branch, commit, or same-worktree change.

### Exact decision to return

Which checks/reviews remain at each risk tier, which are deleted or replaced,
where monoliths should split around public Interfaces, and which visual risks
need shared-contract tests, representative canaries, or targeted anomaly proof?

### Classification candidates

Keep, downgrade, delete, deepen seam, or split.

### Named failure and deletion test

Prevent semantic regressions, candidate forgery, Student/Teacher leakage,
broken anchors, and print/PDF geometry drift. Delete a check when mutation or
change simulation shows another faster check catches the same failure at the
same or earlier gate; retain it when a unique realistic mutant survives.

### Risk tier and why

P0 mixed risk: test deletion can hide shared regressions, while unconditional
portfolio execution makes low-risk work disproportionately expensive.

### Dependencies, parallelism, and write conflicts

Baseline first; explicitly parallel-safe with Tickets 02 and 04–07 because all
six are repository-read-only. Ticket 08 alone records and closes their results.

### Fresh task size and route

One fresh context, 70–90K tokens. Sol Medium; deterministic per-script census
may be delegated to Luna Max only after columns and expected output are fixed.

### Acceptance evidence

- Complete verifier inventory and hotspot/dependency clusters.
- Named-failure cadence with replacement-not-layering proposals.
- Explicit Screen/Print/PDF deep-test triggers and canary rules preserving
  public correctness without per-paper manual proof.
