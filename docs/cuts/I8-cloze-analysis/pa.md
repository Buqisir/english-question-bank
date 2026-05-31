# I8 完形填空 AI 解析生成 — PA Review

Reviewer: PA (小川 persona, independent context)
Branch / HEAD under review: `i8-cloze-analysis-plan` @ `ebf4a35`
Date: 2026-05-30
Review level: Large (data contract + new facet vocab + runtime `paper-import-ai`
path + teaching interpretation). Full gates required: PA before DEV, CR before
merge. Generation-only; render surface + entry gate are explicitly I9 (verified
DEFERRED, not flagged as a gap).

## Verdict

**APPROVE WITH MUST FIX.**

The direction is right and the cut is correctly sliced. The seam (generate +
validate JSON now, render in I9) is a deliberate, sound decision and the
contract binds correctly to the real I3 cloze group identity model (questionId
keying, per-question A–D options, inline `__41__` passage blanks). The teaching
model is expressible and machine-validatable as written.

But the plan's central wiring claim is factually wrong about how analysis files
reach disk, and as literally written it will **hard-block publish** the first
time DEV runs it. Two Must Fix items are real rework/availability risks that must
be folded into `plan.md` before DEV. Neither requires a PO decision; both are
mechanical corrections the plan must record so DEV touches the right files.

## Product Principle

The teacher action being improved: at one-click paper import, a paper containing
a 完形 section now also produces a validated, reviewed 完形 讲评 JSON bundled into
the same asset version — so I9 can later render per-blank why-it-fits + distractor
glosses + highlightable evidence without a second generation pass. I8 produces
no teacher-visible surface; its "user" is the owner reading the generated JSON
for teaching truth (Step 6). This reduces future teacher prep work; it does not
turn PaperSurface into an AI dashboard (no surface ships in I8).

## Exact Architecture Model (verified against code)

- I3 cloze group (confirmed in `server/paper-import-ai/docxSplitter.mjs` ~L555–582
  and `scripts/verify-i3-cloze-ai-import.mjs` L42–82): `clozeGroup.questions[]` =
  `{ id, stem (the number string "41".."55"), options:{A,B,C,D}, answerKey,
  blankId ("blank-<tail>-041") }`; `paragraphs[]` carry inline `__41__` markers;
  `blankIds[]` is the array of those blankIds. Options are **per-question**, not
  a shared bank. The contract's identity model (key by questionId, carry blankId
  + blankNo, per-question A–D) is correct.
- Crucially: in a real cloze the correct word is **absent from the passage** (it
  is the blanked-out slot `__41__`). So the universal `collocation-partner`
  evidence highlights the *partner* word in the passage, never the answer word.
  The contract handles this correctly (passage-side default; `option`-side
  reserved for phrase decomposition). This is the right model and does not break
  the exact-substring rule.
- Analyze module pattern to mirror (`server/paper-import-ai/analyzeSevenChoices.mjs`):
  `build…Messages` → provider call/retry → `extractFirstJsonObject` → validate
  shape → exact-quote → `isRetryableAnalysisError` (answer-conflict is
  non-retryable via `/答案解析版不一致/`). Solid template; cloze mirrors it cleanly.
- **Where analysis files actually reach disk (the load-bearing correction).** The
  plan says "Extend `buildPaperImportAiPackageFiles(...)` to write
  `analyses/cloze-analysis-v1.json` … exactly as `sevenChoicesAnalysis` is
  handled." That is **not** how seven-choices works. The real path is:
  1. `packageBuilder.mjs` emits a flat-named file into `outputFiles`
     (`seven-choices-analysis-v1.json`, L778–783) — but this is only the package
     manifest fed to the C7 publish validator.
  2. `server/paper-import/validator.mjs` recognizes a file **only if its
     `schemaVersion` is in `PAPER_IMPORT_SCHEMA_VERSIONS`** (L17–23). An unknown
     schemaVersion is a **blocking** issue `json.schemaVersionUnknown` (L597–601)
     that fails the whole publish. It then builds `packageData.scAnalysis` from
     the `seven-choices-analysis-v1` entry (L514) and returns it in the
     normalized bundle (L521–527).
  3. The on-disk `analyses/` write happens in `server/paper-import/storage.mjs`:
     `makeVersionedArtifacts` clones `packageData.scAnalysis` (L85–90),
     `writePaperImportVersion` writes it to `analyses/` (L122–124), and
     `swapPaperImportLatest` copies it into `latest/analyses/` (L157–163). All
     three are **hardcoded per analysis type**, not driven by `outputFiles`.

  Consequence: doing literally what the plan says (push `cloze-analysis-v1.json`
  into `outputFiles`) will hit the validator allow-list and **block every publish
  of a cloze paper** with `json.schemaVersionUnknown`. And even if it passed, the
  file would never be written to `analyses/` because storage.mjs has no cloze
  branch. The plan's Suggested Files list omits both `validator.mjs` and
  `storage.mjs`, so DEV would not know to touch them.

## Data-Contract Notes

- Binding to I3 is correct: questionId keying, blankId/blankNo carriage,
  per-question A–D options, single cloze group id in `targetGroups`. No contract
  revision needed for identity.
- `correctFit.optionLabel` vs `answer-key.json`: the contract makes a mismatch
  non-retryable blocking, matching the proven seven-choices pattern. Correct. The
  field being *optional* ("recommended for readability") is acceptable because
  the answer authority stays `answer-key.json`; but note the validator can only
  enforce the conflict check when the label is present (same as seven-choices).
- Exact-substring rule is sound for context/stem (passage text exists) and for
  `option`-side (the blank's own per-question options exist). One real gap: the
  passage contains inline blank markers `__41__`; the contract does not tell the
  model to keep `signalText` clear of those markers. Seven-choices explicitly
  excludes blank-number markers (prompt L166–167). For cloze, a `collocation-partner`
  near a blank could include `__42__` and then fail (or pass spuriously) the
  substring check. This is a Should Watch (prompt wording), not a blocker.
- Two-axis model is machine-validatable: `pos` is a closed enum incl. `other`
  escape; `signatureFacet` optional with POS-prefix match; `other` takes no
  signature. The `other` escape is sufficient for prepositions/pronouns. The
  asymmetric treatment (correctFit reason vs distractor meaning-only gloss) is
  unambiguous for a validator: it checks presence/coverage, not "why-wrong"
  semantics, which is the right division of labor.
- Validator strength vs over-strictness: ≥1 `collocation-partner` per blank +
  exact substring + answer-conflict block is strong enough to catch a
  hallucinated analysis without being unsatisfiable on real papers, **provided**
  the blank-marker carve-out (above) is in the prompt so the model does not
  accidentally fail substring on near-blank context.

## Must Fix Before DEV

### MF-1 — Publish wiring must name the real files; cloze schemaVersion must be allow-listed

**Risk:** As written (Step 4: extend only `packageBuilder.buildPaperImportAiPackageFiles`),
the first real publish of a cloze paper hard-fails at
`validator.mjs:597` (`json.schemaVersionUnknown`) because `cloze-analysis-v1` is
not in `PAPER_IMPORT_SCHEMA_VERSIONS`. Even past that, the file is never written
to `analyses/` because `storage.mjs` (`makeVersionedArtifacts`,
`writePaperImportVersion`, `swapPaperImportLatest`) has no cloze branch. This is
guaranteed rework discovered late, and it directly breaks the I9 contract (I9
fetches `${assetBase}/analyses/cloze-analysis-v1.json`, per
`PaperIntelligencePaperSurfaceHarness.tsx:365`).

**Required disposition:** Step 4 must explicitly name and require edits to:
- `server/paper-import/validator.mjs`: add `'cloze-analysis-v1'` to
  `PAPER_IMPORT_SCHEMA_VERSIONS`; add a `clozeAnalysisEntries` filter (≤1, mirror
  the seven-choices `package.tooManySevenChoicesAnalysis` guard) and a
  `clozeAnalysis` field in the normalized `packageData` (mirror `scAnalysis`
  pass-through at L513–527). Do NOT add a `schemas/**` JSON Schema (AJV correctly
  skips when no schema file, L168 — keep Forbidden intact).
- `server/paper-import/storage.mjs`: extend `makeVersionedArtifacts`,
  `writePaperImportVersion`, and `swapPaperImportLatest` to write
  `analyses/cloze-analysis-v1.json` when present, mirroring `scAnalysis`.
- Add both files to Suggested Files, owner-file-aware.

### MF-2 — Resolve the publish-gate semantics for cloze analysis (optional vs required)

**Risk:** Step 4 says cloze analysis is "OPTIONAL for publish … but when a cloze
group exists the one-click flow is expected to generate it." Seven-choices makes
its analysis **required** when the group exists (`packageBuilder.mjs:294–296`
`seven_choices_analysis_required`). "Optional + expected" is exactly the
fake-availability trap the PA persona must catch: it permits a published cloze
paper whose `analyses/cloze-analysis-v1.json` is silently missing, which I9 will
then surface as a broken/empty 完形解析 entry with no blocking signal at import
time.

**Required disposition:** Lock one rule in `plan.md` Locked Product Decisions and
encode it in the verifier:
- Recommended (mirrors seven-choices, avoids silent gap): when a cloze group is
  detected, cloze analysis is **required at publish** (block with a clear
  `cloze_analysis_required` issue if absent). "Optional in I8 wiring terms" then
  means only that cloze analysis must not retroactively block a Reading/七选五
  paper that has **no** cloze group — which is already the natural behavior.
- If the owner instead wants cloze analysis truly optional (publishable without
  it), that must be an explicit PO decision recorded as such, AND the plan must
  state how I9 distinguishes "no cloze analysis exists" from "broken" so it does
  not present fake availability. Do not leave this to DEV.

## Must Fix -> Plan Disposition Checklist

| MF | Required `plan.md` disposition |
| --- | --- |
| MF-1 | Step 4 rewritten to name `server/paper-import/validator.mjs` (allow-list `cloze-analysis-v1`; `clozeAnalysis` in normalized packageData; ≤1 guard) and `server/paper-import/storage.mjs` (write `analyses/cloze-analysis-v1.json` in version + latest swap). Both added to Suggested Files. Forbidden keeps `schemas/**` unchanged (AJV skip is intentional). Step 5 verifier must assert the published asset actually contains `analyses/cloze-analysis-v1.json`, not just that packageBuilder emitted it. |
| MF-2 | Locked Product Decision: cloze analysis is required-at-publish when a cloze group exists (default), with a named blocking issue; "optional" scoped to no-cloze papers only. Step 4 + verifier encode it. If owner chooses truly-optional, record as an explicit Open PO Decision plus an I9 availability-distinction note. |

## Should Watch

- **Blank-marker carve-out in the prompt (SW-1).** The cloze passage carries
  inline `__41__` markers. Step 2 prompt should instruct the model to keep
  `signalText` clear of `__nn__` markers (seven-choices does this for bare blank
  numbers). Otherwise occasional substring failures or spurious matches on
  near-blank context. Prompt wording only; not a contract change.
- **Prompt philosophy consistency (SW-2).** The contract/plan describe inline-JSON
  output via `readApiPrompt()` rewrite, while the existing
  `prompts/seven-choices-analysis-v1.md` on disk still uses the file-download
  philosophy (`UNABLE_TO_CREATE_FILE`) that `readApiPrompt()` rewrites at runtime.
  DEV should mirror the runtime rewrite, and the Step 2 prompt-contract verifier
  (mirror `verify-i0c`) should assert the cloze prompt names every `pos`, every
  signature leaf, every evidence `type`, the asymmetric distractor rule, and the
  exact-substring requirement. Plan already calls for this; just make sure the
  verifier asserts the asymmetric rule explicitly (it is the contract's most
  novel claim).
- **`other`-pos with no signature path (SW-3).** Make the validator's
  POS/signature-prefix check explicitly allow `pos:"other"` with no
  `signatureFacet` (contract says so; ensure the validator does not require a
  signature for any pos). Low risk; named so CR checks it.
- **Smoke-sample edge: phrase blanks (SW-4).** The only `option`-side evidence
  case is phrase decomposition (`empty`/`out`). Step 6 should ensure at least one
  real sample exercises a phrase blank so the option-side substring path is
  empirically proven, not only unit-fixture proven.

## Allowed Files

- `prompts/cloze-analysis-v1.md` (new)
- `server/paper-import-ai/analyzeCloze.mjs` (new)
- `server/paper-import-ai/routes.mjs` (add `analyze-cloze` route + `clozeAnalysis`
  into publish payload parse + `buildPaperImportAiPackageFiles` call)
- `server/paper-import-ai/packageBuilder.mjs` (accept `clozeAnalysis`, emit file +
  answer-conflict re-check mirroring seven-choices L293–317)
- `server/paper-import/validator.mjs` (MF-1)
- `server/paper-import/storage.mjs` (MF-1)
- `app/src/services/paperImportAi.ts` + `PaperImportAiWorkbench.tsx` (analyze-cloze
  call; thread `clozeAnalysis` to publish, single user action)
- `scripts/verify-i8-cloze-analysis.mjs` (new) + `scripts/verify-ci.mjs` +
  `scripts/README.md`

## Forbidden Files

- `schemas/**` — do not add a `cloze-analysis-v1.schema.json`; AJV intentionally
  skips analyses with no schema file (validator.mjs L168). Keeps `paper-asset-v1`
  and the I3 model untouched.
- Any render surface / entry gate / cloze analysis card / evidence highlight code
  (`shared/papersurface/**`, paper-intelligence cloze render) — all I9.
- `server/paper-import-ai/analyzeSevenChoices.mjs`,
  `prompts/seven-choices-analysis-v1.md`, `seven-choices.*` facets — no changes.
- `app/public/paper-assets/**` generated runtime outputs — do not commit.
- No review UI; no post-hoc re-analyze path; no grammar-cloze.

## Static Verify Requirements

- `node scripts/verify-i8-cloze-analysis.mjs` (must cover Steps 2–4):
  - prompt-contract string checks (mirror `verify-i0c`): every `pos`, every
    signature leaf, every evidence `type`, asymmetric distractor rule,
    exact-substring requirement, "mark signature only when it applies".
  - analyzeCloze validator: good fixture passes; each of {missing required field,
    wrong schemaVersion, non-substring evidence, POS/signature mismatch, missing
    `collocation-partner`, answer conflict} throws the right blocking error;
    answer conflict is **non-retryable** (does not loop).
  - route exists, honors injected `services.analyzeCloze`, returns
    `cloze-analysis-v1` without regressing existing responses.
  - **package + publish proof (MF-1):** a supplied cloze analysis passes the C7
    publish validator (allow-list) AND the published version/latest dir actually
    contains `analyses/cloze-analysis-v1.json` keyed/shaped per contract. Assert
    on-disk write, not only packageBuilder output.
  - **publish-gate proof (MF-2):** with the locked rule, a cloze paper missing
    analysis blocks (or publishes, per the locked decision) with the named issue.
- Register `verify-i8-cloze-analysis.mjs` in `scripts/verify-ci.mjs` (the plan
  correctly flags prior I-series bit-rot from CI omission — this is sufficient if
  Big CR confirms it is actually in `verify:all`).
- Regression: `verify-i2`, `verify-i3`, `verify-c7-paper-import-contracts`,
  `verify-c7-paper-import-publish` still green; `git diff --check`.

## Browser QA Matrix

I8 is generation-only; QA is `?view=paper-import-ai` + reading published JSON
(rendered 讲评 is I9). The plan's matrix is adequate. Add one row for MF-2:

| Case | Expected result |
| --- | --- |
| Paper with Reading + 七选五 + 完形 + answer DOCX | One analysis action generates cloze analysis q41–q55; publish writes `analyses/cloze-analysis-v1.json` into version + latest |
| Generated cloze analysis | Each blank: correctFit + distractor glosses (meaning-only) + ≥1 collocation-partner evidence; signatures only where they apply |
| AI answer conflicts with answer key | Blocks with answer-conflict; no retry loop; no conflicting analysis stored |
| Cloze group present but analysis absent (MF-2) | Publish blocks with the named `cloze_analysis_required` issue (per locked decision) — no silently-incomplete cloze asset |
| Paper with Reading/七选五 but no 完形 | Existing path unchanged; no cloze analysis attempted; no new blocking |

## DEV Readiness

DEV-ready after MF-1 and MF-2 are folded into `plan.md`. All readiness facts are
stated: exact teacher action (future-facing, generation only), before/after, cut
boundary (generate+validate), future-cut boundary (I9 render/entry), allowed +
forbidden files (corrected to include validator.mjs + storage.mjs), verify
assertions (incl. on-disk publish proof), and browser QA matrix.

## Open PO Decisions

At most one, and only conditionally:

1. **(Conditional) Cloze-analysis publish gate.** Default recommendation:
   required-at-publish when a cloze group exists (mirrors seven-choices, no fake
   availability). The owner only needs to decide if he wants the
   weaker "truly optional" behavior instead — in which case the I9
   availability-distinction note becomes mandatory. If he accepts the default,
   this is not an open decision and DEV may proceed.

(0–1 open decisions; well under the 3-decision ceiling. DEV may start once MF-1
and MF-2 dispositions are recorded.)
