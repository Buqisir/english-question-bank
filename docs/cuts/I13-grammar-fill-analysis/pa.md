# I13 语法填空解析 · PA (fresh-Opus, cold-read)

Verdict: **APPROVE WITH MUST FIX** (4 Must Fix)

Reviewer: 小川 wearing PA hat, fresh session. Branch `i13-grammar-fill-analysis`
tip `d7ad9f5`, confirmed checked out. PO/owner 黄学伟. Persona +
Operating Reality + both contract docs + facet KB + all load-bearing code
(`docxSplitter.mjs`, `analyzeCloze.mjs`, `packageBuilder.mjs`, `routes.mjs`,
`validator.mjs`, `storage.mjs`, the I8 commit footprint) read by path.

The direction is right: mirroring I8, static-facet architecture, generation-only
slice, server-stamped meta, block-never-overwrite answer authority. The teaching
model is sound and the contract encodes it faithfully (see §4). The cut is NOT
ready for DEV as written, for one dominant reason: **the plan's Step list
under-scopes the mirror it claims to follow.** I8 (the named mirror) touched 16
files; this plan names 6. The 4 Must Fix below close that gap and two data-shape
holes.

---

## Product Principle

At import time, attach reviewed per-blank 语法填空 analysis to the published
package so a later render slice can show the PO's static 考点 framework 代入'd to
each blank. The teacher task served (future slice) is 讲评: show *why this
form/word*, with highlightable syntactic triggers. This slice ships zero render —
its only job is to make the data exist, validated, in the package, exactly as I8
did for cloze. That boundary is correct.

## Exact Architecture Model (verified)

- Answer authority stays with `answer-key.json` (parsed by
  `docxSplitter.mjs:124 parseGrammarFillAnswers` as inflected free text). AI
  never overwrites; mismatch blocks non-retryably. Correct, mirrors
  `analyzeCloze.mjs:217-223` `isAnswerConflict`.
- `facetKey` validated by membership against a minimal registry; framework bodies
  stay in the KB / deferred to render. Correct and DRY.
- `meta` server-stamped (`analyzeCloze.mjs:291-303` `stampMeta`). Correct.
- Persistence chain (this is where the plan is thin): packageBuilder emits a flat
  `outputFiles` array → `publishPaperImportPackage` → `validatePaperImportPackage`
  (`validator.mjs:449 validateParsedBundle` keys `packageData` by `schemaVersion`)
  → `writePaperImportVersion` (`storage.mjs:99` / `makeVersionedArtifacts`
  L75-96). A `grammar-fill-analysis-v1.json` file that packageBuilder pushes is
  **parsed but dropped** unless validator AND storage are taught the new
  schemaVersion. See MF-2.

---

## Must Fix Before DEV

### MF-1 — Plan Step list under-scopes the I8 mirror; persistence + client + sibling-verifier work is missing. (blocks DEV)

Concrete risk: The plan (Steps 1-6) names `prompts/`, registry JSON,
`analyzeGrammarFill.mjs`, `routes.mjs`, `packageBuilder.mjs`,
`verify-i13`. But the I8 "Steps 2-5" commit `22d4f4f` — the exact mirror this
plan invokes — touched **16 files**, including everything the plan omits:

- `server/paper-import/validator.mjs` — add a `grammar-fill-analysis-v1` entry
  set + paperId-mismatch warning + include it in the returned `normalized`
  bundle (mirror `validator.mjs:455 / 524-528 / 538`).
- `server/paper-import/storage.mjs` — `makeVersionedArtifacts` must clone +
  re-stamp `sourceAssetVersion` (mirror L91-94) and `writePaperImportVersion`
  must write `analyses/grammar-fill-analysis-v1.json` (mirror L131-133).
- `app/src/services/paperImportAi.ts` — add the `analyze-grammar-fill` client
  call (mirror L228 `analyze-cloze`) and a `grammarFillAnalysis` field on the
  publish payload (mirror L248/264).
- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx` — obtain the
  grammar-fill analysis and pass it at publish (mirror L465
  `clozeAnalysis: clAnalysisState.result?.analysis`).
- `scripts/verify-i1/i2/i3/i4/i5-*.mjs` — every existing verifier that calls
  `buildPaperImportAiPackageFiles` will throw if grammar-fill analysis becomes a
  required param (they pass no `grammarFillAnalysis` today). I8 had to update all
  five for the cloze-mandatory change; this cut faces the identical break.

Required disposition: either (a) expand the plan's allowed-files + Must-Do steps
to the full I8 footprint, or (b) take MF-3's "optional at publish" decision,
which shrinks but does not eliminate this list (validator+storage+client still
needed to persist/produce the file at all). The plan must NOT leave DEV to
"discover" validator/storage/client; that is the difference between a 6-file cut
and a 14-16-file cut and is a rework trap.

### MF-2 — packageBuilder Step 5 alone does NOT persist the analysis; validator + storage are load-bearing. (blocks DEV)

Concrete risk: Plan Step 5 says packageBuilder will "write the analysis file
into the package." Verified false-as-sufficient: `validateParsedBundle`
(`validator.mjs:449-540`) only lifts known `schemaVersion`s into `packageData`;
an unrecognized `grammar-fill-analysis-v1` file is parsed into `parsedFiles` then
**silently dropped**, and `storage.mjs` only writes `scAnalysis`/`clozeAnalysis`.
So if DEV implements only Step 5, the generation smoke could "pass" in-memory
while the published version dir contains NO grammar-fill analysis file — a
ship-a-hole bug that the smoke (which validates the in-memory object) would not
catch.

Required disposition: plan.md must add explicit Must-Do sub-steps for
`validator.mjs` (recognize + pass through) and `storage.mjs` (re-stamp + write
`analyses/grammar-fill-analysis-v1.json`), and the verify plan (MF-4) must assert
the file is present **on disk after publish**, not only that the object
validates.

### MF-3 — "Mandatory vs optional at publish" must be DECIDED in the plan, not deferred to PA/DEV. (blocks DEV — PO decision)

PA recommendation: **MANDATORY**, matching cloze (`packageBuilder.mjs:397-405`
already hard-requires `clozeAnalysis` when a cloze group exists, and L203 already
hard-requires the grammar-fill *group*). Mandatory keeps the four-family paper
consistent and prevents publishing a half-analyzed objective paper.

But mandatory has a verified blast radius the plan must own: it converts a
missing-analysis publish from "silently omit file" to "throw
`grammar_fill_analysis_required`," which breaks every fixture in
`verify-i1/i2/i3/i5` that publishes a four-family paper without supplying
grammar-fill analysis (same break I8 caused and had to repair). It also means the
client MUST run `analyze-grammar-fill` before publish or publish 422s.

Required disposition: plan.md records the locked decision (PA proposes
mandatory), names the new `issue('grammar_fill_analysis_required', …)` guard
mirroring L397-399, and lists the five sibling verifiers as required updates
under Must Do (folds into MF-1). If PO chooses optional instead, record that and
drop the publish-guard step — but validator/storage/client (MF-2) stay required.

### MF-4 — Answer-match normalization boundary is under-specified and can WRONGLY accept; verify cases must be enumerated. (blocks DEV — data contract)

This is C1, and it is the highest-risk new logic because unlike cloze (compare
letter `===` letter) the grammar-fill compare is fuzzy free-text. Verified
failure modes the contract/plan do not yet pin down:

1. **Multi-word answers are real, not hypothetical.** `verify-i4` asserts
   `q56 answerKey === 'were worn'` (passive). "collapse spaces + trim" is right,
   but the plan must state multi-word answers are first-class, not noise.
2. **`/`-alternatives:** contract §Answer Authority + plan C1 say "accept any
   `/`-separated alternative," but the answer key may store `whether/if` with or
   without spaces, and the AI emits ONE form. Rule must be: split answerKey on
   `/`, trim each, AI answer matches if it equals **any** branch (normalized).
   Spell this out; it is the single most likely false-block.
3. **Sentence-initial capitalization:** answerKey `Whether` vs AI `whether`.
   Case-insensitive compare handles it — but then the render must re-apply
   sentence-initial capitalization later. In-scope: case-insensitive accept.
   Out-of-scope but note for render slice.
4. **WRONG-accept hazard (the dangerous direction):** over-normalization can
   accept a genuinely wrong answer. Forbid normalization beyond {trim, collapse
   internal whitespace, lowercase, split-on-`/`}. Do NOT strip punctuation,
   stem/lemmatize, or do edit-distance — those would let `worn` pass for `wore`.
   The validator must compare the AI answer against the *literal normalized
   answer-key branches only*; anything else blocks.
5. The KB lists `was/were`-style and `because/as` alternatives in
   `…conjunction.adverbial-clause`; the same `/`-branch rule covers them.

Required disposition: plan.md must (a) freeze the normalization function as
exactly the four ops above (closed list — forbid the rest), (b) state multi-word
+ `/`-branch + case-insensitive as accept cases, (c) name the verifier cases:
`whether/if` accepted, `Whether`/`whether` accepted, `were worn` (multi-word)
accepted, `worn` vs `wore` BLOCKED (no lemmatization), genuine wrong answer
BLOCKED non-retryably.

---

## Must Fix -> Plan Disposition Checklist

- [ ] **MF-1** → plan.md `Allowed Files` + Must-Do Steps expanded to the full I8
  footprint: add `validator.mjs`, `storage.mjs`, `paperImportAi.ts`,
  `PaperImportAiWorkbench.tsx`, and the five sibling verifiers (i1/i2/i3/i4/i5)
  as required-touch. Forbidden list keeps `schemas/**`, group model, other
  families' analysis modules.
- [ ] **MF-2** → plan.md adds Must-Do sub-steps for validator pass-through +
  storage write, and the verify entry asserts on-disk file presence post-publish.
- [ ] **MF-3** → plan.md records locked PO decision **D: grammar-fill analysis
  MANDATORY at publish** (PA-recommended), with the new publish guard mirroring
  `packageBuilder.mjs:397-399` and the five-verifier fixture update as Must Do.
  (Open PO Decision #1.)
- [ ] **MF-4** → plan.md freezes the normalization op-list (closed: trim, collapse
  ws, lowercase, split-`/`; forbid stem/edit-distance/punct-strip) and the
  contract's §Validation answer rule cites it; verifier cases enumerated as above.

---

## Should Watch (non-blocking)

- **SW-1 — `hint` vs `prompt` field name.** Contract uses `hint`; the parsed
  question model exposes the given word as `question.prompt`
  (`docxSplitter.mjs:740`, `packageBuilder.mjs:518`). Non-blocking because it is
  a deterministic input-mapping in `analyzeGrammarFill.mjs`, but DEV must map
  `prompt → hint` and the input-assertion (mirror `assertClozeAnalyzeInput`)
  should not require an `options` object (grammar fill has none). Flagging so DEV
  does not copy the cloze 15-question / options assertion verbatim.
- **SW-2 — passage carries inline markers AND `(wear)` hints.** Fixture passage
  text is e.g. `… and  56  .` and real DOCX keeps parenthesized hints inline
  (`extractGrammarFillPrompts`). The contract's no-marker evidence rule is
  correct; just confirm the verifier's exact-substring fixture includes a passage
  with both a `  56  ` marker and a `(wear)` token, so the no-marker rule is
  actually exercised. Non-blocking; it is a test-coverage note, folded into MF-4's
  verifier list.
- **SW-3 — `sourceAssetVersion` re-stamp.** storage re-stamps cloze analysis
  `sourceAssetVersion = version` (`storage.mjs:94`). Grammar-fill analysis must do
  the same or the published version number drifts. Covered if MF-2 storage step is
  done; watch it in CR.
- **SW-4 — render-slice coupling (future).** `role`/`path` and the 12-type
  evidence vocab are generated now but only consumed by a later render. If the
  render slice changes the facet leaf set, the registry JSON and any already-
  published analyses drift. Acceptable for slice 1 (generate-at-import, no
  re-analysis), but the render-slice cut must own a registry-version check.

## Allowed Files (PA-recommended; PM to finalize in plan)

Generation core: `prompts/grammar-fill-analysis-v1.md`,
`server/paper-import-ai/grammar-fill-facets-v1.json`,
`server/paper-import-ai/analyzeGrammarFill.mjs`,
`server/paper-import-ai/routes.mjs`,
`server/paper-import-ai/packageBuilder.mjs`.
Persistence (MF-1/MF-2): `server/paper-import/validator.mjs`,
`server/paper-import/storage.mjs`.
Client (MF-1): `app/src/services/paperImportAi.ts`,
`app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`.
Verifiers: `scripts/verify-i13-grammar-fill-analysis.mjs`, `scripts/verify-ci.mjs`,
and required edits to `scripts/verify-i1/i2/i3/i4/i5-*.mjs` (MF-3 fixture update).

## Forbidden Files

`schemas/**`, `paper-asset-v1`, the grammar-fill group model / docxSplitter
q56-q65 parse shape, other families' analysis modules
(`analyzeCloze.mjs` / seven-choices / reading), `app/public/paper-assets/**`,
`.claude/launch.json`. No render surface / entry gate this slice.

## Static Verify Requirements

- `node scripts/verify-i13-grammar-fill-analysis.mjs` green: valid fixture passes;
  each validation rule fails-closed when violated; MF-4 answer cases
  (`whether/if` accept, case-insensitive accept, `were worn` multi-word accept,
  `worn`-for-`wore` BLOCK, wrong-answer non-retryable BLOCK); C2 cases (bad
  facetKey block, blank_type mismatch block, role/path on non-non-finite block,
  16-leaf registry membership); evidence non-substring + marker-present block;
  **post-publish on-disk** `analyses/grammar-fill-analysis-v1.json` present (MF-2).
- `node scripts/verify-ci.mjs` green: new script registered; i1/i2/i3/i4/i5 + i8
  stay green AFTER the mandatory-publish fixture updates (MF-3).
- Generation smoke (needs AI quota) per plan — keep, but it does NOT substitute
  for the on-disk persistence assertion.

## Browser QA Matrix

None this slice — generation only, no render, no user-visible surface. (Confirmed
in scope; matches I8 which deferred all render QA to I9.) Docs/server/no-TSX-UI
edits only; the two client files are data-plumbing, not visual.

## DEV Readiness

Not ready until MF-1..MF-4 are folded into plan.md by PM compression. The
architecture is correct and the contract is sound; the blockers are scope-honesty
(the plan must own the full I8 footprint), one decided PO question (mandatory),
and a frozen normalization boundary. After compression this is a clean, well-
mirrored Sonnet DEV pass.

## Open PO Decisions (1 — under the 3 limit)

1. **Mandatory vs optional grammar-fill analysis at publish.** PA recommends
   MANDATORY (consistency with cloze; blast radius known and bounded to the five
   sibling-verifier fixtures). PO to confirm in plan.md. This is the only decision
   that needs PO sign-off; MF-1/2/4 are engineering dispositions for PM.

---

## Contract / Facet-KB notes (verification detail)

- **§4 Contract completeness — PASS.** The contract faithfully encodes the facet
  model: given/no-hint axis, `hint` null-for-no-hint, `role`/`path` gated to
  `grammar-fill.given.verb.non-finite` only, closed 12-type evidence vocab, no
  distractor glosses (correct — grammar fill has no A-D), server-stamped meta,
  answer-authority block-never-overwrite. No facet in the KB fails to fit the
  shape. `overview`-only group analysis (no `affectiveArc`) is the right
  divergence from cloze.
- **C2 leaf-count drift — REAL, fold into MF-1/plan.** The KB header and plan say
  "11 facets" / "all 11 leaves," but the actual assignable **leaf** set is
  **16**: `given.verb.finite`, `given.verb.non-finite`, `given.noun`,
  `given.adjective`, `given.derivation.noun-to-adj`,
  `given.derivation.verb-to-noun`, `given.derivation.verb-to-adj`,
  `given.pronoun`, `given.numeral`, `no-hint.preposition`, `no-hint.article`,
  `no-hint.pronoun`, `no-hint.conjunction.coordinating`,
  `no-hint.conjunction.relative-clause`, `no-hint.conjunction.noun-clause`,
  `no-hint.conjunction.adverbial-clause`. The "11" counts `derivation` and
  `conjunction` as single nodes while their children are the real leaves — the KB
  itself says derivation is split into 子叶 and conjunction is a 子闸+四类. A DEV
  transcribing "11 leaves" will under-populate the registry and the AI will be
  unable to tag conjunction/derivation blanks correctly. The registry JSON must
  enumerate the **16** terminal keys, and the parent nodes
  (`grammar-fill`, `.given`, `.given.verb`, `.given.derivation`, `.no-hint`,
  `.no-hint.conjunction`) must NOT be valid `facetKey` values. Plan Step 2's
  "all 11 leaves" must be corrected to 16, and the verifier must reject a parent
  node used as a leaf key. (Recorded under MF-1's plan-disposition; it is a
  spec-text error, not a separate PO decision.)
