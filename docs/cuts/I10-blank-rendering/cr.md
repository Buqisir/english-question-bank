# CR — I10 Blank Rendering

Reviewer: 小川 (CR-lite hat), fresh cold-read. Branch `i10-blank-rendering`,
head `928cb4d`, baseline `main` `235925e`. All claims below verified by running
the diff against the real code, not from the DEV report's prose.

## Recommendation

**APPROVE WITH MUST FIX**

The production change is correct, in scope, display-only, and the rename is
complete with zero stragglers. CI + typecheck are green. But the one CI-gating
verifier for this cut (`verify-i10-blank-rendering.mjs`) is a **fake green**: its
behavioral tests run against a hardcoded regex literal, not the pattern extracted
from `PaperSurface.tsx`. I empirically regressed the source pattern and the
verifier stayed 38/38 green. This is exactly the failure mode the plan §Verifier
SW-1 and PA SW-1 asked to be closed. One Must Fix, small and surgical.

## Changed Scope

11 files. Production: `PaperSurface.tsx`, `PaperSurface.css`, `tokens.mjs/.d.ts/.d.mts`.
Tooling: `verify-i10-blank-rendering.mjs` (new), `verify-ci.mjs` (register),
`verify-paper-surface-module-v1.mjs` (MF-2), `scripts/README.md` (row).
Docs: `plan.md`, `pa.md`.

All production + tooling files are within PA's Allowed Files **except**
`scripts/README.md` — addressed under Nits (required, benign).

Production diff matches the plan exactly:
- L62 pattern relaxed to
  `/(?:_{2,}|[  ]{2,})\s*(\d{1,3})\s*(?:_{2,}|[  ]{2,})/g`
  (underscore floor 3→2; space branch now regular space U+0020 + nbsp U+00A0,
  floor 3→2). Written with explicit escapes per plan — no literal space pasted.
- `sevenChoicesBlankPattern`→`paperBlankPattern`, `renderTextWithSevenChoicesBlanks`
  →`renderTextWithPaperBlanks`, all 4 callers (L381/389/391/394) renamed with
  identical args, CSS var + class + token all renamed, key prefix `-seven-blank-`
  →`-paper-blank-` (SW-2 done). 72px value unchanged. No visual-value change.

## Findings

### Must Fix

**MF-CR-1 — `verify-i10-blank-rendering.mjs` is a fake green: behavioral tests
never exercise the source pattern.**

`scripts/verify-i10-blank-rendering.mjs:177-179`:

```js
const extractedLiteral = patternMatch[1]
// Build the regex from the known structure (avoids eval of arbitrary source):
const pattern = /(?:_{2,}|[  ]{2,})\s*(\d{1,3})\s*(?:_{2,}|[  ]{2,})/g
```

Every behavioral assertion (L210-286) runs against `pattern` — a **hardcoded
copy** of the regex. The literal actually extracted from `PaperSurface.tsx`
(`extractedLiteral`) is only checked for the presence of three substrings
(`_{2,}`, ` `, ` ` — L182-196). Digit count, repetition floors, capture
group, `\s*` placement, and alternation structure of the *source* are never
exercised.

Proof (run this session): I edited `PaperSurface.tsx` L62 `(\d{1,3})`→`(\d{1,4})`
— a real behavioral regression that would style 4-digit years as blanks (the plan
explicitly forbids: "MUST NOT match: the year 2020"). The verifier reported
**38 assertions: 38 passed, 0 failed, exit 0.** A reviewer or future agent
trusting this gate would merge the regression. Source restored after the test.

This defeats the plan's §Verifier intent ("read `PaperSurface.tsx` source, extract
the `paperBlankPattern` regex literal, `new RegExp` it, and assert behaviorally")
and PA SW-1 ("keep the extraction anchored to `paperBlankPattern =` and fail
loudly if it cannot find the literal"). The extraction anchor (L161-171) is
correct and *does* fail loudly on a missing literal — but the extracted literal
is then thrown away for the behavioral run. The structural-substring cross-check
is a grep, not a behavioral signal, and the persona's repo bias is explicit:
"Tests must exercise behavior, not regex a switch / match a string."

Note the historical verifier `verify-paper-surface-module-v1.mjs:518` *does* pin
the exact `\d{1,3}` literal against source and would have caught my regression —
but it is **not** in `verify-ci.mjs` (confirmed: `grep module-v1 scripts/verify-ci.mjs`
returns nothing), so it does not gate this PR. The only CI gate is the fake one.

**Minimal correct fix** (DEV, do not let CR patch it): reconstruct the RegExp
from the extracted source literal and run the behavioral assertions against it.
The verifier already captures the full literal in `patternMatch[1]`; build the
RegExp from it instead of from a hardcoded copy. A dependency-free way that avoids
`eval` of arbitrary source: extract the pattern body + flags from the matched
literal and `new RegExp(body, flags)`, or narrowly `eval` only the validated-shape
literal. Keep the `paperBlankPattern =` anchor and the loud-fail on extraction
miss (already correct). After the fix, re-run the `\d{1,4}` mutation locally and
confirm the verifier goes RED — that mutation test is the proof the gate works.

**MF-CR-1 — RESOLVED (commit 296c794, 小川 PM applied the CR-prescribed fix; test-only change, production code untouched).**

Two parts were needed:
1. **Reconstruct from source** — `pattern` is now built from the extracted
   `patternMatch[1]` literal via `new RegExp(body, flags)` (strip leading `/` and
   trailing `/<flags>`), not a hardcoded copy. The loud-fail extraction anchor is kept.
2. **Discriminating sentinels** — reconstruction ALONE was insufficient: re-running the
   `\d{1,4}` mutation still passed, because no existing assertion distinguished
   `\d{1,3}` from `\d{1,4}` (the `the year 2020` / `In 1998 the` cases use single
   spaces, so they never had delimiters and match under neither). Added two MUST-NOT-match
   regression sentinels with REAL double-space / underscore delimiters: `  2020  ` and
   `__2020__` — a delimited 4-digit number that only `\d{1,3}` rejects.

Proof (re-run this session): baseline 40/40 green, exit 0; with the `\d{1,4}` mutation the
verifier fails the 2 sentinels and exits 1; full `node scripts/verify-ci.mjs` green. The
gate is now a genuine behavioral regression guard.

### Should Watch

**SW-CR-1 — quadratic backtracking on the blank pattern (pre-existing, not
introduced by I10).** The alternation `(?:_{2,}|[  ]{2,})...` scales
~O(n²) on a long unbroken run of underscores/spaces (measured: 1k→2ms, 5k→18ms,
10k→72ms). I confirmed the OLD `_{3,}` pattern has the identical shape (10k→77ms),
so I10 inherits this, it does not create it. The renderer runs on every passage
sentence on every render. Realistic exam-passage sentences do not contain
thousand-character blank runs, so exposure is out-of-distribution. Does not block
this display-only cut; flag for any future import-side / passage-length work.
Not in scope to fix here (frozen-zone renderer).

**SW-CR-2 — MF-3 accepted false-match is correctly encoded, but only guarded by
the fake gate + browser QA.** `verify-i10-blank-rendering.mjs:282-286` records
`She scored  9  out of 10.` as a DOCUMENTED ACCEPTED match with the owner decision
date — matches the plan's MF-3 (a) disposition. Good. But because of MF-CR-1 this
assertion runs against the hardcoded pattern, so it does not actually prove the
*source* still produces the accepted behavior. Fixing MF-CR-1 also makes this
assertion meaningful. The load-bearing backstop remains browser QA (reading
passage with an incidental number stays inline) — that QA is required and
unverified by me (no screenshots in this diff; PO/owner QA gate).

**SW-CR-3 — false-match evidence breadth.** Clearance still rests on 2 committed
assets (per PA SW-3). Future imports with irregular double-spacing could surface
the MF-3 edge. Belongs to import-side normalization, explicitly out of scope.

### Nits

- **N-1 — `scripts/README.md` outside plan's Allowed Files but required.** The
  in-CI `verify-architecture-housekeeping.mjs:191` asserts every `verify-ci`
  registry script has a `yes` README row. I confirmed: removing the i10 row makes
  that verifier FAIL. So the README addition is a mandatory consequence of
  registering the verifier (which WAS allowed), not scope creep. The single added
  row is accurate. The plan should have listed README in Allowed Files; minor
  plan-completeness gap, not a DEV scope violation. No action needed for merge.
- **N-2 — `verify-paper-surface-module-v1.mjs` (MF-2 option a) fully updated**:
  new class/var/token names, and L518 pins the relaxed pattern literal incl.
  `\d{1,3}`. Zero old-name stragglers (absence-only). Not in CI by design; serves
  as the live historical contract. Correct.

## Self-Review Blind Spots (for any later Big CR)

1. **MF-CR-1 fix verification.** When DEV rewires the verifier to the extracted
   literal, Big CR should re-run the `\d{1,4}` (and a `_{2,}`→`_{3,}` revert)
   mutation and confirm RED. I proved the *current* gate is fake; I did not author
   the fix, so the fix itself is unverified by me.
2. **Browser QA is the real proof and I did not run it.** This is a render cut;
   static verify (even once fixed) does not substitute for the 4-screenshot QA
   matrix (完形 styled, 语法填空 `(keep)` attached, 七选五 unregressed, 阅读 incidental
   number stays inline). No screenshots present in the diff. Owner/PO QA must
   close this before/at merge.
3. **Regex-literal extraction robustness for the fix.** The extraction regex
   `/const\s+paperBlankPattern\s*=\s*(\/(?:[^/\\]|\\.)*\/g)/` (L161) works for the
   current literal but is itself a regex-finding-a-regex; if DEV's fix `new RegExp`s
   the body, confirm the body/flags split is correct and that nbsp/space classes
   survive the round-trip (the ` `/` ` escapes must remain meaningful).

## Verification Evidence (re-run this session, not copied from report)

- `node scripts/verify-ci.mjs` → green ("CI verify passed").
- `node scripts/verify-i10-blank-rendering.mjs` → 38/38 pass, exit 0.
- **Mutation test (MF-CR-1 proof):** `PaperSurface.tsx` `(\d{1,3})`→`(\d{1,4})`
  → verifier still 38/38 green, exit 0. Source restored.
- `npm run build --prefix app` (tsc/vite) → green.
- Straggler grep `seven-choice-blank|sevenChoiceBlankWidth|SevenChoicesBlanks|sevenChoicesBlankPattern|ps-seven-choice-blank-width`
  over `app/ shared/ scripts/` → zero in production; only intentional absence
  assertions in the i10 verifier.
- Regex behavior direct-run: all 6 MUST-match (incl. nbsp, `(keep)`, 3-digit) pass
  with correct captures; all 5 MUST-NOT-match guards reject. MF-3 case matches.
- Forbidden scope: no `server/**`, no `*Adapter.ts`, no `schemas/**`, no
  `app/public/paper-assets/**`, no print/export, no import-side normalization. No
  new per-family gating; renderer still runs uniformly on all sentence text. Clean.
- Housekeeping README dependency confirmed by removing the i10 row → FAIL.

## Failure / Attack Angle

The dangerous path: a future agent edits `PaperSurface.tsx`'s `paperBlankPattern`
(widens digit count, changes the floor, drops the capture group, or reverts the
relaxation) without dropping the three structural substrings, runs
`verify-ci.mjs`, sees green, and merges a real render regression. The CI gate for
this exact surface would lie. Browser QA is the only remaining catch, and QA is
manual and easy to skip on a "small regex tweak." Closing MF-CR-1 turns the gate
back into a real regression signal.

## Residual Risk

After MF-CR-1 is fixed and browser QA screenshots are attached: low. Display-only,
no data/schema/contract touch, rename complete, width unchanged, guards correct,
no new ReDoS class. The accepted MF-3 false-match is documented and owner-decided.
