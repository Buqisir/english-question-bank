# workflow-route-retire · cut note

- What changed: retired the standard-cut Workflow route;
  `AGENTS.md` is the sole current authority for roles, models, effort, and
  execution sequence. Medium / Large fresh CR now writes canonical `cr.md`
  before RM. Merged to `main` as `dfabfab` via PR #286.
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
- Follow-up / watch: Round 2 fresh CR is APPROVE with open Must Fix = 0.
  **SW-1:** an artifact-gate PASS proves only that `cr.md` exists and is
  non-empty; RM must read its verdict and confirm every Must Fix is closed
  before merge.
- Start date: 2026-07-21
- Merge date: 2026-07-21 (`dfabfab`); post-merge main CI
  `29856827902` passed.
- PA rounds: 0
- Routine CR rounds: 2
- Big CR rounds: 0
- Must Fix count: 5 raised / 5 closed / 0 open
