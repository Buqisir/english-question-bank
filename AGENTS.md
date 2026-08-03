# Agent Instructions

This repository builds the English Question Bank workbench at `eqbank.cc`.
`AGENTS.md` is the operational entrypoint; `CLAUDE.md` only points here.
Historical cuts are evidence, not current instructions.

## Start safely

- Follow the owner's current request and the named spec or ticket. Do not add
  adjacent features or revive historical work.
- When the owner supplies a worktree, branch, expected HEAD, fixed point, or
  allowed dirty file, verify those facts before writing.
- Preserve unrelated changes. Do not stash, clean, reset, rebase, merge, or
  delete another task's work.
- Only one task writes a worktree at a time. Explicit parallel work needs
  separate worktrees and non-overlapping write surfaces.
- Never store secrets, account data, private student data, or full copyrighted
  passages in reusable memory.

## Work proportionately

- Clear, reversible work stays in the current task: understand, change, run the
  affected checks, review the diff, and commit when requested.
- Use a tracked spec and tickets only when the work genuinely needs more than
  one context. Use Wayfinder only when the route to a spec is genuinely foggy.
- Do not create governance-only phase, receipt, manifest/digest-approval,
  publication, recovery, review-of-prose, or ticket-management work.
- The owner starts top-level tasks. A handoff is needed only when the owner asks
  for one or a real work boundary requires it; include the exact path, branch,
  HEAD, spec, and ticket without restating a governance ceremony.
- Durable product scope and decisions belong in the relevant spec, ticket, or
  ADR. `.scratch/` is same-task scratch only.

## Verify the changed risk

Run the narrowest public-seam checks that exercise the changed behavior and its
direct consumers. These routes are deterministic; unknown scope falls back to
the full suite.

| Change | During work | Final gate |
| --- | --- | --- |
| Atomic UI micro-change | `verify:changed` + exact-page real click | Owner QA when visible; no unrelated backend/Paper suite |
| Known-shape Canonical Paper data | `verify:changed` strict input/publication canary | no authority bump, deep per-paper tri-surface proof, full suite, or independent review unless a shared shape changes |
| Ordinary local feature | `verify:changed` + its focused behavioral check | affected build/public seam |
| Shared renderer/Paper contract | `verify:paper` + affected real Screen/Print/PDF | one final `verify:all` and one independent Standards/Spec review |
| Auth, isolation, persistence, migration, production config, or irreversible cross-cut | `verify:changed` security pack + affected public seam | one final `verify:all` and one independent Standards/Spec review |

`SKIP` is not `PASS`; report its limitation literally. Run release checks once
on the final candidate, confirm `main` CI after merge, and update
`docs/STATUS.md` only for a material release. Prefer behavioral evidence;
source-regex is a last resort. Before deleting shared CSS, inventory producers
and naming collisions.

Every new or retained verifier, process rule, or governance document must name
in one sentence the real failure it uniquely prevents, or the independent
detection layer other checks cannot supply. If that is uncertain, quarantine
it outside daily packs instead of inventing a quota or deleting blindly.

Evaluate a `VersionedRenderContract` only when the next real shared-renderer
authority bump demonstrates resolver/fixture/consumer replay fan-out; do not
pre-build it.

## Owner QA

Visible behavior requires real browser interaction and owner acceptance. The
task prepares the service, data/login, exact URL, and first checklist state,
then smoke-checks the page before reporting it ready. The owner should not have
to start services, find fixtures, or reconstruct the route. Use
`docs/agents/owner-qa-handoff-template.md` for the compact format.

## Product boundaries

- Preserve `Source -> Passage -> Question Group -> Question -> Paper Set ->
  Export`.
- Prefer teacher-operable, passage-first workflows. AI-derived information must
  serve a named teacher task and require human confirmation.
- Student versions hide answers and explanations; teacher versions include
  them.
- Screen, Student/Teacher Print HTML, and PDF consume the same stable Canonical
  Paper and shared renderer seams; no surface reconstructs paper meaning on its
  own.
- Paper authoring, PaperSurface, print/export, and import display follow
  `docs/product/exam-paper-format-standards.md`.
- The backend import pipeline produces canonical paper data; the website
  consumes it. Do not restore website import UI. Paper import starts at
  `docs/import/agent-runbook.md` and follows
  `docs/product/nck1-paper-standard.md`.
- Open Design is for prototypes; production UI belongs under `app/`.

Read `docs/steering/README.md` and only the relevant product/UI note before a
product or visual decision. UI direction follows `PRODUCT.md` and
`docs/agents/ui-collaboration.md`. Visual polish must not silently change
domain, schema, adapters, PaperSurface, server behavior, paper assets, or
print/export behavior.

## Production and repository facts

- Production changes, deploys, database/configuration mutation, and R2 actions
  require explicit current owner authorization. Check
  `docs/cuts/launch-deploy/go-live-record.md` before an authorized production
  action. Never run `scripts/pull-run-push.mjs` against production otherwise.
- Remote: `github` (not `origin`).
- `app/` uses pnpm; `server/` uses npm.
- Fresh worktree setup: `bash scripts/setup-worktree.sh`.
- Commit messages are one line: scope plus one clear sentence.

Focused supporting guidance lives in `docs/agents/testing-cadence.md`,
`docs/agents/review-levels.md`, `docs/agents/model-routing.md`, and
`docs/agents/owner-qa-handoff-template.md`. Nested `AGENTS.md` or `CLAUDE.md`
files may add only directory-local deltas.
