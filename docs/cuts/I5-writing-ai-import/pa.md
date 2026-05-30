# PA Report — I5 Writing AI Import (retroactive cold read)

Cut: `I5-writing-ai-import` · Tier: Large · Review type: PA (cold read) ·
Date: 2026-05-30
Reviewer: PA (Opus, fresh session) · PO: 黄学伟 · PM author: 阿澈
Question under review: can the already-built writing-import feature **land on
`main`** (not whether to start DEV).

Baseline verified independently: on `codex/i5-writing-ai-import`,
`git rev-parse --show-toplevel` = repo root, `git fetch github` clean, branch
carries merge `2fcca09` and PM grill `41dab1b`. `plan.md` treated as input; its
three open questions answered below from the code, not from its wording.

---

## Verdict

**APPROVE WITH MUST FIX.**

The direction is right and in-scope. Writing import is a legitimate extension of
the AI importer and of the existing per-group paper-view adapter layer; the data
contract holds end-to-end (schema, validator, DB CHECK all already admit
writing); the two ADR-0007 locked decisions are consistent with the code and I
found no evidence strong enough to challenge either. The feature does not turn
PaperSurface into an AI dashboard — the writing view is a plain A4 prompt render
with an empty analysis panel, mirroring the cloze/grammar-fill siblings.

It cannot land as-is for three concrete reasons: (1) the planned `verify-i2`
fixture fix is under-scoped and will leave `verify-i2` red at the seven-choices
reject fixtures; (2) the per-cut scope guards red `verify-i2`/`verify-i3` on this
branch and must be resolved by an actual CI-design decision, not by whitelisting
siblings one by one; (3) the DB publish path for a writing group is exercised by
**zero** tests, and publish is the user-visible action this cut ships.

None of these is a wrong-direction or contract defect. They are land blockers
that are cheap and well-scoped to close.

---

## Product Principle

The teacher action being improved: importing a **complete standard paper** and
getting every section — now including the two writing tasks (应用文 + 读后续写) —
landed as first-class question-bank assets, so the writing prompt/material is
viewable on the same A4 surface as the objective sections, ready for future
writing analysis to attach.

The product test this cut must keep passing: *the paper stays primary, and
"import" means a whole paper, not a pile of objective questions plus orphaned
prose.* Six-family completeness (ADR-0007 #2) is the parse-correctness guard that
enforces this. Writing modelled as a zero-Question Group + Writing Task
(ADR-0007 #1) is what keeps the Question-keyed analysis machinery from being
special-cased into incoherence. Both are sound and stay.

---

## Exact UX / Architecture Model

What is actually built and how data flows (verified by reading, not by the
survey):

- **Splitter** (`docxSplitter.mjs:853-1023`): parses a writing section into
  `applicationGroup` (`groupType:'writing'`, zero questions, prompt paragraphs)
  and `continuationGroup` (zero questions, material paragraphs + ≥2
  `continuationStarters`). Errors are structured (`continuation_section_not_found`,
  `continuation_starters_missing`, …) and surfaced in the workbench.
- **Package builder** (`packageBuilder.mjs:184-216, 529-641`): hard-blocks
  publish unless all six families are present (reading A–D `:190-194`,
  seven-choices `:197`, cloze `:201`, grammar-fill `:203`, application `:208`,
  continuation + ≥2 starters `:211-216`). Emits writing groups, `writingTasks`
  (`taskType`, `wordCountTarget`, `continuationStarters`, `materialText`),
  `answerBox` blocks (`:575`, `:640`), and a `第四部分 写作` layout part.
- **Validator** (`validator.mjs:424-446`): `validateNonReadingCompleteness`
  iterates `group.questionIds`; for a writing group that array is empty so the
  loop body never runs — zero-Question groups pass cleanly, no warning, no block.
- **Publisher** (`server/paper-import/publisher.mjs`): `getWritingGroups`
  (`:346-355`) returns writing groups with `defaultQuestionId:null`; writing QA
  links (`:438-455`) deliberately **omit** the `questionId` param while every
  other family sets it. `upsertPaperAssetToDb` writes the writing group to
  `question_groups` with `group_type='writing'` (CHECK at
  `data/sql/schema.sql:36-47` admits it) and `default_score=0`.
- **Harness** (`PaperIntelligencePaperSurfaceHarness.tsx:345-358`): routes
  `groupType==='writing'` → `buildWritingPaperView` → renders the prompt/material
  via PaperSurface's `textMap`; right analysis panel shows the no-active-question
  state (`analysisByQuestionId:{}`, `defaultQuestionId:null`).
- **Workbench** (`PaperImportAiWorkbench.tsx:405-421`): `canPublish` requires
  `appReady && contReady` (≥2 starters) on top of the four objective families.
  Client disable + server throw — no fake availability.

Three answers to `plan.md`'s open questions:

### Q1 — Adapter-layer boundary: legitimate; the I2 forbid is over-broad

`writingPaperViewAdapter.ts` sits in `app/src/features/paper-intelligence/`
beside `clozePaperViewAdapter.ts`, `grammarFillPaperViewAdapter.ts`,
`paperAssetSurfaceAdapter.ts`, `sevenChoicesSurfaceAdapter.ts`. The
per-group-type "plain paper view" adapter is an **established, already-landed
pattern** (cloze in I3, grammar-fill in I4). Writing is a parallel, pure
`asset → view-model` builder: no DOM, no `data-pi-*`, no analysis. It is a
legitimate extension of that layer.

The surface I2 actually meant to protect is the shared **PaperSurface data
contract** (`shared/papersurface/`, `app/src/shared-ui/papersurface/`, and the
harness `adapter/` contract). I5 touches **none** of those (confirmed in the
diff). The `verify-i2:115` rule `file.endsWith('Adapter.ts')` is a blanket
filename match that catches the wrong files — the per-group view adapters are not
the contract. Proof that the rule is wrong, not the code: the I5 author had to
hand-patch `verify-i3:79` to `(...Adapter.ts && !f.includes('writingPaperViewAdapter'))`
to let the new adapter through. That whitelist-per-sibling pattern is the symptom
(see Q2).

**Rule DEV follows:** a plain per-family paper-view adapter
(`<family>PaperViewAdapter.ts`) belongs in
`app/src/features/paper-intelligence/`; it must be pure (asset → view-model),
emit no `data-pi-*`, mutate no DOM, and carry zero analysis for import-only
families. The forbidden surface is the shared PaperSurface contract, which
writing does not touch.

A4 rendering: correct for what the cut ships, with one boundary to state.
`buildWritingPaperView` (`writingPaperViewAdapter.ts:26-111`) renders the
prompt/material paragraphs only. The `answerBox`, part/section headings,
instruction notes, and `pageBreakHint` live in `content.blocks` and are consumed
by **no current renderer** (the harness uses `textMap`; `usePaperBlocks` speaks a
different block vocabulary — `question_group`/`section_header`). That is forward-
looking print/export data, acceptable for an import-only cut and consistent with
the cloze/grammar-fill siblings — but QA must not expect an answer box in the
browser, and "should the answer region eventually render in the teacher view?" is
a genuine future-cut boundary (Open PO Decision #1).

### Q2 — Scope-guard CI design: remove the per-cut guards from `verify:all`

The four cuts carry **three inconsistent** guard mechanisms:

| script | diff basis | mechanism | state on I5 branch |
|---|---|---|---|
| verify-i2 | `github/main...HEAD` ∪ worktree | `shouldCheckScope` heuristic + allowlist + forbid(`*Adapter.ts`) | ❌ reds on sibling files (`:107`) |
| verify-i3 | `github/main...HEAD` ∪ worktree | allowlist + forbid(`*Adapter.ts` **except** hand-patched `writingPaperViewAdapter`) | 🟡 reds on `CONTEXT.md`, `docs/adr`, `docs/cuts/I5` (allowlist `:74`) |
| verify-i4 / verify-i5 | `git diff HEAD` (worktree only) | allowlist + forbid | ✅ **inert** on a clean branch (empty diff → asserts pass vacuously) |

The guards are branch-coupled: they assume the only branch where importer files
change is that cut's own branch. False — `packageBuilder.mjs`, `docxSplitter.mjs`,
`publisher.mjs`, and the harness are **shared across I1–I5**, so every later cut
legitimately edits the same files and trips the prior cut's allowlist/forbid. On
`main` they pass only by accident (empty diff). The "i4/i5" pair was already
"resolved" by making the guard inert; the i2/i3 pair was being resolved by hand-
whitelisting each new sibling. Both are non-solutions. This is exactly the
standing "i4/i5 unconditional scope guards" follow-up, now blocking a land.

**Decision DEV task 2 implements:** per-cut branch-time scope guards must **not**
run inside `verify:all` / `verify-ci`. Remove the `assertAllowedScope` /
`assertForbiddenScope` calls from each verify script's `main()` (verify-i2,
verify-i3, verify-i4, verify-i5) so `verify:all` runs only the behavioural /
contract assertions. Cross-cut scope discipline is already a PA/CR
responsibility — that is where it belongs; a brittle, branch-coupled CI assertion
that reds every sibling cut is worse than no assertion. If a machine-checked
guard is ever wanted again, it must be a single cut-aware gate invoked explicitly
at cut time (parameterised by the active cut id), never inside `verify:all`.

Explicitly forbidden resolution: do **not** keep extending each prior cut's
allowlist/forbid to whitelist the new sibling (the `writingPaperViewAdapter`
hand-patch at `verify-i3:79`). That is the failing pattern; DEV should also remove
that patch when it removes the guards.

This removes cause (B) of `verify-i2`/`verify-i3` red. Cause (A) is closed by DEV
task 1.

### Q3 — Writing publish/export with no `questionId`: sound design, one verify hole

The contract holds at every layer I checked:

- Schema `paper-asset-v1.schema.json` admits `groupType:'writing'` (enum
  `:58-60`), `content.writingTasks` (`:84`), an untyped `blocks` array (so
  `answerBox` passes), and `additionalProperties:true` on groups (so
  `writingTaskId` survives). `verify-i5:320-321` proves the full six-family
  package passes `validatePaperImportPackage`.
- `getWritingGroups` → `defaultQuestionId:null`; writing QA links omit
  `questionId` entirely (`publisher.mjs:438-455`). No `questionId=null`-string
  leak (the writing branch never calls `.set('questionId', …)`). This is exactly
  ADR-0007 #4 — "writing QA links have no `questionId`" is correct design, not a
  bug. The harness consumes such a link without a `questionId` and renders the
  writing view.
- DB CHECK `data/sql/schema.sql:36-47` admits `'writing'`; `groupTypeMap` maps
  `writing → 'writing'`.

**The one real gap — a verification hole, not a code defect:** the DB publish
path (`publishPaperImportPackage` → `upsertPaperAssetToDb`) is exercised by **no
test for writing**. `verify-i5` validates the package but never publishes it;
`verify-c7-paper-import-publish.mjs` uses a reading-only fixture (asserts
`group_type='reading' count === 4`, `:91`) with zero writing coverage. The
publish is one transaction wrapping all groups, so a single bad writing insert
would roll back the entire publish. The code *reads* correct, but landing a
publish feature whose publish path is wholly untested fails the PaperSurface bar
("browser-visible behaviour must be QA'd"). → Must Fix (verification), closable
by a cheap static publish-path assertion and/or a recorded browser/PO QA pass.

### Sanity-check (prompt-requested): DEV task 1 reject-ordering is under-scoped

The plan's claim — "the reject fixtures stay valid (seven-choices is checked at
`:198`, before writing at `:208`)" — is **true only for the family-completeness
reject** (`verify-i2:619`, missing seven-choices → `/缺少七选五/`, which fires
before the writing gate). It is **wrong for the three seven-choices reject
fixtures** at `verify-i2:576` (`/缺少 AI 解析/`), `:591` (`/缺少答案解析版答案/`),
`:606` (`/答案冲突/`). Those checks live at `packageBuilder.mjs:289-316`, **after**
the six-family gate (`:208`). They pass `applicationGroup`/`continuationGroup` as
`undefined`, so under six-family enforcement they now throw `缺少应用文写作`
**first** — the wrong message — and their `assertRejects` patterns fail.

Empirically proven (minimal probe against `buildPaperImportAiPackageFiles`):

```
A four-family happy path (no writing):              THROW -> 缺少应用文写作，不能发布。
B sc-analysis=null, no writing (verify-i2:576 shape): THROW -> 缺少应用文写作，不能发布。
```

Also note `buildPaperImportAiPackageFiles` reads `applicationGroup` /
`continuationGroup` from its **options argument**, not from `parseResult` — so
"add them to `scFixtureParseResult()`" alone is a no-op; each call site must pass
them. The fix: add writing groups to `scFixtureParseResult()` **and** thread
`applicationGroup`/`continuationGroup` into every build meant to pass the gate —
the happy path (`:552`) and the three SC rejects (`:576`, `:591`, `:606`) — while
the missing-seven-choices reject (`:619`) keeps omitting them. Plus the two new
reject fixtures (missing application → `/缺少应用文写作/`, missing continuation →
`/缺少读后续写/`), each needing the other five families present. As written, the
plan's DEV task 1 would leave `verify-i2` red at the SC-analysis reject after the
happy path is fixed.

---

## Must Fix Before Land

1. **DEV task 1 is under-scoped — extend it to the seven-choices reject
   fixtures.** Add writing groups to `scFixtureParseResult()` (`verify-i2:406`)
   **and** pass `applicationGroup`/`continuationGroup` into the builds at
   `verify-i2:552`, `:576`, `:591`, `:606`. Add two new reject fixtures (missing
   application → `/缺少应用文写作/`; missing continuation → `/缺少读后续写/`). Leave
   `:619` untouched. **Done:** `verify-i2` green at six families with no
   scope-guard bypass and no reject firing the wrong message.

2. **Resolve the scope-guard CI design (DEV task 2) by removing the per-cut
   guards from `verify:all`.** Delete `assertAllowedScope`/`assertForbiddenScope`
   from `main()` in verify-i2/i3/i4/i5, and remove the `writingPaperViewAdapter`
   hand-patch at `verify-i3:79`. Do **not** whitelist siblings. **Done:**
   `verify-i2` and `verify-i3` green on the I5 branch and still green on `main`,
   with all behavioural/contract assertions retained.

3. **Close the writing DB-publish verification hole.** Add a publish-path
   assertion that a six-family package (including the two writing groups)
   round-trips through `publishPaperImportPackage` → DB without violating the
   `question_groups.group_type` CHECK, and that `getWritingGroups` + the
   `questionId`-less writing QA link are produced. (Extend
   `verify-c7-paper-import-publish.mjs` to six families, or add a publish
   assertion to `verify-i5`.) **Done:** the writing publish path is proven by a
   test, not only by reading the schema. May be paired with the Browser QA below
   but not replaced by it.

---

## Must Fix -> Plan Disposition Checklist

| # | Must Fix | Where PM reflects it in `plan.md` |
|---|---|---|
| 1 | DEV task 1 must also fix the SC reject fixtures (`:576/:591/:606`) and pass writing groups via the builder **arguments** | **DEV tasks** — rewrite task 1's "Done" to enumerate the four builds + two new rejects; note args-not-parseResult |
| 2 | Remove per-cut scope guards from `verify:all`; remove the verify-i3 sibling whitelist; do not whitelist siblings | **DEV tasks** (task 2 approach now decided) + **Verification** (state guards are cut-time-only / out of `verify:all`) |
| 3 | Add a writing DB-publish-path test | **Verification** — add the publish-path assertion to the required verify list |

---

## Should Watch

- **Writing splitter robustness.** The note-block state machine
  (`docxSplitter.mjs:904-962`, `findWritingSectionStart`, starter detection) is
  heuristic and is CI-covered by a single idealised synthetic fixture
  (`verify-i5:90-154`). The real-DOCX test (`verify-i5:458-488`) points at an
  absolute path on the owner's Desktop and **skips** elsewhere — it proves nothing
  in CI. Does not block land (the contract and gating are proven), but PO QA must
  validate parsing on at least one real paper before relying on it. Why not a
  blocker: a mis-parse degrades to a structured error the workbench surfaces and
  the six-family gate refuses to publish — it cannot publish garbage.
- **Writing Task not persisted relationally.** `upsertPaperAssetToDb` writes the
  writing group + passage but not the structured Writing Task
  (`wordCountTarget`, `continuationStarters`, `taskType`); that lives only in
  `paper-asset.json`. Fine for I5 (future writing analysis attaches at group/task
  level off the asset, per ADR-0007 #4), but watch when that future cut lands —
  it must read the asset, not expect DB rows.
- **`default_score = 0`** for writing groups (`publisher.mjs:72-77`, empty
  `questionIds`). Harmless now; revisit if writing ever needs a group score.
- **First-paragraph label `标题`** (`writingPaperViewAdapter.ts:46`). For a
  writing prompt the first line is usually the scenario, not a title. Cosmetic.

---

## Allowed Files

I5's actual contract surface (16 files, `github/main...HEAD`) is in scope and
correct:

- `server/paper-import-ai/docxSplitter.mjs`, `packageBuilder.mjs`, `routes.mjs`
- `server/paper-import/publisher.mjs`
- `app/src/features/paper-intelligence/writingPaperViewAdapter.ts`,
  `PaperIntelligencePaperSurfaceHarness.tsx`
- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`
- `app/src/services/paperImportAi.ts`
- `CONTEXT.md`, `docs/adr/0007-writing-import-data-contract.md`,
  `docs/cuts/I5-writing-ai-import/*`
- `scripts/verify-i5-writing-ai-import.mjs`

DEV may additionally touch, for the Must Fix items only:

- `scripts/verify-i2-seven-choices-ai-import.mjs` (task 1 fixture; PO-locked
  per plan)
- `scripts/verify-i3-cloze-ai-import.mjs`, `verify-i4-grammar-fill-ai-import.mjs`,
  `verify-i5-writing-ai-import.mjs` (task 2: remove scope-guard calls)
- `scripts/verify-c7-paper-import-publish.mjs` **or**
  `verify-i5-writing-ai-import.mjs` (task 3: publish-path test)

---

## Forbidden Files

- `shared/papersurface/`, `app/src/shared-ui/papersurface/` — the real shared
  PaperSurface contract. Untouched by I5; must stay untouched.
- `schemas/paper-import/*` — already admit writing on `main`; **no schema change
  is needed or allowed** for this cut.
- `app/src/domain/paperAsset.ts` — already carries the writing/`answerBox`/
  `writingTasks` types on `main` (not in I5's diff); DEV must not need it.
- Landed I1–I4 runtime contracts beyond the `verify-i2` fixture (task 1) and the
  scope-guard removals (task 2).
- Do not weaken six-family enforcement (`packageBuilder.mjs:208-216`) — PO-locked
  (ADR-0007 #2).

---

## Static Verify Requirements

Green required to land: `verify-i5`, `verify-i2` (six-family, no bypass),
`verify-i3`, `verify-i4`, `verify:all` / `verify-ci`.

New assertions DEV must add:

1. `verify-i2`: the four corrected/added writing fixtures throw the right
   message in the right order (Must Fix 1).
2. Writing DB-publish path: a six-family package publishes through
   `publishPaperImportPackage` with a writing group persisted at
   `group_type='writing'`, and a `questionId`-less writing QA link is generated
   (Must Fix 3).
3. After task 2, confirm `verify:all` contains **no** branch-diff scope assertion
   (grep for `github/main...HEAD` in the verify scripts run by `verify-ci`).

---

## Browser QA Matrix

| # | Scenario | Expected |
|---|---|---|
| 1 | Import a complete six-family paper; open the workbench | Application + continuation status both read 就绪; publish button enabled only when both ready |
| 2 | Remove the writing section from the source; re-parse | `缺应用文写作` / `缺读后续写` shown; publish button disabled |
| 3 | Publish a six-family paper end-to-end | Publish succeeds; no DB CHECK error; version written; writing groups present in the published asset |
| 4 | Click a writing QA link (no `questionId`) from the publish report | Writing A4 view loads the prompt/material; right panel shows the no-active-question state; no console error from a missing `questionId` |
| 5 | Open both the application and the continuation QA links | Each renders its own prompt/material; continuation shows its material (starters are part of the export blocks, not the prompt body — confirm against PO expectation, see Open PO #1) |
| 6 | Parse one **real** exam DOCX (PO machine) | Application + continuation parse; ≥2 English starters detected |

QA note for the PO: the browser writing view shows the **prompt/material text
only** — no answer box renders (it is export/print data). Do not file that as a
bug unless Open PO Decision #1 resolves toward in-view rendering.

---

## Land Readiness

Ready on every axis except the three Must Fix items:

- Teacher action improved: ✅ stated (import a whole paper incl. writing).
- Before/after: ✅ (writing now lands as zero-Question groups + Writing Tasks).
- Current-cut boundary: ✅ import + plain A4 prompt view; no writing analysis.
- Future-cut boundary: ✅ writing analysis attaches at group/task level (ADR-0007
  #4); answer-region rendering deferred (Open PO #1).
- Allowed/forbidden files: ✅ above.
- Verify scripts/assertions: ⛔ blocked by Must Fix 1 & 3.
- Browser QA matrix: ✅ defined; must be run.
- PO decisions ≤3: ✅ one open.

Not land-ready until Must Fix 1–3 close and the Browser QA matrix passes. No
wrong-direction, contract, or boundary defect blocks the land.

---

## Open PO Decisions

1. **Answer region in the teacher A4 view.** `answerBox`/headings/`pageBreakHint`
   are written into `content.blocks` but rendered by no current surface (the
   harness shows prompt/material only). Is the writing answer region expected to
   render in the teacher workbench in a future cut, or is it export/print-only
   data? This sets the future-cut boundary and the QA expectation for cases 4–5
   above. Does not block this land; needed before any writing-render cut starts.

(No ADR-0007 challenge: both locked decisions are consistent with the code and I
found no evidence strong enough to override. Not escalating.)
