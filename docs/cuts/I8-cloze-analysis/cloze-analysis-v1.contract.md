# Cloze Analysis V1 Contract

Cut: I8 完形填空 reviewed-analysis contract
Last synced: 2026-05-30

This document defines the intended reviewed-analysis JSON shape for 完形填空
(cloze). It is a contract, not yet a JSON Schema, TypeScript runtime type,
validator, or prompt. The I8 `analyzeCloze.mjs` validator and
`prompts/cloze-analysis-v1.md` are built FROM this contract.

It parallels `seven-choices-analysis-v1` but encodes a different teaching model,
because cloze tests word-level choice among four near-options, not sentence-level
discourse cohesion.

## Purpose

`cloze-analysis-v1` records reviewed teacher-facing analysis for the 15 blanks
(q41–q55) of one standard 高考完形填空 section. For each blank it explains why the
correct option fits and what each distractor means in context.

The file is for reviewed analysis. `answer-key.json` remains the answer
authority.

## Teaching Model (read before the shape)

Every blank is solved on two axes, plus a highlightable evidence layer.

**Axis 1 — Collocation Fit (搭配合理).** Universal. Every blank's first test is
whether the option forms a reasonable collocation in its sentence. This axis IS
the distractor-discrimination work: options that do not collocate are eliminated.
Its concrete form depends on part of speech (who performs/receives a verb's
action; which adjective/verb a noun pairs with; what an adjective/adverb
modifies).

**Axis 2 — POS Signature (词性特有考点).** Optional. When collocation alone does
not lock the answer, a part-of-speech-specific test point does:

| POS | Signature test point |
| --- | --- |
| verb | action sequence (动作顺序) |
| noun | semantic field (语义场 / 话题词呼应) |
| adjective | affective consistency (情感态度与上下文一致) |
| adverb | affective consistency (与所修饰形容词绑定) |
| phrase | contextual composition (语境合成义，可猜词，如 empty out=清空) |

Many blanks are solved by Collocation Fit alone — only mark a signature when one
genuinely applies. Do not force one.

**Evidence layer (highlightable).** Concrete, exact passage substrings that prove
the reasoning, so the render can highlight them. See [Evidence](#evidence).

**Asymmetric option treatment.** The correct option gets a full *why-it-fits*
reason. Distractors get only a *what-it-means-in-context* gloss — never a
"why-wrong" argument (that tends to be circular; the gloss lets the student see
the mismatch themselves).

**Logical connectors are not a blank type.** Modern 高考 no longer tests choosing
a connector. A connector in surrounding text is a *context signal* that steers
other blanks — it lives in the evidence layer (`logical-connector`), never as a
POS or signature.

## Top-Level Shape

```json
{
  "schemaVersion": "cloze-analysis-v1",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-...cloze"],
  "meta": {
    "generatedBy": "external-ai",
    "model": "...",
    "promptVersion": "cloze-analysis-v1",
    "reviewStatus": "reviewed",
    "reviewedBy": "...",
    "reviewedAt": "2026-05-30"
  },
  "groups": {
    "group-...cloze": {}
  },
  "blanks": {
    "q-...-041": {}
  }
}
```

- `targetGroups` MUST contain exactly the one cloze group id.
- `groups` is keyed by groupId (group-level overview).
- `blanks` is keyed by **questionId** (q-…). Each blank carries its `blankId`
  and `blankNo`. (In cloze a blank and its question map one to one.)
- `reviewStatus` is retained for a future review flow; I8 writes `reviewed`
  directly and ships no review UI.

## Group Analysis

Each target group carries a light overview only. Cloze is one continuous
passage, so there is **no** discourse-unit decomposition and **no** paragraphId
anchoring at group level (unlike seven-choices).

```json
{
  "overview": "中文：文章主旨 + 文体（记叙文 / 夹叙夹议）",
  "affectiveArc": "中文：情感主线或故事走向（如先抑后扬），供情感一致类空参照"
}
```

`overview` is required. `affectiveArc` is required (1–2 sentences); it anchors
the affective-consistency signature for adjective/adverb blanks.

## Blank Analysis

Each `blanks[questionId]` analyzes one cloze blank.

```json
{
  "blankId": "blank-...-041",
  "blankNo": 41,
  "pos": "verb",
  "signatureFacet": "cloze.signature.verb.action-sequence",
  "correctFit": {
    "optionLabel": "C",
    "reason": "中文：为什么对——搭配合理（施受/修饰关系）+ 特有考点怎样锁定"
  },
  "distractorGlosses": [
    { "optionLabel": "A", "optionText": "glance", "meaning": "中文：该词在此语境的意思（瞥一眼，与持续观察的语境不符）" },
    { "optionLabel": "B", "optionText": "...", "meaning": "中文：词义" },
    { "optionLabel": "D", "optionText": "...", "meaning": "中文：词义" }
  ],
  "evidence": [
    {
      "type": "collocation-partner",
      "signalText": "the house",
      "signalSide": "context-after",
      "targetText": "pulled down",
      "relation": "中文：pull down 的宾语是 the house，施受关系成立。"
    }
  ],
  "teachingNote": "中文一句：可迁移的解题动作。"
}
```

## Required Fields

For each blank:

- `blankId`
- `blankNo`
- `pos`
- `correctFit` (with `reason`; `optionLabel` recommended for readability)
- `distractorGlosses`
- `evidence` (at least one)
- `teachingNote`

`signatureFacet` is **optional** — present only when a POS signature genuinely
applies. Collocation-Fit-only blanks omit it.

## POS Axis

`pos` is exactly one of:

- `verb`
- `noun`
- `adjective`
- `adverb`
- `phrase`
- `other`

`other` is an escape hatch for a rare blank (e.g. preposition, pronoun) and runs
the Collocation-Fit axis only; do not assign it a signature.

## Signature Facets

When marked, `signatureFacet` MUST be one of these leaf keys:

- `cloze.signature.verb.action-sequence`
- `cloze.signature.noun.semantic-field`
- `cloze.signature.adjective.affective-consistency`
- `cloze.signature.adverb.affective-consistency`
- `cloze.signature.phrase.contextual-composition`

The signature's POS prefix MUST match the blank's `pos` (a `verb` blank may only
take `cloze.signature.verb.*`). `other` blanks take no signature.

## Correct Fit

`correctFit.reason` is 1–3 Chinese sentences. It MUST explain the collocation
that makes the option fit, and, when `signatureFacet` is set, how that signature
locks the answer. `correctFit.optionLabel`, when present, MUST equal the blank's
answer key (`answer-key.json` stays authoritative; a mismatch blocks).

## Distractor Glosses

`distractorGlosses` gives, for each non-answer option, a short Chinese gloss of
what that option *means in this context*. It does NOT argue why the option is
wrong.

- One entry per distractor. A standard cloze blank has three (the A–D options
  minus the answer).
- Each entry: `optionLabel`, `optionText`, `meaning` (中文).
- Keep `meaning` to one short clause. The student infers the mismatch.

## Evidence

`evidence` records concrete, highlightable signals that prove the reasoning.

Closed vocabulary of `type`:

| `type` | what it highlights |
| --- | --- |
| `collocation-partner` | the collocating partner word (a verb's subject/object, a noun's modifier, etc.) |
| `repetition-echo` | a same-word / synonym / antonym echo elsewhere that anchors the answer |
| `semantic-field` | a topic-field partner word (the noun semantic-field signature) |
| `affective-cue` | a word that sets the emotional tone (the affective-consistency signature) |
| `logical-connector` | a transition / cause word in context that steers the choice |

Each evidence item:

```json
{
  "type": "collocation-partner",
  "signalText": "exact passage substring",
  "signalSide": "context-before",
  "targetText": "optional connected phrase",
  "relation": "中文：这个词如何指向答案"
}
```

Rules:

- **At least one** evidence item per blank: the `collocation-partner` that proves
  the correct option's Collocation Fit. Other types are added only when they
  genuinely apply — do not pad.
- `signalText` MUST be an exact substring of its source.
- `signalText` MUST NOT include a blank marker (`__41__` and the like); quote
  the surrounding words, not the gap token.
- `signalSide` is `context-before`, `context-after`, `stem`, or `option`.
- Context-side / stem signals MUST appear in the cloze passage text (or the
  question stem); `option` signals MUST appear in one of that blank's A–D
  options.
- `option`-side highlighting is **primarily** for **phrase** blanks, to
  decompose the phrase (e.g. highlight `empty` and `out` separately) alongside a
  `contextual-composition` signature. Other POS blanks may use an `option`
  signal only when a compound/collocation option word genuinely needs internal
  decomposition; default to highlighting in the passage. The validator allows
  `option` signals for any POS (it cannot judge intent); the prompt steers the
  phrase-first convention.
- Prefer short `signalText` chunks (1–8 English words). Use `targetText` for the
  larger connected object.

## Terminology

- `pos`: the part of speech of the blank's options.
- Collocation Fit (搭配合理): the universal axis — does the option collocate.
- POS Signature (词性特有考点): the optional locking test point for the blank's POS.
- `correctFit`: why the answer fits.
- `distractorGlosses`: what each wrong option means in context (not why wrong).
- `evidence`: exact, highlightable passage/option substrings proving the choice.
- `teachingNote`: the transferable solving move, one Chinese sentence.

Do not introduce "context clue" / "上下文线索" as a formal term; name the precise
evidence `type` instead.

## Validation Rules (for the analyzeCloze.mjs validator)

- `schemaVersion === 'cloze-analysis-v1'`; `paperId` matches; `sourceAssetVersion >= 1`.
- `targetGroups` is exactly `[clozeGroupId]`.
- `blanks` keys exactly equal the cloze group's 15 questionIds.
- Each blank has all required fields above; `signatureFacet`, when present, is a
  valid leaf whose POS prefix matches `pos`.
- Each blank has ≥1 evidence item including ≥1 `collocation-partner`.
- Every `evidence.signalText` passes the exact-substring rule for its
  `signalSide` (passage/stem for context/stem; the blank's options for `option`).
- `correctFit.optionLabel`, when present, equals the blank's answer key; a
  mismatch is a non-retryable blocking error (do not silently overwrite the
  authoritative answer).
- `distractorGlosses` covers each non-answer option of the blank.

## Strictly Out Of Scope For I8

- JSON Schema files (`schemas/**` unchanged).
- The render surface and entry gate (those are I9-cloze-analysis-surface).
- Post-hoc re-analysis of already-published assets (I8 generates at import time).
- A review UI / review workflow (the `reviewStatus` field is reserved only).
- Grammar-cloze / 语法填空 analysis.
- Any change to `paper-asset-v1` or the I3 cloze group model.
