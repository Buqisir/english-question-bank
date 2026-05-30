# I8 Cloze Analysis — Grill Decisions

Source: PM grill with the owner (出题人), 2026-05-30. These are the locked
product/teaching decisions behind `cloze-analysis-v1.contract.md`. Recorded here
rather than in `docs/adr/` because, like seven-choices, the teaching taxonomy
lives in the cut's contract/decisions docs by repo convention.

## Why a new model (not a copy of seven-choices)

Cloze tests word-level choice among four near-synonymous, same-POS options;
seven-choices tests sentence-level discourse cohesion. The solving vocabulary
differs, so `cloze.*` is a fresh facet tree, not a rename of `seven-choices.*`.

## The teaching model (from the owner, verbatim intent)

- **Universal axis: Collocation Fit (搭配合理).** Every blank's first test. Its
  concrete form is POS-dependent (verb: who acts / who receives; noun: which
  adjective modifies / which verb governs; adjective: how it modifies the
  subject's state / the noun; adverb: how it modifies sentence/adj/verb).
- **POS Signature (词性特有考点), optional locking move:** verb→action sequence;
  noun→semantic field; adjective→affective consistency; adverb→affective
  consistency (bound to its adjective); phrase→contextual composition / guess
  meaning from parts (empty out=清空, pull down=拆毁).
- Collocation Fit alone often decides the answer; signature is marked only when
  it genuinely applies — no forced labels.

## Resolved questions

- **Distractor treatment (asymmetric).** Correct option → full *why it fits*.
  Wrong options → only *what the word means in context*, no "why wrong" argument
  (circular). All non-answer options get a gloss.
- **Logical connectors are not a blank type** anymore; a connector in context is
  an evidence signal (`logical-connector`) that steers other blanks.
- **Repetition / synonym echo** is a distinct, cross-POS evidence type
  (`repetition-echo`), not folded into semantic-field.
- **Evidence is highlightable**, ≥1 per blank (the collocation partner);
  passage-side by default; option-internal highlighting only for phrase blanks.
- **Group analysis is light:** overview + affectiveArc only. No discourse units,
  no paragraphId anchoring (cloze is one continuous passage).
- **Identity binds to the I3 cloze model:** blanks keyed by questionId, each
  carrying blankId + blankNo (41–55); options are per-question A–D (not a shared
  option bank).
- **Generation at import time (Option A):** add an `analyze-cloze` leg to the
  paper-import-ai flow, mirroring analyze-seven-choices; publish bundles
  `analyses/cloze-analysis-v1.json`. Already-imported cloze papers are
  re-imported to gain analysis. No post-hoc re-analysis path in I8.
- **No review UI in I8:** generate → write `reviewStatus: reviewed` → shown
  directly. Field reserved for the future.

## Cut split

The seam is placed where the JSON is generated and validated:

- **I8-cloze-analysis (this cut):** contract + facets + prompt + analyzeCloze +
  import wiring + package + verifier. Validated empirically by running on real
  papers and the owner reading the output.
- **I9-cloze-analysis-surface:** render in PaperSurface (focus-per-blank, reuse
  the right analysis pad + clue highlight) + completeness-gated `完形解析` entry.

Rationale: the contract is validated by *running* it on real papers, so
contract→prompt→analyze is one uninterrupted iteration loop; the render layer
depends on a stable JSON contract and is verified differently (browser QA), so
it is the natural second cut. This is task refinement per the owner's
"把大的拆成小的" principle, not fragmentation for its own sake.
