# PA — import-zj-2020-2022 · server publish-link 浙江老卷 heading/分值 正确化

Reviewer: PA (小川 hat, fresh cold session, did not write any of this code)
Date: 2026-06-18
Scope under review: making the **server publish link** (`packageBuilder.mjs` +
the cloze analyze gate) correctly support 浙江 2020–2022 老卷 format, given the
already-CR-PASSED `lib.mjs` split接力 change.

---

## Verdict

**APPROVE WITH MUST FIX** — recommend data-driven heading + score (option a),
scoped to the 4 sections that actually differ, with a hard byte-diff back-compat
gate. The direction (fix the publish link before publishing 6 ZJ papers) is
correct and the cut is the right size. But three real blockers exist that the
plan does not currently record, and the biggest one (per-question **score**, not
just heading text) is wider than the prompt framed it.

This is an **L4** change: it is the export/publish data-contract layer feeding
SQLite import and the printed A4 paper; teachers will see the result publicly.
PA + DEV + CR + (focused) verify are all required; do not let DEV publish without
the byte-diff gate green.

---

## Product Principle

The published paper is a teacher-facing A4 artifact going public. A heading that
says "完形 共15小题 满分15分" over a 20-题 30-分 浙江完形 is a visible factual error
a teacher will catch immediately, and a wrong per-question score silently
corrupts the paper's total-score display and the basket/组卷 totals. Correctness
of counts AND scores is the whole point of this cut; "heading text" alone
under-scopes it.

---

## Exact Architecture Model (verified against code + 6 sources)

### What packageBuilder hardcodes today (verified, with the real ZJ values)

`buildPaperImportAiPackageFiles` emits these as literal strings / constants.
Confirmed correct ZJ values from all 6 `full.txt` (uniform across the 6 papers):

| Element | code site | hardcoded (新课标) | 浙江老卷 correct |
|---|---|---|---|
| Reading part heading | L224 | `第二部分 阅读` (no score) | `第二部分 阅读理解（共两节，满分35分）` |
| Reading 第一节 heading | L225 | `第一节 阅读理解` (no score) | `第一节（共10小题；每小题2.5分，满分25分）` |
| Seven 第二节 heading | L367 | `第二节 (共5小题；每小题2.5分，满分12.5分)` | `第二节（共5小题；每小题2分，满分10分）` |
| **Seven per-q score** | L336 `DEFAULT_SCORE=2.5` | 2.5 | **2** |
| Lang part heading | L460 | `第三部分 语言运用(共两节，满分30分)` | `第三部分 语言运用（共两节，满分45分）` |
| Cloze 第一节 heading | L461 | `第一节(共15小题；每小题1分，满分15分)` | `第一节（共20小题；每小题1.5分，满分30分）` |
| **Cloze per-q score** | L427 `score: 1` | 1 | **1.5** |
| Grammar 第二节 heading | L553 | `第二节(共10小题；每小题1.5分，满分15分)` | `第二节（共10小题；每小题1.5分，满分15分）` ✅ same |
| Grammar per-q score | L510 `score: 1.5` | 1.5 | 1.5 ✅ same |
| Writing part heading | L628 | `第四部分 写作（共两节，满分40分）` | same ✅ |
| App 第一节 heading | L629 | `第一节（满分15分）` | same ✅ |
| Continuation 第二节 | (writing block) | `第二节（满分25分）` | same ✅ |
| Reading per-q score | L248 `DEFAULT_SCORE=2.5` | 2.5 | 2.5 ✅ same |

**Net: only 4 sections actually differ** — reading part+section headings,
seven (heading+score), cloze (heading+score), lang part heading. Grammar and the
entire writing block are byte-identical between the two formats. This narrows the
blast radius and makes the back-compat diff tractable.

### Counts are ALREADY data-driven; scores are NOT (decisive for option a)

Verified `groups.json` for paper-zj-2020-jan: it carries the real question arrays
that packageBuilder receives — reading 3+3+4=10, seven 5, cloze **20**, grammar
10 — but contains **no 满分/score/每小题 text at all** (`stripScoreAnnotations`
dropped it at split). So:
- **题数 (共N小题)** can be derived right now from `group.questions.length` with
  zero new data — no re-split needed for counts.
- **分值 (每小题X分 / 满分Y分)** has no source in the package and must come from
  somewhere: either a small per-format table in packageBuilder, or re-injected
  into groups.json meta.

### Score is consumed downstream, not just printed (blast radius widening)

`answerEntries[].score` is not cosmetic. App.tsx renders it directly
(`{question.score} 分` L4626, `{block.score} 分/题` L5427) and computes paper /
basket totals from it (`totalScore` L3636/5572/3086, `item.score * questionCount`
L1293). With hardcoded seven=2.5 and cloze=1, a published 浙江老卷 would show
完形每题1分 (should be 1.5) and a wrong paper total (would compute reading
25 + seven 12.5 + cloze 15 + grammar 15 + writing 40 = 107.5 instead of the real
135). **Fixing only the heading string and leaving `DEFAULT_SCORE`/`score:1`
hardcoded produces a paper that prints a correct heading over wrong per-question
scores and a wrong total — internally inconsistent.** The cut must fix score and
heading together.

### provenance.region is NOT visible to packageBuilder, and is not a format key

Verified flow in `02-publish.mjs`: `provenance` is read (L39) but applied to
`import-meta.json` **after** packageBuilder runs (L201–225). The
`buildPaperImportAiPackageFiles` call (L187) is spread from `payload` (L159),
which does **not** include provenance. The runtime route caller
(`routes.mjs:158`) also does not pass it. So **option (b)-via-region is not
feasible without first threading provenance into the builder.** Worse, region is
not a discriminator anyway: paper-zj-2026-jan (a **new-format** Format-B paper)
also has `region:"浙江"`. Region cannot tell old ZJ from new ZJ. **Reject region
as the format key.**

---

## Recommendation: option (a), narrowed — derive counts from data, table the scores

Recommend a **hybrid that is mostly (a)**:

1. **Counts** (`共N小题`): derive from `group.questions.length` already in the
   package. No new data, no re-split.
2. **Scores + 满分 + 每小题**: introduce a small **per-section score resolver**
   keyed off the section's question count + section type — NOT off paperId prefix
   and NOT off region. The two officially-supported formats are fully separated by
   the cloze question count alone: cloze=15 ⇒ 新课标 score set; cloze=20 ⇒ 浙江老卷
   score set. That single signal also implies seven score (2.5 vs 2), reading
   section 满分 presence, and lang-part 满分 (30 vs 45). This is the same signal the
   analyzeCloze gate (L55) already uses.

Why this beats the pure alternatives:
- **Pure (a) "store score in groups.json meta"** forces a re-split of all 6 ZJ
  papers AND re-deriving the new-standard meta to keep byte-compat — more churn,
  and it re-opens the just-CR-PASSED lib.mjs. Avoid touching lib.mjs again in
  this cut.
- **Pure (b) template-by-paperId-prefix / region** is brittle (region is not a
  discriminator; paperId prefix is a naming convention, not a contract) and
  needs provenance threading. Reject.
- The recommended form keeps the decision boundary **in one explicit place**
  (a format-profile object), makes the new-standard branch reproduce today's
  literals byte-for-byte, and degrades gracefully for a future 全国甲/乙/丙 by
  adding one profile entry rather than re-plumbing.

**YAGNI note:** there is exactly one extra format today. Do NOT build a generic
score-DSL. Build a two-entry profile table (NEW_STANDARD, ZJ_LEGACY) selected by
cloze count, with a clear comment that a 3rd entry is the extension point. Anything
larger is over-engineering the PA explicitly rejects.

---

## Must Fix Before DEV

### MF-1 — Fix per-question SCORE, not just heading text (data-contract correctness)
**Risk:** Hardcoded `DEFAULT_SCORE=2.5` (seven) and `score:1` (cloze) flow into
`answerEntries[].score`, which App.tsx renders per-question and sums into paper /
basket totals. Correcting only the heading string yields a published paper whose
printed heading contradicts its own per-question scores and total. Publicly
visible, teacher-catchable.
**Required disposition:** plan.md must record that this cut corrects seven score
(2.5→2) and cloze score (1→1.5) for the ZJ profile **in the same change as the
headings**, and that grammar (1.5) and reading (2.5) are unchanged. Add a verify
assertion on `answer-key.json` per-question score for one ZJ paper AND a paper
total = 135 check.

### MF-2 — Back-compat must be proven by byte-diff on emitted package, gated before publish
**Risk:** The 16 already-published papers (12 新课标 + 4 ZJ new-format incl.
paper-zj-2026-jan) must emit identical packages. The new-standard branch must
reproduce today's exact literals — including the punctuation quirks
(`第二节 (共5小题…` with a space; `第一节(共15…` without; full-width vs half-width
parens differ between sections). One stray character regresses every existing
paper. No existing verify script asserts emitted heading/score text, so there is
**currently zero guard** here.
**Required disposition:** plan.md Verification must require a byte-diff harness:
for ≥3 baselines (`paper-2024-i` FmtA, `paper-2025-ii` FmtB, `paper-zj-2026-jan`
ZJ-new) run `buildPaperImportAiPackageFiles` before vs after the change and assert
the emitted `paper-asset.json` + `answer-key.json` blocks are **byte-identical**.
Publish of the 6 ZJ papers is Forbidden until this diff is green. (This mirrors
the split-side byte-diff the lib.mjs CR already did — reuse the pattern.)

### MF-3 — Format selection key must be cloze-count, explicitly; region/paperId are Forbidden as keys
**Risk:** If DEV reaches for `provenance.region` or a `paper-zj-` prefix, it
(a) cannot work without threading provenance into the builder, and (b) is wrong —
region=浙江 also matches new-format paper-zj-2026-jan, which would corrupt an
already-published paper. paperId prefix is a naming convention, not a contract.
**Required disposition:** plan.md must lock the format key = "completion (cloze)
group question count" (15 ⇒ new-standard, 20 ⇒ ZJ-legacy), record region/paperId
as Forbidden discriminators, and note that any unrecognized count must **throw a
publish error** (no silent fallback to new-standard headings over a third format).

---

## Must Fix -> Plan Disposition Checklist

- [ ] **MF-1** → plan.md: Must-Do step "correct seven score 2→ and cloze 1.5 in
      ZJ profile, same change as headings; reading/grammar unchanged" + Verify
      entry "answer-key per-q score + paper total=135 on one ZJ paper".
- [ ] **MF-2** → plan.md: Verify entry "byte-diff emitted paper-asset.json +
      answer-key.json before/after on paper-2024-i / paper-2025-ii /
      paper-zj-2026-jan = identical" + Forbidden "no publish of 6 ZJ papers until
      byte-diff green".
- [ ] **MF-3** → plan.md: locked product decision "format key = cloze question
      count (15 new / 20 ZJ)"; Forbidden "region / paperId prefix as format key";
      Must-Do "unrecognized format throws, no silent new-standard fallback".

---

## Should Watch

- **SW-1 analyzeCloze L55 change is correct — keep it.** Relaxing the cloze
  analyze-input gate from `===15` to `15 || 20` is right and necessary: ZJ完形 is
  20 空, and the gate would otherwise block ZJ analysis. The comment is accurate
  (新课标15 / 浙江20). The workflow agent's change should be **retained**. Minor:
  it is a discrete-value allowlist, not a `>=12` range, so a future format with a
  different cloze count would be blocked here too — acceptable and consistent with
  MF-3's "throw on unknown format" posture. Non-blocking.
- **SW-2 grammar source inconsistency.** 2020-jan source says 完形/语法
  "每小题5分，满分15分" (a typo in the original — 10×5≠15); the other 5 papers say
  "每小题1.5分，满分15分". The chosen ZJ profile must use 1.5 (matches generated
  output and the 满分15 invariant), not transcribe 2020-jan's typo. Already aligns
  with current hardcoded grammar=1.5, so no change — but DEV should not "fix"
  grammar toward the 2020-jan typo. Non-blocking; noted so it isn't mis-read.
- **SW-3 reading section heading is a NEW emission for the ZJ branch.** New-standard
  emits reading part/section headings with **no** score text. The ZJ branch must
  ADD score text there (满分35 / 满分25). Confirm the print/render layer handles a
  section heading carrying 满分 text on reading (it already does for other sections,
  so low risk) — but it is the one place ZJ emits a string shape new-standard never
  did. Worth one glance in browser QA of a printed ZJ paper. Non-blocking for DEV.
- **SW-4 no re-split needed.** Counts come from existing groups.json; scores come
  from the profile table. The 6 ZJ groups.json are already produced and answer-
  verified per the lib.mjs CR. Do not re-run 01-split for this cut (and do not
  reopen lib.mjs). Record this so DEV doesn't over-scope.

---

## Allowed Files

- `server/paper-import-ai/packageBuilder.mjs` (heading generation + per-section
  score resolution; the only runtime file that should change)
- `server/paper-import-ai/analyzeCloze.mjs` — **only to keep** the existing L55
  15||20 change; no further edits expected
- one verify script (extend an existing `verify-i*.mjs` for the package build, or
  add a focused byte-diff harness) for MF-1 + MF-2

## Forbidden Files

- `scripts/import-pipeline/lib.mjs` — already CR-PASSED; do not reopen for scores
- `scripts/import-pipeline/01-split.mjs` and `groups.json` — no re-split
- `scripts/import-pipeline/02-publish.mjs` contract logic (provenance override
  block stays as-is; do NOT route region into the builder)
- App.tsx / any app/src runtime render code — scores/headings flow through data,
  not UI edits
- Do not publish/import the 6 ZJ papers in the DEV stage (owner-gated, after
  byte-diff green + 2020-jan visual check)

## Static Verify Requirements

1. Byte-diff: `buildPaperImportAiPackageFiles` before/after on paper-2024-i,
   paper-2025-ii, paper-zj-2026-jan → emitted `paper-asset.json` heading blocks +
   `answer-key.json` score entries **identical** (MF-2).
2. ZJ correctness: build one ZJ paper (e.g. paper-zj-2020-jan, dry-run, no
   publish) → assert headings match the table above AND answer-key per-q scores =
   reading 2.5 / seven 2 / cloze 1.5 / grammar 1.5, paper total = 135 (MF-1).
3. Unknown-format guard: a synthetic group set with cloze count ∉ {15,20} causes
   `buildPaperImportAiPackageFiles` to throw, not silently emit new-standard
   headings (MF-3).
4. Confirm none of the existing six-family publish gates (`reading_group_missing`,
   `seven_choices_group_missing`, `cloze_group_missing`,
   `grammar_fill_blank_count_invalid` =10, `application_writing_missing`,
   `continuation_writing_missing`, `continuation_starters_missing`) trip for ZJ:
   verified ZJ groups.json has reading A/B/C summing to 10 with letters A/B/C —
   **see Open PO Decision OPD-1: reading-D is required by the publish gate but ZJ
   has only A/B/C.**

## Browser QA Matrix

Not required for the DEV diff itself (no UI code changes), but required before the
owner-gated publish (per L4):
- Print/preview one published ZJ paper (2020-jan): reading heading shows 满分35 /
  第一节 满分25; 完形 shows 共20小题 每小题1.5分 满分30分; 语言运用 part shows 满分45;
  paper total renders 135 in the basket/组卷 total. (Covers MF-1, SW-3.)
- Confirm an already-published paper (paper-2024-i) is byte-unchanged in the UI
  after re-publish is NOT needed — it is not re-published; the byte-diff (MF-2) is
  the guard. Only the 6 new ZJ papers get QA.

## DEV Readiness

Ready **after** plan.md records MF-1..MF-3 and resolves OPD-1. The teacher action
improved (publish a factually-correct 浙江老卷 A4 paper), before/after behavior,
cut boundary (4 sections + score), future boundary (3rd format = add one profile
entry), allowed/forbidden files, verify scripts, and QA matrix are all specified
above. The split side is done and CR-PASSED. **Do not start DEV until OPD-1 is
answered**, because it determines whether ZJ can pass the existing publish gate at
all — it is upstream of the heading work.

## Open PO Decisions (1 — under the limit of 3)

**OPD-1 — ZJ reading has 3 passages (A/B/C, 10 题), but the publish gate
`reading_group_missing` (packageBuilder L190–194) requires Reading A/B/C/**D****.
Verified: paper-zj-2020-jan groups.json has only reading-a/b/c (3+3+4=10), no
reading-d. New-standard papers have 4 reading passages (A–D). **As written, every
ZJ老卷 will fail `缺少 Reading D，不能发布` before any heading code runs.** This is a
blocker the prompt did not surface and the plan must resolve:
  - Option 1: relax the 4-family reading gate to "≥1 reading passage covering the
    required question count" (correct, but touches a publish gate — needs CR care).
  - Option 2: split ZJ reading into a 4th synthetic group (wrong — fabricates
    structure).
  PO/PM must pick. **Recommend Option 1**, scoped narrowly to reading-letter
  completeness, with the question-count total (10 for ZJ / 15 for new) as the real
  invariant. This is the single most important thing for PM to resolve, and it
  belongs in this cut, not a follow-up — without it the 6 papers cannot publish.

> Note: I am surfacing OPD-1 as the one open decision rather than asserting the
> fix, because relaxing a publish gate is a product-contract call (what is the
> minimum valid reading structure?) that is the PO/PM's to make, not DEV's.
