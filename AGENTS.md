# Agent Instructions

This repository builds the English Question Bank workbench at `eqbank.cc`.
`AGENTS.md` is the operational entrypoint; `CLAUDE.md` only points here.
Historical cuts are evidence, not current instructions.

## Start safely

- Follow the owner's current request and the named spec or ticket. Do not add
  adjacent features or revive historical work.
- Verify any owner-supplied worktree, branch, expected HEAD, fixed point, or
  allowed dirty file before writing. Preserve unrelated changes; do not stash,
  clean, reset, rebase, merge, or delete another task's work.
- Only one task writes a worktree at a time. Explicit parallel work needs
  separate worktrees and non-overlapping write surfaces.
- Never store secrets, account data, private student data, or full copyrighted
  passages in reusable memory.

## Work proportionately

- The owner defines the desired outcome, acceptance result, and explicit
  non-goals. The agent inspects the affected code, classifies the technical
  risk, and chooses the lightest safe implementation and verification path;
  do not ask the owner to choose engineering ceremony or a risk lane.
- Clear, reversible work stays in the current task: understand, change, run the
  affected checks, review the diff, and commit when requested.
- Uncertainty starts as ordinary, reversible work while the blast radius is
  being established; it does not become high risk merely because code is
  unfamiliar, spans several files, or has historical complexity. Escalate only
  when inspection finds a concrete high-risk seam.
- Use a tracked spec and tickets only when the work genuinely needs more than
  one context. Use Wayfinder only when the route to a spec is genuinely foggy.
- Do not create governance-only tasks, approvals, publication/recovery stages,
  repeated reviews, or automatic task chains. The owner starts top-level tasks.
- Use a handoff only when the owner asks or a real work boundary requires it;
  follow `docs/agents/dispatch-protocols.md`.
- Durable product scope and decisions belong in the relevant spec, ticket, or
  ADR. `.scratch/` is same-task scratch only.

## Verify the changed risk

Run the narrowest public-seam checks that exercise the changed behavior and its
direct consumers. Inspect the affected code before choosing the verification
weight. Uncertainty does not automatically require the full suite: use focused,
reversible checks while establishing the blast radius. Run the full suite only
for a final high-risk candidate or when the blast radius genuinely remains
unknown after inspection, and state the reason.

| Change | During work | Final gate |
| --- | --- | --- |
| Atomic UI micro-change | `pnpm -C app verify:changed` + exact-page real click | Owner QA when visible; no unrelated backend/Paper suite |
| Known-shape Canonical Paper data | `pnpm -C app verify:changed` strict input/publication canary | no authority bump, deep per-paper tri-surface proof, full suite, or independent review unless a shared shape changes |
| Ordinary local feature | `pnpm -C app verify:changed` + its focused behavioral check | affected build/public seam |
| Shared renderer/Paper contract | `pnpm -C app verify:paper` + affected real Screen/Print/PDF | one final `pnpm -C app verify:all` and one independent Standards/Spec review |
| Auth, isolation, persistence, migration, production config, or irreversible cross-cut | `pnpm -C app verify:changed` security pack + affected public seam | one final `pnpm -C app verify:all` and one independent Standards/Spec review |

`SKIP` is not `PASS`; report its limitation literally. Retain a verifier or
process rule only when it names the failure or independent detection layer it
uniquely supplies; otherwise keep it outside daily packs.

## Owner QA

For visible behavior, prepare and smoke-check the exact service, data/login,
URL, and first state before Owner QA. Use
`docs/agents/owner-qa-handoff-template.md`; the owner does not reconstruct the
test state.

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
  `docs/import/agent-contract.md` and follows
  `docs/product/nck1-paper-standard.md`.
- Open Design is for prototypes; production UI belongs under `app/`.

Read `docs/steering/README.md` and only the relevant product/UI note before a
product or visual decision. UI direction follows `PRODUCT.md` and
`docs/agents/ui-collaboration.md`. Visual polish must not silently change
domain, schema, adapters, PaperSurface, server behavior, paper assets, or
print/export behavior.

For domain or architecture changes, read `CONTEXT.md` and relevant ADRs, use
their established vocabulary, and flag conflicts before editing.

## Production and repository facts

- Production changes, deploys, database/configuration mutation, and R2 actions
  require explicit current owner authorization. Check
  `docs/cuts/launch-deploy/go-live-record.md` before an authorized production
  action. Never run `scripts/pull-run-push.mjs` against production otherwise.
- Remote: `github` (not `origin`).
- `app/` uses pnpm; `server/` uses npm.
- Fresh worktree setup: `bash scripts/setup-worktree.sh`.
- `scripts/dev.sh` binds server-side vocabulary PDF rendering to the matching
  local `PORT`; standalone API starts for print QA must set
  `QUESTION_BANK_PUBLIC_ORIGIN` to that app origin explicitly.
- Commit messages are one line: scope plus one clear sentence.

Focused supporting guidance lives in `docs/agents/testing-cadence.md`,
`docs/agents/review-levels.md`, and
`docs/agents/owner-qa-handoff-template.md`. Nested `AGENTS.md` or `CLAUDE.md`
files may add only directory-local deltas.
