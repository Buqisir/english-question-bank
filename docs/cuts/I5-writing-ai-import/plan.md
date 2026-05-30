# I5 Writing AI Import — Plan

Cut: I5-writing-ai-import · Tier: **Large** · Date: 2026-05-29
PM: 阿澈 (Opus, this session) · PO: 黄学伟
`cut size: large; touches schema / data-contract / product-boundary / teaching-interpretation: yes`

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

1. **verify-i2 → six-family.** Add `applicationGroup` + `continuationGroup` to
   `scFixtureParseResult()` (`verify-i2:406`) and pass them to the happy-path build
   (`:552`) and the C7-validator build (`:565`). Template: `verify-i4:219-229`. Add two
   new reject fixtures: missing application → `/缺少应用文/`, missing continuation →
   `/缺少读后续写/`. **Done:** `verify-i2` green at six families with **no scope-guard
   bypass**.
2. **Scope-guard CI hygiene** (implement after PA decides the approach — see Open Q2).
   **Done:** `verify-i2`/`verify-i3` green on the I5 branch without neutering, and still
   green on `main`.

## Open questions for fresh PA (cold read — do NOT pre-resolve here)

1. **Adapter-layer boundary.** `writingPaperViewAdapter.ts` lands in the PaperSurface
   adapter layer, which I2 deliberately declared a forbidden contract surface
   (`*Adapter.ts`). Is writing-import a legitimate extension of that layer or does it
   belong elsewhere? Verify A4 plain-writing rendering correctness.
2. **Scope-guard design.** Are per-cut branch-time scope guards the right mechanism in
   `verify:all` CI at all, or should they run cut-time only? (the "i4/i5 unconditional
   scope guards" follow-up). PA picks the approach DEV task 2 implements.
3. **Publish/export correctness** for writing with no `questionId` — `getWritingGroups`,
   writing QA links, six-family publish blocking in the workbench.

## Forbidden scope

- No schema/contract redesign beyond the writing additions already in I5.
- Do not touch landed I1–I4 contracts except the `verify-i2` fixture (task 1).
- Do not weaken six-family enforcement (PO-locked).

## Verification

`verify-i5`, `verify-i2` (six-family, no bypass), `verify-i3`, `verify-i4`,
`verify:all` / `verify-ci`. Browser QA: A4 writing render + six-family publish blocking
in `PaperImportAiWorkbench`.

## Cut flow & gates (Large)

Sync ✅ → PM grill + plan ✅ (this) → **fresh Opus PA → `pa.md`** → PM compression →
Sonnet DEV → CR-lite → browser QA + PO QA → RM → `cut-note.md`.
PA and PM are separate sessions (PO instruction; PA cold-reads).
