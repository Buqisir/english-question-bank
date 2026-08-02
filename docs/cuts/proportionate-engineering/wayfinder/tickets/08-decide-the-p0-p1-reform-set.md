# Decide the P0/P1 reform set

Status: done
Claim: 019fc24c-f59e-72b2-b465-a9c40859884b
Blocked by: Audit governance and coordination gates; Audit verification, review, and visual proof; Audit Canonical Paper data operations and contract fan-out; Audit module depth and architecture hotspots; Design the UI micro-change lane; Audit legacy, operations, safety, and model routing
Next on PASS: `docs/cuts/proportionate-engineering/wayfinder/tickets/09-replace-dispatch-and-approval-burden.md`
Terminal: no
Type: grilling
Priority: P0
Map: `docs/cuts/proportionate-engineering/wayfinder/map.md`

## Question

### Hypothesis and evidence target

The six audits will produce overlapping candidates; applying all of them would
itself create a giant reform. Synthesize one ordered P0/P1 set whose retained
controls each own one named failure and whose reforms have bounded, non-
overlapping write surfaces.

### Affected files and surfaces

Read the six exact read-only task result packets and current authorities. This
is their sole durable recorder: write their evidence-backed resolutions into
Tickets 02–07, mark those six done, append their one-line map gists, and record
this synthesis resolution in the same serial commit. Create no research asset,
publication ticket, approval ticket, map-review ticket, or ticket-management
ticket.

### Exact decision to return

Which candidates are accepted as keep/downgrade/delete/deepen/split, what exact
P0/P1 sequence must close before Ticket 25, what can remain P2, and which
architecture work fits the already-charted first tranche? Anything else becomes
non-blocking P2 backlog in Fog, not another child ticket.

### Classification candidates

Keep, downgrade, delete, deepen seam, or split, with exactly one semantic owner
and one acceptance check per named risk.

### Named failure and deletion test

Prevent inconsistent partial reform and accidental safety weakening. Reject a
reform when its deletion test is unproved; reject a retained mechanism when no
unique realistic failure survives without it.

### Risk tier and why

P0 cross-cut decision: it controls every following write and the blocker exit.

### Dependencies, parallelism, and write conflicts

All six read-only packets must be complete and exact. This is the only serial
recording task and is not parallel-safe. It may not add tickets or implement
reforms; the 13-ticket ceiling is closed.

### Fresh task size and route

One fresh context, 60–80K tokens. Sol Medium.

### Acceptance evidence

- Decision matrix with evidence pointers, exact owners, write surfaces, and
  ordered dependencies.
- Before/target action counts for all four workflows.
- P0/P1 set is fresh-context-sized and creates no ledger, approval loop, or
  giant verifier.
- Recording the six results adds no new principle/policy authority and creates
  no independent review merely for investigation or synthesis.

## Resolution

The owner-confirmed grilling frontier is complete: necessary slow controls
stay; each retained action owns one realistic failure; deletion requires no
measurable risk increase; downgrade requires a lighter closure; risk follows
blast radius, irreversibility, and automation authority; local UI and unchanged-
Adapter data get light lanes; only P0/P1 blocks Ticket 25; 13 tickets is final.
All six exact read-only packets passed at
`19cc7ef5e8bf446c269343c03bf3285390d2cce8`. No contradiction requires another
owner round.

### Ordered decision matrix

| Order / priority | Area and decision | Unique named failure and retained owner | Bounded write surface / acceptance check |
| --- | --- | --- | --- |
| 1 / P0 | Governance/dispatch: **keep** manual owner dispatch, exact preflight, semantic approval, byte identity/ancestry and closed transitions; **delete** agent dispatch exception and conditional-manifest peer/two-commit ceremony; **deepen** typed receipt route and exact ticket-DAG blocker | Unauthorized dispatch, overlapping/dirty writer, unapproved scope, substituted bytes, illegal edge. `dispatch-protocols.md` owns route semantics; `issue-tracker.md` owns stored shape | Ticket 09: governance authorities plus direct route verifier only. Mutants for agent dispatch, stale HEAD, dirty writer, byte drift and illegal edge must fail; maps are not validated as tickets |
| 2 / P0 | Canonical data: **split** Data Addition from Shared Contract Change; **deepen** candidate-bound Teacher Confirmation and one atomic publisher; **delete** per-paper authority/full-suite/review/per-sidecar proof; **downgrade** public proof to actual-paper canary with escalation | Wrong source/substituted candidate, unconfirmed semantics, partial visibility, retry corruption, novel-shape misrouting, consumer anomaly. Candidate/confirmation and publisher Interfaces own these failures | Ticket 10: canonical import/publication Interface and direct behavioral tests only; no paper import or paper-canonical ticket/manifest write. Faults for each named failure must close at the Interface |
| 3 / P0-P1 | Verification: **split triggers** by producer-to-consumer impact; **delete duplicate suite execution**; **split/deepen** import-pilot internals while retaining one real end-to-end canary; **keep** unique high-risk proof and review lineage | Unmapped shared regression, leaked QA processes, forgery, answer leakage, recovery breakage, geometry/anchor drift. `testing-cadence.md`, deterministic impact selection, and public Interfaces own distinct risks | Ticket 11 verifier/CI/testing surface. Each removed check needs a mutant caught at the same or earlier gate; unknown/cross-cut impact still selects the full suite |
| 3 / P0-P1 | UI micro-change: **split** atomic/local/shared presentation; **merge** sanity review into target-page evidence; **delete** backend/schema/version/independent-review ceremony for qualifying local changes; **keep** dependency trace, affected app checks, real-click/screenshot and Owner QA | Hidden shared impact, build/local regression, inaccessible interaction, real visual defect, teacher rejection. UI collaboration/testing authorities and exact target page own these failures | Ticket 11 UI-route authority and direct checks only. A representative local change completes in 6 actions; every escalation predicate routes out |
| 4 / P1 | Rendered behavior: **deepen** one pure Rendered Behavior Plan Interface; Screen/Print keep media rendering/geometry; **replace**, do not layer, duplicated derivation tests | Screen/Print caller divergence in family order, chrome, rhythm and predecessor/following relationships. The Plan Interface owns shared derived semantics | Ticket 12: one shared pure Module, two callers and replacement/public-seam tests. No compiler, authority, publication, schema or visual redesign |
| 4 / P1 | Legacy: **delete** only no-op `saveAssemblyBasket()` writer and assertions; **keep** migration reader and current legacy consumer/Print compatibility paths | Dead call maintenance burden has no surviving failure; migration/consumer paths still prevent browser or persisted-data loss | Ticket 12 bounded legacy surface. Behavior is unchanged and migration reader remains; all other retirement waits for live-data proof |
| keep / P0 safety | Operations: **keep** auth, permissions, isolation, transactional migration/recovery, atomic bank transport, additive backup/restore and exact production posture; do not touch production/R2 | Auth bypass, cross-user leak, durable loss, partial migration, wrong release and unrecoverable backup | No P0/P1 write in this map. Hardening/deletion candidates need fresh production authority and are P2, non-blocking |
| keep / routing | Model/parallel: **keep** current model table; allow Luna Max only for fully specified mechanical inventories, Sol for judgment; parallelize only repository-read-only evidence with one serial writer | False model claims and overlapping writes. `model-routing.md` and manual task boundary own the risks | No reform write. No inference about cost, quota, billing or intelligence; no parallel same-worktree writers |

Overlapping candidates were rejected: Ticket 03 and Ticket 05 import-pilot
proposals are one Ticket 11 split; governance-verifier artifact-kind repair is
Ticket 09, not Ticket 11; rendered-behavior derivation is Ticket 12, not another
import-pilot matrix; legacy Print deletion is rejected until persisted-data
proof; operations work is not smuggled into the architecture tranche.

### Four-workflow action targets

Counts use the baseline's separately observable control definition; they are
not LOC, elapsed-time, cost, quota, or model-quality KPIs.

| Workflow | Before | Target | Decision |
| --- | ---: | ---: | --- |
| Data Addition | 10 | 10 | Keep the ten unique closures, but enforce them through the deep unchanged-Adapter lane; exclude authority bump, full suite, independent review and universal per-paper proof because they were never valid baseline actions |
| UI Micro-change | 7 | 6 | Merge standalone sanity review into exact target-page real-click/screenshot evidence; every other action owns a unique failure |
| Shared Contract Change | 9 | 9 | Keep nine high-blast-radius closures; replace duplicate verifier work inside affected-check action 4 rather than delete a distinct gate |
| Persistence/auth | 9 | 9 | Keep all nine security/durability closures; internal deepening may reduce commands or fan-out, not mandatory risk actions |

The accepted P0/P1 serial route is exactly Tickets 09, 10, 11, 12, then Ticket
13 closure. No new ticket, verifier, ledger, approval loop, publication task,
map review, or synthesis-only independent review is created. Everything else
is non-blocking P2 Fog and cannot delay Ticket 25.
