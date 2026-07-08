# CR — 刀⑤ 渲染保真 (render-fidelity)

Reviewer: CR (fresh Opus, cold read). Branch `claude/render-fidelity`
(74475b9..032778c) vs `main`. Authority: `exam-paper-format-standards.md` v2.
Contract: `plan.md` + PA dispositions F1/F2/F3.

## Verdict

**APPROVE.**

No Must Fix. The four-face归标 is implemented correctly, proven against the REAL
`paper-2026-i` payload (not synthetic fixtures), stays inside the allowed file
set, and the DOCX package is OOXML-valid through the production LibreOffice
conversion path. F2 (behavioral blank counts) and F3 (DOCX scope pins) landed as
the PA required; F1 (Chunk D) is correctly deferred — no `segmentPaperText.mjs`
change, no relaxed-regex fix, no fake 8→10 metric shipped. Findings below are all
Should Watch / Note and do not block merge.

## Changed Scope (confirmed from diff, not report)

All 28 files within PA's allowed set. Forbidden surfaces **untouched**: no
`scripts/import-pipeline/**`, no `papers/*/groups.json`, no
`exam-paper-format-standards.md` / `nck1-paper-standard.md`, no `api.mjs`, no
`segmentPaperText.mjs`. Chunk D correctly absent.

## Verification Evidence (re-run, not copied)

- `verify-print-renderer.mjs` — 47/0. Test 8 renders the real 2026-i asset through
  the real `buildPrintHtml`; independent `paperBlankPattern` count asserts
  seven=5 / cloze=15 / grammar=10, styled-span count matches. Real-payload PDF
  byte smoke passes (%PDF).
- `verify-h5g-docx-renderer.mjs` — 85/0 (in verify-ci). `assertRealAssetBlankCounts`
  feeds the same real payload through the real `buildDocumentXml` and counts
  `<w:u w:val="single"/>` runs exactly (5/15/10) on BOTH exam + handout builders.
- `verify-paper-surface-tokens.mjs` 150/0, `verify-paper-surface-module-v1.mjs`
  113/0, `verify-i10-blank-rendering.mjs` 41/0, `harness` PASSED,
  `verify-i6-writing-render` 19/0, `verify-i15` PASS, `verify-c8` 30/0,
  `verify-paper-surface-mjs-declaration-parity` 17/0 (blankPattern .d.ts/.d.mts
  covered, SW-3 lesson honored).
- **Real DOCX built + LibreOffice→PDF**: package has `word/footer1.xml` +
  `[Content_Types]` override + `word/_rels/document.xml.rels` (rIdFooter1→footer1)
  + `w:footerReference` in the single sectPr; 30 underlined blank runs (15+10+5);
  writing-box `trHeight=3231` twips = 57mm (读后续写). `soffice --convert-to pdf`
  succeeds, output starts `%PDF`. OOXML is valid on the production conversion path.

### Focus-item adjudication

1. **Blank-pattern lift — screen behavior unchanged.** Regex literal is
   byte-identical (`blankPattern.mjs:31` == old `PaperSurface.tsx:63`). The `/g`
   singleton-leak trap is handled: every consumer (screen `renderTextWithPaperBlanks`,
   `renderPassageLineWithBlanks`, `docxPassageLineRuns`, the verify counters)
   sets `lastIndex = 0` before `.test()` and again before the `.exec()` loop, and
   the loop drains to `null` (auto-resets). No cross-module contamination: browser
   uses it only in PaperSurface, server only in print/docx — different processes.
2. **Standards fidelity** — margins 21/24mm (print `@page`; DOCX 1191/1361 twips),
   footer 17.5mm (992 twips / 6.5mm padding), line-height 1.714, body 14px/10.5pt/
   size-21, blank widths 3.3em vs 4.6em, writing box 144×65 / 145×57mm, rFonts
   Times/宋体 with Hei on 卷名+部标题: all match §1-§3/§6/§8.
3. **DOCX OOXML** — footer part fully wired, both sectPr builders route through the
   shared `docxSectPr()`, `fldSimple` PAGE/NUMPAGES valid, twips arithmetic correct.
4. **Verify integrity** — F2 tests are genuinely behavioral on the real payload;
   no fake-green. Asset file is git-tracked (won't silently SKIP).
5. **Freeze retirement (b6643e5)** — removed asserts are `git diff --name-only`
   PR-diff-freeze guards ("diff contains only … no runtime expansion") that any
   authorized cut breaks; the 16px/56px pins were **upgraded** to token-var checks
   (still fail if the CSS stops consuming the token), the server/tokens freezes
   repointed to the live `verify-paper-surface-tokens.mjs` contract, prototype
   must-exist asserts retired because Chunk E deleted the prototype. Scripts still
   run 165/83 live asserts. No live behavioral guard weakened.
6. Pre-existing `verify-auth-gate` / `verify-user-scope` failures reproduce as
   `unable to open database file` — a local sqlite env issue on a surface this cut
   does not touch. Confirmed unrelated.

## Findings

### Should Watch

- **SW-A (verify gate asymmetry).** The DOCX real-payload F2 test is in
  `verify-ci.mjs` (via `verify-h5g-docx-renderer`), but the PRINT real-payload F2
  test + writing-box test live in `verify-print-renderer.mjs`, which is `no` in the
  CI list (README-documented, pre-existing posture). A regression to the
  print-specific span rendering (`renderPassageLineWithBlanks`, `.print-blank`
  CSS) would not be caught by CI — only by a manual run / the plan's acceptance
  gate. The shared `paperBlankPattern` itself is CI-guarded (i10 + parity + the
  DOCX real-payload test), so the exposure is narrow. Recommend registering
  `verify-print-renderer.mjs` in `verify-ci.mjs`. Non-blocking.
- **SW-B (heading sizes not normalized to §2/§4「不放大」).** Body runs got
  size-21, but 部标题 (`section_header`) stays size 24/28 (12/14pt), the print
  `.section-header` stays 12pt / `h1` 18pt, and 篇章标题 (`passage.title`) stays
  size 22 (11pt). Standard §4 says hierarchy is distinguished by weight+indent,
  「一律不放大字号」(only 卷名 20pt is enlarged). These deviations are
  pre-existing and outside the plan's stated Chunk C scope (body 10.5pt + margins +
  fonts + footer + blanks + box), so not a regression — but §2/§4 heading-size
  fidelity is not yet met. Also all `section_header` blocks get Hei regardless of
  部/节 distinction (§2: 节标题 = 书宋), the flagged Hei judgment call. Worth a
  follow-up watch entry.
- **SW-C (empty writing box, §8 段首语).** §8 requires 读后续写's two 段首语 printed
  inside the box; the box is emitted empty because that data is not plumbed into
  the render `detail`. Acknowledged/deferred in the diff comments. Acceptable as a
  follow-up, but the box is not yet §8-complete for continuation writing.

### Note

- Global `docxRFonts` now emits rFonts on EVERY run including teacher-analysis
  chrome (not just body). F3 forbade only SIZE flattening of analysis (respected —
  analysis paragraphs carry no `size:21`); applying body fonts to analysis text is
  harmless and outside standard scope. Note only.
- DOCX writing-box / blank border is `w:sz="4"` = 0.5pt; §6/§8 say 0.48pt. OOXML
  border width granularity is eighths-of-a-point (0.125pt), so 0.48pt is not
  exactly representable and 0.5pt is the nearest legal value. Print side uses
  0.48pt exactly. Acceptable.
- `/续写/` title heuristic picks 145×57 vs 144×65mm box; both renderers share the
  same heuristic and import publishes the title verbatim ("读后续写"/"应用文写作").
  Reasonable; a mis-titled group would get the wrong box size, low likelihood.
- rPr child-element order (`rFonts, b, i, u, sz, color`) is not the canonical
  CT_RPr sequence (schema wants color→sz→u). `main` already emitted `sz` before
  `color` out-of-order and shipped; LibreOffice tolerates it (verified: real doc
  converts). Strict Word/Open-XML-SDK validation could flag it. Consistent with
  the file's existing lax posture; low risk.

## Self-Review Blind Spots

- I judged OOXML validity via LibreOffice conversion, not a strict schema
  validator (Open XML SDK). rPr ordering and the minimal single-relationship
  `document.xml.rels` open+convert cleanly in LO, but I did not confirm Microsoft
  Word opens without a "repair" prompt. If a future cut targets Word-strict
  validity, inspect rPr ordering + whether a styles.xml part is expected.
- I did not visually confirm the PDF/DOCX render (owner Browser QA matrix, SW-1)
  — I verified structure/counts/values, not pixels. The 14px screen regression and
  each analysis surface still need owner screenshot sign-off per plan.
- The `paperAssetParagraphText` mirror inside the verify scripts is a hand-copy of
  the `api.mjs` transform, not an import of the real function. It matched on 2026-i,
  but if `api.mjs`'s real transform diverges later, the verify would silently test
  a stale shape. Low risk today.

## Failure / Attack Angle

The most plausible fake-green would have been an F2 test fed synthetic strings
while real exports ship unstyled `__56__` (the I10 precedent). Attacked directly:
the asset is git-tracked (no silent SKIP), the counts are cross-checked by an
independent `paperBlankPattern` pass over the same real text, and I rebuilt a real
DOCX and counted 30 underlined runs in the actual `word/document.xml`. The second
angle — a stale-fallback second sectPr builder left un-migrated — is closed: both
builders route through the single `docxSectPr()` and the shared footer, verified in
the emitted package (one `footerReference`, both exam+handout counted in verify).
The residual live risk is SW-A: a print-side blank regression escaping CI because
`verify-print-renderer` is not gated.

## Residual Risk

Low. Core export paths proven on real data + real conversion. Open items are
fidelity follow-ups (heading sizes, 段首语, print test gating), not correctness or
data-contract defects. Merge is safe; log SW-A/SW-B/SW-C to the watch ledger.

## Recommendation

**APPROVE.** No Must Fix. Address SW-A (gate the print test) opportunistically;
carry SW-B/SW-C as follow-up watch entries. Owner Browser QA screenshots still
required before the cut is closed (plan §验收).
