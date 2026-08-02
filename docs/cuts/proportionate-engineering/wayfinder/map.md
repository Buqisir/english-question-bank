# Proportionate Engineering Reform — Wayfinder Map

Status: superseded

## Supersession

The owner superseded the Tickets 09–13 route with the one-time deletion-first
governance cleanup authorized in source thread
`019fbe68-10d0-7371-9927-467af87c4d6c`. Tickets 09–13 are not current work and
create no approval, review, publication, recovery, or completion blocker.
Ticket 25 may start after the cleanup commit. The remaining map content is
historical evidence only.

## Notes

- Goal: remove, downgrade, deepen, or split mechanisms whose burden is materially
  heavier than the named failure they prevent, while preserving controls for
  authentication, permissions, per-user isolation, persistence/migrations,
  backups, production configuration, recoverability, atomic publication,
  Student/Teacher separation, PaperSurface anchors, and Screen/Print/PDF
  correctness.
- Governing principle: weight follows blast radius, irreversibility, and
  automation authority. Raw speed is evidence, not the KPI. Retain a mechanism
  only when its named failure is real and a lighter existing mechanism is
  insufficient.
- Canonical terms: a **Data Addition** publishes another structurally known
  paper through unchanged accepted shared behavior; a **Shared Contract
  Change** alters an accepted adapter, schema, publication, renderer, auth,
  persistence, or other public seam; **Atomic Publication** means every field
  and version of one Canonical Paper becomes visible together or not at all,
  not that every consumer is re-proved for every paper; a **Risk Closure** is
  the least-heavy mechanism that demonstrably prevents one named failure.
- Architecture vocabulary: use Module, Interface, Seam, Adapter, Depth,
  Leverage, and Locality. Apply deletion tests and change simulations; LOC is a
  locator, not a verdict. Replace tests at a deep public Interface rather than
  layering new proof over old shallow seams.
- Every ticket must consult `$wayfinder`, `$codebase-design`, and
  `$domain-modeling`, plus current `AGENTS.md`, `CONTEXT.md`,
  `docs/agents/{issue-tracker,dispatch-protocols,testing-cadence,model-routing}.md`,
  and the smallest relevant steering/architecture authority.
- Baseline reconnaissance at source HEAD
  `bd967162ed58e322dc2a79fcae88bf32b9e99d7c`: 2,516 tracked files; 170,936
  lines across tracked `js/jsx/ts/tsx/mjs/cjs`; 140
  `scripts/verify-*.mjs` files totaling 82,247 lines; the import-pilot verifier
  is 18,975 lines; `standards/paper-canonical/**` plus
  `schemas/paper-canonical/**` is 434 files / 28,280 lines; 36 manifest-version
  files; and 73 current consumer JSON artifacts. The supplied 2,557 / 170,307
  / 81,618 / 79 and 165-ticket figures are hypotheses with drift or denominator
  ambiguity, not authority. The first ticket must publish reproducible
  denominators before any burden ratio is used.
- P0/P1 reforms and their four-workflow before/after measurement must close
  before paper-canonical Ticket 25 can resume. This map does not itself approve
  or dispatch Ticket 25. P2 improvements become a non-blocking backlog once
  P0/P1 closes and business development resumes; they do not delay Ticket 25.
- Tickets 02–07 are safe for parallel read-only evidence collection after
  Ticket 01 fixes definitions. Those six tasks make no repository or same-
  worktree writes, do not claim/close their ticket files, and return structured
  evidence packets only. Ticket 08 is the sole later writer that records all
  six resolutions and their map gists in one serial synthesis commit.
  Repetitive inventory is Luna Max work only after the counting seam and
  expected output are fixed; cross-cut decisions remain Sol Medium.
- Reform self-check: one map, no separate proof ledger, no new approval loop,
  no giant verifier, no per-ticket ceremony. Replace existing authority and
  tests instead of duplicating them, with one acceptance check per actual risk.
- This 13-ticket map is the last meta-governance layer. It may not spawn
  publish, digest-approval, map-approval, review-of-map, or ticket-management
  tickets. Reform tickets close only through concrete deletion, downgrade,
  replacement tests at a public Interface, deep-seam change, or removal of a
  redundant workflow; writing another principle or policy layer is not closure.
- No separate independent review is created for read-only investigation,
  synthesis-only recording, low-risk documentation, or a qualifying UI micro-
  change. A reform uses independent review only when its actual diff changes
  high-risk shared behavior under current risk authority.

## Decisions so far

- [Freeze the burden baseline and risk language](tickets/01-freeze-burden-baseline-and-risk-language.md) — froze exact-HEAD path denominators, canonical risk terms, and named-failure action traces for the six read-only audits.
- [Audit governance and coordination gates](tickets/02-audit-governance-and-coordination-gates.md) — retained unique owner/identity/transition gates but selected manual dispatch and one typed receipt route over agent dispatch, conditional approval peers, and map-route duplication.
- [Audit verification, review, and visual proof](tickets/03-audit-verification-review-and-visual-proof.md) — kept unique high-risk public proof while selecting impact-triggered suites, direct QA lifecycle tests, a thin real canary, and replacement rather than layered verifier matrices.
- [Audit Canonical Paper data operations and contract fan-out](tickets/04-audit-canonical-data-and-contract-fanout.md) — split unchanged-shape Data Addition from Shared Contract Change around candidate-bound Teacher Confirmation and one atomic publisher with risk-triggered canaries.
- [Audit module depth and architecture hotspots](tickets/05-audit-module-depth-and-hotspots.md) — selected one pure Rendered Behavior Plan Interface to replace duplicate Screen/Print derived semantics; all other hotspots are P2.
- [Design the UI micro-change lane](tickets/06-design-the-ui-micro-change-lane.md) — split atomic/local/shared presentation, kept affected checks plus target-page Owner QA, and merged standalone sanity review into browser evidence.
- [Audit legacy, operations, safety, and model routing](tickets/07-audit-legacy-operations-and-model-routing.md) — preserved reachable compatibility and all security/durability controls, selected only a proven no-op deletion, and kept evidence-based model/parallel routes.
- [Decide the P0/P1 reform set](tickets/08-decide-the-p0-p1-reform-set.md) — fixed the non-overlapping serial P0/P1 route across Tickets 09–12 and closure Ticket 13; only UI actions target 7-to-6 while unique-risk counts remain intact.
- [Replace disproportionate dispatch and approval burden](tickets/09-replace-dispatch-and-approval-burden.md) — replaced the duplicate approval ceremony with one artifact-kind route Interface, one semantic owner decision, machine identity/ancestry checks, receipt-only phase state, and one closed-ticket dependency.

## Fog

- Exact deep-module improvements beyond the first highest-leverage P1 tranche
  depend on hotspot change simulations and become non-blocking P2 backlog once
  precise; this map creates no additional child ticket for them.
- Exact stale compatibility deletions depend on live caller and production-data
  evidence; absence of a current caller is not sufficient when persisted old
  data can still reach the route.
- Any genuinely new content shape found during canonical data-lane work must
  leave the data-operation lane and use the existing Shared Contract Change
  route; it does not grow this map.
- Lower-priority P2 cleanup becomes non-blocking backlog after P0/P1 closure;
  it may be noted in Fog but must not create another ticket in this map or delay
  business development and Ticket 25.
- P2 architecture: split `server/api.mjs`, host-page composition, publication
  internals, and authority-registry layout; localize touched `App.css`
  selectors; consider further verifier decomposition only after the accepted
  public Interfaces land.
- P2 compatibility/legacy: retire legacy whole-paper/Print adapters, Assembly
  Basket migration reader, historical manifests/consumer artifacts, and old
  migration/backup scripts only after fresh reachable production/browser/data
  and recovery evidence. The 33-paper local snapshot proves deletion is unsafe
  now, not current production state.
- P2 operations: exact-release deploy hardening, separating destructive R2
  retention from additive backup, startup-owned user-schema migration, and
  current-vs-history status/ADR cleanup require separate fresh authority; they
  do not authorize production/R2 access and do not block Ticket 25.
- P2 portfolio: classify the 18 untriggered verifier scripts and source-regex
  assertions by live caller and unique mutant before any deletion; absence from
  CI or high LOC is not proof.
