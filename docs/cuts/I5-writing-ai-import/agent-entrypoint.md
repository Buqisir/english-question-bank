# Agent Entrypoint — I5 Writing AI Import

Cut: I5-writing-ai-import
Stage: **Feature built, ZERO review.** Needs retroactive PM grill -> PA -> CR ->
QA before it can land on `main`.
Roles: per `AGENTS.md` "Current Operating Reality" — one Claude across Opus
(PM / PA / CR) and Sonnet (DEV) in separate fresh sessions.
Date: 2026-05-30

## Situation (read first — this cut is out of order)

Unlike I2–I4, the I5 writing-import feature was **already implemented** by a
prior Claude (Opus 4.7) session on branch `codex/i5-writing-ai-import`
(2 commits, ~1100 insertions, `verify-i5` green) **with no `plan.md`, `pa.md`,
or any review**. This file banks a PM survey done 2026-05-30 so a fresh session
can review and land it properly. Treat the feature as an unreviewed proposal,
not as done.

## What I5 does (PM survey)

- Splitter: parse **application (应用文)** + **continuation (读后续写)** writing
  tasks from the DOCX writing section.
- Package builder: **six-family completeness**, writing groups, `writingTasks`,
  `answerBox` blocks.
- Publisher: `getWritingGroups`, writing QA links (no `questionId`).
- Harness: `writingPaperViewAdapter` for plain A4 writing views.
- Workbench: application / continuation status panels and publish blocking.

Files vs the i5 base: `writingPaperViewAdapter.ts` (+111), `packageBuilder.mjs`
(+148), `docxSplitter.mjs` (+186), `publisher.mjs` (+37), `routes.mjs` (+2),
`PaperImportAiWorkbench.tsx` (+34), `PaperIntelligencePaperSurfaceHarness.tsx`
(+36), `paperImportAi.ts` (+28), `verify-i5-writing-ai-import.mjs` (+509), plus
i3/i4 fixture updates for six-family completeness.

## ⚠️ Two risks the survey found — PA must focus here

1. **Stale base.** `codex/i5-writing-ai-import` branched **before** the
   2026-05-30 PRs #154–#158 (workflow reconciliation, ③ deferred-skip fix,
   ① JSON-prompt fix, ⑤ verify CI-greening, skills vendoring). The branch must
   be **synced to current `main` first**; a 3-way merge keeps `main`'s files,
   but the verify scripts overlap with risk 2.

2. **Four-family ↔ six-family interaction (the real one).** I5 raises the
   package builder from **four-family** to **six-family** completeness (adds
   application + continuation writing as required families). But PR #157 (⑤)
   just greened `verify-i2` to a **four-family** package fixture. When i5 syncs
   with `main`, `verify-i2`'s fixture (and any four-family assumption) must move
   to six-family or I5's enforcement re-reds `verify-i2`. The i5 branch already
   "update[d] I3/I4 fixtures for six-family" but that **overlaps `main`'s ⑤
   changes to `verify-i2`/`verify-i3`** — expect a real reconcile on the verify
   scripts during sync, not a formality.

## Recommended sequence (large cut)

1. **Sync first**: merge current `main` into `codex/i5-writing-ai-import`;
   resolve the four↔six-family overlap on `verify-i2` / `verify-i3` and confirm
   `verify-i2` green at six families. Non-trivial integration, not a formality.
2. **PM grill + plan**: use the `grill-with-docs` skill to grill I5 against
   `CONTEXT.md` (does writing-import fit the domain model? are `writingTasks` /
   `answerBox` the right terms vs Passage / Question Group?) and write
   `docs/cuts/I5-writing-ai-import/plan.md`.
3. **Fresh Opus PA** (`docs/agents/pa-persona.md` + `grill-with-docs`):
   cold-read the feature. Focus on the six-family contract change, publish /
   export correctness (writing QA links with no `questionId`),
   `writingPaperViewAdapter` A4 rendering, and whether writing-import serves a
   real teacher task. Write `pa.md`.
4. PM compression -> Sonnet DEV fixes -> CR-lite -> browser QA + PO QA -> RM ->
   `cut-note.md`.

## Must Read (cut-specific, ≤5)

- This file
- `server/paper-import-ai/docxSplitter.mjs` (writing splitter)
- `server/paper-import-ai/packageBuilder.mjs` (six-family + writingTasks / answerBox)
- `scripts/verify-i5-writing-ai-import.mjs` (the contract, 509 lines)
- `docs/product/exam-paper-format-standards.md`

## Background (skim if unfamiliar / not already loaded)

- `AGENTS.md` — especially "Current Operating Reality"
- `CONTEXT.md`
- `docs/steering/cut-workflow-protocol.md`, `docs/agents/review-levels.md`,
  `docs/agents/pa-persona.md`
- `server/paper-import/publisher.mjs`

## Source of truth

- Feature branch: `codex/i5-writing-ai-import` (commits `97bf91e`, `1d0dbea`)
- Target base: current `github/main` (≥ `41126be` Merge #158)
- No PR for the feature yet.

## Output paths

- PM plan: `docs/cuts/I5-writing-ai-import/plan.md`
- PA report: `docs/cuts/I5-writing-ai-import/pa.md`
- CR / Big CR: `docs/cuts/I5-writing-ai-import/cr.md`
- Cut note: `docs/cuts/I5-writing-ai-import/cut-note.md`
- Cross-session handoff: `docs/cuts/I5-writing-ai-import/handoff.md`

## Kratos

- Search before acting, e.g. `kratos-memory search "I5 writing import six-family"`.
- Related memory already saved: the ⑤ verify CI-greening + four-family contract
  note, and the I-series CI-gap follow-up (i4/i5 unconditional scope guards).

## Escalation

Use the signals in `AGENTS.md` (`CONTEXT INSUFFICIENT`, `BRANCH CONFLICT`,
`SPEC CONTRADICTS`, `SCOPE UNCLEAR`) instead of writing a partial artifact.
