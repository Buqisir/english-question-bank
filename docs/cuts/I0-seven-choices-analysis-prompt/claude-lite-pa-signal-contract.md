# Claude Lite PA Report — I0-C++ Seven Choices Signal Contract

Date: 2026-05-26
Reviewer: Claude lite (小川)
Working tree: uncommitted changes present in all 7 listed files + adapter + verify script

---

## Verdict: APPROVE WITH MUST FIX

Must Fix: 1
Should Watch: 3
Open Questions: 1

---

## Must Fix

### MF-1 — External input underspecifies `mechanismSignals` scope

**File:** `docs/cuts/I0-seven-choices-analysis-prompt/external-ai-input-seven-choices.md`
**Lines:** The per-blank field list reads:

```
- `mechanismSignals` when the blank uses logical connector or referential
  cohesion
```

**Problem:** This states `mechanismSignals` as conditional on grammatical mechanism, but
decisions.md, contract, prompt, and verifier ALL require `mechanismSignals` for **every
blank**, including topic-field-alignment blanks. An AI following the external input
literally would skip `mechanismSignals` on Q037/Q038 equivalents in new papers and
fail the verifier on signal-count and context-side signal checks.

**Fix:** Replace the conditional clause with an unconditional requirement, consistent
with the prompt and contract. Suggested replacement:

```
- `mechanismSignals` (required for every blank; see signal rules below)
```

The downstream signal rules section already states the correct per-mechanism
requirements (logical, referential, topic-field). The top-level field list just needs
to match.

---

## Should Watch

### SW-1 — No `signalText` length ceiling in verifier

The prompt says "Prefer short chunks, usually 1-8 English words." The verifier does
not enforce this. The fixture Q037 already has a 14-word context signal:

```json
"signalText": "Slowly easing into a training program"
```

At scale, LLMs may return full-clause signals that produce over-wide translucent
highlights in the passage. This does not break any hard rule today, but could degrade
UI quality. The verifier could add a soft warning (not a hard fail) when any signal
exceeds, say, 10 words. Not required for this commit; flagged for future hardening.

### SW-2 — Q037 `topicClues` contains normalized duplicate

`topicClues` for Q037 contains:

```json
"Doing too much too soon",
"doing too much too soon"
```

These normalize to the same string. The verifier does not check for normalized
duplicates. The duplicate causes the adapter to generate two overlapping highlight
ranges for the same text, which is harmless in v1 but indicates the LLM double-
counted the heading. Low risk for a single fixture; could accumulate across more
papers. No verifier change required now; note as a data-quality watch for batch
production.

### SW-3 — Pre-existing: Q037 `roleFacet = summary` debatable

Retained from prior Claude lite CR (decisions.md, section "Claude Lite CR Follow-Up").
Option G gives a concrete 10% rule rather than merely restating the paragraph topic.
Acceptable for the first fixture but should receive human review before the label is
used as a search-training signal.

---

## Open Questions

### OQ-1 — `topicClues` locality: heading-only clues two paragraphs from the blank

Q036 `topicClues` includes `"Common Mistakes New Runners Make"` (the passage title,
two paragraphs above the blank). The verifier accepts any clue that appears anywhere
in `passageText`. A future LLM might populate `topicClues` with thematically related
clues from remote paragraphs, weakening the "nearby context" guidance.

No action needed for the current fixture or this commit. Consider whether a future
verifier hardening should check that each topicClue appears in the blank's own
paragraph or adjacent discourse unit. The prompt says "nearby context / heading
clues only" — this is enforced by guidance but not by the verifier.

---

## Consistency Check (Q1)

All seven files are internally consistent on:

- Facet vocabulary: 3 mechanism facets, 3 position facets, 4 role facets — matched
  across decisions, contract, prompt, external input, verifier, fixture.
- `primaryMechanismFacet` required for every blank — consistent in decisions, contract,
  prompt, verifier, fixture. **Inconsistency only in external input** (see MF-1).
- Signal count 2–5 with at least one option-side and one context-side — consistent
  across all except external input (MF-1 covers this).
- `signalSide` values `option` / `context-before` / `context-after` — consistent in
  decisions, contract, prompt, verifier, external input, fixture.
  Adapter (`sevenChoicesSurfaceAdapter.ts`) has been updated to match in the current
  working tree: `signal.signalSide === 'context-before' || signal.signalSide === 'context-after'`. ✅
- `MECHANISM_LABELS` in adapter now includes `topic-field-alignment: '话题场对应'`. ✅
- Teaching priority (logical > referential > topic-field) consistent.
- `topicClues` 3–6, context-side only, no blank markers — consistent.
- `contextEvidence` as single object, no blank marker numbers — consistent and enforced
  by verifier.

---

## External AI Reliability Check (Q2)

The hardest constraints for an external AI to satisfy reliably:

1. **`signalText` exact substring** — LLMs frequently paraphrase; the verifier catches
   mismatches. Expected failure mode; requires iteration or post-processing.
2. **`topicClues` must not include option-only words** — LLMs contaminate topic clues
   with option text. Verifier catches this via `passageText.includes`. Known failure
   mode.
3. **Blank marker exclusion in quote fields** — LLMs include the number naturally.
   Verifier catches it. Easy to fix in a second pass.

None of these are blockers for the prompt design. The priority instruction
("structure first, signal accuracy second, prose third") gives the AI the right
fallback order. The verifier provides actionable rejection output for iteration.

---

## UI Highlight Risk Check (Q3)

No structural highlight risks found in the data contract or fixture.

- Context-side `mechanismSignals` will now correctly reach `leftHighlights` in the
  adapter (working tree fix confirmed, see Q1 above).
- `topicClues` and `mechanismSignals` have separate `kind` values (`'topic'` vs
  `'signal'`) in the adapter's `leftHighlights`. The I0-D spec requires different
  visual weights; the CSS must implement this.
- SW-1 (over-wide signalText) is the only highlight-quality risk, and it is a future-
  scale concern rather than a current blocker.

---

## Verifier Calibration Check (Q4)

The verifier enforces all hard contract constraints without over-policing:

- Exact substring checks for `signalText` (context-side vs passage, option-side vs
  option text) — correct and necessary.
- Mechanism-signal cross-reference (each signal's `mechanismFacet` must be active on
  the question) — correct; prevents stray signals.
- Paired context+option requirement for topic-field blanks — correct and needed.
- Does NOT enforce `signalText` length or `fitSummary` sentence count — correct
  deferral; these are prose-quality concerns outside verifier scope.
- Does NOT check for normalized duplicate `topicClues` — acceptable gap; flagged
  as SW-2.

---

## Fixture Consistency Check (Q5)

All five blanks in the current fixture satisfy the new signal-side and signal-count
rules:

| Q | Primary | Signals | Context-side | Option-side | Count |
|---|---------|---------|-------------|-------------|-------|
| 036 | logical-connector | 4 | context-before × 1, context-after × 1 | option × 2 | ✅ |
| 037 | topic-field-alignment | 2 | context-before × 1 | option × 1 | ✅ |
| 038 | topic-field-alignment | 2 | context-after × 1 | option × 1 | ✅ |
| 039 | logical-connector | 3 | context-before × 1 | option × 2 | ✅ |
| 040 | topic-field-alignment | 3 | context-before × 1, context-after × 1 | option × 1 | ✅ |

All `signalText` values verified as exact substrings of their declared source.
All signal `mechanismFacet` values are active (primary or supporting) on their
respective questions.

One soft note: Q037 context signal "Slowly easing into a training program" is 14
words, exceeding the 1–8 word guideline. Functionally sound; see SW-1.

---

## Final Recommendation

**Fix MF-1 in `external-ai-input-seven-choices.md` before using the document to
generate analysis for new papers.**

The fixture, verifier, contract, prompt, and decisions are ready to commit as-is. The
adapter working tree changes are also ready. MF-1 is a one-line fix to the external
input field list.
