<!-- 第九轮用的开放版「定位」一节草稿（未进 prompts/，等 Owner 定）。 -->

### 定位 (how a reader gets back to the answer)

Purpose. The answer key is given and the reviewed analysis already says why
the correct option is right. 定位 does two things for a student reading the
analysis:
1. help them see where in the passage the answer comes from, and how the
   stem and the correct option match the passage;
2. show them, on this question's own words and paragraphs, how a strong
   reader gets from the question back to that place, so they can do the same
   on the next paper.

Write it as a good teacher would say it beside the question: concrete, on
this question, never a general tip ("先找关键词再回原文" teaches nothing).

What the page shows. The stem is printed with your 定位词 in bold; the
passage is printed with the 定位词's counterpart marked and the answer words
highlighted; under the question comes your one 找法 line. The line can point
at those marks by name.

How strong readers get back to the passage. These are directions, not a
checklist; use what fits this question, or a better path if you see one.
- A distinctive stem word (a name, a number, a date, a rare term, a quoted or
  underlined word) usually leads straight to one sentence. When the passage
  says it in other words, the pair is the lesson (stem "started", passage
  "opened").
- The asking word says what to look for once you are there: a cause after
  why, an action for suggest / advise, a date for when, the speaker's words
  for what X thinks.
- From where you land, signal words point to the answer: after but / however
  / yet is the real point; So / That's why at the start means the cause is
  before; a pronoun (it, this, there, such) points back to what it names; an
  example serves the point next to it.
- Questions mostly follow passage order.
- Some questions have no single sentence: which is true, what two things have
  in common, who would most likely, how many in all, numbers read off a
  chart. Then say how to check: which word of each option to carry back, or
  that the number comes from the chart, and where the correct option's
  support is.
- A question on the whole text or on one named paragraph: say what to read
  (the opening, the last paragraph, the word the text keeps coming back to).
- When the stem itself already names the paragraph or quotes the word, do
  not repeat that; say what around it decides the answer (a restatement next
  to the word, the turn after But).

Output per question:

`findZh` (required, every question) — the 找法 line: one Chinese line, at
most 45 units (each Chinese character and each English word counts as one).
English words in it are copied from the stem, the options or the passage.
Name a paragraph only as [[paragraphId]]; the page prints it the way this
passage is labelled, so never write 第 N 段 yourself. Never use an English
word that only a wrong option uses: that leads the student to the trap. Do not
give the answer letter, and do not copy the analysis's own explanation.

`locateBy` (required) — `stem` when the stem leads a reader to one passage
sentence; otherwise `options` (the options have to be checked in different
places) or `passage` (the whole text or a whole paragraph).

`locate` (only when `locateBy` is `stem`) — the marks the page draws:
- `sourceText`: 1-5 English words copied exactly from the stem (not the whole
  stem): the 定位词 printed in bold.
- `targetText`: the one complete passage sentence the reader lands on, copied
  exactly; `targetParagraphId`: its paragraph.
- `targetCue`: the 1-5 words inside `targetText` that match `sourceText`,
  when the passage words differ from the stem words; omit it when
  `sourceText` appears in `targetText` as is.
- `answerText`: the deciding passage words, copied from one `quote` of the
  correct option's evidence; keep it to what the correct option rewrites.
- `note`: a short Chinese line for the record: which stem words lead to
  which passage words.

Examples (made-up passage):

```json
{
  "q1": {
    "locateBy": "stem",
    "findZh": "抓题干 started，[[para-2]] 里换成了 opened；顺着 But 往后读，开张后的实情在后一句",
    "locate": {
      "sourceText": "started",
      "targetText": "When Mia opened her bakery, she expected few customers.",
      "targetParagraphId": "para-2",
      "targetCue": "opened",
      "answerText": "the shop was full every morning",
      "note": "题干 started 对应原文 opened。"
    }
  },
  "q2": {
    "locateBy": "options",
    "findZh": "四项各带一个地名回原文核对，只有 harbour 在 [[para-4]] 和 free 写在同一句"
  },
  "q3": {
    "locateBy": "passage",
    "findZh": "问全文主旨，看 [[para-1]] 提出的问题和 [[para-6]] 的结论，全文反复回到 trust 这个词"
  }
}
```
