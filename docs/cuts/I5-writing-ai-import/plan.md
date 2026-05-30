# I5 Writing AI Import — Plan

Cut: I5-writing-ai-import · Tier: **Large** · Date: 2026-05-29
PM: 阿澈 (Opus, this session) · PO: 黄学伟
`cut size: large; touches schema / data-contract / product-boundary / teaching-interpretation: yes`
Last synced: 2026-05-30 after PA cold-read review + PM compression.
Open review items: 1 (Open PO Decision #1, non-blocking — see §PA follow-up).
PA verdict: APPROVE WITH MUST FIX (3 Must Fix, no direction/contract/boundary defect).
PA report: [pa.md](pa.md). PM independently re-verified the three load-bearing claims.

## Situation

The writing-import feature was **already implemented** by a prior Opus 4.7 session
(commits `97bf91e`, `1d0dbea`) with **no plan / PA / review**. This is a retroactive
review-to-land. Treat the feature as an unreviewed proposal.

Branch synced to `github/main` (≥ `41126be`) via merge `2fcca09` — clean textual
merge; `main`'s substantive changes survived (docxSplitter `sevenChoicesError` branch,
verify-ci i2/i3 gating, seven-choices JSON-prompt fix).

## Locked decisions (PM grill, PO-confirmed)

1. **Writing = zero-question Question Group + Writing Task.** Not a hollow Question.
   CONTEXT.md updated (Question Group exception, new **Writing Task** term, two
   relationships). See [ADR-0007](../../adr/0007-writing-import-data-contract.md).
2. **Six-family completeness is enforced.** Importer ingests only complete standard
   whole papers (PO: "永远导一整张完整卷"). Six families required: reading A-D,
   seven-choices, cloze, grammar-fill, application, continuation. Supersedes the
   four-family contract. ADR-0007. **Do not weaken enforcement to "fix" verify-i2.**
3. **`answerBox` is a layout block (implementation), not a glossary term.** The domain
   concept "answer space" already lives in CONTEXT.md (Student Version). No glossary entry.
4. Future writing analysis attaches at group / Writing Task level, **no `questionId`** —
   the publisher's "writing QA links without questionId" is correct design, not a bug.

## Sync findings — verify state on the synced branch

| script | state | cause |
|---|---|---|
| verify-i5 | ✅ 78 | — |
| verify-i4 | ✅ 45 | i5 author already raised i4 fixtures to six-family |
| verify-i3 | 🟡 | body green (28); reds **only** on branch-time scope guard |
| verify-i2 | ❌ | two independent causes ↓ |

verify-i2 red causes:
- **(A) Contract fix needed.** The "successful publish" happy-path fixture
  (`verify-i2:552`) builds a four-family package with no application/continuation; under
  six-family enforcement (`packageBuilder.mjs:208`) it now throws `缺少应用文写作`
  (a plain `issue()` object → `[object Object]`). The reject fixtures stay valid
  (seven-choices is checked at `:198`, before writing at `:208`).
- **(B) Branch-time scope guards.** `verify-i2`/`verify-i3` diff `github/main...HEAD`
  and assert only that cut's files changed; I5's sibling files trip them. I2 also
  forbids `*Adapter.ts` (`verify-i2:115`), which I5's `writingPaperViewAdapter.ts`
  trips. On `main` (empty diff) these guards skip and pass — they are branch-time only.

## DEV tasks (Sonnet)

> PA correction (verified by PM): `buildPaperImportAiPackageFiles` reads
> `applicationGroup`/`continuationGroup` from its **options argument**, not from
> `parseResult`. Adding them to `scFixtureParseResult()` alone is a no-op — **every
> build that must pass the six-family gate has to pass them explicitly.** And the gate
> order is reading→sc→cloze→grammar→**application(`:209`)→continuation(`:212`)**→
> seven-choices-content-checks(`:290-311`). So the three seven-choices *content* reject
> fixtures throw `缺少应用文写作` first (wrong message) unless they pass writing groups.

1. **verify-i2 → six-family (full, not just the happy path).**
   - Add `applicationGroup` + `continuationGroup` to `scFixtureParseResult()`
     (`verify-i2:406`), template `verify-i4:219-229`.
   - Pass both writing groups via the builder **arguments** into all four builds that
     must reach past the gate: happy path (`:552`) **and** the three seven-choices
     content rejects — sc-analysis-missing (`:576`, `/缺少 AI 解析/`), sc-answer-missing
     (`:591`, `/缺少答案解析版答案/`), sc-answer-conflict (`:606`, `/答案冲突/`).
   - Leave the family-completeness reject (`:619`, missing seven-choices →
     `/缺少七选五/`) **omitting** writing groups — it must still fire `缺少七选五` at
     `:198` first.
   - Add two new reject fixtures, each with the other five families present: missing
     application → `/缺少应用文写作/`, missing continuation → `/缺少读后续写/`.
   - **Done:** `verify-i2` green at six families, **no scope-guard bypass**, and no
     reject firing the wrong message.

2. **Remove per-cut scope guards from `verify:all` (PA-decided approach).**
   Delete the `assertAllowedScope` / `assertForbiddenScope` calls from `main()` in
   `verify-i2/i3/i4/i5`, retaining every behavioural / contract assertion. Also remove
   the sibling hand-patch at `verify-i3:79`
   (`...Adapter.ts && !f.includes('writingPaperViewAdapter')`). **Do not** whitelist
   siblings — that is the failing pattern. Cross-cut scope discipline is a PA/CR job,
   not a brittle branch-coupled CI assertion. If a machine guard is ever wanted again it
   must be a single cut-aware gate invoked explicitly at cut time, never inside
   `verify:all`.
   **Done:** `verify-i2`/`verify-i3` green on the I5 branch without neutering **and**
   still green on `main`; `grep github/main...HEAD` over the scripts `verify-ci` runs
   returns nothing.

3. **Close the writing DB-publish verification hole (NEW — PA Must Fix 3).**
   The publish path (`publishPaperImportPackage` → `upsertPaperAssetToDb`) has **zero**
   writing coverage: `verify-i5` validates the package but never publishes it, and
   `verify-c7-paper-import-publish.mjs` uses a reading-only fixture (`:91`,
   `group_type='reading' count===4`). Publish is the user-visible action this cut ships.
   Add a publish-path assertion: a six-family package (incl. both writing groups)
   round-trips through `publishPaperImportPackage` → DB without violating the
   `question_groups.group_type` CHECK, the writing group persists at
   `group_type='writing'`, and a `questionId`-less writing QA link is produced. (Extend
   `verify-c7` to six families, or add the assertion to `verify-i5`.)
   **Done:** the writing publish path is proven by a test, not only by schema reading.
   Pairs with Browser QA #3 but is not replaced by it.

## PA follow-up (the three open questions, now resolved by PA cold read)

1. **Adapter-layer boundary — RESOLVED: legitimate, the I2 forbid is over-broad.**
   `writingPaperViewAdapter.ts` is a plain per-family `asset → view-model` builder
   beside the landed cloze/grammar-fill adapters; it touches **none** of the real
   shared PaperSurface contract (`shared/papersurface/`,
   `app/src/shared-ui/papersurface/`, the harness `adapter/` contract). The
   `verify-i2:115` `*Adapter.ts` filename match is too broad and catches the wrong
   files. **Rule DEV follows:** a plain `<family>PaperViewAdapter.ts` belongs in
   `app/src/features/paper-intelligence/`, must be pure (no `data-pi-*`, no DOM
   mutation, zero analysis for import-only families); the forbidden surface is the
   shared PaperSurface contract, which writing does not touch.
2. **Scope-guard CI design — RESOLVED → DEV task 2** (remove per-cut guards from
   `verify:all`).
3. **Writing publish/export with no `questionId` — RESOLVED: sound design, one verify
   hole.** Schema, validator, publisher, and DB CHECK all admit writing; the
   `questionId`-less writing QA link is correct per ADR-0007 #4 (no `questionId=null`
   leak). The only gap is the untested DB-publish path → DEV task 3.

## Forbidden scope (PA-confirmed)

- `shared/papersurface/`, `app/src/shared-ui/papersurface/` — the real shared
  PaperSurface contract. Untouched by I5; must stay untouched.
- `schemas/paper-import/*` — already admit writing on `main`; **no schema change is
  needed or allowed**.
- `app/src/domain/paperAsset.ts` — already carries writing/`answerBox`/`writingTasks`
  types on `main`; DEV must not need it.
- Landed I1–I4 runtime contracts beyond the `verify-i2` fixture (task 1) and the
  scope-guard removals (task 2).
- Do not weaken six-family enforcement (`packageBuilder.mjs:209-212`) — PO-locked
  (ADR-0007 #2).
- Do not whitelist siblings in any verify scope guard (task 2 removes them outright).

## Verification

Green required to land: `verify-i5`, `verify-i2` (six-family, no bypass), `verify-i3`,
`verify-i4`, `verify:all` / `verify-ci`.

New assertions DEV must add:
1. `verify-i2`: the corrected four builds + two new writing rejects throw the right
   message in the right order (task 1).
2. Writing DB-publish path: a six-family package publishes through
   `publishPaperImportPackage` with the writing group persisted at
   `group_type='writing'` and a `questionId`-less writing QA link generated (task 3).
3. After task 2, `grep github/main...HEAD` over the scripts `verify-ci` runs returns
   nothing (no branch-diff scope assertion left in `verify:all`).

Browser QA (must run before RM — PaperImportAiWorkbench): (1) import six-family paper →
application + continuation both 就绪, publish enabled only when both ready; (2) strip
writing → `缺应用文写作` / `缺读后续写`, publish disabled; (3) publish end-to-end →
succeeds, no DB CHECK error, writing groups in the asset; (4) click a writing QA link
(no `questionId`) → A4 prompt view loads, right panel shows no-active-question state, no
console error; (5) open both application + continuation links; (6) parse one **real**
exam DOCX (PO machine) → both writing tasks parse, ≥2 English starters.
**QA note:** the writing view shows prompt/material text only — no answer box renders
(it is export/print data). Not a bug unless Open PO Decision #1 resolves toward in-view
rendering.

## Should Watch (PA — non-blocking; `Follow-up Gate` where noted)

- **Writing splitter robustness.** The note-block state machine
  (`docxSplitter.mjs:904-962`) is heuristic, CI-covered by one idealised synthetic
  fixture; the real-DOCX test (`verify-i5:458-488`) points at an absolute path on the
  owner's Desktop and **skips** in CI. Not a land blocker (a mis-parse degrades to a
  structured error and the six-family gate refuses to publish), but **`Follow-up Gate`:
  PO QA must validate parsing on ≥1 real paper** (Browser QA #6) before relying on it.
- **Writing Task not persisted relationally.** `upsertPaperAssetToDb` writes the group
  + passage but not the structured Writing Task (`wordCountTarget`,
  `continuationStarters`, `taskType`) — that lives only in `paper-asset.json`. Fine for
  I5 (future analysis attaches off the asset, ADR-0007 #4); the future writing-analysis
  cut must read the asset, not expect DB rows.
- **`default_score = 0`** for writing groups — harmless now; revisit if writing ever
  needs a group score.
- **First-paragraph label `标题`** (`writingPaperViewAdapter.ts:46`) — cosmetic; the
  first writing line is usually the scenario, not a title.

## Open PO Decisions (1 — non-blocking for this land)

1. **Answer region in the teacher A4 view.** `answerBox` / headings / `pageBreakHint`
   are written into `content.blocks` but rendered by no current surface. Is the writing
   answer region expected to render in the teacher workbench in a future cut, or is it
   export/print-only data? Sets the future-cut boundary and the QA expectation for
   Browser QA #4–5. **Does not block this land**; needed before any writing-render cut
   starts. PO may decide now or defer.

## Cut flow & gates (Large)

Sync ✅ → PM grill + plan ✅ → fresh Opus PA ✅ (`pa.md`, APPROVE WITH MUST FIX) →
PM compression ✅ (this) → **Sonnet DEV (tasks 1–3)** → CR-lite → browser QA + PO QA →
RM → `cut-note.md`.
PA and PM were separate sessions (PO instruction; PA cold-read, PM re-verified claims).
