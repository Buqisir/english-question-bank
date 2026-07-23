# codex-matt-governance · cut note

Cut: `codex-matt-governance`
Status: CLOSED — fresh RM accepted and merged; post-merge main CI green
PR / branch: `codex/codex-matt-governance-readme-ci-fix-20260722-01`
Start date: 2026-07-22
Merge date: 2026-07-22
Merge commit: `a2730a87480a8c124dd97de55fe6961a23c5128d`
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
- The first RM verification found one CI registry/documentation mismatch: the new
  live-state verifier is in `verify-ci.mjs`, but its `scripts/README.md` entry
  lacked the required `Runs in CI? = yes` field; the bounded Fix DEV / fresh
  verification / fresh CR loop corrected and approved it before final RM.

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
- Exact-head README parity verification is recorded in the live entrypoint;
  canonical fresh CR ends APPROVE with zero unresolved Must Fix.
- Final RM at `599572d`: `git diff --check` 0; Large artifact gate PASS 4 /
  FAIL 0; live-state check 0; TypeScript 0; `verify:all` PASS 85 / SKIP 1 /
  FAIL 0.
- Main was clean and exactly aligned with `github/main` before merge. GitHub
  Actions run `29973653722` completed green for both `verify` and `e2e` on
  merge head `a2730a8`.

Watch / next:
- The first three new qualifying Medium/Large cuts must exercise the serial
  tracked topology; their evidence is the evaluation gate for this model.
- Historical plan/dispatch model selections remain evidence only, never a
  second runtime routing table.
- Preserve Wayfinder continuity in repository state without reviving a
  surviving coordinator task.
