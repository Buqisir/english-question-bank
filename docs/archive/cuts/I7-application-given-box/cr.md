# I7-application-given-box — CR-lite Review

Reviewer: 小川 (CR hat, cold independent read — did NOT implement this cut).
Date: 2026-05-30. Branch: `I7-application-given-box`.
Baseline: `main` @ `4cfcc1a` → HEAD `5c77e5c`. No uncommitted changes (only untracked `.claude/launch.json`, irrelevant).
Level: L2/L3 hybrid — data-contract extension + splitter heuristic + render. Reviewed at L3 strength on the parsing surface (highest risk).

---

## Verdict

**APPROVE**

No Must Fix. The cut is correct, in scope, and proven by tests that actually exercise behavior. All three PA Must Fix items landed with real assertions, not say-so. The C7 guard relaxation is justified and does not open a contract hole. `node scripts/verify-ci.mjs` is green on a re-run I performed myself.

---

## Changed Scope

16 files, all inside the plan's Allowed set:

- Splitter: `server/paper-import-ai/docxSplitter.mjs` (new `detectApplicationGiven` + `extractApplicationParagraphs` returns `applicationGiven`).
- Contract: `app/src/domain/paperAsset.ts` (optional `applicationGiven?: { top; bottom }`).
- Package: `server/paper-import-ai/packageBuilder.mjs` (conditional spread of `applicationGiven`; passage/instruction now given-stripped).
- Render: `writingPageModel.mjs` + `.d.ts` + `.d.mts` (answerBox `givenLines` → `givenTop`/`givenBottom`); `WritingPaperPage.tsx` + `writingPaperPage.css` (top/bottom render, `--letter` modifier).
- Verify: new `verify-i7-application-given.mjs` (15 checks) + registration in `verify-ci.mjs` + `README.md`; `verify-i6` migrated (19 checks); `verify-c7` forbidden-prefix relaxation.
- Docs: `plan.md`, `pa.md`, `agent-entrypoint.md`.

Forbidden scope confirmed UNTOUCHED **from the diff file list**, not the report: no `App.tsx`, no harness reducer/state, no PaperSurface kernel (`shared-ui/papersurface`, `shared/papersurface`), no `extractContinuationContent`, no print/export path, no reading/七选五/完形/语法填空 parse-render. The harness was not changed in I7. Confirmed.

---

## PA Must Fix — did each land?

- **MF1 (guarded detection, no bare "末尾纯英文=给定")** — LANDED. `detectApplicationGiven` requires one positive signal (salutation `^(dear|to|hi|hello)\b` | closing word | single-line title with no `.!?`), else returns `{ given: null, promptLines: contentLines }` (fail-safe, prompt intact). It also requires a non-empty Chinese prompt to remain (`promptLines.length > 0`), so an all-English block never gets eaten. I pressure-tested 6 adversarial shapes (see Attack Angle) — the guard holds.
- **MF2 (negative-guard + salutation-only fixtures)** — LANDED. verify-i7 has 5 shapes incl. Shape 4 (trailing English sentence, no signal → `null`, line stays in 情境) and Shape 5 (salutation-only `Dear Ms. Smith,` → captured, all top, removed from 情境). Inline `(Open Day)` aside asserted to stay in 情境. I confirmed Shape 4's assertion is meaningful: it asserts `null`, so a regressed bare rule that captured would fail it.
- **MF3 (continuation re-pinned on renamed model; starter fold kept; `.d.ts`+`.d.mts` lockstep; continuation never via applicationGiven)** — LANDED. verify-i6 now asserts `givenTop===STARTERS` and `givenBottom===[]` for continuation, plus a new app-with-given case asserting top/bottom from `applicationGiven`. The starter-fold (`b.text === starterText` skip) in `writingPageModel.mjs` is untouched; continuation still flows via `task.continuationStarters` (`appGiven ? ... : starters`). Both `.d.ts` and `.d.mts` changed identically (verified by diff + app typecheck exit 0).

---

## Findings

### Must Fix
None.

### Should Watch (non-blocking)

1. **`To`-prefixed direction line over-capture.** A trailing standalone English line that starts with the word "To" (e.g. `To make it vivid, add details.`) is captured as a given title and removed from the prompt, because `To` is a salutation signal in the locked rule. This is **contract-conformant** — PO explicitly locked `Dear/To/Hi/Hello` as signal ①, and a real application 情境 rarely ends in a bare English "To …" line. Non-blocking; flagged only so a future second-paper QA watches for it.
2. **`Best` closing-word breadth.** `Best of luck …` matches the closing list at line-start. This only fires *inside* an already-gated letter run (a salutation already classified it as given), so the mis-split lands entirely within given content — benign. PA Should-Watch #4; no action.
3. **Single real-paper basis.** The heuristic is line-verified against one paper (重庆巴蜀). The guard fails safe on unclassifiable shapes, so a second-paper surprise degrades to "no capture / empty box," never to deleted prompt content. Re-run the splitter on a second application DOCX before RM, as planned.
4. **`instruction` loses the given lines** (packageBuilder L555 joins given-stripped `paragraphs`). No current consumer depends on the skeleton being in `instruction`; the A4 view reads `passage.paragraphs`. Watch if a future "copy full prompt" feature assumes otherwise. PA Should-Watch #2.

---

## C7 guard relaxation — is it a hole?

No. Removing `app/src/domain/paperAsset.ts` from `verify-c7`'s `forbiddenPrefixes` is sound and PO-approved:
- The relaxed file is a TS **type**, not the runtime contract boundary. The boundary is the JSON schema + validator, both still guarded (`schemas/paper-import/`, `server/paper-import/`, print-renderer, PaperSurface kernel remain forbidden).
- The guard **mechanism** is intact: `server/paper-import-ai/` is in this diff, so `shouldCheckForbiddenScope` is true and the remaining forbidden prefixes are still actively asserted (verify-c7 green).
- The new field is **optional** → backward-compatible for every existing asset (absent = old behavior).

PA's "schema is a bare object that doesn't strip it" claim is **verified true**: `paper-asset-v1.schema.json` L84 is `"writingTasks": { "type": "object" }` — no `properties`, no `additionalProperties:false`. In `validator.mjs` `stripUnknownFields`, the strip branch only fires when `additionalProperties===false && hasKnownProperties`, and recursion only descends into declared `properties` (none here). So `applicationGiven` is neither stripped nor schema-rejected. Also confirmed: the validator runs on uploaded analysis packages, not on packageBuilder's direct asset output, and packageBuilder omits the field entirely when `null` (conditional spread — no `{top:[],bottom:[]}` leak).

---

## Render correctness scan (WritingPaperPage answerBox)

- Keys: top uses `t${i}`, bottom uses `b${i}` — no collision. OK.
- `--letter` modifier keys on `givenBottom.length > 0`. Continuation (`bottom:[]`) and title-only app (`bottom:[]`) → no modifier → default `min-height:7rem` per top line, I6 visual preserved. Letter app (`bottom` present) → flattens top min-heights + pins signature to bottom via `margin-top:auto`. Matches plan.
- Empty arrays: no-given application never builds an answerBox-with-given (`applicationGiven` absent → `givenTop=starters=[]`, `givenBottom=[]`) → top div renders zero `<p>`, bottom div not rendered → empty box. OK.
- No stale `givenLines` consumer remains (grep: only a comment string in verify-i6). app typecheck exit 0 → `.tsx` consumes the new keys.

---

## Self-Review Blind Spots

- I did NOT run a real browser/A4 visual QA. The `--letter` 22rem min-height and "blank space between top and bottom" is asserted only by CSS reading, not by rendering the重庆 asset. The plan routes browser QA after CR — that gate must still run; my approval covers correctness/contract/scope, not pixel layout.
- The heuristic is validated against one real paper plus synthetic fixtures. I cannot rule out a second-paper shape that the positive signals mis-handle; the fail-safe bounds the damage to "no capture," which is why this is APPROVE not BLOCK.

## Failure / Attack Angle

The dangerous failure mode is the splitter eating a legitimate trailing English 情境 line and deleting it from the prompt. I attacked this with 6 adversarial inputs to `detectApplicationGiven`: trailing word-count sentence, single-line title with a period, two unsignalled English note lines, a `Best`-in-opening false closing word, a mid-run closing word, and a `To`-prefixed direction line. Only the `To`-prefixed line over-captured — and that is the locked, PO-approved signal, not a bug. The all-English-block case is blocked by the `promptLines.length > 0` guard. The fake-green risk (a test asserting the wrong thing) was checked: Shape 4 asserts `null` and would fail under a regressed bare rule. The MF3 continuation regression is pinned by a value-equality assertion, not a shape match.

## Residual Risk

Low. Bounded by the fail-safe (unclassifiable trailing English → no capture, prompt intact). The only residual is layout polish, deferred to browser QA, and second-paper heuristic surprises, also bounded by fail-safe.

## Verification Evidence (re-run by CR)

- `node scripts/verify-ci.mjs` → `CI verify passed` (full suite).
- `node scripts/verify-i7-application-given.mjs` → 15 checks.
- `node scripts/verify-i6-writing-render.mjs` → 19 checks.
- `cd app && npx tsc --noEmit` → exit 0.
- Adversarial `detectApplicationGiven` probe (6 shapes) → guard behaves as locked.

## Recommendation

**APPROVE.** Mergeable as-is. Browser QA (the重庆 asset re-split + A4 box visual) remains the next gate before RM, per plan.
