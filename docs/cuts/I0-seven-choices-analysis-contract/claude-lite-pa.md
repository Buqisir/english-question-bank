# Claude Lite PA — I0-B Seven Choices Analysis Contract

Reviewer: Claude (lite PA)
Date: 2026-05-24
Cut: I0-B 七选五 reviewed-analysis contract
Files reviewed:
- `docs/cuts/I0-facet-taxonomy-foundation/decisions.md`
- `docs/cuts/I0-facet-taxonomy-foundation/facet-taxonomy-draft.md`
- `docs/cuts/I0-seven-choices-analysis-contract/decisions.md`
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`

---

## Verdict: READY FOR NEXT CUT

**Must Fix: 0**
**Should Watch: 1**

---

## Must Fix

None.

---

## Should Watch

### SW-1 — Contract document does not state the full three-case mechanism rule

**File:** `seven-choices-analysis-v1.contract.md`, Required Fields section

**Current text:**
> `primaryMechanismFacet` is required when `roleFacet` is `seven-choices.role.cohesion`.

**Gap:** The contract document states only the cohesion case. The bridge case (optional) and the topic/summary case (absent) are defined in `decisions.md` but are not restated in the contract document itself.

A prompt author or verifier working from the contract document alone will know the mechanism is required for cohesion, but will not know whether bridge requires or forbids it, and will not know that topic and summary blanks carry no mechanism field at all.

**Recommended addition** to the Required Fields section of the contract document:

> `primaryMechanismFacet` is required when `roleFacet` is `seven-choices.role.cohesion`.
> It is optional when `roleFacet` is `seven-choices.role.bridge`.
> It must be absent when `roleFacet` is `seven-choices.role.topic` or `seven-choices.role.summary`.

No structural changes are needed — this is a two-sentence prose addition.

---

## Checklist Findings

| Check | Result |
| --- | --- |
| Docs-only scope — no JSON Schema, TS types, validators, prompts, sample JSON, app/server/runtime, DB, or PaperSurface | ✅ Clean. Both `decisions.md` and the contract document have explicit out-of-scope sections enumerating all excluded artefacts. |
| Contract consumes I0-A facet keys without renaming | ✅ Clean. All four position keys, four role keys, and four mechanism leaf keys match the I0-A taxonomy table exactly. No aliases or renamed variants present. |
| Facets classify the blank/question | ✅ Clean. `positionFacet`, `roleFacet`, `primaryMechanismFacet`, and `supportingMechanismFacets` all sit inside `questions[questionId]`, keyed by blank. |
| `topicClues` are context-side clues only | ✅ Clean. "context-side clues only" is stated explicitly. Good/bad examples clearly demonstrate the option-side vs context-side boundary. |
| `optionFit` explains correct option fit | ✅ Clean. `optionFit` carries `fitSummary`, `matchedClues` with `contextSide`/`optionSide`/`relation`, and `correctOptionLabel` with the authoritative-answerKey caveat. |
| Distractors do not get facet keys | ✅ Clean. `keyDistractors` items carry only `optionLabel` and prose `reason`. Contract states "Do not give distractors their own facet keys in v1." |
| Mechanism required for `role=cohesion` | ✅ Clean. Stated in both documents. |
| Mechanism optional for `role=bridge` | ⚠ Correct in `decisions.md` only; absent from contract document. See SW-1. |
| Mechanism absent for `role=topic` and `role=summary` | ⚠ Correct in `decisions.md` only; absent from contract document. See SW-1. |
| Contract does not over-specify PaperSurface, import validation, or DB | ✅ Clean. None of these appear anywhere in the contract. |
| Sufficient for next cut (prompt + sample JSON + verify) | ✅ Yes. JSON shape, field definitions, valid facet key enumerations, topic-clue rules, optionFit structure, distractor handling, and context-evidence fields are all specified. The mechanism gap (SW-1) is recoverable from `decisions.md` by the next cut. |

---

## Final Recommendation

Ready for next cut. The contract is well-scoped, structurally sound, faithful to I0-A keys, and provides sufficient detail for a prompt author to generate sample JSON and a verifier to check it.

Address SW-1 in the next editing pass on the contract document — a two-sentence addition to the Required Fields section makes the mechanism rule self-contained and removes the need for the next cut to cross-reference `decisions.md` for this rule.
