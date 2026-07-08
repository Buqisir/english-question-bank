# PA Review — 刀⑤ 渲染保真 (render-fidelity)

Reviewer: PA (fresh Opus, un-anchored). Branch `claude/render-fidelity`.
Plan under review: `docs/cuts/render-fidelity/plan.md`.
Authority read: `exam-paper-format-standards.md` v2, `nck1-paper-standard.md` §8,
`paper-surface-spike-follow-up.md` (Issue #30 Gate 2), `paper-surface-watch-ledger.md`
L158-192, `docs/cuts/I10-blank-rendering/cut-note.md`. Code verified against the
actual files, not the plan's claims.

## Verdict

**APPROVE WITH MUST FIX.**

Direction is right: A/B/C/E (token single-source, PDF/DOCX typography归标, DOCX
rFonts, dead-code removal) are correctly sliced, correctly forbidden-scoped, and the
numeric conversions check out. Two Must Fix items block DEV: Chunk D's bug premise is
not grounded in any real on-disk asset (F1), and the cross-surface blank-marker data
contract for B/C is unpinned (F2). Both are verification-integrity holes that would
ship fake-green or chase a non-reproducing bug. Neither is a re-slice.

## Product Principle

The four render faces must converge on one typography authority (standard v2). The
paper stays primary; this cut is metrics + missing blank/writing-box styling, not new
teaching features. Correct. No AI-dashboard creep.

## Exact Architecture Model (verified)

- `<PaperSurface>` has exactly ONE consumer: `PaperIntelligencePaperSurfaceHarness.tsx`
  (L1284). It drives cloze / grammar / seven-choice / reading-analysis / writing
  surfaces via adapters. So Chunk A's `PaperSurface.css` 16→14px + margin change hits
  ALL of those teaching surfaces at once, not one "paper preview". (See SW-1.)
- Screen path: adapters → `segmentPaperText.mjs` (shared) → `PaperTextMap` (segmented
  sentences) → `renderTextWithPaperBlanks` matches `paperBlankPattern`
  (`PaperSurface.tsx:63`) per-sentence.
- Server path is DIFFERENT: `print-renderer.mjs` and `docxRenderer.mjs` consume
  `detail.passage.materialText`, which = `paperAssetParagraphText(group)`
  (`server/api.mjs:323,1613`) = the same `group.passage.paragraphs[].text` joined by
  `\n\n`. Server renders WHOLE lines (`passage.split(/\n/)` → `<p>`), NO sentence
  segmentation. Therefore the I10 sentence-initial failure mode structurally cannot
  occur server-side; B/C are unaffected by D.
- Deploy: server runs from a full repo checkout
  (`WorkingDirectory=/opt/eqb/english-question-bank`, `node server/api.mjs`), so
  `shared/` is present in prod. A server-side `import '../shared/papersurface/…'` is
  low-risk (see SW-2), NOT the coupling problem it could have been.

## Must Fix Before DEV

### F1 (Blocker) — Chunk D's bug premise and acceptance metric are not real

The stored grammar-fill blanks in `paper-2026-i` are `__NN__ (hint)`
(underscore-wrapped), e.g. `__56__ (hold)`, `__57__ (frequent)`, and the
sentence-initial `daji days. __62__ (draw)` (`groups.json` /grammar/paragraphs).
Grepped across ALL `scripts/import-pipeline/papers/*/groups.json`: every grammar
marker normalizes to `__NN__ ()` — **zero** assets store the 2-space `  NN  ` format.

`paperBlankPattern` requires a `_{2,}`-OR-`[space]{2,}` delimiter on BOTH sides.
`__62__` keeps both underscore delimiters through `segmentSentences`' `.trim()`
(`segmentPaperText.mjs:117`), so it styles even sentence-initially. The I10 bug ONLY
manifests on the 2-space form, whose LEADING delimiter is trimmed at a sentence
boundary. Per the I10 cut-note the 2-space case was a "QA-only synthetic variant,
reverted; on-disk grammar assets use non-canonical legacy shapes."

Consequence: the plan's D acceptance — "paper-2026-i 语法填空 10/10 styled (原 8/10)"
— is factually wrong. On real 2026-i data all grammar blanks already style (10/10);
"8/10" was a synthetic measurement. DEV cannot reproduce the bug on 2026-i, cannot hit
the stated regression delta, and would either declare D done without a real repro or
chase a form no importer emits. The watch-ledger's own follow-up trigger ("a REAL
imported 语法填空 paper shows enough sentence-initial blanks that it bothers a
teacher") is NOT currently met.

Required disposition: PM/PO must either (a) name a real, on-disk, or
pipeline-emitted asset that stores the 2-space `  NN  ` grammar form and reproduces
the sentence-initial failure — and rewrite D's acceptance against THAT asset with a
before/after count that is real; or (b) reclassify D as a defensive/hypothetical fix
whose only test is a synthetic 2-space fixture, explicitly stating no real asset
triggers it; or (c) DEFER D out of this cut (its follow-up trigger is unmet) and keep
the watch-ledger entry open. If (b), the "match-before-segmentation / keep leading
delimiter" work still lands in `segmentPaperText.mjs` (shared, used by cloze / seven /
reading too) — D must state the fix touches the SHARED segmenter and prove no
segmentation change for cloze/seven/reading, not "`PaperSurface.tsx:63`". As written
the plan points DEV at the wrong file (the pattern is not the fix site; the segmenter
is).

### F2 (Must Fix) — B/C blank-marker data contract is unpinned; "同源 pattern" is not enough

The plan's B/C safety rests on "same pattern as screen". Pattern-sameness only helps
if the server's INPUT text encodes blanks the way the pattern expects. There are THREE
grammar-fill encodings live in-repo: `__NN__` (stored in 2026-i, matched by
`paperBlankPattern`), `  NN  ` (2-space, watch-ledger premise, matched by
`paperBlankPattern`), and `NN._____` (dot+underscore, matched ONLY by I15
`grammarFillBlankPattern` in `grammarFillBlank.ts`). Real 2026-i uses `__NN__` — which
`grammarFillBlankPattern` does NOT match. So:

- Server B/C need `paperBlankPattern` (it covers cloze `__41__`, seven `_____36_____`,
  and grammar `__56__` — all three families visible in 2026-i). Moving/reusing
  `grammarFillBlankPattern` gives the server nothing.
- The B/C verify must assert styled output on the REAL export payload
  (`paperAssetParagraphText(group)` for 2026-i), not on synthetic strings. A verifier
  fed synthetic text passes while real PDFs/DOCX ship unstyled `__56__` — a fake-green
  exactly of the class CR caught in I10 (MF-CR-1).

Required disposition: plan.md must (1) record the concrete marker encoding present in
`detail.passage.materialText` per family, cite it from 2026-i, (2) state `paperBlankPattern`
is the server pattern, (3) add a B and a C verify assertion that renders the real
2026-i cloze + grammar + seven passage and counts styled blanks (behavioral, real
payload), and (4) note HTML/XML escaping order (escape non-blank slices, inject the
blank span/run separately) so the underscores are not mangled.

### F3 (Must Fix) — DOCX归标 scope: which runs, which paths

`docxRenderer.mjs` has TWO builders with their own `<w:sectPr>` and passage loops
(the blocks builder around L440-575 sectPr L571; the second/legacy builder around
L595-760 sectPr L755). "所有正文 run 显式 size:21" and the new margins/footer/rFonts
must be applied to BOTH, or one path regresses. Also "所有正文 run size 21" must NOT
flatten teacher-version ANALYSIS chrome (同义替换 / 选项分析 tables, sizes 18-22 at
L289-379) — those are teacher annotations, not the student A4 paper body, and are out
of the exam-format standard's scope (标准 §0 保真分级 governs the 试卷面, not analysis
overlays). Blanket "all runs → 21" would corrupt them.

Required disposition: plan.md must scope "正文 run" to passage / stem / options body
runs only, name BOTH builder paths + both sectPr sites, and explicitly exclude the
teacher-analysis runs from the size-21 sweep.

## Must Fix -> Plan Disposition Checklist

- F1 → Locked PO decision on Chunk D basis: name a real 2-space asset + rewrite D
  acceptance, OR mark D synthetic-only, OR defer D. If kept: relocate D's Must Do to
  `segmentPaperText.mjs` (shared) with a Forbidden "no cloze/seven/reading
  segmentation change" + a Verify asserting those three surfaces' segmentation
  unchanged. Correct the "PaperSurface.tsx:63" bug-site claim.
- F2 → plan.md records the per-family marker encoding (cited from 2026-i), fixes
  server pattern = `paperBlankPattern`, adds B + C Verify entries that render the real
  2026-i payload and count styled blanks, and a Must Do note on escape/inject order.
- F3 → plan.md scopes "正文 run size 21" to body runs, names both docx builder paths +
  both sectPr sites, adds a Forbidden excluding teacher-analysis runs.

## Should Watch

- SW-1 — Chunk A 14px + 91px-margin change hits every harness-driven surface (cloze /
  grammar / seven / reading analysis / writing), not one preview, because there is a
  single `<PaperSurface>` consumer. Owner pre-approved 16→14 for 屏幕 PaperSurface
  (standard 执行与迁移), so not a blocker — but收官 screenshots for owner review must
  cover EACH analysis surface, not just a reading page. Record in Browser QA.
- SW-2 — Server import path portability: prod already bit an absolute-path bug
  (commit af9bda9). DEV must use a module-relative specifier
  (`../../shared/papersurface/…` resolved by Node against the file URL), not a
  cwd-relative or absolute path. Deploy ships `shared/` (full-repo checkout) so no
  packaging change is needed — confirm no bundler strips it.
- SW-3 — `paperBlankPattern` currently lives as a literal in `PaperSurface.tsx:63` and
  is reconstructed-from-source by the I10 + module-v1 verifiers. Moving it to
  `shared/papersurface/*.mjs` for server reuse must keep `.d.ts`/`.d.mts` parity (I10
  MF-1 lesson: a missed `.d.mts` broke the CI parity verifier) and update those two
  verifiers to import the real moved literal, not a stale copy.
- SW-4 — DOCX bytes are a declared byte-for-byte contract (`docxRenderer.mjs` L5-6).
  margins/sizes/rFonts/footer intentionally break the H5-G "byte-identical to api.mjs"
  invariant; golden byte assertions in `verify-h5g-docx-renderer` will need updating —
  expected, but call it out so CR doesn't read it as a regression.
- SW-5 — Line-height unify to 1.714 drops the current passage 1.85 / question 1.7
  split. Standard §3 PERMITS option columns at 20pt (≈1.905) but does not mandate it;
  unifying to 18pt is within-standard. Note only.
- SW-6 — Dependency graph: C also depends on B (the shared pattern move lands in B),
  not just on A. Sequence C after B.
- SW-7 — Scope-expectation: nck1 §8 phrases "渲染保真刀落地后自动解禁" the figure/table
  draft-basket lock. This cut does NOT implement figure/table rendering (correctly
  Forbidden — that's 图表契约刀). Plan should state it does not unlock that gate, so no
  one reads §8 as satisfied.

## Allowed Files (as implied by plan; PA-confirmed correct set)

`shared/papersurface/tokens.mjs` (+ `.d.ts`/`.d.mts`), a new/relocated shared
`paperBlankPattern` module (+ parity types), `app/src/shared-ui/papersurface/PaperSurface.css`,
`app/src/shared-ui/papersurface/PaperSurface.tsx` (import site only),
`app/src/features/paper-intelligence/writingPaperPage.css`,
`server/print-renderer.mjs`, `server/exports/docxRenderer.mjs`,
`shared/papersurface/segmentPaperText.mjs` (Chunk D only, IF kept),
the named verify scripts, `scripts/verify-ci.mjs`, `scripts/README.md`, and (Chunk E)
deletion of `app/src/features/paper-intelligence/paperSurfacePrototype/` +
`scripts/verify-paper-surface-prototype.mjs`.

## Forbidden Files (PA-confirmed)

Import pipeline (`scripts/import-pipeline/**`), any stored asset
(`papers/*/groups.json` etc.), `docs/product/exam-paper-format-standards.md`,
`docs/product/nck1-paper-standard.md`, the website detail-page render path, and the
relaxed-regex I10 fix approach (watch-ledger red line). All correctly listed in the
plan. Add: teacher-analysis run sizes in `docxRenderer.mjs` (per F3) are effectively
forbidden from the size-21 sweep.

## Static Verify Requirements

Existing scripts all present (checked): `verify-paper-surface-tokens`,
`verify-paper-surface-module-v1`, `verify-i6-writing-render`, `verify-print-renderer`,
`verify-print-pdf-export-flow`, `verify-h5g-docx-renderer`, `verify-exam-export`,
`verify-i10-blank-rendering`, `verify-paper-surface-prototype`, `verify-ci`. New/updated
assertions must be BEHAVIORAL on real payloads (repo convention; I10 fake-green
precedent), specifically the F2 real-2026-i blank-count asserts for B and C.

## Browser QA Matrix

- Screen: each harness-driven surface (cloze, grammar-fill, seven-choice, reading
  analysis, writing) at 14px + new margins — screenshot each for owner (SW-1).
- PDF: one paper containing cloze + grammar-fill + seven-choice + writing exported via
  the real flow; confirm styled underlines, centered numbers, writing boxes, 24/21mm
  margins, footer page number.
- DOCX: same paper → LibreOffice → PDF; confirm rFonts (Times/宋体), 10.5pt body,
  blanks, writing box, footer, both builder paths.
- Chunk D: only meaningful IF F1 resolves to a real 2-space asset; else a synthetic
  fixture screenshot.

## DEV Readiness

NOT ready until F1-F3 are dispositioned in plan.md. A/B(core)/C(core)/E are ready
in shape. F1 may remove or re-base Chunk D entirely; F2 changes B/C verify strategy;
F3 scopes the DOCX sweep. Open PO decisions: 1 (F1's D basis: real-asset / synthetic /
defer) — within the ≤3 limit.

## Open PO Decisions

1. Chunk D basis (F1): does any real/importer-emitted asset store the 2-space grammar
   blank form? If not, is D synthetic-only or deferred? (Blocks D only; A/B/C/E proceed.)
