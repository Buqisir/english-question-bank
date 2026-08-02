# Replace disproportionate dispatch and approval burden

Status: done
Claim: 019fc257-2c44-7381-a372-21cd289a0066
Blocked by: Decide the P0/P1 reform set
Next on PASS: independent review
Terminal: no
Type: task
Priority: P0
Map: `docs/cuts/proportionate-engineering/wayfinder/map.md`

## Question

### Hypothesis and evidence target

The accepted decision matrix will identify redundant governance facts and
manual approvals that can be replaced by one deep route Interface without
opening unauthorized or irreversible transitions.

### Affected files and surfaces

Only `AGENTS.md`, `docs/agents/{dispatch-protocols,issue-tracker}.md`, the
smallest steering pointers that restate the removed route, and
`scripts/verify-dev-completion-report-contract.mjs`. Never modify product code,
production, R2, or paper-canonical spec/tickets/manifest/approval receipts.

### Exact decision to return

Apply exactly the accepted governance keep/downgrade/delete set and report the
new low-risk route plus preserved fail-closed transitions. Closure requires
deleting or simplifying executable routing/validation workflow and removing
its superseded tests or steps; a prose-only policy edit cannot pass.

Implement one typed route Interface by artifact kind: receipt is the sole live
phase state, map is an index, and an external blocker is one exact closed ticket
DAG dependency. Remove the agent-side dispatch exception, conditional-manifest
approval peer/two-commit route, map route/digest binding, and repeated blocker
copies. Preserve manual owner dispatch, exact checkout/writer preflight, owner
semantic approval, machine byte identity/ancestry, and closed transitions.

### Classification candidates

Apply the decided downgrade/delete/deepen/split outcomes; do not add new
classifications in this task.

### Named failure and deletion test

Prevent unauthorized dispatch, stale authority, and concurrent writers. Route
mutation/adversarial tests must still reject them after redundant layers are
deleted; routine low-risk work must no longer require digest comprehension or
repeated approval.

### Risk tier and why

P0 governance, cross-cut but reversible in Git.

### Dependencies, parallelism, and write conflicts

Ticket 08 only. Serial; conflicts with all central authority reforms.

### Fresh task size and route

One fresh context, 60–80K tokens. Terra Max because Ticket 08 selected a cross-
cut executable route change.

### Acceptance evidence

- Focused adversarial route tests at the retained public Interface.
- Deleted superseded assertions/tests rather than layered replacements.
- Measured action reduction for the low-risk route with named failures closed.
- Artifact-kind regression proves this Wayfinder map is not treated as a
  parallel-route ticket, while illegal ticket and receipt routes still fail.
- No publish/digest/map approval, review-of-map, or ticket-management successor.
- Independent review only if the actual diff changes high-risk shared dispatch
  behavior; low-risk docs cleanup does not create a dual-axis lineage.

## Result

Commit: resolve the closure commit with `git log -1 --format=%H -- docs/cuts/proportionate-engineering/wayfinder/tickets/09-replace-dispatch-and-approval-burden.md`.

Verify:

- `node --check scripts/verify-dev-completion-report-contract.mjs`
- `node scripts/verify-dev-completion-report-contract.mjs` — 36 passed, 0 failed
  (0.3 seconds observed).
- `git diff --check`

Notes:

- Replaced the retired coordinator, conditional-manifest, map-binding, and
  repeated-blocker assertions with one artifact-kind route Interface.
- The retained direct failures are agent-side dispatch, stale checkout
  authority, concurrent writers, unapproved scope, substituted bytes, illegal
  phase edges, and malformed/open/non-ancestor external dependencies.
- This is a high-risk shared-dispatch behavior change. Its one declared
  successor is an independent Standards/Spec review before any Ticket 10 work.

Action reduction (routine low-risk route): 7 mandatory manual/execution
actions to 3. The removed actions are ticket-granularity approval, conditional
approval peer, post-publication re-entry, human digest approval, map route
update, map-to-receipt binding commit, and a second approval-route preflight.
The retained actions are one owner semantic approval (unapproved scope),
machine byte identity/ancestry (substituted or stale bytes), and one receiving
checkout/writer preflight (dirty or concurrent writer); the closed receipt
matrix retains the illegal-edge failure.
