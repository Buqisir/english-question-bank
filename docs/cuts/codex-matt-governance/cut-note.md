# codex-matt-governance · cut note

Cut: `codex-matt-governance`
Status: RM closeout in progress; canonical re-review is MERGEABLE with zero
unresolved Must Fix
PR / branch: `codex/codex-matt-governance-live-state-migration-20260722-01`
Start date: 2026-07-22
Merge date: 2026-07-22
Rounds: PA 3; formal CR / re-review 5; explicitly escalated Big CR 0
Must Fix: PA surfaced 11 across two blocking rounds; CR surfaced 13 across four
blocking rounds; final unresolved count 0

Completed:
- Ratified two independent axes: EQB risk selects release gates, while context
  topology selects one bounded task, serial tickets, or a Wayfinder map.
- Established `docs/agents/model-routing.md` as the only current exact
  model/thinking authority and required every relay role to select explicitly.
- Replaced a surviving coordinator with a one-way, independently addressable
  PA -> DEV -> verification -> CR -> QA/RM relay and durable tracked state.
- Split the sole live state into structured `agent-entrypoint.md`; historical
  relay prose is preserved in non-authoritative `relay-history.md`.

Bugs / blockers found:
- Role labels inside inherited or parent-owned contexts did not establish fresh
  PA, verification, CR, QA, or RM boundaries.
- The first lifecycle records exposed multiple apparent live frontiers and
  verification prose contained misleading PASS claims.
- RM initially found a dirty, divergent main checkout with an overlapping
  untracked file. Owner-authorized recovery preserved it on local branch
  `codex/rescue-main-pre-governance-20260722-01` before cleaning `main`.

Pitfalls / wrong assumptions:
- “Wayfinder remains responsible” means continuity of the tracked role and
  map, not a long-lived conversation supervising successors.
- A green artifact or self-report is not independent exact-head evidence.
- Narrative handoff history cannot safely double as machine-current routing
  state.

Good decisions:
- The owner-approved live-state convergence narrowed blocking re-review to
  observable role, topology, branch/head, model-route, and write-authority
  failures instead of reopening wording debates indefinitely.
- Product/runtime, production configuration, plugins/skills, and the in-flight
  `wt-applied-writing-lecture` cut stayed outside this governance cut.
- Browser and owner QA were correctly omitted because the cut changes only
  collaboration rules and documentation.

Verify evidence:
- Fresh verification is recorded in `verification.md`, including exact-head
  live-state/Git checks and the earlier full suite PASS 84 / SKIP 1 / FAIL 0.
- Canonical `cr.md` ends with MERGEABLE and zero unresolved Must Fix.
- RM must still pass the Large artifact gate, current-head release checks, and
  post-merge `main` CI before terminal closure.

Watch / next:
- The first three new qualifying Medium/Large cuts must exercise the serial
  tracked topology; their evidence is the evaluation gate for this model.
- Historical plan/dispatch model selections remain evidence only, never a
  second runtime routing table.
- Preserve Wayfinder continuity in repository state without reviving a
  surviving coordinator task.
