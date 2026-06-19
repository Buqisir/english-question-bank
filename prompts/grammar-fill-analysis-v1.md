# Grammar-Fill Analysis Prompt — V1

## Purpose

Produce a reviewed-analysis JSON object for 高考英语语法填空 (grammar fill) groups (q56–q65, 10 blanks, no A–D options).

This is an API response task, not a chat answer, not a research report, and not a free-form explanation.

## Output Requirement

You MUST return exactly one JSON object as plain text in this API response.
The first non-whitespace character MUST be `{` and the final non-whitespace character MUST be `}`.

Do NOT create or download a file.
Do NOT return `UNABLE_TO_CREATE_FILE`.
Do NOT wrap JSON in markdown fences.
Do NOT write a filename heading.
Do NOT write "Here is the JSON".
Do NOT explain what you are doing.

## Reasoning Rule

Reason carefully internally about:

- each blank's `blankType`: `given` (has a hint word in parentheses) or `no-hint` (no hint)
- for `given` blanks: what POS is the hint word → which `given` sub-facet → what form does the blank need
- for `no-hint` blanks: what functional word is missing (preposition / article / pronoun / conjunction)
- the syntactic trigger words in the passage that prove the answer (evidence)
- exact field names and enum values
- the `role` and `path` for non-finite verb blanks only

But output only the JSON object.

Priority order:

1. JSON structure and enum values must be valid.
2. `evidence.signalText` must be an exact substring of the passage.
3. `answer` must equal the answer key.
4. Chinese explanation quality comes after structure and signal accuracy.

If you are unsure, preserve valid structure and exact signal text first.

## Teaching Model

Every blank is solved by identifying its **考点 (facet)** and applying the **static solving framework** for that facet.

Two blank families (primary axis):

- **`given`** 有提示词：the hint word's POS is the gate into the `given` sub-branch; the answer is a **form-change** of the hint (tense / non-finite form / POS derivation …).
- **`no-hint`** 无提示词：the answer is a **function word** to be supplied (article / preposition / conjunction / pronoun).

### `given` sub-branch selection rule

The hint word's POS = entry into which `given` sub-facet:

| Hint POS | Default facet | Exception |
| --- | --- | --- |
| verb (原形) | `given.verb` → then N+1 判谓/非谓（分词 `-ed`/`-ing` 作表/定/状/宾补 → `non-finite` + `role`） | blank needs noun → `verb-to-noun`；blank needs a **non-participle** adjective (`-able`/`-ous`/`-ful`/`-ive`, `a-`) → `verb-to-adj` |
| noun | `given.noun` | if blank needs a different POS → `given.derivation.*` |
| adjective | `given.adjective` | if blank needs a different POS → `given.derivation.*` |
| pronoun | `given.pronoun` | — |
| numeral | `given.numeral` | — |

**Derivation exception (PO-confirmed):** when the blank needs a POS different from the hint's POS, use `grammar-fill.given.derivation.*`:
- `noun-to-adj`: hint is noun, blank needs adjective
- `verb-to-noun`: hint is verb, blank needs noun
- `verb-to-adj`: hint is verb, blank needs a **non-participle** adjective derived by a true adjective suffix (`-able`/`-ous`/`-ful`/`-ive`) or the `a-` prefix (remark→remarkable / harm→harmful / sleep→asleep). 分词 `-ed`/`-ing` 不入此叶 — see 判定口令 below.
- `adjective-to-noun`: hint is adjective, blank needs noun (介词后 / 缺主宾 / 限定词后 → 名词；常见后缀 `-ity` curious→curiosity / `-ness` happy→happiness / `-ce` confident→confidence / `-ment`)

**判定口令（given 动词 + 答案是 `-ed`/`-ing` → 句法功能优先）:** 先判该空的句法 **role**（表语 predicative / 定语 attributive / 状语 adverbial / 宾补 object-complement / 主补 subject-complement）→ 归 `grammar-fill.given.verb.non-finite` + `role`。**只有**答案是非分词形容词后缀（`-able`/`-ous`/`-ful`/`-ive`）或 `a-` 前缀派生时，才用 `grammar-fill.given.derivation.verb-to-adj`。即情感/状态分词 `excited`（was excited）/ `educated`（become educated）/ `closed`（stays closed）作表语、`aching`/`existing`/`recognized` 作定语、`astonished`（leaving us ~）作宾补，一律是 `non-finite` + `role`，**不是** `verb-to-adj`。

**Adjective → adverb:** this is the `grammar-fill.given.adjective` facet's primary action (变副词), NOT `derivation`.

### `given.verb` sub-facet: finite vs. non-finite

Use **N+1 rule**: count predicates in the clause. If the verb slot is a predicate slot → `finite`; if already filled → `non-finite`.

- **`grammar-fill.given.verb.finite`** — 谓语动词. Framework: ① find subject (number/person) ② judge voice (active/passive) ③ judge tense (time-marker words lock tense).
- **`grammar-fill.given.verb.non-finite`** — 非谓语动词. Framework: ① judge position → identify syntactic role (`role` field) ② fast-path (subject/object/predicative/object-complement: fixed collocation/pattern locks one table row → judge voice only) or slow-path (attributive/adverbial: test `to-inf` condition first → if met, judge voice; else remove `to-inf` row → judge voice ± aspect).

### `role` and `path` (non-finite only)

For **`grammar-fill.given.verb.non-finite`**, add:

- `role` ∈ `subject` / `predicative` / `object` / `attributive` / `adverbial` / `object-complement` / `subject-complement`
- `path` ∈ `fast` (fixed collocation/situation directly locks one row) / `slow` (walk the table: test to-inf first, then voice, then aspect)

For every other facet: `"role": null, "path": null`.

### `no-hint` sub-branch selection rule

| Position / signal | Facet |
| --- | --- |
| Introduces a new predicate (new 主谓) → subordinating or coordinating conjunction | `no-hint.conjunction.*` |
| Connects equal elements, no new predicate | `no-hint.conjunction.coordinating` |
| Before a noun, limits it | `no-hint.article` |
| After a verb/adjective or collocates → prepositional phrase (no new predicate) | `no-hint.preposition` |
| Pronoun position (subject/object), anaphora / formal-subject / it-cleft | `no-hint.pronoun` |

**Conjunction sub-type (4 leaves):**

- `coordinating` — connects parallel elements (no subordination)
- `relative-clause` — preceded by antecedent noun/pronoun; clause modifies it; use `who/whom/which/that/whose/when/where/why`
- `noun-clause` — clause fills a noun slot (subject/object/predicative); no antecedent; use `what/whether/if/that/how/when/where/why`
- `adverbial-clause` — both clauses are structurally complete; clause modifies the main clause; use time/reason/condition/concession/result connectors: `when/while/as/because/since/if/unless/although/though/so that/…`

## Required Top-Level Shape

```json
{
  "schemaVersion": "grammar-fill-analysis-v1",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-...-grammar-fill"],
  "meta": {
    "generatedBy": "external-ai",
    "promptVersion": "grammar-fill-analysis-v1",
    "reviewStatus": "reviewed"
  },
  "groups": {
    "group-...-grammar-fill": {
      "overview": "中文：文章主旨 + 文体（1 句，供个别题的语境参照）"
    }
  },
  "blanks": {
    "q-...-056": {}
  }
}
```

Do NOT fill `meta.model`, `meta.reviewedBy`, or `meta.reviewedAt` — the server stamps real provenance after generation. Emit `meta` only as shown above (`generatedBy`, `promptVersion`, `reviewStatus`).

`targetGroups` MUST be exactly the one grammar-fill groupId from the input.

## Required Fields Per Blank

Every `blanks[questionId]` MUST include:

- `blankId` — exact blankId from the input
- `blankNo` — integer blank number (56–65)
- `blankType` — exactly `given` or `no-hint` (from input)
- `hint` — the given base word (string) for `given` blanks; `null` for `no-hint` blanks (from input)
- `facetKey` — exactly one of the **17 leaf** keys listed below
- `answer` — the produced form/word; MUST equal the answer key
- `role` — required string iff `facetKey === "grammar-fill.given.verb.non-finite"` else `null`
- `path` — required string iff `facetKey === "grammar-fill.given.verb.non-finite"` else `null`
- `reason` — 中文 1–3 句：代入该考点框架到本空（认主语/时态/触发词/搭配…）
- `evidence` — array with ≥1 item
- `teachingNote` — 中文一句：可迁移的解题动作

## The 17 Valid `facetKey` Leaves

Use ONLY these exact string values. Do NOT use parent nodes (`grammar-fill`, `grammar-fill.given`, `grammar-fill.given.verb`, `grammar-fill.given.derivation`, `grammar-fill.no-hint`, `grammar-fill.no-hint.conjunction`) — they are NOT valid facetKeys.

```
grammar-fill.given.verb.finite
grammar-fill.given.verb.non-finite
grammar-fill.given.noun
grammar-fill.given.adjective
grammar-fill.given.derivation.noun-to-adj
grammar-fill.given.derivation.verb-to-noun
grammar-fill.given.derivation.verb-to-adj
grammar-fill.given.derivation.adjective-to-noun
grammar-fill.given.pronoun
grammar-fill.given.numeral
grammar-fill.no-hint.preposition
grammar-fill.no-hint.article
grammar-fill.no-hint.pronoun
grammar-fill.no-hint.conjunction.coordinating
grammar-fill.no-hint.conjunction.relative-clause
grammar-fill.no-hint.conjunction.noun-clause
grammar-fill.no-hint.conjunction.adverbial-clause
```

`blank_type` match rule: any `grammar-fill.given.*` leaf MUST go with `blankType: "given"`. Any `grammar-fill.no-hint.*` leaf MUST go with `blankType: "no-hint"`.

## Group Analysis

`groups[groupId]` MUST include:

- `overview` — required; Chinese: main topic + text type (1 sentence)

(Grammar fill reasoning is local/syntactic, so no `affectiveArc` is needed — unlike cloze.)

## Evidence Rules

`evidence` records concrete, highlightable **syntactic trigger** signals — the words in the passage that prove the answer's form or word.

Closed `type` vocabulary — use ONLY these values:

| `type` | What it highlights |
| --- | --- |
| `subject` | 主语（定数/语态/非谓语逻辑主语）|
| `time-marker` | 时间标志词（定时态）|
| `antecedent` | 先行词 / 被指代·被替代的名词（定从、代词、冠词回指）|
| `modified-word` | 被修饰的名词/形容词/动词（非谓语作定语、形容词变副词）|
| `governing-word` | 支配词（宾补谓语动词、接动名词的动词、介词搭配核心）|
| `collocation` | 固定搭配 / 锁行触发（非谓语快路、介词搭配、冠词固定搭配）|
| `comparison` | 比较·对比标志（than / different from → that·those；比较级）|
| `parallel` | 并列结构（并列连词、并列谓语时态呼应）|
| `connector` | 逻辑连接（状语从句的逻辑关系词）|
| `clause-frame` | 从句框架/缺成分位置/强调句框架（三大从句、it-cleft）|
| `of-phrase` | of 短语（冠词"拥有 vs 种类"）|
| `determiner` | 限定词（冠词、名词数）|

Each evidence item:

```json
{
  "type": "subject",
  "signalText": "exact passage substring",
  "signalSide": "passage",
  "relation": "中文：这个词如何指向答案"
}
```

Rules:

- **At least one** evidence item per blank.
- `signalText` MUST be an **exact substring** of the grammar-fill passage text.
- `signalText` MUST NOT include a blank marker (`  56  ` token or `(wear)` hint-token) — quote the surrounding trigger words, not the gap or hint parentheses.
- `signalSide` is always `passage` for grammar fill (no options exist).
- Prefer short `signalText` (1–8 words).

## Answer Authority

`answer` MUST equal the blank's answer key. The answer key for `given` blanks is the inflected/derived form of the hint word. For `no-hint` blanks it is the functional word to fill.

Do NOT guess or invent. Write the exact form you determined from your syntactic analysis.

## Strictly Forbidden

- Do NOT output chat JSON or markdown.
- Do NOT invent blank IDs, question IDs, or group IDs.
- Do NOT use parent facet keys (`grammar-fill`, `grammar-fill.given`, `grammar-fill.given.verb`, `grammar-fill.given.derivation`, `grammar-fill.no-hint`, `grammar-fill.no-hint.conjunction`).
- Do NOT include `role` or `path` for any facet other than `grammar-fill.given.verb.non-finite`.
- Do NOT include a blank marker (`  56  ` or `(wear)` token) in any `signalText`.
- Do NOT add `distractorGlosses` (grammar fill has no A–D options).
- Do NOT add `affectiveArc` to the group analysis (grammar fill, unlike cloze, is syntactic).
- Do NOT overwrite or contradict the authoritative answer key.
- Do NOT omit `evidence`.
- Do NOT report `meta.model`, `meta.reviewedBy`, or `meta.reviewedAt` — the server stamps these.
