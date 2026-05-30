# I5 Writing AI Import — Plan

Cut: I5-writing-ai-import · Tier: **Large** · Date: 2026-05-29
PM: 阿澈 (Opus, this session) · PO: 黄学伟
`cut size: large; touches schema / data-contract / product-boundary / teaching-interpretation: yes`
Last synced: 2026-05-30 after CR-lite round 2 (APPROVE) + PM compression.
Open review items: 0 blockers. Remaining gates: browser QA + PO QA → RM.
Non-blocking: 1 Open PO Decision (#1) + 2 Should Watch carried to follow-up.
PA verdict: APPROVE WITH MUST FIX (3 Must Fix) — DEV round 1 closed them (`fd52a78`).
  PA report: [pa.md](pa.md).
CR-lite round 1: APPROVE WITH MUST FIX (1) — caught DEV's false `verify-ci EXIT 0`.
CR-lite round 2: **APPROVE, 0 Must Fix** — DEV round 2 (`96d2e64`) closed MF-1; PM +
  CR both independently re-confirmed `verify-ci` EXIT 0 with `verify-i5` gated.
  Report: [cr-lite-i5.md](cr-lite-i5.md) §Round 2 Re-Review.
**Code/verify gates are GREEN.** Browser QA (阿澈): scenarios 4–5 (render) + 6 (real
DOCX parse on the 七中 paper) **PASS** ([qa-i5.md](qa-i5.md)). Integration with the relay
confirmed (`gpt-5.5`). Remaining: owner's interactive workbench pass (scenarios 1–3) →
RM.

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

## DEV round 2 — post-CR-lite (blocker + two PM-decided additions)

> Round 1 (commit `fd52a78`) closed PA Must Fix 1–3 but reported `verify-ci EXIT 0`
> when it is **red**. CR-lite caught it; PM re-confirmed. Close these before re-CR.

4. **MF-1 (blocker): make `verify-ci` exit 0.** `verify-i1-paper-import-analysis.mjs`
   → `assertPublishPackageBuilder()` (`:445-447`) builds a **four-family** package
   (no `applicationGroup`/`continuationGroup`); under six-family enforcement it throws
   `缺少应用文写作` (a plain `issue()` object → `[object Object]`, exit 1). Round 1's
   verify-i1 scope-guard removal *unmasked* this pre-existing fixture bug without
   fixing it. Add the two writing groups to the fixture and thread them into the build
   args — same pattern as DEV task 1. **Done:** `verify-i1-paper-import-analysis` and
   `verify-ci` exit 0.
5. **SW-1 cleanup (fold in — DEV already edits this file):** remove the now-dead
   `assertAllowedScope`/`changedFiles`/`gitLines` bodies still present in
   `verify-i1-paper-import-route.mjs` (`:59`) and `verify-i1-paper-import-analysis.mjs`
   (`:78`). Round 1 removed only the *calls*, leaving dead `github/main...HEAD` code.
   **Done:** `grep -r "github/main\.\.\.HEAD"` over the scripts `verify-ci` runs returns
   nothing (the plan's gate now actually passes).
6. **Register `verify-i5` in `verify-ci` (PM decision on CR SW-2).** `assertPublishPath`
   proves the writing publish path, but `verify-i5` is **not** in the `verify-ci`
   registry (`verify-ci.mjs:34-37` lists only i1/i2/i3), so the protection never runs
   in CI. Add `verify-i5` to the registry. CI-safe: its only env-dependent test
   (`assertRealDocx`) `existsSync`-guards and **skips** when the owner's DOCX is absent
   (`verify-i5:454-463`). **Done:** `verify-ci` runs `verify-i5` and stays green on a
   machine without the owner's DOCX.

## Follow-up Gate (recorded, NOT this cut)

- **Close the full I-series CI gap:** register `verify-i4` in `verify-ci` too (and audit
  any other unregistered stable script). This is the standing "i4/i5 not in verify-ci"
  item; round 2 registers only i5 (it carries this cut's writing-publish proof).
- **Writing QA-link identification is polarity-based** (`assertPublishPath` finds writing
  links by *lacking* `questionId=`, asserting `=== 2`). Sound today, but a future cut
  that drops `questionId` from another family could mask a regression. Re-examine if a
  Big CR runs or when another family's link shape changes (CR Attack-Angle #3).
- **Dead `assertAllowedScope()` stub in `verify-i1-paper-import-analysis.mjs`**
  (CR round-2 SW-1): round-2 removed its helpers but left the function body, which would
  `ReferenceError` if ever called. Not called, so harmless; delete on the next touch of
  that file. Non-blocking — accepted into merge.
- **`writingPaperViewAdapter` renders only from `group.passage.paragraphs`, ignoring
  `writingTask.instruction`** (browser QA F1, [qa-i5.md](qa-i5.md)). For I5 import output
  both fields agree (packageBuilder writes both), so the prompt renders — browser-
  confirmed. But a writing group with `passage:null` (e.g. the pre-I5 on-disk
  `paper-2024-jslk-english` asset) renders blank. Cheap future hardening: fall back to
  `writingTask.instruction` when `passage.paragraphs` is empty. Non-blocking.

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
`verify-i4`, and **`verify-ci` EXIT 0 with `verify-i5` registered in it** (round-2
tasks 4 & 6). A green verify-i5 invoked by hand is not enough — the gate must run it.

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

Sync ✅ → PM grill + plan ✅ → Opus PA ✅ (`pa.md`) → PM compression ✅ → Sonnet DEV
round 1 ✅ (`fd52a78`) → CR-lite ✅ (1 Must Fix) → PM compression ✅ → Sonnet DEV
round 2 ✅ (`96d2e64`, tasks 4–6) → re-CR-lite ✅ (APPROVE, verify-ci EXIT 0) → PM
compression ✅ → browser QA 阿澈 first pass ✅ (render 4–5 PASS, `qa-i5.md`) →
**PO QA (owner: scenarios 1–3, 6)** → RM artifact gate (阿澈) → merge (小川) →
`cut-note.md`.
PA / DEV / CR were separate sessions; PM re-verified each report's load-bearing claims.
