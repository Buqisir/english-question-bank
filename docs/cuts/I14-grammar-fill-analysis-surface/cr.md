# CR-lite — I14 语法填空解析 render 面 + 入口 gate

Reviewer: 小川 (CR, fresh cold-read, no DEV context). Date: 2026-06-01.
Branch `i14-grammar-fill-analysis-surface`, base `main`, HEAD `b88cee9`.
Tier: CR-lite, with a hard L4-depth pass on the GATE-1 locate (load-bearing).
Independence note: DEV was completed by the PM session inline (subagent dropped
its socket), so this is the ONLY independent read of the code — reviewed cold,
not anchored to the implementer's narrative.

## Verdict

**APPROVE** — no Must Fix. The GATE-1 offset-mapping algorithm is correct under
hand-tracing and edge cases; MF-1 textMap/locate consistency is genuinely closed
(verified by mutation, not by the report's say-so); all enumerated harness touch
points (incl. every dep array) are mirrored from cloze; scope is clean (exactly
the allowed files, no forbidden touch); the verifier is registered in `verify-ci`
and is NOT theater — three independent mutations each made it FAIL.

## Changed Scope

Non-doc files (all in the plan's allowed set):
- `grammarFillFacetRegistry.ts` (new) — 16 facet framework bodies, non-finite 形变表.
- `grammarFillAnalysisSurfaceAdapter.ts` (new) — GATE-1 tolerant locate + model build.
- `GrammarFillAnalysisPanel.tsx` (new) — right-pad card.
- `PaperIntelligencePaperSurfaceHarness.tsx` (modified) — grammarFill fetch→fallback branch + touch points.
- `server/search/paperSurfaceAvailability.mjs` — one `analysisConfigs` entry (config only, no logic change).
- `scripts/verify-i14-grammar-fill-analysis-surface.mjs` (new) + `verify-ci.mjs` + `README.md`.

No forbidden scope touched: no `shared/papersurface/**`, no I13
contract/prompt/`analyzeGrammarFill`/`normalizePassageText`/`packageBuilder`
(incl. `normalizeGrammarFillText`), no `schemas/**`, no `findAllTextRanges`, no
cloze/reading/seven-choices adapter or panel, no generated `paper-assets/**`,
no `.claude/launch.json`. Confirmed from `git diff main...HEAD --name-only`, not
from the report.

## Findings

### Must Fix
None.

### Should Watch (non-blocking)

- **SW-A (PO QA): transcription fidelity of all 16 framework bodies.** The drift
  guard only proves key-set equality; verbatim correctness of the 考点框架 prose
  vs the KB is unmachine-checkable. Spot-checked the non-finite 形变表 (caption,
  columns `含义/主动/被动`, rows doing/being done · done · to do/to be done) and
  finite (一找/二判语态/三判时态) against `grammar-fill-facets-v1.md:100-161` —
  faithful, not a paraphrase. Full eyeball of all 16 remains PO QA. Does not
  block: an error here is a teaching-prose typo, not a correctness/contract defect.
- **SW-B (PO/UI polish): evidence `type` rendered as the raw enum string.**
  `GrammarFillAnalysisPanel.tsx:179` prints `row.type` verbatim (e.g. `time-marker`,
  `governing-word`) — no Chinese label map (unlike role/path which have
  `ROLE_LABELS`/`PATH_LABELS`). Plan §Step 2 only says "evidence `type` label",
  which the raw enum technically satisfies, so this is in-scope-as-written. Flag
  for 阿澈/PO: an English enum on a teacher 讲评 surface may read rough. Non-blocking.
- **SW-C (browser QA, already in matrix): the cross-column line must actually
  DRAW** on the GATE-1 adjacent-to-blank case, not merely compute a range. The
  verifier proves `range.sentenceId ∈ textMap` (necessary condition); the visual
  render is Step 6's job. Carried as a browser-QA gate, not a code defect.
- **SW-D: multi-occurrence over-match is expected, not a bug** (inherited I9 rule;
  grammar-fill evidence carries no paragraphId). PO QA should not read an extra
  highlight as a regression.

## Self-Review Blind Spots (for the later browser/PO QA)

- **I did not run a real published grammar-fill asset through both normalization
  passes on live bytes.** The GATE-1 whitespace-only-divergence premise (PA
  verified it analytically) is taken as given; my review proves the locate
  function is correct *given* whitespace-only divergence. If a real-corpus
  `signalText` diverges by something OTHER than whitespace (e.g. a punctuation
  rule fires unexpectedly inside a valid signalText), the tolerant match would
  still miss — that is exactly what Step 6 on a normalize-diverged paper exists
  to catch. Load-bearing browser QA remains.
- **I did not render the panel in a browser.** CSS classes (`pi-gf-*`) are new and
  I did not confirm they exist/inherit sensibly — the plan defers panel CSS to
  阿澈. The 形变表 `<table>` rendering and the framework `<ol>` ordering are
  unverified visually.
- **Student-version hiding (Super Teacher boundary)** is asserted by the
  availability gate's role handling, not exercised by the I14 verifier; confirm in
  browser QA that the `语法解析` entry is absent in the student version.
- **`signalSide: 'stem'` path is untested with a real stem string** — the adapter
  treats stem like passage (searches passage text), which yields zero ranges
  gracefully if the stem text isn't in the passage. No fixture exercises a
  *locatable* stem signal; low risk (stem is rare and the code path is identical
  to passage).

## Verification Evidence (re-run, not copied)

- `node scripts/verify-i14-grammar-fill-analysis-surface.mjs` → **67 passed, 0 failed.**
- `node scripts/verify-ci.mjs` → CI verify passed (i14 registered at `verify-ci.mjs:48`).
- `npm run build --prefix app` → built in 138ms, no errors (pre-existing 500 kB
  chunk-size warning only).
- Registry: 16 keys; drift guard asserts equality with the 16 server
  `grammar-fill-facets-v1.json` keys; non-finite has a `table`.

### Mutation test (did the verifier catch the break?) — YES, 3/3

| Mutation | Effect | Verifier result |
| --- | --- | --- |
| `buildNormalizedProjection` never collapses whitespace (`if (false)`) | tolerant match degrades to plain indexOf | **FAIL** (3 GATE-1 asserts) — caught |
| `storedEnd = indexMap[matchEnd] - 1` (off-by-one) | wrong stored slice | **FAIL** (2 GATE-1 byte-slice asserts) — caught |
| locate emits `sentence.id + "-DIVERGED"` (textMap/locate divergence) | MF-1 silent-fail mode | **FAIL** (MF-1 + multi-occurrence membership asserts) — caught |

The MF-1 assertion checks `range.sentenceId` membership in the ACTUAL built
`surfaceData.textMap` (not a recomputed set), and the GATE-1 asserts check that
`storedText.slice(start,end)` equals the real diverged bytes (`'had  visited'`,
`'the   old'`) — these exercise behavior, not string shape. Adapter restored to
HEAD after mutations; clean re-run = 67/0.

### GATE-1 hand-trace (offset mapping)

`indexMap[i]` = stored index of the char/whitespace-run-start at normalized pos
`i`; sentinel `indexMap[normalized.length] = text.length`. `end` is exclusive
(matches I9 `findAllTextRanges`).
- Needle is `collapseWhitespace(...).trim()` → never starts/ends on a space token,
  so `matchStart`/`matchEnd` always land on real-char boundaries.
- Match ending at a collapsed run: `storedEnd = indexMap[matchEnd]` = run START →
  trailing whitespace correctly EXCLUDED (verified `'the'` in `'the  cat'` → [0,3)).
- Match ending at last char: `matchEnd === normalized.length` →
  `storedEnd = text.length` via sentinel (verified `'the cat'` → full span incl.
  double space).
- `searchFrom = matchEnd` (needle length ≥ 1) → strictly advances, no infinite
  loop; overlapping matches skipped (same as I9).
- Needle longer than sentence → loop guard `searchFrom <= len - needleLen` (RHS
  negative) → skipped.
- textMap built per-paragraph with `${paragraphId}-s${i}`, byte-identical
  construction to `clozeAnalysisSurfaceAdapter.ts:205-226`; the locate searches
  and keys against THAT SAME map → MF-1 sentenceId consistency holds structurally.

## Failure / Attack Angle

The dangerous failure mode for this cut is the I11 silent-fail one layer up: a
located range pointing at a sentenceId the rendered textMap doesn't contain, so
the cross-column line never draws but the offset "matched." MF-1 closes the
*structural* version (same per-paragraph construction, verifier asserts
membership). The residual attack vector is **non-whitespace divergence in a real
corpus signalText** that the analytical whitespace-only premise missed — the
tolerant match would return zero ranges and the highlight would silently not
draw, indistinguishable from "no evidence." Only a real normalize-diverged paper
in browser QA closes this; it cannot be closed in code. A second, lower vector:
the panel renders `framework`/`reason`/`teachingNote`/`evidence type` as raw
strings — a transcription error or an English enum leaks straight onto the teacher
surface (SW-A/SW-B, PO-QA territory, not a merge blocker).

## Residual Risk

Low for merge. The runtime logic is correct and proven; the data contract is
consume-only; scope is tight. The two open risks (real-corpus GATE-1 divergence,
transcription fidelity) are both browser/PO-QA gates the plan already mandates
(Step 6 + SW-1), not code defects. No data/persistence/export path touched →
no Big CR escalation warranted.

## Recommendation

**APPROVE.** Mergeable as-is for the code gate. Browser QA (Step 6, esp. the
GATE-1 adjacent-to-blank line actually drawing + student-version hiding) and PO
transcription spot-check of all 16 frameworks remain the gating follow-ups before
the cut is fully done.
