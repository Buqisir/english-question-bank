# workflow-route-retire · cut note

- What: retire the standard-cut Workflow route; make `AGENTS.md` the sole
  current authority for roles, models, and execution sequence.
- Kept: risk tiers, PA / QA triggers, RM and main-CI gates; historical records
  remain unchanged.
- Added gate: Medium / Large fresh CR writes non-empty `cr.md` before RM.
- Verify: targeted current-rule scan, Claude frontmatter parse, artifact-gate
  fixtures, and diff hygiene; PM runs full `verify:all` before merge.
