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
- the shortest complete sentence skeleton that shows why this slot needs this form
- a nearby parallel, paired, referential, or tense structure that can verify the judgment when one exists
- exact field names and enum values
- the `role` and `path` for non-finite verb blanks only
- the controlled `similarityProfile.route` and any applicable `features`

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
| verb (原形) | `given.verb` → then N+1 判谓/非谓（分词 `-ed`/`-ing` 作表/定/状/宾补/主补 → `non-finite` + `role`） | blank needs noun → `conversion.verb-to-noun`；blank needs a **non-participle** adjective (`-able`/`-ous`/`-ful`/`-ive`, `a-`) → `conversion.verb-to-adjective`；blank needs an adverb → `conversion.verb-to-adverb` |
| noun | genitive (`'s`) → `given.noun.genitive`；regular plural of the hint → `given.noun.number` | blank needs a different POS or a same-POS derived word (e.g. occupational `-er`/`-or`) → `given.conversion.noun-to-noun` / `noun-to-adjective` / `noun-to-verb` |
| adjective | comparative/superlative of the hint → `given.adjective.comparison` | blank needs an adverb (`-ly`) → `given.conversion.adjective-to-adverb`；blank needs a noun → `given.conversion.adjective-to-noun` |
| pronoun | `given.pronoun` | — |
| numeral | `given.numeral` | — |

**词形转换（`given.conversion.<src>-to-<dst>`, 2026-07-15 owner 拍板"词性转换"→"词形转换"重铸，方向矩阵制，8 向）：** use ONLY when the blank's POS genuinely differs from the hint's POS (or, for `noun-to-noun`, is a same-POS derived word) — NOT when it's the hint's own inflection (plural/genitive/comparison/finite-tense/non-finite-role, all of which have their own dedicated facet above):
- `noun-to-noun`: hint is noun, blank is a different noun derived from it (e.g. occupational suffix `-er`/`-or`: photograph→photographer)
- `noun-to-adjective`: hint is noun, blank needs an adjective
- `noun-to-verb`: hint is noun, blank needs a verb
- `adjective-to-adverb`: hint is adjective, blank needs an adverb (`-ly`)
- `adjective-to-noun`: hint is adjective, blank needs a noun (介词后 / 缺主宾 / 限定词后 → 名词；常见后缀 `-ity`/`-ty` curious→curiosity, `-ness` happy→happiness, `-ce`/`-cy` confident→confidence／accurate→accuracy, `-ment`)
- `verb-to-adjective`: hint is verb, blank needs a **non-participle** adjective derived by a true adjective suffix (`-able`/`-ous`/`-ful`/`-ive`) or the `a-` prefix (remark→remarkable / harm→harmful / sleep→asleep). 分词 `-ed`/`-ing` 不入此叶 — see 判定口令 below.
- `verb-to-noun`: hint is verb, blank needs a noun
- `verb-to-adverb`: hint is verb, blank needs an adverb

**判定口令（given 动词 + 答案是 `-ed`/`-ing` → 句法功能优先）:** 先判该空的句法 **role**（表语 predicative / 定语 attributive / 状语 adverbial / 宾补 object-complement / 主补 subject-complement，见下"成分七格"）→ 归 `grammar-fill.given.verb.non-finite` + `role`。**只有**答案是非分词形容词后缀（`-able`/`-ous`/`-ful`/`-ive`）或 `a-` 前缀派生时，才用 `grammar-fill.given.conversion.verb-to-adjective`。即情感/状态分词 `excited`（was excited）/ `educated`（become educated）/ `closed`（stays closed）作表语、`aching`/`existing`/`recognized` 作定语、`astonished`（leaving us ~）作宾补，一律是 `non-finite` + `role`，**不是** `verb-to-adjective`。

**名词的数 / 名词的格 / 形容词比较等级（三个独立考点，非"词形转换"——词性不变，讲评语言是"考复数/考所有格/考比较级"）：**
- `given.noun.number`：hint 的规则单复数变化（含 -y→-ies / -f(e)→-ves 等规则变化）
- `given.noun.genitive`：hint 的所有格（`'s`）
- `given.adjective.comparison`：hint 的比较级/最高级（含不规则 better/worse/further/more/most 等）

### `given.verb` sub-facet: finite vs. non-finite

Use **N+1 rule**: count predicates in the clause. If the verb slot is a predicate slot → `finite`; if already filled → `non-finite`.

- **`grammar-fill.given.verb.finite`** — 谓语动词. Framework: ① find subject (number/person) ② judge voice (active/passive) ③ judge tense (time-marker words lock tense). `tense`/`voice`/`agreementSensitive` are stamped server-side from your `answer`, deterministically — do NOT output them yourself.
- **`grammar-fill.given.verb.non-finite`** — 非谓语动词. Framework: ① judge position → identify syntactic role (`role` field, 成分七格 below) ② fast-path (subject/object/predicative/object-complement/subject-complement: fixed collocation/pattern locks one table row → judge voice only) or slow-path (attributive/adverbial: test `to-inf` condition first → if met, judge voice; else remove `to-inf` row → judge voice ± aspect). `form` (the legacy to-do/doing/done bucket) and the finer `similarityForm` (to-do/to-be-done/to-have-done/doing/being-done/having-done/done) are stamped server-side from your `answer` — do NOT output them yourself.

### `role` and `path` (non-finite only)

For **`grammar-fill.given.verb.non-finite`**, add — **成分七格终稿（2026-07-15 owner 补主补拍板）**:

- `role` ∈ `subject`（主语）/ `predicative`（表语，系动词后）/ `object`（宾语）/ `attributive`（定语）/ `adverbial`（状语）/ `object-complement`（宾语补足语，如 tell sb to do / wait for sth to do）/ `subject-complement`（**主语补足语 = 宾补的被动**，如 be expected to do、be left doing — NOT a synonym for "表语"; a 系动词 + 表语 blank is `predicative`, never `subject-complement`）
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

## Student-Facing Explanation Rule

Facet keys, N+1, fast/slow paths, role enums, and evidence types are internal
classification. Keep them exact in their own fields, but do not use them as the
opening or substance of `reason`, `evidence[].relation`, or `teachingNote`.

Write `reason` by walking the actual sentence:

1. restore the shortest useful skeleton around the gap;
2. state what job the gap performs in that skeleton;
3. derive the required word or form;
4. when useful, verify it with a nearby parallel structure, paired blank,
   antecedent, time relation, or governing word.

Simple blanks may combine these into one sentence. A difficult blank may use up
to three. Do not expand a simple article or preposition blank into a general
grammar lecture, and do not invent distractors for a task with no options.

Prefer concrete wording such as:

```text
句子的主干是 I have found ___ taking on...；find 后缺宾语，而这个宾语仍指
主语 I，所以要用反身代词 myself，不能用只表示普通宾语的 me。
```

Do not stop at:

```text
find oneself doing 是固定搭配。
```

## Required Top-Level Shape

```json
{
  "schemaVersion": "grammar-fill-analysis-v2",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-...-grammar-fill"],
  "meta": {
    "generatedBy": "external-ai",
    "promptVersion": "grammar-fill-analysis-v2",
    "reviewStatus": "reviewed"
  },
  "groups": {
    "group-...-grammar-fill": {
      "overview": "中文：文章主旨 + 文体（1 句，供个别题的语境参照）",
      "fullTranslationZh": "填入正答后的全文中文翻译，每空保留 [56]...[65] 标记",
      "selectedLongSentences": [
        {
          "paragraphId": "para-...",
          "sourceText": "保留 __63__ 等空标的原文精确片段",
          "displayText": "按权威答案补全空格后的同一句",
          "relatedQuestionIds": ["q-...-063", "q-...-064", "q-...-065"],
          "translationZh": "自然中文翻译",
          "analysisZh": "先找主干，再说明并列、修饰等关系",
          "underlineTexts": ["displayText 中 1—3 个唯一精确片段"]
        }
      ]
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
- `facetKey` — exactly one of the **22 leaf** keys listed below
- `answer` — the produced form/word; MUST equal the answer key
- `role` — required string iff `facetKey === "grammar-fill.given.verb.non-finite"` else `null`
- `path` — required string iff `facetKey === "grammar-fill.given.verb.non-finite"` else `null`
- `similarityProfile` — machine-facing matching support, exactly
  `{ "route": "controlled-value", "features": ["controlled-value"] }`; choose
  the route that states **why this answer form is required**, and use only the
  applicable controlled features below (`[]` when none apply)
- `reason` — 中文 1–3 句：还原句子骨架，说明空格职责并推出答案；有相邻
  并列、成对空格或回指关系时，用它作必要验证
- `evidence` — array with ≥1 item
- `teachingNote` — 中文一句：只补充一个可迁移的解题动作，不换术语复述 `reason`

Do NOT output `tense`/`voice`/`agreementSensitive` (finite verb), or `form`/
`similarityForm` (non-finite verb), yourself — the server stamps these
deterministically from `answer` after your response. `similarityProfile` is
different: it records the contextual judgment route and MUST be generated here.

## The 22 Valid `facetKey` Leaves

Use ONLY these exact string values. Do NOT use parent nodes (`grammar-fill`, `grammar-fill.given`, `grammar-fill.given.verb`, `grammar-fill.given.conversion`, `grammar-fill.no-hint`, `grammar-fill.no-hint.conjunction`) — they are NOT valid facetKeys. (The old `grammar-fill.given.noun` / `grammar-fill.given.adjective` / `grammar-fill.given.derivation.*` leaves from v1 are retired — do NOT use them.)

```
grammar-fill.given.verb.finite
grammar-fill.given.verb.non-finite
grammar-fill.given.conversion.noun-to-noun
grammar-fill.given.conversion.noun-to-adjective
grammar-fill.given.conversion.noun-to-verb
grammar-fill.given.conversion.adjective-to-adverb
grammar-fill.given.conversion.adjective-to-noun
grammar-fill.given.conversion.verb-to-adjective
grammar-fill.given.conversion.verb-to-noun
grammar-fill.given.conversion.verb-to-adverb
grammar-fill.given.noun.number
grammar-fill.given.noun.genitive
grammar-fill.given.adjective.comparison
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

## Controlled `similarityProfile`

This object is stored for later similar-question matching. It is not
student-facing prose and must not be mentioned in `reason` or `teachingNote`.
Use one `route` allowed by the blank's `facetKey`; `features` is a unique array
using only the values allowed for that facet. Do not invent labels.

### Verb facets

For `grammar-fill.given.verb.finite`, use one route:

```text
present-stable-description | present-frequency-marker |
past-explicit-time | past-context-cue | past-narrative-chain |
present-perfect-explicit-marker | present-perfect-current-effect |
past-progressive-background | past-perfect-prior-past | modal-passive
```

Use `features: []`. The route must agree with the tense/voice expressed by the
authoritative answer. The server, not you, derives the answer's tense, voice,
and agreement sensitivity.

For `grammar-fill.given.verb.non-finite`, the route MUST start with the exact
`role` value plus `-`:

```text
adverbial-purpose | adverbial-adjective-complement |
adverbial-unexpected-result | adverbial-active | adverbial-passive |
adverbial-prior-active |
attributive-future | attributive-abstract-content |
attributive-special-limiter | attributive-participle |
object-verb-to-infinitive | object-verb-gerund |
object-form-changes-meaning | object-wh-infinitive |
object-preposition | object-but-structure |
subject-direct-gerund | subject-direct-passive-gerund |
subject-infinitive | subject-passive-infinitive |
subject-fixed-gerund-frame |
predicative-nominal-gerund | predicative-nominal-passive-gerund |
predicative-nominal-infinitive | predicative-nominal-passive-infinitive |
predicative-participle-property | predicative-participle-state |
object-complement-general | object-complement-sensory |
object-complement-special | object-complement-with |
object-complement-participle-state |
subject-complement-linking | subject-complement-general-passive |
subject-complement-reporting-passive |
subject-complement-sensory-passive |
subject-complement-special-passive
```

`subject-complement-linking` covers structures such as `seem to have done`;
it is not an adverbial. `subject-complement-reporting-passive` covers
`be said/reported/believed... to do/to have done`.

Allowed non-finite features are:

```text
preposed | postposed | active-relation | passive-relation |
completed-state | ongoing-passive
```

Use them only with `attributive-participle`: select exactly one position
(`preposed`/`postposed`) and one relation (`active-relation`,
`passive-relation`, `completed-state`, or `ongoing-passive`). For every other
non-finite route use `features: []`; the finer answer form is server-derived.

### Given-word non-verb facets

Use the exact route shown. Features are `[]` unless a row explicitly lists
allowed features.

| `facetKey` suffix | Allowed `route` | Allowed `features` |
| --- | --- | --- |
| `conversion.noun-to-noun` | `derived-noun` | — |
| `conversion.noun-to-adjective` | `derived-adjective` | — |
| `conversion.noun-to-verb` | `finite-result` / `non-finite-result` | exactly one inherited finite or non-finite route; see below |
| `conversion.adjective-to-adverb` | `modify-adjective` / `modify-predicate` / `modify-non-finite` / `modify-sentence` / `modify-adverb-number-quantity` | — |
| `conversion.adjective-to-noun` | `derived-noun` | — |
| `conversion.verb-to-adjective` | `true-derived-adjective` | — |
| `conversion.verb-to-noun` | `derived-noun` | — |
| `conversion.verb-to-adverb` | `derived-adverb` | — |
| `noun.number` | `quantity-determiner` / `sentence-number-agreement` / `parallel-structure` / `contextual-multiple-generic` / `countable-sense-shift` | — |
| `noun.genitive` | `genitive` | — |
| `adjective.comparison` | `comparative` / `superlative` | `than-marker`, `degree-modifier`, `parallel-comparative`, `semantic-comparison`, `fixed-comparative-frame`, `explicit-range-unique`, `semantic-superlative` |
| `pronoun` | `object-pronoun` / `possessive-determiner` / `possessive-pronoun` / `reflexive-pronoun` / `one-to-ones` | — |
| `numeral` | `cardinal-to-ordinal` | — |

For `adjective.comparison`, select every genuinely present signal feature and
at least one. Do not count `the` alone as proof of a superlative.

For `conversion.noun-to-verb`, conversion is only the first layer. If the
derived verb is the predicate, use `finite-result` and put exactly one of the
finite judgment routes from the Verb facets section in `features`. If it is
non-finite, use `non-finite-result` and put exactly one of the non-finite routes
from that section in `features`. The server then derives tense/voice/agreement
or the finer answer form from `answer`; do not output those derived fields.

### No-hint facets

| `facetKey` suffix | Allowed `route` | Allowed `features` |
| --- | --- | --- |
| `preposition` | `fixed-collocation` / `contextual-relation` | — |
| `article` | `the-anaphoric` / `the-shared-context` / `the-postmodified-specific` / `the-structural` / `indefinite-first-mention` / `indefinite-identity-category` / `indefinite-structural` | `superlative`, `ordinal`, `one-the-other`, `the-same`, `proper-name-class`, `quantity-proportion`, `adjective-class`, `fixed-the-phrase`, `fixed-indefinite-phrase`, `concretized-abstract`, `a-consonant-sound`, `an-vowel-sound`, `spelling-sound-exception` |
| `pronoun` | `referential-it` / `formal-subject-it` / `formal-object-it` / `cleft-it` / `substitution-that-those` / `impersonal-it` | — |
| `conjunction.coordinating` | `addition-sequence` / `contrast` / `choice` / `restatement` / `cause-effect` / `not-but` / `not-just-but-also` / `not-only-but-also` / `both-and` / `either-or` / `neither-nor` / `whether-or` | — |
| `conjunction.relative-clause` | `missing-subject` / `missing-object-predicative` / `missing-possessive` / `missing-adverbial` / `preposition-relative` / `as-special` | `human`, `thing`, `whole-event`, `restrictive`, `non-restrictive` |
| `conjunction.noun-clause` | `that-clause` / `whether-if` / `what` / `who` / `when-where-why-how` / `wh-infinitive` | `subject-clause`, `object-clause`, `predicative-clause`, `appositive-clause` |
| `conjunction.adverbial-clause` | `time` / `reason` / `condition` / `concession` / `purpose` / `result` / `manner` / `comparison` / `place` | `simultaneous`, `before-after`, `since-start`, `until-end`, `as-soon-as`, `negative-condition` |

For articles, features record the decisive substructure or `a/an` sound rule;
use `[]` when the route itself is already complete. For a relative clause,
record the applicable antecedent type and restrictive status. For a noun
clause, record exactly one clause-role feature. Adverbial-clause features are
optional refinements and must be `[]` when none applies.

## Group Analysis

`groups[groupId]` MUST include:

- `overview` — required; Chinese: main topic + text type (1 sentence)
- `fullTranslationZh` — required for new NCK1 generation; translate the complete
  answer-filled passage into natural Chinese in source order. Immediately before
  the Chinese words governed by each answer, keep the exact ASCII marker
  (`[56]` ... `[65]`) exactly once, including function-word blanks whose Chinese
  meaning is absorbed into the sentence. Preserve paragraph breaks and add no
  grammar explanation or vocabulary notes.
- `selectedLongSentences` — required; 1–2 sentences with genuine sentence-level
  teaching value, preferably one that connects several gaps or carries the
  passage's central meaning. Do not select a sentence merely because it is long.
  `paragraphId` and `sourceText` must locate the stored source exactly and retain
  every `__63__`-style marker. `displayText` must be the deterministic form
  completed with authoritative answers. `relatedQuestionIds` must belong to this
  group. `analysisZh` finds the main trunk first, then explains how coordination,
  clauses, and modifiers attach; do not repeat the per-gap grammar analysis.
  `underlineTexts` contains 1–3 unique, non-overlapping exact substrings of
  `displayText`, limited to the decisive sentence structure.

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
- Do NOT use parent facet keys (`grammar-fill`, `grammar-fill.given`, `grammar-fill.given.verb`, `grammar-fill.given.conversion`, `grammar-fill.no-hint`, `grammar-fill.no-hint.conjunction`), nor the retired v1 leaves (`grammar-fill.given.noun`, `grammar-fill.given.adjective`, `grammar-fill.given.derivation.*`).
- Do NOT output `tense`, `voice`, `agreementSensitive`, `form`, or `similarityForm` — the server stamps these.
- Do NOT include `role` or `path` for any facet other than `grammar-fill.given.verb.non-finite`.
- Do NOT include a blank marker (`  56  ` or `(wear)` token) in any `signalText`.
- Do NOT add `distractorGlosses` (grammar fill has no A–D options).
- Do NOT add `affectiveArc` to the group analysis (grammar fill, unlike cloze, is syntactic).
- Do NOT overwrite or contradict the authoritative answer key.
- Do NOT omit `evidence`.
- Do NOT report `meta.model`, `meta.reviewedBy`, or `meta.reviewedAt` — the server stamps these.
