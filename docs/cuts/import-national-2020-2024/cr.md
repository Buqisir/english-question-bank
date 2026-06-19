# CR — import-national-2020-2024 · 全国甲/乙/丙卷导入（只导阅读+语言运用 4 题型）

Reviewer: CR (fresh cold session, did NOT write this diff). Read the actual diff,
re-ran verify, probed the misroute backstops by hand. Did not nod along to the
DEV/PA narrative.
Date: 2026-06-19
Branch: `import-national-2020-2024` @ `ca352b2`; baseline `main`.
Level: **L4** — publish data-contract layer (FORMAT_PROFILE + publish gates +
split 契约). Strength follows risk: I independently re-verified byte-equivalence
and gate symmetry rather than trusting pass counts.

---

## Recommendation

**APPROVE** (no Must Fix).

The design is sound and the two highest-risk holes the PO/PA flagged (silent
misroute in both directions) are genuinely backstopped, not just commented. I
proved the backstops fire by hand. Backward compatibility is byte-identical on
all four regression-critical formats by my own re-run, not the report's say-so.
Two Should Watch items remain — neither blocks this merge.

---

## Changed Scope (confirmed from the diff, not the report)

Committed file set = exactly the plan's allowed set, nothing forbidden:
`lib.mjs`, `packageBuilder.mjs`, `validator.mjs`, `01-split.mjs` (report-only
null guard), `verify-national-format.mjs` (new), `paper-2022-jia/config.json`
(new glue), `.gitignore` (source.docx untracked), plan.md/pa.md (docs).

- **No** schema / domain / Adapter / PaperSurface / print / App.tsx / frontend
  touch. No "短文改错" 题型 added. `git diff --name-only` confirms.
- The 3 untracked `source.docx` from the opening snapshot are now covered by the
  new `.gitignore` rule and no longer appear in `git status` — off-repo material,
  correctly never tracked.
- Plan anticipated edits to `gen-configs.mjs` / `02-publish.mjs`; neither was
  needed (02-publish already destructures `application`/`continuation` and passes
  them through null-safe — verified lib lines 48/168-169, no property access).
  Fewer changes than planned, not a defect.

---

## Findings

### Must Fix
None.

### Should Watch (do NOT block this merge)

- **SW-A — `verify-national-format.mjs §3 is a copy of validator logic, not a
  call into validator.** Line 49 inlines `letters.has('D')?4:3`, a *duplicate* of
  validator's expression, so §3 would NOT catch a future divergence in
  `validator.mjs`. This is acceptable **only because** the REAL symmetry is proven
  elsewhere: `verify-publish-gate.mjs paper-2022-jia` runs the actual
  `validatePaperImportPackage` → `validateReadingAnalysisBundle` end-to-end and I
  re-ran it → `ok:true`, blockingCount 0, exercising both packageBuilder's
  resolveFormatProfile (→ nationalLegacy) and validator's reading gate (expects
  A-D, finds A-D) on the same asset. If §3's inlined copy is ever mistaken for the
  symmetry guard and the publish-gate run is dropped, the duplicate could go
  green while validator diverges. Keep running `verify-publish-gate paper-2022-jia`
  as the load-bearing symmetry check; §3 is a convenience pre-check only.

- **SW-B — the import-pipeline verify family is owner/DEV-run, NOT CI-gated.**
  `verify-national-format.mjs` lives in `scripts/import-pipeline/`, which is not in
  `scripts/verify-ci.mjs`'s explicit allowlist (only `scripts/verify-*.mjs` run in
  CI). This matches the established convention for this pipeline (verify-zj-*,
  verify-publish-gate are all owner-run too), so it is **not a regression this cut
  introduced**. But it means these protections only protect if someone runs them.
  Mitigated by: publish is owner-gated (plan §流程 5-6, only after owner QA of
  2022-甲), and the gates DO run inside `02-publish` / `verify-publish-gate` before
  any real publish. Non-blocking; the norm here is manual-run pipeline tooling.

- **SW-C — nationalLegacy A4 score total is owner-QA-gated (carry-over of PA
  SW-4).** Question counts are correct (15/5/20/10, re-verified). Rendered scores
  (reading 2 via `profile.readingScore`, seven 2, cloze 1.5, grammar 1.5) are
  sourced from the profile per PA's requirement, not copied from zj. The A4 total
  (~85 ex-listening/writing) must be checked against the official 全国 paper by
  owner QA before publish — this is a sourcing/QA step (plan §流程 6), not a
  CR-blockable code defect.

---

## Self-Review Blind Spots (for any later Big CR)

- **Doubly-broken new-standard residual (acknowledged in PA MF-1).** The reverse
  assertion `else if (applicationGroup || continuationGroup) throw
  unexpected_writing_groups` only fires when writing groups are NON-null. A
  new-standard paper that simultaneously (a) miscounts cloze to exactly 20 AND (b)
  fails to parse BOTH application and continuation (both null) AND (c) has exactly
  4 reading passages → routes to nationalLegacy with null/null writing → reverse
  assertion sees null/null → publishes as a "national" paper with no writing. This
  is the documented residual the PA accepted. I judge it acceptable: a 15-question
  new-standard would need +5 spurious cloze questions to hit exactly 20, AND a
  total writing-parse failure, simultaneously — implausible, and any such paper is
  multiply-broken upstream. Not closeable without a 4th signal; out of this cut's
  scope. Big CR should re-confirm this is still residual if a 4th cloze-20 format
  is ever added.
- **`groupLetter` title-fallback asymmetry** (packageBuilder counts via groupId
  regex OR title `Reading [A-D]`; validator counts via groupId regex only). Cannot
  diverge for this pipeline because all generated reading groupIds end in
  `reading-[a-d]` (verified on 3 papers), so the title fallback is never reached.
  If a future asset source produces a reading group with a non-conforming groupId
  but a matching title, the two sides could desync. Pre-existing quirk, not
  introduced here; flagged for awareness.

---

## Failure / Attack Angle (concrete)

1. **National paper loses passage D in parsing (cloze20 + 3 passages).** I probed
   this: it routes to **zjLegacy** (not throw) — PA named this risk. BUT zjLegacy
   has `requireWritingFamilies:true`, and a national paper carries null writing →
   packageBuilder throws `continuation_writing_missing`. **Blocked, not
   silently half-published.** Backstop holds (verified by hand: 3-passage cloze20
   → zjLegacy → requires writing → national has none → throw).
2. **Half-parsed new-standard, cloze miscounted to 20, 4 passages, writing groups
   present.** I probed this (padded paper-2025-ii cloze to 20): routes to
   nationalLegacy (`requireWritingFamilies:false`). BUT its real
   application+continuation groups are non-null → reverse assertion
   `unexpected_writing_groups` fires. **Blocked.** This is exactly the hole the PO
   asked about, and it is closed.
3. **skipWriting becoming a catch-all (PA SW-2).** Verified the skip is keyed
   strictly on `/短文改错/` matching in the writing part, NOT on "第二节 missing →
   swallow". A new-standard/浙江 paper with a genuinely broken 续写 contains no
   "短文改错" → falls to the else branch → still throws. Confirmed only
   paper-2022-jia (the national paper) contains "短文改错" across all 24 local
   papers, so the keyed match cannot misfire on existing formats.
4. **Stale fallback / weakened gate.** The four hard 题型 gates (reading A-D /
   七选五 / 完形 / 语法) are unchanged and still throw. `DEFAULT_SCORE` (2.5) fully
   removed; newStandard + zjLegacy both set `readingScore:2.5` = byte-identical.
   The six-family gate was wrapped in `if (profile.requireWritingFamilies)`, not
   deleted — newStandard/zjLegacy still require it (proven: zj-2026-jan +
   zj-2020-jan both `ok:true` through the full gate, exercising the writing path).

---

## Verification Evidence (re-run by CR, not copied)

- **Byte-equivalence (independent):** wrote a harness importing `buildGroups` from
  both branch and `main:lib.mjs`, ran on cached `full.txt` for paper-2024-i (FmtA),
  paper-2025-ii (FmtB new-standard), paper-zj-2026-jan (zj new), paper-zj-2020-jan
  (zj old cloze20). **All 4 `[IDENTICAL]`.** This is the load-bearing backward-compat
  proof — the only existing-format-affecting changes are `buildGrammar` stdStart
  (= 56 for both new-standard 36+5+15 and zj-old 31+5+20, hand-verified) and the
  writing-skip branch (keyed on 短文改错, never matched by existing formats).
- `verify-national-format.mjs`: 13/13 [OK] (re-ran).
- `verify-publish-gate.mjs paper-2022-jia`: `ok:true`, blockingCount 0 — full
  real gate (packageBuilder + validator) on the national paper, A-D required and
  found. The TRUE symmetry proof.
- `verify-publish-gate.mjs paper-zj-2020-jan` (zjLegacy regression): `ok:true`,
  blockingCount 0 — writing-family松绑 did not misfire.
- `verify-publish-gate.mjs paper-zj-2026-jan` (new-standard FmtB regression):
  `ok:true` — writing path still enforced and passing.
- cloze15 new-standard papers (2024-i/2025-i/2025-ii) fail the gate only on
  `seven_choices_analysis_required` (missing local AI analyses, a local-state
  artifact), NOT on format/score logic.
- Misroute backstops #1 and #2 above probed by hand (node one-liners) — both block.

---

## Residual Risk

Low. The two-direction misroute is backstopped (requireWritingFamilies + reverse
assertion), backward compat is byte-identical by independent re-run, scope is
clean, and the real publish gate passes symmetrically on the national paper. The
only un-closeable residual (doubly-broken new-standard, Self-Review Blind Spot #1)
is documented, implausible, and out of scope. Owner QA still owns the A4 score
total (SW-C) before publish — correctly gated by plan §流程 5-6.
