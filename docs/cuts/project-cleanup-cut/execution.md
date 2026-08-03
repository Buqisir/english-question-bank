# Project Cleanup Cut — execution record

Status: complete
Executed: 2026-08-03
Authority: `final-plan.md`

This is the cut's only execution record. Counts are outcomes, not quotas.

## Cut 0 — one baseline and owned worktrees

- Canonical product candidate: `b9c5fe0cfac1f618392f7c296ab4064a1a866f05`.
- Repository release closeout: Ticket 35 focused re-review PASS, Owner QA PASS,
  Ticket 36 done.
- Final pre-cleanup `main` CI: run `30847313636`, verify
  `PASS 116 / SKIP 4 / FAIL 0`, E2E PASS.
- Local final product suite: `PASS 120 / SKIP 1 / FAIL 0`.
- Fixed denominator: 33 papers / 273 groups / 1530 questions /
  4140 question-owned options.
- No production deploy, production DB/config change, R2 synchronization, or
  production backfill was performed.
- Stale local QA/API listeners found during closeout were stopped; no project
  listener remained afterward.

Worktrees went from 35 to 7. Removed targets were clean and ancestors of
`main`, except the Ticket 32 durability branch whose exact commit
`396940ad3611ad2bedc7faae228671bc76ab4bf3` was separately proven
patch-equivalent by `git cherry main` (`-`). Removed worktrees:

1. `.codex/worktrees/0527/wt-paper-canonical-unification-20260725`
2. `.codex/worktrees/1f21/wt-paper-canonical-unification-20260725`
3. `.codex/worktrees/299c/wt-paper-canonical-unification-20260725`
4. `.codex/worktrees/4000/wt-paper-canonical-unification-20260725`
5. `.codex/worktrees/44ec/wt-paper-canonical-unification-20260725`
6. `.codex/worktrees/4faf/wt-paper-canonical-unification-20260725`
7. `.codex/worktrees/593e/wt-paper-canonical-unification-20260725`
8. `.codex/worktrees/620f/wt-paper-canonical-unification-20260725`
9. `.codex/worktrees/6322/wt-paper-canonical-unification-20260725`
10. `.codex/worktrees/8c5f/wt-paper-canonical-unification-20260725`
11. `.codex/worktrees/92ce/wt-paper-canonical-unification-20260725`
12. `.codex/worktrees/99fe/wt-paper-canonical-unification-20260725`
13. `.codex/worktrees/a23f/wt-paper-canonical-unification-20260725`
14. `.codex/worktrees/a66a/wt-paper-canonical-unification-20260725`
15. `.codex/worktrees/e121/wt-paper-canonical-unification-20260725`
16. `.codex/worktrees/e99b/wt-paper-canonical-unification-20260725`
17. `.codex/worktrees/governance-fix-rereview-20260722`
18. `.codex/worktrees/matt-native-eqb-20260723/english-question-bank`
19. `.codex/worktrees/t29-clean-20260802`
20. `Projects/wt-application-writing-v1-20260724`
21. `Projects/wt-applied-writing-retained-pilot`
22. `Projects/wt-codex-matt-governance`
23. `Projects/wt-eqb-completion-exit-contract-20260724`
24. `Projects/wt-eqb-explicit-skill-handoff-20260724`
25. `Projects/wt-eqb-workflow-skill-contract-20260724`
26. `Projects/wt-paper-normalization-20260724`
27. `Projects/wt-workflow-route-retire-status`
28. `Projects/wt-workflow-route-retire-v2`

Retained worktrees and ownership:

- `Projects/english-question-bank` — `main`.
- `Projects/wt-paper-canonical-unification-20260725` — this cleanup cut.
- `.codex/worktrees/295e/english-question-bank` — unmerged EQB Auto-Next work.
- `Projects/wt-applied-writing-layout-prototype` — unmerged prototype.
- `Projects/wt-applied-writing-lecture` — unmerged and contains an unsaved change.
- `Projects/wt-applied-writing-lecture-v3` — unmerged implementation lineage.
- `Projects/wt-workflow-route-retire` — unmerged historical workflow lineage.

## Project-scoped design tools

- Installed official project-scoped Impeccable `4.0.4` under
  `.agents/skills/impeccable/`; it remains available alongside
  `emil-design-eng`.
- `.codex/config.toml` disables 34 unrelated global skills only for this
  project. It does not uninstall them; `grilling` and `chrome:control-chrome`
  remain visible as requested.

## Cut 1 — proportionate verification

The existing `verify-ci.mjs` remains the one runner. No second orchestration
framework was added.

| Entry | Pack size | Named failure |
| --- | ---: | --- |
| `verify:changed` UI | 4 | catches shared UI token/CSS-family regressions without backend or Paper work |
| `verify:changed` known Paper data | 7 | catches invalid input, authority, confirmation, atomic publication, and recovery drift |
| `verify:changed` ordinary feature | 44 | catches non-Paper feature contracts without paying Paper/security cost |
| `verify:changed` security | 6 | catches auth, ownership, isolation, daily-limit, and deployment posture drift |
| `verify:paper` | 70 | catches shared Canonical Paper, Screen/Print, draft/export, and writing-family drift |
| `verify:all` | 120 | release/fallback closure when a narrower risk route is insufficient |

Six representative paths are executable routing tests; unknown paths fall back
to `all`. The UI route was executed end to end and passed
`PASS 4 / SKIP 0 / FAIL 0` including app build.

Every stable registration now has a named-failure row in `scripts/README.md`.
The complete macOS visual import pilot was removed from direct registration
because the QA wrapper already launches it; this removes one full duplicate
run. Ubuntu now truthfully SKIPs its macOS authority-glyph layer after running
the platform-neutral QA server checks. The stale CI template was deleted;
`.github/workflows/verify.yml` is the sole workflow authority.

The 38 executable `verify-*` files outside the stable registry were reviewed:

- 1 is the runner itself;
- 5 are dedicated GitHub E2E steps;
- 1 is the transitive macOS visual pilot;
- 1 is an intentionally local performance probe;
- 30 are explicit operator, migration, ticket, historical-contract, or
  unresolved local probes.

Those 30 remain outside daily packs (quarantine/explicit-only). None was
deleted merely for being quiet. `awaiting-rendering-cut`: 0 after Cut 2's
interface audit.

The retained process rules with independent named failures are: exact scope
preflight, one writer per worktree, one independent review lineage for real
high risk, and provisioned real-click Owner QA. The old prose-only UI/Paper
subsections were replaced by the five-row executable risk matrix; no new phase,
receipt, digest approval, or review loop was introduced.

## Cut 2 — CanonicalRendering decision

No new wrapper was built. Audit showed the desired deep interface already
exists as `shared/paper-canonical/consumerProjection.mjs`:

- it accepts the confirmed Consumption Plan and projects family semantics once;
- Screen reaches it through
  `shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs`;
- Print/PDF consumes the same projection from `server/print-renderer.mjs`;
- shared writing chrome is derived by `projectCanonicalWritingChrome`;
- Ticket 35 blank authority is already centralized in
  `shared/papersurface/blankRuling.mjs`.

Renaming or wrapping this as a second `CanonicalRendering` layer would add
fan-out without deleting semantics: exactly the titanium-patch failure this cut
forbids. Existing interface and public rendered-behavior tests remain. No
mirror test had sufficient duplicate evidence for deletion beyond the already
removed double Pilot execution.

## Cut 3 — reference-aware archive

`.rgignore` excludes `docs/archive/` from default search. Runtime Canonical
manifests, ledgers, paper assets, genre decisions, and every path read by
`authority.mjs` or `server/api.mjs` stayed in place.

The following 55 completed or superseded cuts had zero live full-path
references immediately before `git mv` and were moved to
`docs/archive/cuts/`:

`C7-whole-paper-import-workbench`, `H3-frontend-component-slimming`,
`H8-paper-surface-host-interaction-run-form`, `I0-seven-choices-entry`,
`I15-grammar-fill-blank-focus`, `I16b-theme-labels-backfill`,
`I16d-topic-chip`, `I17b-topic-label-claude-backfill`, `I3-cloze-ai-import`,
`I4-grammar-fill-ai-import`, `I5-writing-ai-import`,
`I7-application-given-box`, `I9-cloze-analysis-surface`,
`ai-mode-filter-chips`, `ci-feedback-loop-repair`,
`classic-retire-2-detail-view`, `classic-retire-3-cleanup`, `content-trust`,
`craft-polish`, `design-canon`, `design-canon-v2`, `detail-slim`, `draft-docx`,
`draft-workbench-visual-unify`, `engine-rewire`, `error-copy-mainline`,
`figure-render`, `fixture-move`, `home-editorial`,
`import-national-2020-2024`, `import-zj-2020-2022`, `lecture-css-restore`,
`lecture-rail-scroll-fix`, `legacy-import-retire`, `motion-press-exit`,
`paper-import-ai-retire`, `paper-normalization`, `paper-passage-letter`,
`paper-row-browse-entry`, `process-slim`, `process-tuning`,
`search-thinking-toggle`, `section-chrome-on-solo-surface`,
`similar-entrypoints`, `surface-question-policy`, `trust-cracks`,
`ui-boundary-trim`, `ui-p1-shell`, `ui-panel-reunify`, `ui-polish-misc`,
`ui-search-feel`, `ui-teal-repaint`, `ui-token-sweep`,
`workbench-header-unify`, and `writing-box-starters`.

The moves are history-preserving and individually reversible through Git.
Uncertain, active, runtime-read, or unmerged initiative directories were not
moved.

## Deferred

`VersionedRenderContract` remains unbuilt. Its sole trigger is the next real
shared-renderer authority bump demonstrating resolver/fixture/consumer replay
fan-out.
