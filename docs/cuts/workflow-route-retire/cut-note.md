# workflow-route-retire · cut note

- What changed (pending merge): retired the standard-cut Workflow route;
  `AGENTS.md` is the sole current authority for roles, models, effort, and
  execution sequence. Medium / Large fresh CR now writes canonical `cr.md`
  before RM. Nothing has shipped to `main` yet.
- Cut / moved / deliberately not done: deleted
  `.claude/workflows/cut-pipeline.js`; did not change product runtime,
  production config, historical cuts / STATUS, or create an unnecessary
  `agent-entrypoint.md`.
- Wrong assumptions discovered: steering and compatibility profiles cannot
  safely restate PA triggers or model / effort values; those copies drifted.
  Artifact presence also does not prove CR approval.
- Verify / browser QA: targeted current-rule scans, Claude frontmatter parse,
  artifact-gate fixtures, and `tsc` exit 0 passed. PM-run full `verify:all`:
  PASS 84 / SKIP 1 / FAIL 0 (documented absent off-repo I16a fixture). Browser
  QA is not required because this is process / docs-only.
- Follow-up / watch: fresh CR must re-review all five Must Fixes. **SW-1:** an
  artifact-gate PASS proves only that `cr.md` exists and is non-empty; RM must
  read the verdict and confirm every Must Fix is closed before merge.
- Start date: 2026-07-21
- Merge date: pending
- PA rounds: 0
- Routine CR rounds: 1
- Big CR rounds: 0
- Must Fix count: 5
