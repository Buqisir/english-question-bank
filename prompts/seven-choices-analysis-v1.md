# Seven Choices Analysis Prompt — V1

## Purpose

Produce a reviewed-analysis JSON file for 高考英语七选五 groups.

This is a file-generation task, not a chat answer, not a research report, and
not a free-form explanation.

## Output Requirement

You MUST create exactly one downloadable `.json` file named:

```text
seven-choices-analysis-v1.json
```

Do NOT output JSON in chat.
Do NOT paste JSON content into the chat window.
Do NOT wrap JSON in markdown fences.
Do NOT write a filename heading.
Do NOT write "Here is the JSON".
Do NOT explain what you are doing.
Do NOT provide a fallback JSON-in-chat response.

If you cannot create a downloadable file, stop and reply with exactly:

```text
UNABLE_TO_CREATE_FILE
```

## Reasoning Rule

Reason carefully internally about:

- the blank's discourse position
- the inserted sentence role
- grammatical / lexical cohesion
- topic clues from the context
- correct-option fit
- optional teachable distractors, only when genuinely useful
- the real before → inserted sentence → after progression in plain language
- exact field names and enum values

But output only the downloadable JSON file.

If the supplied passage, option bank, questions, blanks, and answer labels are
sufficient, generate the file immediately. Do not spend time on unrelated
thinking, task restatement, process narration, or confirmation.

Priority order:

1. JSON structure and enum values must be valid.
2. `mechanismSignals.signalText` must be exact and locatable.
3. Chinese explanation quality comes after structure and signal accuracy.

If you are unsure, preserve valid structure and exact signal text first. Do not
write prettier prose at the cost of wrong fields or non-locatable signals.

## Teaching Prose Rule

Position, role, and mechanism facets are internal classification. Keep their
enum values exact, but do not begin `fitSummary`, `relation`, or `reason`
with labels such as referential cohesion, topic-field alignment,
or lexical repetition. First reconstruct what the passage is doing.

The Chinese teaching lines are `find`, `explain`, `distractors` and the group's
`extraOptions`; write them by the 讲法 section below. `optionFit.fitSummary` and
`keyDistractors` are derived by the server from them (see "Legacy Fields the
Server Derives").

`mechanismSignals[].relation` should explain what the highlighted words connect,
not simply announce that they belong to the same topic field.

## 讲法（七选五心法，详见 docs/product/seven-choices-methods.md）

给中国高中生和老师看的七选五解析。七个选项填五个空，多两个。要写清两件事：每个空怎么找到答案；两个多余选项各自想骗哪一空、骗在哪、断在哪。读者手上有试卷。讲解用中文，英文原词照抄。按题号讲，不写做题顺序。

### 每个空（`questions[questionId]`）

1. **上下文** `contextEvidence`：`paragraphId` 是空所在的段落；`beforeQuote`、`afterQuote` 只抄**本段**里空前、空后的一小段原文（不含空位标记）。空在段首 `beforeQuote` 写空串，空在段尾 `afterQuote` 写空串。上一段末尾、下一段开头由导出自己取：只要 `find.quotes` 或 `lock` 用到了相邻段的词，导出就印「上段末尾」或「下段开头」那一行，没用到就不印。所以承上启下的空，要在找法里引上一段或下一段的原词；段首总起、段尾总结的空不必引。
2. **锁定词** `lock`：1 到 3 个锁定答案的英文词，原样出现在空前、空后、答案或相邻段里，导出会加粗。锁定词在本段但离空远时，把 `beforeQuote` 或 `afterQuote` 抄长一点把它包进来，不要换成不关键的词。
3. **找法** `find`（`text` 55 字以内，`quotes` 至少一条）：先看哪边，凭哪个词，为什么七个里只能是它。引的英文原样放进 `quotes`，并原样出现在 `text` 里。
4. **讲解** `explain`（80 字以内）：这句在段里干什么，前后怎么接上。找法说「凭什么选」，讲解说「这句在这里起什么作用」，两句不说同一句话；不复述答案的中文意思。
5. **错项** `distractors`（0 或 1 条，每条 `text` 45 字以内）：只在**另一空的正确答案**放到这里也说得通一半、学生真会填错时写，说它哪里接得上、原文哪个词让它不成立。`label` 必须是另一空的正确答案；两个多余选项不写在这里。

找法：先看空后。错的选项多半空前接得上、空后接不上。

1. 看空的位置：段首、段中、段尾、小标题。
2. 看空后有没有指向前文的词：代词（he、they、this、it、them）、指代短语（do this、such a plan）、连接词（Yet、But、So、also、For example）、数字、专名。有，就找能给它铺垫的选项。
3. 空后没有指向词，再看空前：问句要答案，冒号要内容，列举要同类。
4. 小标题空和段首总起空看整段讲什么，找原词或同义复现。只有小标题空、或答案要概括后面几段才看得出的空，才在找法第一句写「先跳过，做完后面几段再回来」；空前空后就能定的空不写这句。

常见的招：指代回指、原词或同义复现、转折对比、段首总起、并列平行、因果、问答呼应、承上启下、小标题概括段意、段尾总结、举例说明。招式名可以用，但放在具体解释之后，不单独当结论。这些是帮着想到该看哪里，不是对应表。

### 两个多余选项（`groups[groupId].extraOptions`）

这是这份解析的特点，要讲好。命题人常常照某一空的正确答案改出一个多余选项，专门骗那一空：共用一个核心词，把对象或方向改掉；或者把答案的陈述改成问句；或者对同一个问题给另一种回答；或者仿答案开头的 This、They、But。也有的照某空前后的原文词改，还有的只和全文话题沾边。

两个多余选项各写一条，键是选项字母：

- `target`：它最能骗的那一空的题号（数字）。哪一空都接不实写 `null`，这时 `kind` 必须是 `topic`。
- `secondary`：还能骗的第二空的题号，没有写 `null`。不硬凑。
- `kind`：`shadow`（影子项，照某空答案改的）、`context`（语境项，照某空前后的原文词改的）、`topic`（话题项，只和全文话题沾边）。判断顺序：先拿它和五个正确答案逐个比，共用一个核心词（单复数、大小写、词形不同也算，如 plant 和 plants、This 和 this）、仿同一种开头（This、They、But、Both）、或是同一句话换成问句或反过来说，就是影子项，哪怕它同时也借了空前后的原文词；都不是，再看语境项、话题项。
- `shadowOf`：影子项写它照着改的那个正确答案的字母，其余写 `null`。
- `shared`：影子项写两边共同的英文词，取两边都有的那一段字母（plant 和 plants 写 "plant"，This 和 this 写 "this"，不分大小写）；其余写空数组。
- `text`（100 字以内）：依次说**像在哪**（选项里哪个词和那一空前后哪个词看似接得上）；**断在哪**（原文哪个具体的词让它不成立，优先找空后：代词没有先行词、连接词转不过来、空后的伏笔没人接、和原文事实矛盾、对象换了；说不出具体的词就是没找到，接着找）；影子项再加一句它是照哪个答案改的、都有什么词、答案说什么、它改成什么；有次目标就用一句话说它为什么也像那一空。话题项直说「它和全文话题有关，但哪一空都接不上」，再说最接近的那一空断在哪。
- `quotes`：`text` 里引的英文，原样抄。

导出把多余选项印在 `target` 那一空后面，标「多余项」，并在这一条末尾替你印「也可能误填第 N 空」；`target` 为 `null` 的印在题组末尾。所以 `text` 里不写任何题号，用「这一空」「那一空」「答案 X」指代。

### 写死的

- 每个空、两个多余选项都要有一条。
- 所有英文引文（`beforeQuote`、`afterQuote`、`lock`、`find.quotes`、`distractors[].quotes`、`extraOptions.*.quotes`、`shared`）是原文或选项里一字不差的子串，不含空位标记；`quotes` 里的每一条都原样出现在它所属的那段中文里。原文里的弯引号、不间断空格照原样抄。
- 字数：一个汉字算 1，一个英文词算 1，标点不算。找法 55，讲解 80，错项每条 45，多余选项每条 100。
- 找法、讲解、错项里不写本空题号（题头已印）；提别的空说「前一空」「后面那一空」或引原文。多余选项的 `text` 里不写任何题号。
- 不写「第几段」：段落编号和卷面不一定对得上。说「上一段」「下一段」「最后一段」或引原文。
- 不用「·」。不写空话：「能统领整段」「不符合语境」「不如……切题」「衔接自然」「使文章更完整」「语意连贯」「起到……的作用」。

### 你自己判断的

用哪一招；措辞；先看哪边；多余选项算哪一类、骗哪一空、有没有次目标；每空写不写错项。

写完做**搬家检验**：把一句找法、讲解或断点原样搬到另一个空上，如果还成立，就是套话，重写，直到它只在这一空成立。

### 例子（编的，和你要做的卷子无关）

原文片段：

> Many people think a garden needs a lot of space. __2__ A few pots on a balcony can grow herbs, tomatoes and even small lemon trees. They only need sun for about six hours a day.

答案：「In fact, a small corner is often enough.」

- 找法：「空后 "A few pots on a balcony" 是例子，要空里先有一句总说。只有 "a small corner is often enough" 能被它证明，又和空前 "a lot of space" 唱反调。」
- 讲解：「空前是一般人的想法，这句马上纠正：小角落就够；空后用阳台几盆菜把纠正坐实。」
- 坏的讲解：「承上启下，使文章衔接自然。」搬到哪一空都成立，什么也没说。

多余选项「In fact, a big garden is often better.」（`kind: "shadow"`，`shadowOf` 是答案的字母，`shared: ["In fact", "is often"]`）：

- text：「它和答案一样以 "In fact" 开头，也像在纠正空前 "a lot of space"。但空后 "A few pots on a balcony" 是在证明小也行，它却说大园子更好，方向反了。它是照答案改的：都有 "In fact" 和 "is often"，答案说小角落就够，它改成大园子更好。」

多余选项「They should be watered every morning.」（`kind: "context"`）：

- text：「开头 They 像在接空后的 "They only need sun"，又都在说怎么照料。但放进这一空，They 前面只有 "a garden"，没有复数名词可指；照料是下一句的事，它抢在例子前面说了。」

## Legacy Fields the Server Derives

Do NOT write these; the server fills them from your new fields so older consumers
(site panel, draft-paper text) keep working:

- `optionFit.fitSummary` — copied from `explain`.
- `optionFit.correctOptionLabel` — the supplied answer label.
- `keyDistractors` — your `distractors`, then the spare options whose `target`
  is this blank.

## Required Top-Level Shape

```json
{
  "schemaVersion": "seven-choices-analysis-v1",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-..."],
  "meta": {
    "generatedBy": "external-ai",
    "promptVersion": "seven-choices-analysis-v1",
    "reviewStatus": "reviewed"
  },
  "groups": {
    "group-...": {
      "overview": "50–80字软目标的中文内容简介，概括主题及核心内容",
      "fullTranslationZh": "Answer-completed full Chinese passage translation; no hand-written [36]-style markers",
      "selectedLongSentences": [
        {
          "paragraphId": "para-...",
          "sourceText": "Exact source sentence, retaining any __36__ marker",
          "displayText": "The same sentence with the authoritative option inserted",
          "relatedQuestionIds": ["q-...-036"],
          "translationZh": "Natural Chinese translation",
          "analysisZh": "Chinese explanation of the main trunk, modifiers, and relations",
          "underlineRanges": [{"start": 0, "end": 3, "quote": "The"}]
        }
      ],
      "discourseStructure": {
        "summary": "Chinese summary of the discourse flow",
        "units": [
          {
            "unitId": "unit-...",
            "heading": "Optional heading text",
            "paragraphIds": ["para-..."],
            "summary": "Chinese summary of this unit"
          }
        ]
      }
    }
  },
  "questions": {
    "q-...": {}
  }
}
```

Do NOT fill `meta.model`, `meta.reviewedBy`, or `meta.reviewedAt`. The runtime
stamps the actual model identity; Owner Review records approval provenance
later. `reviewStatus` is a compatibility field in this analysis contract, not
Owner Review approval.

## Group Analysis

Each `groups[groupId]` item is light analysis, not copied source data.

Include:

- `overview`
- `fullTranslationZh`
- `selectedLongSentences`
- `discourseStructure.summary`
- `discourseStructure.units[]`
- `extraOptions` — the two spare options, keyed by option label (see 讲法):

```json
"extraOptions": {
  "C": {
    "target": 38, "secondary": 40, "kind": "shadow", "shadowOf": "E",
    "shared": ["plant"],
    "text": "Chinese, no question numbers",
    "quotes": ["exact English quoted in text"]
  },
  "A": {
    "target": null, "secondary": null, "kind": "topic", "shadowOf": null,
    "shared": [], "text": "…", "quotes": ["…"]
  }
}
```

`overview` is the one canonical introduction shared by teaching, list/search
and future similarity consumers. Aim for 50–80 Chinese characters without
padding. Do not discuss individual gaps or cohesion mechanics here; keep those
in the separate discourse fields.

`fullTranslationZh` is student-visible. Translate the whole passage in source
order and complete all five gaps with the authoritative answer sentences.
Preserve paragraph breaks. Do not hand-write `[36]`-style markers: insertion
identity comes only from `teachingContent` relationships. Do not add option letters, analysis,
vocabulary notes, or source text that is not present in this group.

`selectedLongSentences` contains 1–2 sentences with real teaching value; each has
a stable `sentenceId`. Prefer
a difficult sentence that carries the passage's central meaning or materially
supports one of the five gaps; do not select it merely for length. `paragraphId`
and `sourceText` must locate the stored source exactly, retaining any `__36__`
marker. `displayText` must be the deterministic answer-completed form.
`relatedQuestionIds` must cite questions in this group. In `analysisZh`, identify
the main trunk first and then explain how clauses, non-finite phrases, or logical
relations attach. `underlineRanges` locates decisive structure in `displayText`:
Unicode code-point offsets, start inclusive/end exclusive, with the exact `quote`.
Do not trim or normalize before counting. Usually 1–3 short ranges suffice;
repeated phrases and overlaps are valid when explicitly located. The example
offsets only illustrate the encoding; calculate them for your actual text. Do
not also emit historical `underlineTexts`.

Add closed `teachingContent` (`schemaVersion: objective-teaching-content-v1`)
beside these fields. It declares `sourceTextId`, exact `sourceAssetVersion`,
`translation {textId,legacyField:"fullTranslationZh",paragraphs[]}` whose
paragraphs are exact code-point slices of that one translation value and link
existing source paragraph IDs, authoritative `completedSourceTexts[]`, and
`annotations[]`. Every question needs original-text `answer-evidence` and one
completed-text `answer-insertion` bound to its exact `blankId`; every selected
sentence needs `sentence-structure`. Range shape is
`{textId,paragraphId,start,end,quote}`. Repeated occurrences, many-to-many links,
and overlaps require explicit offsets; never first-match, trim, normalize,
mutate original blanks, or interpret hand-written `[36]` as annotation data.
An insertion range must locate that blank's actual replacement, not another
occurrence of the same answer. All text identities are distinct. Non-key difficult
sentences use empty `relatedQuestionIds` and sentence-structure `questionIds`.

Do NOT copy paper-asset fields into `groups[groupId]`. In particular, do not
include `groupId`, `groupType`, `questionIds`, `blankIds`, `optionBank`, or
`passageTitle` there.

## Required Per-Blank Shape

Each `questions[questionId]` item analyzes one blank.

```json
{
  "blankId": "blank-...",
  "positionFacet": "seven-choices.position.paragraph-middle",
  "roleFacet": "seven-choices.role.cohesion",
  "primaryMechanismFacet": "seven-choices.cohesion.grammatical.referential-cohesion",
  "supportingMechanismFacets": [
    "seven-choices.cohesion.lexical.topic-field-alignment"
  ],
  "topicClues": [
    "new runners",
    "training program",
    "risk of injury"
  ],
  "contextEvidence": {
    "paragraphId": "para-...",
    "headingAnchor": "Optional heading text",
    "beforeQuote": "Short exact context before the blank",
    "afterQuote": "Short exact context after the blank"
  },
  "mechanismSignals": [
    {
      "mechanismFacet": "seven-choices.cohesion.grammatical.logical-connector",
      "signalText": "If",
      "signalSide": "option",
      "targetText": "keep these things in mind",
      "relation": "If 引出适用条件，与空后祈使句构成条件—建议关系。"
    }
  ],
  "lock": ["keep these things in mind"],
  "find": {
    "text": "先看空后 \"keep these things in mind\"：要先有一个条件，只有 \"If you are just starting out\" 是条件。",
    "quotes": ["keep these things in mind", "If you are just starting out"]
  },
  "explain": "空前说人人都能跑，这句把话收到新手身上，空后的几条建议才有了对象。",
  "distractors": [],
  "optionFit": {
    "matchedClues": [
      {
        "contextSide": "training program / risk of injury",
        "optionSide": "increasing your running distance by no more than 10% each week",
        "relation": "Chinese explanation of the match"
      }
    ]
  }
}
```

`contextEvidence` must be one object, not an array. Its quote fields must use
exact passage text but must exclude the blank marker number itself, such as
`36`, `37`, `38`, `39`, or `40`.

## Facet Values

These three existing fields are also the complete small-question similarity
profile. Do not add a second `similarityProfile` object: matching uses the exact
per-question `blankId` together with `positionFacet`, `roleFacet`, and
`primaryMechanismFacet`. `topicClues` and the evidence fields explain the match
but do not replace those controlled facets.

Use ONLY these position facets:

- `seven-choices.position.paragraph-start`
- `seven-choices.position.paragraph-middle`
- `seven-choices.position.paragraph-end`

Use ONLY these role facets:

- `seven-choices.role.topic`
- `seven-choices.role.summary`
- `seven-choices.role.bridge`
- `seven-choices.role.cohesion`

Use ONLY these mechanism facets:

- `seven-choices.cohesion.grammatical.referential-cohesion`
- `seven-choices.cohesion.grammatical.logical-connector`
- `seven-choices.cohesion.lexical.topic-field-alignment`

Do NOT use parent keys as blank-level facet values.
Do NOT invent new facet keys.
Do NOT use earlier draft names for lexical echo or pronoun reference. Use the
final facet keys listed above exactly.

## Mechanism Rules

Every blank MUST include primaryMechanismFacet.

`roleFacet` answers what the inserted sentence does. `primaryMechanismFacet`
answers how the blank is solved. Topic and summary blanks still need a solving
mechanism, usually `seven-choices.cohesion.lexical.topic-field-alignment`.

Choose `primaryMechanismFacet` by this hard priority order:

1. If the correct option and the before / after context form a clear logical
   connector relation, use
   `seven-choices.cohesion.grammatical.logical-connector`.
2. Otherwise, if they form a clear referential relation, use
   `seven-choices.cohesion.grammatical.referential-cohesion`.
3. Otherwise, use `seven-choices.cohesion.lexical.topic-field-alignment`.

Topic-field alignment can be supporting evidence, but it must not override a
real logical connector or referential mechanism as the primary mechanism.
When no logical connector or referential cohesion is doing the main solving
work, topic-field alignment is not a weak mechanism. It is the primary solving
mechanism, and its compact matched signals belong in `mechanismSignals`.

- `supportingMechanismFacets` is optional and may contain at most 2 items.
- `mechanismSignals` is required for every blank.
- Each blank must have 2-5 `mechanismSignals`.
- Each blank must include at least one option-side signal and at least one
  context-side signal (`context-before` or `context-after`).
- A logical-connector blank must include the logical connector and at least one
  logical object it connects to.
- A referential-cohesion blank must include the reference word and its
  antecedent / referent.
- A topic-field-alignment blank must include compact matched word chunks from
  both the context side and option side.

Common logical connectors include, but are not limited to: if, while, however,
therefore, so, also, instead, for example, in addition, as a result, because,
although, but, yet.

Common reference words include, but are not limited to: this, that, these,
those, it, they, such, one, ones, the former, the latter.

## Mechanism Signals

Use `mechanismSignals` for the exact logical connector, pronoun, demonstrative,
or topic-field word chunk that should be highlightable in the UI.
They are the strong solving signals. A future surface may render them as strong
highlights.

Each item must include:

- `mechanismFacet`
- `signalText`
- `signalSide`: `option`, `context-before`, or `context-after`
- `targetText` when useful
- `relation` in Chinese

`signalText` rules:

- It MUST be an exact substring of its source.
- `option` signal text must appear in the correct option.
- `context-before` / `context-after` signal text must appear in the passage or
  heading.
- Copy it character for character. Do not change tense, person, number,
  inflection, spelling, punctuation, spacing, or capitalization to make the
  signal read more smoothly. For example, source `serves` cannot become
  `serve`, and source `make` cannot become `makes`.
- Prefer short chunks, usually 1-8 English words.
- Logical connectors and reference words may be a single word.
- Do not put a whole sentence or paragraph in `signalText`; use `targetText`
  for larger explanation objects.

`targetText` may be a summary or multi-part explanation. It does not need to be
independently highlightable.

Examples:

```json
[
  {
    "mechanismFacet": "seven-choices.cohesion.lexical.topic-field-alignment",
    "signalText": "hurts",
    "signalSide": "context-after",
    "targetText": "uncomfortable",
    "relation": "空后具体说会 hurts，选项先用 uncomfortable 概括这种不适。"
  },
  {
    "mechanismFacet": "seven-choices.cohesion.lexical.topic-field-alignment",
    "signalText": "uncomfortable",
    "signalSide": "option",
    "targetText": "hurts / pain",
    "relation": "uncomfortable 概括空后 hurts、pain。"
  },
  {
    "mechanismFacet": "seven-choices.cohesion.grammatical.logical-connector",
    "signalText": "If",
    "signalSide": "option",
    "targetText": "keep these things in mind",
    "relation": "If 引出适用条件，与空后祈使句构成条件—建议关系。"
  },
  {
    "mechanismFacet": "seven-choices.cohesion.grammatical.referential-cohesion",
    "signalText": "these things",
    "signalSide": "context-after",
    "targetText": "common mistakes",
    "relation": "these things 指代前文 common mistakes。"
  }
]
```

For topic-field alignment, put only the compact matched words or chunks that
decide the answer in `mechanismSignals`. Put the broader context-side clue set
in `topicClues`.

## Topic Clues

`topicClues` are required for every blank.

They are context-side word chunks in the blank's semantic paragraph or content
unit that belong to the same topic field and help solve the blank.
They are broader than `mechanismSignals`: useful context-side topic-field clues,
not the strongest solving signal. A future surface may render them as weaker
marks such as underlines or wave marks.

Do NOT introduce `contextClues`, "context clue", or "上下文线索" as a formal
field or category. That wording is too broad and blurs `mechanismSignals`,
`topicClues`, and `contextEvidence`.

Rules:

- Include 3-6 items per blank.
- Include nearby context / heading clues only.
- Do NOT include words that appear only in the correct option.
- Do NOT collect generic high-frequency words.
- Prefer short chunks over isolated function words.

Example good `topicClues`:

```json
["Not wearing the right equipment", "wear properly", "workouts", "running shoes"]
```

Example bad `topicClues`:

```json
["expensive equipment", "take up running"]
```

The bad examples may belong in `optionFit.matchedClues[].optionSide`, not in
`topicClues`.

## Option Fit

`optionFit` explains how the correct option fits the context.

- `correctOptionLabel` must match the supplied answer label.
- `matchedClues` must compare option-side language with context-side clues.
  It is expanded explanation detail, not a UI highlighting source.
- `fitSummary` is derived from `explain`; do not write it.

## Context Evidence

`contextEvidence` is the audit location for the blank. It tells the reviewer
where to look: paragraph ID, optional heading anchor, and exact before / after
quotes.

It is not a clue type and should not be treated as the thing that solved the
blank. Put concrete solving signals in `mechanismSignals`; put broader
context-side topic-field chunks in `topicClues`.

## Distractors

Write `distractors` (0 or 1 item, another blank's correct answer) and the
group's `extraOptions` by the 讲法 section. Do NOT write `keyDistractors`; the
server derives it. Do NOT give distractors their own facet keys.

## Final Literal-Substring Check

Before returning JSON, silently run this check on every
`mechanismSignals[]` item:

1. For `signalSide: "option"`, search `signalText` in the authoritative correct
   option text with a literal substring search.
2. For `context-before` or `context-after`, search `signalText` in the supplied
   passage or heading with a literal substring search.
3. If the literal search fails, do not repair the source or explain the
   intended word family. Replace `signalText` with a shorter character-for-
   character substring that actually exists on that side.
4. Repeat the same literal check for `contextEvidence.beforeQuote` and
   `contextEvidence.afterQuote` against the blank's own paragraph, and for
   `lock`, `find.quotes`, `distractors[].quotes`, `extraOptions.*.quotes` and
   `shared` against the passage and options.

Meaning-equivalent, lemma-equivalent, differently inflected, or normalized text
still fails this check. Do not return until every literal search succeeds.

## Strictly Forbidden

- Do NOT output chat JSON.
- Do NOT output markdown.
- Do NOT invent paragraph IDs, blank IDs, question IDs, group IDs, or option
  labels.
- Do NOT change passage text, option text, or answer labels.
- Do NOT include `status` as a chat wrapper.
- Do NOT include `questionNo` instead of `questionId` keys.
- Do NOT include analysis for non-target groups.
- Do NOT use `reading-choice-analysis-v1` fields or schemaVersion.
- Do NOT create fields named `answer`, `correctAnswer`, `explanationZh`,
  `analysisZh`, `questionSide`, or `sourceSide`.
