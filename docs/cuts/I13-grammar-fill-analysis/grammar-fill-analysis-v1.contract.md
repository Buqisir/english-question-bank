# Grammar-Fill Analysis V1 Contract

Cut: I13 语法填空 reviewed-analysis contract
Last synced: 2026-05-31 (draft — PM 小川, from the aligned facet KB)

This document defines the intended reviewed-analysis JSON shape for 语法填空
(grammar fill). It is a contract, not yet a JSON Schema, runtime type, validator,
or prompt. The future `analyzeGrammarFill.mjs` validator and
`prompts/grammar-fill-analysis-v1.md` are built FROM this contract.

It parallels `cloze-analysis-v1` in file role, but encodes a **different teaching
model**: grammar fill has **no A–D options** — each blank produces a *form/word*,
not a choice among distractors. So there are **no `distractorGlosses`**. Instead
each blank names a **考点 (facet)** and shows the AI's **代入 (application)** of
that facet's *static* solving framework, plus highlightable **evidence**.

## Teaching Model (read before the shape)

Authority for the考点 framework is the **static facet KB**
`docs/cuts/I13-grammar-fill-analysis/grammar-fill-facets-v1.md` (PO 黄学伟's
teaching IP). Architecture decision (locked):

- The **solving framework per考点 is STATIC** (in the facet KB), **not
  AI-generated** → zero hallucination of method.
- The AI does only three things per blank: ① assign the **`facetKey`**;
  ② **代入** — apply that facet's framework to *this* blank (identify the subject /
  tense / trigger word …) in `reason`; ③ highlight **`evidence`** (the trigger
  words in the passage).
- The per-blank JSON **references `facetKey`** and does **NOT** duplicate the
  static framework text (DRY; prevents the AI restating/garbling the method). A
  separate machine-readable facet registry (`grammar-fill-facets-v1.json`,
  derived from the KB) resolves `facetKey → framework` for the render — see Out
  Of Scope.

Two blank families (the facet KB's primary axis):

- **`given`** 有提示词：提示词词性是进入哪条考点分支的总闸；答案是提示词的**形变**
  （时态/非谓语/词性转换…）。
- **`no-hint`** 无提示词：答案是补出的**功能词**（冠词/介词/连词/代词…）。

## Top-Level Shape

```json
{
  "schemaVersion": "grammar-fill-analysis-v1",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-...-grammar-fill"],
  "meta": {
    "generatedBy": "external-ai",
    "model": "...",
    "promptVersion": "grammar-fill-analysis-v1",
    "reviewStatus": "reviewed",
    "reviewedBy": "",
    "reviewedAt": "2026-05-31"
  },
  "groups": { "group-...-grammar-fill": {} },
  "blanks": { "q-...-056": {} }
}
```

- `targetGroups` MUST be exactly the one grammar-fill group id.
- `groups` keyed by groupId (light overview).
- `blanks` keyed by **questionId** (q-…). Grammar fill has 10 blanks q56–q65; a
  blank and its question map one-to-one.
- **`meta` provenance is server-stamped, not AI-supplied** (same rule as cloze):
  the analyze module overwrites `meta` with authoritative values; the model must
  NOT self-report `model` / `reviewedAt` / `reviewedBy`.

## Group Analysis

Light context only (grammar-fill reasoning is local/syntactic, not passage-mood
driven like cloze — no `affectiveArc`).

```json
{ "overview": "中文：文章主旨 + 文体（1 句，供个别题的语境参照）" }
```

`overview` is required (1 sentence).

## Blank Analysis

Each `blanks[questionId]` analyzes one grammar-fill blank.

```json
{
  "blankId": "blank-...-056",
  "blankNo": 56,
  "blankType": "given",
  "hint": "wear",
  "facetKey": "grammar-fill.given.verb.finite",
  "answer": "wore",
  "role": null,
  "path": null,
  "reason": "中文：把该考点的框架代入本空——一找主语 he(单数) 缺谓语；二判语态 主动；三判时态 时间标志 Yesterday→一般过去；∴ wear→wore。",
  "evidence": [
    { "type": "subject", "signalText": "he", "signalSide": "passage", "relation": "中文：主语，定数与语态" },
    { "type": "time-marker", "signalText": "Yesterday", "signalSide": "passage", "relation": "中文：时间标志→一般过去时" }
  ],
  "teachingNote": "中文一句：可迁移的解题动作。"
}
```

For `no-hint`, `hint` is `null`:

```json
{
  "blankId": "...", "blankNo": 60, "blankType": "no-hint", "hint": null,
  "facetKey": "grammar-fill.no-hint.article", "answer": "a",
  "role": null, "path": null,
  "reason": "中文：of dressing 是'种类'(改不成 dressing's way)→泛指；且 a new way 首次引入→a。",
  "evidence": [
    { "type": "of-phrase", "signalText": "of dressing", "signalSide": "passage", "relation": "中文：种类(非拥有)→泛指→a" }
  ],
  "teachingNote": "中文一句。"
}
```

## Required Fields (per blank)

- `blankId`, `blankNo`
- `blankType` — `given` | `no-hint`
- `hint` — given base word (string) for `given`; `null` for `no-hint`
- `facetKey` — a valid leaf in `grammar-fill-facets-v1` (see Facet Reference)
- `answer` — the produced form/word; MUST equal the answer key
- `reason` — 中文 1–3 句：the 代入 of the facet framework to this blank
- `evidence` — ≥1 item
- `teachingNote` — 中文一句

Optional / conditional:

- `role`, `path` — present ONLY for `grammar-fill.given.verb.non-finite` (see below);
  `null` otherwise.

## Facet Reference

`facetKey` MUST be one of the **16 leaf** keys defined in `grammar-fill-facets-v1.md`,
namespace `grammar-fill.*`, ≤ 4 levels. The validator checks membership against
the facet registry; it does NOT re-derive the framework. The leaf's
`blank_type` MUST match the blank's `blankType`
(`grammar-fill.given.*` ⇔ `given`; `grammar-fill.no-hint.*` ⇔ `no-hint`).

The 16 leaves: given.verb.finite, given.verb.non-finite, given.noun, given.adjective,
given.derivation.{noun-to-adj, verb-to-noun, verb-to-adj}, given.pronoun, given.numeral,
no-hint.preposition, no-hint.article, no-hint.pronoun,
no-hint.conjunction.{coordinating, relative-clause, noun-clause, adverbial-clause}.
**Parent nodes** (`grammar-fill`, `.given`, `.given.verb`, `.given.derivation`, `.no-hint`,
`.no-hint.conjunction`) are **NOT valid `facetKey`s** — the validator rejects a parent used as a leaf.

## `role` / `path` (non-finite only)

For `grammar-fill.given.verb.non-finite`, the成分 is the solving pivot, so it is
structured:

- `role` ∈ `subject` 主语 / `predicative` 表语 / `object` 宾语 / `attributive` 定语 /
  `adverbial` 状语 / `object-complement` 宾补 / `subject-complement` 主补.
- `path` ∈ `fast` 快路（搭配/情形直接锁形变表某行 → 只判主被动）/ `slow` 慢路
  （定语·状语：先测不定式作定/状语，否则淘汰该行 → 主被动 → 进行/完成）.

Both `null` for every other facet.

## Evidence

`evidence` records concrete, highlightable **syntactic trigger** signals (grammar
fill highlights the words that *trigger the rule*, not distractor partners).

Closed vocabulary of `type`:

| `type` | what it highlights |
| --- | --- |
| `subject` | 主语（定数 / 语态 / 非谓语逻辑主语）|
| `time-marker` | 时间标志词（定时态）|
| `antecedent` | 先行词 / 被指代·被替代的名词（定从、代词、冠词回指）|
| `modified-word` | 被修饰的名词/形容词/动词（非谓语作定语、形容词变副词）|
| `governing-word` | 支配词（宾补的谓语动词、接动名词的动词、介词搭配核心）|
| `collocation` | 固定搭配 / 锁行触发（非谓语快路、介词搭配、冠词固定搭配）|
| `comparison` | 比较·对比标志（than / different from / similar to → that·those；比较级）|
| `parallel` | 并列结构（并列连词、并列谓语时态呼应）|
| `connector` | 逻辑连接（状语从句的逻辑关系词）|
| `clause-frame` | 从句框架 / 缺成分位置 / 强调句框架 It…that（三大从句、it-cleft）|
| `of-phrase` | of 短语（冠词"拥有 vs 种类"）|
| `determiner` | 限定词（冠词、名词数）|

Each evidence item:

```json
{ "type": "subject", "signalText": "exact passage substring", "signalSide": "passage", "relation": "中文：这个词如何指向答案" }
```

Rules:

- **At least one** evidence item per blank: the trigger that proves the answer's form/word.
- `signalText` MUST be an **exact substring** of the grammar-fill passage text.
- `signalText` MUST NOT include a blank marker (`  56  ` / `(wear)` token) — quote the
  surrounding trigger words, not the gap.
- `signalSide` is `passage` (the grammar-fill passage) or `stem` (rare). Grammar fill has no
  options, so there is no `option` side.
- Prefer short `signalText` chunks (1–8 words).

## Answer Authority

`answer` MUST equal the blank's answer key (`answer-key.json` stays authoritative). The
comparison is a **CLOSED, FROZEN normalization — exactly four ops**: (1) trim; (2) collapse
internal whitespace; (3) lowercase; (4) split the answer key on `/` into branches. The AI
`answer` matches iff its normalized form equals **any** normalized branch. Multi-word answers
(`were worn`) are first-class.

**FORBIDDEN** (wrong-accept hazard): NO punctuation-strip, NO stemming/lemmatization, NO
edit-distance/fuzzy — those would let `worn` pass for `wore`. A genuine mismatch is a
**non-retryable blocking error** — do not silently overwrite the answer. (Mirrors cloze's
`optionLabel` check, but free-text instead of a letter.)

## Validation Rules (for analyzeGrammarFill.mjs)

- `schemaVersion === 'grammar-fill-analysis-v1'`; `paperId` matches; `sourceAssetVersion >= 1`.
- `targetGroups` is exactly `[grammarFillGroupId]`.
- `blanks` keys exactly equal the grammar-fill group's 10 questionIds (q56–q65).
- Each blank has all required fields; `blankType` ∈ {given, no-hint};
  `hint` is a non-empty string iff `given`, `null` iff `no-hint`.
- `facetKey` is a valid **leaf** (one of the 16) in the facet registry; a **parent node is
  rejected**; its `blank_type` matches `blankType`.
- `role`/`path` present (valid enum) iff `facetKey === grammar-fill.given.verb.non-finite`;
  `null` otherwise.
- `answer` matches the answer key under the **frozen 4-op normalization** (trim / collapse-ws /
  lowercase / split-`/`); no other normalization. Genuine mismatch = non-retryable blocking error.
- `evidence` has ≥1 item; every `signalText` passes the exact-substring rule for its
  `signalSide` and contains no blank marker.
- `overview` present and non-empty.

## Strictly Out Of Scope For I13 slice 1 (generation)

- JSON Schema files (`schemas/**` unchanged).
- The render surface and entry gate (a later I9-style slice).
- The machine-readable facet registry `grammar-fill-facets-v1.json` (facetKey → framework)
  **if** it is deferred to the render slice — decide in plan.md. Slice 1 may ship a minimal
  registry of valid leaf keys for validation only (membership check), without framework bodies.
- A review UI / review workflow (`reviewStatus` reserved only).
- Post-hoc re-analysis of already-published assets (generate at import time).
- Any change to `paper-asset-v1` or the grammar-fill group model (docxSplitter q56–q65 shape).

## ⚠️ Render-slice Follow-up Gate (CR 2026-05-31 — MUST resolve before render ships)

`evidence.signalText` is validated (slice 1) against the **parse-time** passage bytes
(`normalizePassageText`, `analyzeGrammarFill.mjs`), but the **stored** grammar-fill passage gets
an **extra** `normalizeGrammarFillText` pass at publish (`packageBuilder.mjs:~525`). So a stored
`signalText` may NOT be an exact substring of the stored passage. Inert now (slice 1 ships no
render / no consumer). **The render slice MUST** either (a) validate evidence against the
**stored/published** bytes, or (b) highlight with a normalization-tolerant match — else the
grammar-fill evidence highlight silently fails (the I11 plain-`indexOf`, no-fuzzy-fallback failure
mode). Add a verifier fixture whose passage actually changes under `normalizeGrammarFillText`.
