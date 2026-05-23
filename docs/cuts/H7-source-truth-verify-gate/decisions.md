# H7 Decisions — Source Truth + Verify Gate

Status: accepted for this process / quality cut.
Last synced: 2026-05-23 after owner accepted external critique.
Open items from external review: 0

## Locked Decisions

- `AGENTS.md` is the single source of truth for agent rules.
- `CLAUDE.md` should be a pointer to `AGENTS.md`, not a duplicated
  policy document.
- Browser-verification policy belongs in `AGENTS.md`; duplicated
  browser rules in other entry files should be removed.
- `.scratch/` is local-only scratch space because it is gitignored.
- Shared multi-agent truth must live in tracked repo files such as
  `docs/cuts/<CUT>/`, ADRs, or PR descriptions.
- `npm run verify:all --prefix app` / `scripts/verify-ci.mjs` must run
  app build/typecheck before stable verify scripts.
- The GitHub Actions template should call `verify:all` once and let the
  stable entrypoint own build/typecheck.

## Open Decisions

- None.

## Moved / Cut

- `server/api.mjs` route splitting remains a separate architecture cut.
- Runtime schema validation for paper-analysis JSON remains a separate
  data-contract cut.
- Converting historical grep-style verify scripts to run-form tests
  remains a staged follow-up, not H7 scope.
