# Cloze Analysis Prompt — V1

## Purpose

Produce a reviewed-analysis JSON object for 高考英语完形填空 (cloze) groups (q41–q55, 15 blanks, A–D options).

This is an API response task, not a chat answer, not a research report, and not a free-form explanation.

## Output Requirement

You MUST create exactly one downloadable `.json` file named:

```text
cloze-analysis-v1.json
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

- the passage's 主题意义 and how each paragraph moves the main line
- whether each blank sits on the main line or is a local detail
- what each blank must mean in its sentence, before looking at the options
- which words in the source lock the answer, starting from the blank's part of speech
- each distractor in the current sentence: what it would mean there and which
  source words rule it out
- exact, highlightable evidence substrings and exact field names and enum values

But output only the JSON object.

Required together: valid JSON and enums, exact source substrings in every quote
and `evidence.signalText`, and explanations supported by the complete sentence and
context. Plain Chinese is acceptable; a false reason is not a stylistic weakness.
The authoritative answer fixes the choice, not the truth of any proposed reason.
When unsure about a claim, narrow it to what the source supports rather than
inventing a grammar rule or a missing event to justify the answer.

## 讲法（完形心法，详见 docs/product/cloze-methods.md）

老师拿这份解析讲课，学生拿它订正。完形的空不是随便挖的，很多空落在文章的主线上：人物的关键动作、情感的转折、对一件事的概括、点题的那个词。讲解要让学生看到这一点，做题的过程也就是读懂文章在说什么的过程。

讲解分两层：

- **题组开头**（`groups[groupId].mainLine`）：主题意义、每段一句主线、情感线。
- **每个空**（`blanks[questionId]`）：先分主线空还是细节空；脉络说这个空在这里必须是什么意思；找法说原文哪几个词把答案锁定，从词性入手；正确项先写词典义、再写此处指什么；三个错项都写。

不写串空：不要把主线空的答案再串成一句（Owner 2026-11-23 定，`mainLine` 里不要 `thread`）。

### 题组开头

**主题意义** `mainLine.theme`：一句话，这篇文章最后想让读者明白什么，不超过 40 字。依据是原文点题的地方（常在末段，有时在首段），在 `quote` 里原样抄一处，并让它原样出现在 `text` 里。只写原文推得出的意思，不写原文没有的道理。

**主线** `mainLine.paragraphs`：每段一句，写这一段把主线推到哪里：发生了什么，人物的处境或态度怎么变。不超过 30 字。按输入的段落顺序一段一项，`paragraphId` 一一对应；卷面说明、标题这类不是正文的段落，写一句「卷面说明，不属正文。」之类即可。

**情感线** `mainLine.emotion`：记叙文写人物情感怎么变，用「→」连，如「失望→不服→释然」，不超过 40 字。说明文、议论文没有明显的情感变化，写空字符串 `""`，不要为了填满编情感。

### 每个空

**主线空还是细节空** `role`：

- `main`：把答案换成错项，这一段推进主线的那件事就说不成了。人物的关键动作、情感的转折点、对前后一件事的概括、点题的词，通常是主线空。
- `detail`：换成错项，只与本句的搭配或语义冲突，主线照样往下走。
- 拿不准就标 `detail`。不要为了显得每个空都有意义把细节空标成主线。

**脉络** `context`：不看选项也能说出的那句话：这个空在这里必须是什么意思。可以说它是正是负、是哪一类动作、是在概括前面哪件事，还是在引出后面哪件事。不超过 45 字。

- 主线空：说清它在主线的哪一步（转折、低谷、概括、点题等），用这篇文章自己的事和词来说。
- 细节空：只说这一句需要什么意思，不往主题上挂。
- 不写「体现了……精神」「升华了主题」这类话。
- 不写本空的题号，题头已经印了。提到别的空时说「前一空」「后面那一空」，或者直接引原文的词。

**找法** `find`：脉络说「要什么意思」，找法说「原文哪几个词把它锁定」。两行不要说同一句话。

`find.check` 是考点，从这八个里挑一个：

| `find.check` | 考点名 |
| --- | --- |
| `collocation` | 看搭配 |
| `echo` | 看复现 |
| `topic` | 看话题 |
| `action-sequence` | 看动作顺序 |
| `affect` | 看情感 |
| `direction` | 看走向 |
| `contextual-meaning` | 看语境义 |
| `logic` | 看逻辑 |

`find.text` 写「怎么做」：往哪里找、原文哪几个词（英文原样抄）、这几个词怎么锁定答案。不超过 55 字。不以考点名开头：页面会按 `pos` 和 `find.check` 自动印成「名词看复现：……」。`find.quotes` 列出你在 `find.text` 里引的原文，页面会把它们加粗。

从词性入手。下面是各词性的常见情况，帮你想到该看哪里，不是每个空都要对上一条：

- 所有词性的基础都是搭配：放进句子里，谁做什么、什么修饰什么，说得通。大多数动词空看搭配就够了，不要为了显得有技巧去找别的考点。
- 动词（`verb`）：主语发不发得出这个动作，宾语受不受得住；后面跟的介词或结构常常直接定下动词（dream of、pair A with B）；前后两个动作夹出中间那个时看动作顺序，只有先后顺序本身决定答案才算；表态度的动词（hate、admire）可以看情感。
- 名词（`noun`）：最常见的是复现，包括原词、同义、反义、上下义，还有概括复现，即用一个抽象名词把前后的具体事说成一个词，线索常是冒号、such、this、that；名词也考话题，文章讲哪个领域，四个里只有一个属于它；名词也有褒贬。
- 形容词（`adjective`）：情感正负，前后一致还是翻转（but、yet 翻，and、also 同向）；递进（and even、and often 后面的更重）；它修饰的那个名词。
- 副词（`adverb`）：过程的走向（长期下来的结果、常态、突然）；程度。
- 词组（`phrase`）：好的空四个放进去语法都对，只能靠意思，看语境义；熟词僻义要点出来；小品词定方向（down、up、to）。固定结构按词组算。
- 连词、逻辑副词、表逻辑的词组（however、instead、otherwise、let alone）：看逻辑，前后是转折、因果、递进还是让步。只有四个选项本身是这类词时才用看逻辑。句子里有 but、although 这类信号词、靠它定下正负的空，仍是看情感；靠它定下动作的，仍是看搭配或看动作顺序。
- 介词、连词、代词这类选项，`pos` 写 `"other"`，并在 `find.posLabel` 写「介词」「连词」或「代词」，页面印成「连词看逻辑：……」。其他词性不写 `posLabel`。
- 复现不限于名词，任何词性都能用。

主线往往直接告诉你看哪里：情感线定下形容词、副词和表态度的词的正负；主线上的动作链就是动作顺序；主线上一件事说完，后面常用一个名词概括它；段与段之间的转折常落在逻辑词上。用上了就写出原文的词，不要只说「符合情感线」。

**正确项的词义** `correctFit.dictMeaning` 和 `correctFit.meaning`：页面印在题头答案词后面，印成「词典义；此处指语境义」。

- `dictMeaning`（必写，不超过 8 字）：词典里的义项，取最接近这句语境的那一个。这是学生要记住的词义，必须是这个词本身的意思，不能是它在这句里临时指的东西。
- `meaning`（语境义，不超过 12 字）：这个词在这句里具体指什么。和词典义一样时不写，页面只印词典义。熟词僻义、词组的整体意思要写对。
- 两项都只写中文短语，不写「意为」「此处指」，不写理由（理由在脉络和找法里），不写英文。

例：exercise 只写词典义「锻炼」；inspiration 写词典义「鼓舞人心的人或事」、语境义「激励别人的榜样」，印成「inspiration 鼓舞人心的人或事；此处指激励别人的榜样」。只写「榜样」不行：基础弱的学生会把 inspiration 记成「榜样」。

**错项** `distractorGlosses`：三个错项都写，每项一句，不超过 45 字。写 what the word or phrase would mean here（这个词放进这句是什么意思），再写原文哪个词让它不成立，也就是放回当前语境为何不成立。`meaning` 先写词义，用「；」接上排除的理由，开头不重复选项词本身（页面会印）。好的空放进去语法都对，错项靠意思排除；只说「原文没有这回事」不算排除，要说出原文写的是什么。有的错项放进这一句也说得通，但会让主线断掉，这时就用主线排除，说出放进去以后前后哪件事对不上。`quote` 是你在 `meaning` 里引的那处原文。

先排除与正确项最像的干扰项。理由写出与上下文的具体冲突，例如动作对象、情绪方向、前后事件或因果关系，不用「说不通」「讲不通」代替。

Explaining why a distractor is tempting is optional, never required. 原文撑得住时可以带半句，不虚构学生的动机。

Before writing, substitute each option into the complete construction. Preserve
who acts, who receives the action, and what each possessive or preposition links.
Write only the contextual meaning and one decisive mismatch with a stated event or
comparison. Stop once that difference is clear. Do not add a usage lesson, imagined
motive or broader rule, and never give only a reusable dictionary gloss such as
`优势、好处`.

### 写完做一次搬家检验

把一句脉络或找法原样搬到这篇的另一个空上，还成立的就是套话，重写。「根据上下文，此处应填……」「与语境相符」「符合文意」「体现了作者的情感」都过不了。

### 哪些必须照做，哪些你自己判断

必须照做：

- 输出格式、字段和长度上限（一个汉字算 1，一个英文词算 1，标点不算）。
- `find.check` 只用上面八个值。
- 主题意义、找法、每个错项都至少引一处原文。中文先说清意思，英文原词放在对应中文后的括号里。引文保留大小写和词形，是原文的 exact substring，不引空位标记（`__41__` 这种）。
- 答案是给定的，不改，不重新解题。
- 不用「·」做分隔。

你自己判断：

- 每个空是主线还是细节。
- 每个空用哪个考点：选最能让学生下次照着做的那一个。拿不准就用看搭配，写清是哪两个词搭在一起。
- 怎么措辞，不用套固定句式。
- 错项为什么诱人：原文撑得住时可以带半句，不强求。

### 例子（编的，和你要做的卷子无关）

原文：

- 第 1 段：Last spring our school started a garden on the empty roof. Most students thought growing vegetables in the city was a waste of time.
- 第 2 段：Mia joined anyway. She __1__ (A put up　B put off　C put out　D put away) a sign that read "Please don't step on the soil." For weeks nothing grew, and even Mia began to feel __2__ (A hopeful　B discouraged　C proud　D curious).
- 第 3 段：Then one morning she noticed tiny green __3__ (A shoots　B stones　C insects　D papers) pushing through the soil. By June the roof was full of tomatoes. Most students had laughed at the idea. __4__ (A Besides　B However　C Therefore　D Otherwise), twenty of them now asked to join.
- 第 4 段：Mia smiled. Sometimes the best way to change people's minds is to show them, not tell them.

答案：1 A，2 B，3 A，4 B

题组开头：

- 主题意义：要改变别人的看法，让人亲眼看到比光说更有用（show them, not tell them）。
- 主线：第 1 段 学校开屋顶菜园，多数学生觉得白费功夫。第 2 段 米娅还是参加了，几周没长东西，她也泄气。第 3 段 菜苗冒出，番茄满园，二十名学生要求加入。第 4 段 米娅点出道理。
- 情感线：坚持→泄气→惊喜→欣慰

每个空（页面印出来的样子，下面每空只示范一条错项）：

- 第一空（细节）题头：1 A put up 竖起；此处指立起（牌子）。脉络：她要把提醒别踩土的牌子立起来。找法：词组看语境义：牌子（a sign）上写着请勿踩土（Please don't step on the soil），需要立起来让人看到。错项 B：推迟；这里处理的是提醒行人的牌子（a sign），没有要改期的活动。
- 第二空（主线）题头：2 B discouraged 灰心的。脉络：坚持几周没有结果，这是米娅情绪的低谷。找法：形容词看情感：几周没长东西（For weeks nothing grew），连坚持的米娅也动摇了（even Mia）。错项 A：充满希望；几周没长东西（For weeks nothing grew）使连一开始愿意参加的米娅也失去了信心。
- 第三空（主线）题头：3 A shoots 嫩芽。脉络：这是菜园种植有了进展的第一个迹象。找法：名词看话题：嫩绿的小东西（tiny green）从土里冒出来（pushing through the soil），接上了菜园的种植主线。错项 C：昆虫；后文写番茄满园（full of tomatoes），顺着出苗往下写作物结果。
- 第四空（主线）题头：4 B However 然而。脉络：多数学生原来嘲笑这个主意，现在有二十人想加入，态度转变了。找法：副词看逻辑：从嘲笑这事（laughed at the idea）转到请求加入（asked to join）。错项 C：因此；请求加入（asked to join）与先前的嘲笑形成反差，嘲笑本身没有促成加入。


## Legacy Fields the Server Derives

Do NOT write these; the server fills them from your new fields so older consumers
(site panel, draft-paper text, search) keep working:

- `correctFit.reason` — built from `context` + 考点名 + `find.text`.
- `affectiveArc` — copied from `mainLine.emotion` when it is not empty.
- `signatureFacet` — derived from `pos` + `find.check` when they match a POS signature:

| pos value | find.check | Signature facet key |
| --- | --- | --- |
| verb | action-sequence | cloze.signature.verb.action-sequence |
| noun | topic | cloze.signature.noun.semantic-field |
| adjective | affect | cloze.signature.adjective.affective-consistency |
| adverb | affect / direction | cloze.signature.adverb.affective-consistency |
| phrase | contextual-meaning | cloze.signature.phrase.contextual-composition |

`pos: "other"` never carries a signature facet.

## Required Top-Level Shape

```json
{
  "schemaVersion": "cloze-analysis-v1",
  "paperId": "paper-...",
  "sourceAssetVersion": 1,
  "targetGroups": ["group-...cloze"],
  "meta": {
    "generatedBy": "external-ai",
    "promptVersion": "cloze-analysis-v1",
    "reviewStatus": "reviewed"
  },
  "groups": {
    "group-...cloze": {
      "overview": "50–80字软目标的中文内容简介；记叙文须包含有意义的事件发展或转折",
      "fullTranslationZh": "填入正答后的全文中文翻译",
      "mainLine": {
        "theme": { "text": "要改变别人的看法，让人亲眼看到比光说更有用（show them, not tell them）。", "quote": "show them, not tell them" },
        "paragraphs": [
          { "paragraphId": "para-...-1", "text": "学校开屋顶菜园，多数人觉得白费功夫。" }
        ],
        "emotion": "坚持→泄气→惊喜→欣慰"
      },
      "selectedLongSentences": [
        {
          "paragraphId": "para-...",
          "sourceText": "保留 __44__ 等空标的原文精确片段",
          "displayText": "按权威答案补全空格后的同一句",
          "relatedQuestionIds": ["q-...-044", "q-...-045"],
          "translationZh": "自然中文翻译",
          "analysisZh": "先找主干，再说明修饰和逻辑关系",
          "underlineRanges": [{"start": 0, "end": 1, "quote": "按"}]
        }
      ]
    }
  },
  "blanks": {
    "q-...-042": {
      "blankId": "blank-...-042",
      "blankNo": 42,
      "pos": "adjective",
      "role": "main",
      "context": "坚持几周没有结果，这是全文的低谷，要一个负面的情绪。",
      "find": {
        "check": "affect",
        "text": "几周没长东西（For weeks nothing grew），连坚持的米娅也动摇了（even Mia）。",
        "quotes": ["For weeks nothing grew", "even Mia"]
      },
      "correctFit": { "optionLabel": "B", "dictMeaning": "灰心的" },
      "distractorGlosses": [
        { "optionLabel": "A", "optionText": "hopeful", "meaning": "充满希望；几周没长东西（For weeks nothing grew）使连一开始愿意参加的米娅也失去了信心。", "quote": "For weeks nothing grew" },
        { "optionLabel": "C", "optionText": "proud", "meaning": "自豪；几周没长东西（For weeks nothing grew），此时还没有让她自豪的收成。", "quote": "For weeks nothing grew" },
        { "optionLabel": "D", "optionText": "curious", "meaning": "好奇；连米娅也动摇了（even Mia），这里强调长期没见进展带来的失望。", "quote": "even Mia" }
      ],
      "evidence": [
        {
          "type": "affective-cue",
          "signalText": "nothing grew",
          "signalSide": "context-before",
          "relation": "几周没长东西，米娅渐渐泄气。"
        },
        {
          "type": "collocation-partner",
          "signalText": "began to feel",
          "signalSide": "context-before",
          "targetText": "began to feel discouraged",
          "relation": "表示开始感到某种情绪（began to feel），后面接米娅的感受。"
        }
      ]
    }
  }
}
```

Do NOT fill `meta.model`, `meta.reviewedBy`, or `meta.reviewedAt` — the server
stamps real provenance after generation. Emit `meta` only as shown above
(`generatedBy`, `promptVersion`, `reviewStatus`).

## Required Fields Per Blank

Every `blanks[questionId]` MUST include:

- `blankId` — exact blankId from the input
- `blankNo` — integer blank number from the input
- `pos` — exactly one of: `verb`, `noun`, `adjective`, `adverb`, `phrase`, `other`
- `role` — `main` or `detail`
- `context` — 脉络，≤45
- `find` — `{ "check", "text", "quotes" }`，`text` ≤55；`posLabel` only when `pos` is `"other"`
- `correctFit` — object with `dictMeaning` (required: the dictionary sense
  closest to this sentence, a Chinese phrase of at most 8 units) and `meaning`
  (only when what the word refers to here differs from that sense: at most 12
  units; leave it out when the same). Chinese only, no 「意为」/「此处指」, no reason; `optionLabel` is recommended and MUST match the supplied answer key
  when present. Leave `reason` out; the server derives it.
- `distractorGlosses` — one entry per non-answer option, each with
  `optionLabel`, `optionText`, `meaning` (≤45, contextual meaning + what in the
  source rules it out), `quote` (exact substring of the passage that also appears
  in `meaning`)
- `evidence` — array with ≥1 item; MUST include ≥1 `collocation-partner` item

`groups[groupId].mainLine` is required: `theme { text, quote }`, `paragraphs`
(one per input paragraph, same order), `emotion` (string, may be `""`). Do not
write `thread`.

## Group Analysis

`groups[groupId]` MUST include:

- `overview` — required; the one canonical introduction shared by teaching,
  list/search and future similarity consumers. Aim for 50–80 Chinese characters
  without padding. For a narrative, include meaningful event progression or a
  turn rather than a static label; do not emit a separate `similaritySummary`.
- `fullTranslationZh` — required for new NCK1 generation; translate the complete
  answer-filled passage into natural Chinese in source order. Preserve paragraph
  breaks; do not hand-write blank-number markers. Precise insertion annotations
  supply identity; do not add analysis or vocabulary notes.
- `mainLine` — required; see 讲法 above. Do NOT write `affectiveArc`; the server
  copies it from `mainLine.emotion`.
- The Embedding vector itself is generated and versioned by the indexer, never
  by this analysis response.
- `selectedLongSentences` — required; 1–2 sentences with real teaching value,
  each with a stable `sentenceId`.
  Prefer a difficult sentence that carries the story's key meaning or connects
  several blanks; do not select it merely for length. `paragraphId` and
  `sourceText` must locate the stored source exactly and retain its `__44__`-style
  markers. `displayText` must be the deterministic form completed with the
  authoritative option texts. `relatedQuestionIds` must belong to this group.
  `analysisZh` first restores the main trunk, then attaches modifiers and logical
  relations instead of listing grammar labels. `underlineRanges` locates the
  decisive structure using Unicode code-point offsets in `displayText`, start
  inclusive/end exclusive, with the exact `quote`. Do not trim or normalize
  before counting. Usually 1–3 short ranges suffice; repeated phrases and overlaps
  are valid when explicitly located. The example offsets only illustrate the
  encoding; calculate them for your actual text. Do not also emit historical
  `underlineTexts`.
- `teachingContent` — required closed `objective-teaching-content-v1` annex with
  `sourceTextId`, exact `sourceAssetVersion`, translation paragraphs that are
  code-point slices of the one `fullTranslationZh` value and link existing source
  paragraph IDs, authoritative `completedSourceTexts`, and annotations. Every
  blank needs original-text `answer-evidence` plus one completed-text
  `answer-insertion` bound to its exact `blankId`; every long sentence needs
  `sentence-structure`. Ranges are `{textId,paragraphId,start,end,quote}` and may
  overlap or share questions. Select repeated occurrences by explicit offsets;
  never first-match, trim, normalize, or overwrite original exam blanks.
  Locate the actual replacement for each blank, not another copy of its answer.
  Text identities must be distinct. A non-key difficult sentence has empty
  `relatedQuestionIds` and sentence-structure `questionIds`; do not invent links.

## Evidence Rules

Evidence items record concrete, highlightable substrings.

Closed `type` vocabulary — use ONLY these values:

- `collocation-partner` — the collocating partner word (verb's subject/object, noun's modifier, etc.)
- `repetition-echo` — a same-word / synonym / antonym echo elsewhere
- `semantic-field` — a topic-field partner word (noun semantic-field signature)
- `affective-cue` — a word that sets the emotional tone (affective-consistency signature)
- `logical-connector` — a transition or cause word in context

**`type` and `signalSide` are two DIFFERENT axes — never mix them up.** `type`
is WHAT KIND of signal (the five values above). `signalSide` is WHERE it sits
(`context-before` / `context-after` / `stem` / `option`). `type` is NEVER
`"option"`, `"context-before"`, or any side value. An option-side signal is
written as `{ "type": "collocation-partner", "signalSide": "option", ... }`,
NOT `{ "type": "option" }`.

Each evidence item:

```json
{
  "type": "collocation-partner",
  "signalText": "exact substring of source",
  "signalSide": "context-before",
  "targetText": "optional connected phrase",
  "relation": "这处线索表明空格要写人物的感受。"
}
```

`signalSide` MUST be exactly one of: `context-before`, `context-after`, `stem`, `option`

`relation` 直接写中文句子，说明线索和答案的关系，省去「中文：」等前缀。

**Exact-substring rule:** `signalText` MUST be an exact substring of its source.
- `context-before` / `context-after` / `stem` signals: `signalText` MUST appear verbatim in the cloze passage text or question stem.
- `option` signals: `signalText` MUST appear verbatim in one of that blank's A–D option texts.

**Blank marker rule:** `signalText` MUST NOT include blank markers such as `__41__`, `__42__`, etc. Quote the surrounding words, NEVER the blank token itself.

**Option-side usage:** `option`-side signals are reserved for `phrase` blanks only, to decompose the phrase (e.g. highlight `empty` and `out` separately) alongside a `contextual-composition` signature. Single-word blanks highlight in the passage, not the option. Correct shape for an option-side decomposition signal:

```json
{ "type": "collocation-partner", "signalText": "empty", "signalSide": "option", "targetText": "empty out", "relation": "清空（empty）表示把里面的东西去掉。" }
```

Use short `signalText` (1–8 words). Use `targetText` for the larger connected object.

Do NOT pad evidence. Add an item only when it genuinely helps.

## Strictly Forbidden

- Do NOT output chat JSON or markdown.
- Do NOT invent blank IDs, question IDs, group IDs, or option labels.
- Do NOT change passage text, option text, or answer labels.
- Do NOT use `seven-choices.*` facet keys; this is `cloze.*` vocabulary only.
- Do NOT include `schemaVersion: "seven-choices-analysis-v1"` — it MUST be `"cloze-analysis-v1"`.
- Do NOT write `signatureFacet`, `correctFit.reason`, or `affectiveArc`; the server derives them.
- Do NOT use `find.check: "logic"` unless the options themselves are connectors, logical adverbs, or logical phrases.
- Do NOT write the blank's own number in `context` or `find.text`.
- Do NOT include a blank marker (`__41__` and similar) in any `signalText`.
- Do NOT overwrite or contradict the authoritative answer key.
- Do NOT omit the ≥1 `collocation-partner` evidence per blank.
- Do NOT create fields named `contextClues`, `上下文线索`, `answer`, `correctAnswer`, `analysisZh`, or `questionSide`.
