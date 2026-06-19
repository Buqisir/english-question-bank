# PA — import-national-2020-2024 · 全国甲/乙/丙卷导入（只导阅读+语言运用 4 题型）

Reviewer: PA (小川 hat, fresh cold session, read the actual contract code; did not write any of it)
Date: 2026-06-19
Scope under review: adding a 3rd FORMAT_PROFILE (`nationalLegacy`) + relaxing the
six-family completeness gate for it + dynamic 语法 题号接力 + validator mirror.

Level: **L4** — touches the publish data-contract layer (FORMAT_PROFILE +
publish gates + split 契约) that feeds SQLite import and the public A4 paper.

---

## Verdict

**APPROVE WITH MUST FIX**

The direction is right and the cut is correctly sized. The core design —
distinguishing the two cloze-20 formats by reading-passage count, and gating the
writing-family requirement behind a per-profile flag — is **structurally sound**,
not a hack. I verified it against the real parse pipeline: Format B already
assigns reading letters a/b/c/d by detecting big-questions (`lib.mjs:772,778`),
so "4 passages → 全国 / 3 passages → 浙江" is a property that genuinely falls out
of parsing, not an injected guess. The provenance-key prohibition is respected.

But there are **3 Must Fix** items the plan does not currently nail down, all in
the symmetry/guard-strength axis the PO explicitly flagged. Each is a real
silent-misroute or weakened-guard risk, not invented.

---

## Product Principle

The publish gate is a **parse-correctness guard**, not bureaucracy (ADR-0007
decision 2). Its job: refuse to publish a paper that was parsed wrong. The cut
adds a 3rd format and removes one guard (writing-family completeness) for that
format. The bar: every relaxation must be **replaced by an equally tight
structural guard**, and packageBuilder + validator must stay on the **same
signal** so neither side passes what the other blocks. A half-parsed paper
reaching the public A4 surface is the failure we are paid to prevent.

---

## Exact Architecture Model (verified against code)

### The two cloze-20 formats and the discriminator

| | 阅读 | 七选五 | 完形 | 语法 | profile |
|---|---|---|---|---|---|
| 新课标 | A–D (15q) | 36–40 | **15** 41–55 | 56–65 | newStandard |
| 浙江老卷 | A–C (10q) | 31–35 | **20** 36–55 | 56–65 | zjLegacy |
| 全国老卷 | **A–D** (15q) | 36–40 | **20** 41–60 | **61–70** | nationalLegacy (new) |

cloze count alone (`resolveFormatProfile`, `packageBuilder.mjs:41`) maps 15→新课标,
20→浙江. 全国 is also cloze=20, so it collides with zjLegacy. The **only** clean
structural separator between the two cloze-20 formats is the reading-passage
count (4 vs 3). Continuation-presence is NOT a usable separator here — see MF-2.

### Why reading-passage count is the right key (and the failure mode it must guard)

Verified the signal is structural and builder-visible: `parseResult.readingGroups`
is in scope at `packageBuilder.mjs:231`, before the `resolveFormatProfile` call at
:230, so threading it into the resolver is feasible without provenance. Good.

But the resolver currently keys on **one** value (cloze count) and throws on
anything unexpected. Adding a 2nd dimension widens the truth table from 2 rows to
a grid, and the plan only specifies 2 of the new cells. The unspecified cells are
where a misroute hides (MF-1).

### Gate symmetry (the load-bearing risk)

packageBuilder `resolveFormatProfile` (:41) and validator (:317) are **two
independent implementations of the same format detection**, in different modules,
that must agree. Today they already agree on the cloze-count signal. The plan
adds the reading-passage dimension to **both**, but they read it from different
shapes: packageBuilder from `parseResult.readingGroups`; validator from
`getReadingChoiceGroups(asset)` → letters parsed via `reading-([abcd])$` regex
(`validator.mjs:112`). If the two count passages differently (e.g. one counts a
group whose letter regex fails to match), they desync. MF-3.

---

## Must Fix Before DEV

### MF-1 — `resolveFormatProfile` must define the FULL cloze20 × reading-count truth table, and throw (not silently route) on unexpected cells
**Risk (silent misroute, both directions):**
- A **新课标** paper whose cloze is mis-parsed as 20 (e.g. a stray
  question, OCR doubling) has **4** reading passages. Under the plan's rule
  "cloze20 + 4 passages → nationalLegacy", that half-broken 新课标 paper is
  routed to nationalLegacy, which has `requireWritingFamilies:false` — so its
  **missing/garbled writing groups are no longer caught**, and it publishes
  half-parsed. This is exactly the "accidentally lets a HALF-PARSED 新课标 paper
  publish" hole the PO asked about. The current code trusts cloze-count alone and
  would throw or mis-head; the new code must not turn a parse error into a silent
  pass.
- A **全国** paper that loses passage D in parsing (cloze20 + 3 passages) routes
  to **zjLegacy**, gets A–C expected, D-loss goes unreported, and it publishes
  with wrong 七选五/完形 scores (zj uses seven=2, cloze=1.5; 全国 differs) and a
  3-passage paper that should have 4.
**Required disposition:** plan.md must record the resolver's full decision table
and the throw policy:
  - cloze=15 → newStandard (unchanged)
  - cloze=20 ∧ 4 passages → nationalLegacy
  - cloze=20 ∧ 3 passages → zjLegacy
  - cloze=20 ∧ (passages ∉ {3,4}) → **throw `unknown_paper_format`**, no fallback
  - cloze ∉ {15,20} → throw (unchanged)
  And it must lock that the cloze-count check stays **primary**: reading count is
  only consulted *inside* the cloze=20 branch, never overrides a cloze=15 paper.
  (cloze=15 always → newStandard regardless of passage count, so a 新课标 paper
  is never reachable by the nationalLegacy branch unless its cloze is *also*
  mis-parsed to 20 — which the throw-on-unknown and the 4-family cloze=15/15-blank
  cross-check below must surface.)

### MF-2 — Reject continuation-presence as the discriminator; lock reading-count as the sole cloze20 splitter, with a stated reason
**Risk:** The plan's 待审点 floats "无 continuation group" as an alternative or
combined signal. This is a **trap**: nationalLegacy sets
`requireWritingFamilies:false` precisely because 全国 writing is *not imported*, so
`continuationGroup` is null **by design** for 全国. But it is *also* null for any
**half-parsed 新课标** paper whose 续写 failed to parse. So "no continuation" cannot
distinguish "全国 (legitimately no writing)" from "新课标 with a broken 续写". Using
continuation-presence as a format key would route a broken 新课标 to nationalLegacy
and silence its own writing guard — the same hole as MF-1, via a worse signal.
**Required disposition:** plan.md must state: discriminator for the cloze20 split
is **reading-passage count only**; continuation/application presence is explicitly
**Forbidden as a format key** (it is an *output* of the format decision, not an
input). Record the reason (null-for-全国 and null-for-broken-新课标 are
indistinguishable).

### MF-3 — packageBuilder and validator must derive the reading-passage count from the SAME structural definition; verify they agree on the same paper
**Risk:** Two independent counts (`parseResult.readingGroups.length` vs
validator's `getReadingChoiceGroups(asset)` filtered by `groupType==='reading' ∧
/reading-[abcd]$/`) can diverge if one side counts a group the other's
letter-regex drops, or counts a non-A–D reading group. If validator sees 3 where
packageBuilder sees 4 (or vice versa), one side routes nationalLegacy and the
other zjLegacy → one passes what the other blocks, and the asymmetry is invisible
until a paper wedges mid-publish. The existing comment at `validator.mjs:312-314`
says the two must be "同一信号" — today that holds for cloze-count; the cut must
preserve it for the new dimension.
**Required disposition:** plan.md must record:
  - validator's cloze20 branch keys on **actual A–D letter count** parsed the same
    way packageBuilder does (count distinct reading letters, not raw group count),
    and **strengthens** not weakens: cloze20 ∧ 4 letters → require A–D (报 missing
    D); cloze20 ∧ 3 letters → require A–C. New-standard (cloze15) still hard-requires
    A–D.
  - A verify assertion that runs **both** sides on the same 2022-甲 asset and
    confirms identical profile resolution (both → nationalLegacy / A–D).

---

## Must Fix -> Plan Disposition Checklist

- [ ] **MF-1** → plan.md §2: locked decision recording the full cloze20×reading
      truth table + "throw on cloze20 ∧ passages∉{3,4}, no silent fallback" +
      "cloze-count primary, reading-count only inside cloze20 branch". Verify entry
      for the throw on a synthetic cloze20/2-passage input.
- [ ] **MF-2** → plan.md §2 + Forbidden: "discriminator = reading-passage count
      only; continuation/application presence Forbidden as format key" with the
      null-ambiguity reason recorded.
- [ ] **MF-3** → plan.md §3 + Verification: "validator counts reading by distinct
      A–D letters, mirrors packageBuilder; cloze20∧4→require A–D (报缺 D)" + verify
      "run both gates on 2022-甲, assert identical profile + A–D required".

---

## Should Watch

- **SW-1 — `buildGrammar` has TWO hardcoded offsets, not one.** Plan §1 names "题号
  写死 [56..65]" and "blank 偏移 +55". Both exist and **both** must move to
  `stdStart`: the question-number literal array `lib.mjs:573` (`[56,57,…,65]`) AND
  the blank-prompt offset `lib.mjs:561` (`Number(n) + 55`). The signature in the
  plan (`buildGrammar({…, stdStart })`, offset `stdStart-1`) is correct, but DEV
  must change both sites or 全国 grammar prompts (61–70) will mis-number against
  their blanks. Non-blocking (DEV detail), but the byte-diff regression on 新课标/
  浙江 (stdStart still 56) is the guard that catches a miss — keep it.

- **SW-2 — Writing-skip throw relaxation must stay format-gated, not global.**
  `findFormatBSections` throws if 写作 第一节/第二节 missing (`lib.mjs:252-253`).
  The plan relaxes this to "第一节 命中 '短文改错' → 全国 → appStart=contStart=-1".
  Watch that the relaxation is **keyed on the 短文改错 heading match**, not on a
  bare "没找到第二节 → swallow". A 新课标/浙江 paper with a genuinely broken 续写
  section must still throw at split — do not let the writing-skip path become a
  catch-all that hides 续写 parse failures for the writing-importing formats. The
  byte-diff regression (paper-2024-i / 2025-ii / zj papers) covers this if those
  four still parse identically. Non-blocking; verify covers it.

- **SW-3 — `requireWritingFamilies:false` is an acceptable guard swap, given MF-1.**
  ADR-0007 decision 2 ("永远导一整张完整卷") is a parse-correctness guard. For 全国,
  "4 families complete + writing explicitly not imported (PO-confirmed dying type)"
  is an **equivalent** guard *only if* the 4-family hard gates (reading A–D, 七选五,
  完形, 语法) stay硬拦 (they do — `packageBuilder.mjs:240-248` unchanged) AND MF-1
  prevents a broken 新课标 from sneaking into this profile. With both, relaxing the
  writing requirement does not weaken parse-correctness for 全国; it correctly
  encodes "this format has no writing to import". Record in plan.md that this is a
  **scoped supersession of ADR-0007 decision 2 for nationalLegacy only** (write a
  one-line ADR addendum or note), so a future reader doesn't think the whole-paper
  guarantee was silently dropped. Non-blocking but should be written down.

- **SW-4 — nationalLegacy scores must be set explicitly (per MF-1 of the zj cut).**
  Plan §2 lists `sevenScore:2, clozeScore:1.5`. Confirm 全国 真实分值 against a
  source (七选五 2分? 完形 全国 is typically 1.5分×20=30). If 全国 scores differ
  from 浙江, the profile must carry the 全国 values, and the A4 total must compute
  correctly. The zj cut's MF-1 lesson applies: score is rendered + summed, not
  cosmetic. Verify the published 2022-甲 total against the official paper. Owner QA
  catches this, but DEV should set scores from the source, not copy zj.

---

## Allowed Files

- `scripts/import-pipeline/lib.mjs` — buildGrammar stdStart接力 + writing-skip
  format-gated relaxation (SW-1, SW-2)
- `server/paper-import-ai/packageBuilder.mjs` — add nationalLegacy profile +
  resolveFormatProfile reading-count dimension + writing-family flag gate
- `server/paper-import/validator.mjs` — mirror the reading-count signal (MF-3)
- `scripts/import-pipeline/gen-configs.mjs` + `02-publish.mjs` — pipeline glue
  (paperId mapping, null writing groups, provenance injection)
- one verify/byte-diff harness for the regression + symmetry assertions

## Forbidden Files

- Any schema / domain / Adapter / PaperSurface / print / App.tsx render code — no
  writing题型, no UI change
- Do NOT publish/import any 全国 paper in the DEV stage — owner-gated, after
  byte-diff green + 2022-甲 QA (plan §流程 5–6 already says this; keep it)
- Do NOT reopen the zj/新课标 profile literals (byte-diff must be green)
- provenance.region / paperId prefix as format key — Forbidden (existing comment
  `packageBuilder.mjs:38-40`); the discriminator is structural reading-count

## Static Verify Requirements

1. **Back-compat byte-diff:** run `01-split` before/after on paper-2024-i (FmtA),
   paper-2025-ii (FmtB 新课标), paper-zj-2026-jan (浙江 新), paper-zj-2020-jan
   (浙江老卷 cloze20) → `groups.json` byte-identical. Catches SW-1/SW-2 regressions.
2. **2022-甲 split correctness:** SPLIT REPORT 逐题核对 vs 答案版; 题号 21–35 /
   36–40 / 41–60 / 61–70; application=continuation=null (0 paras).
3. **Resolver throw guard (MF-1):** synthetic cloze20 ∧ 2-passage input →
   `resolveFormatProfile` throws `unknown_paper_format`, no silent route.
4. **Gate symmetry (MF-3):** run packageBuilder profile resolution AND validator
   reading gate on the 2022-甲 asset → both resolve nationalLegacy / require A–D
   identically.
5. **Regression on existing formats (MF-1 negative):** `verify-publish-gate.mjs`
   on 1 新课标 + 1 浙江老卷 → still `ok:true` (六题型门松绑没误放它们).
6. **2022-甲 publish gate:** `verify-publish-gate.mjs paper-2022-jia` → `ok:true`,
   blocking empty (after analyses ready).

## Browser QA Matrix

Not required for the DEV diff (no UI change). Required before owner-gated publish:
- Print/preview published 2022-甲: reading shows A–D 4 passages 21–35; 完形 41–60
  (20q); 语法 61–70 (10q); no writing section; paper total matches official 全国卷
  (verifies SW-4 scores). Confirm a previously-published 新课标 paper renders
  unchanged (covered by byte-diff, not a re-publish).

## DEV Readiness

Ready **after** plan.md records MF-1..MF-3 (the truth table, the
continuation-key prohibition, and the validator symmetry + verify). The teacher
action (publish a factually-correct 全国老卷 A4 paper), before/after, cut boundary
(4 files, 4 题型, no writing), future boundary (slice 2 = 9 papers via verified
pipeline), allowed/forbidden files, verify scripts, and QA matrix are all
specified. The split side is gnarly (SW-1/SW-2) but bounded by the byte-diff gate.
Do not start DEV until the MF items are in plan.md — they are the entire reason
this is an independent PA pass.

## Open PO Decisions (0)

None blocking. The PO already decided "import 4 families, drop writing"; the
dying-题型 rationale is recorded. SW-4 (exact 全国 scores) is a sourcing task for
DEV + owner QA, not a product decision.
