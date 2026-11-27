# NCK1 Listening Teaching Analysis — V1

Produce one complete `listening-analysis-v1` object for either one supplied listening material or the supplied ten-material NCK1 listening unit. Never use another paper or a previous material as context. Method: `docs/product/listening-methods.md` v1.

## Authority and materials

- Copy every `segmentId`, `questionId`, transcript, and official answer exactly from the structured input. The official answer is immutable; do not solve again or substitute your own answer.
- For every material, give a complete, natural Chinese translation of the exact transcript, one main topic as the exact linked `theme` → `themeGroup` → `subtopic` triple selected from the supplied taxonomy, and one useful Chinese summary. In `summaryZh`, describe only the speakers, setting, and main event. Omit the specific conclusions or calculation results tested by the questions. Aim for 20–40 Chinese characters; this is a soft writing target, so never pad or truncate meaning merely to meet it.
- For every question, translate the stem and A/B/C options. In `evidence.quote`, copy one continuous span from exactly one aligned sentence in that question's own transcript segment. Include enough of that sentence to show what supports the answer, including any decisive person, quantity, unit, time, or other qualifier. When the answer needs a premise from another sentence or turn, keep the decisive sentence as evidence and explain the other premise in `reasonZh`. Keep the quote verbatim, without added ellipses or stitched excerpts.

Example: If an earlier turn names Paris and the reply is `We'll stay there for 4 nights.`, a question about the length of the stay in Paris needs `We'll stay there for 4 nights.` in `evidence.quote`. Explain in `reasonZh` that the earlier turn establishes Paris and the reply gives the length of the stay, four nights.
- A material may own two or more questions and one quote may support several questions. Keep each question bound to its actual `segmentId`. Do not create timestamps, audio cuts, ASR evidence, publication approval, or search scores.

## What a student needs from a listening explanation

A student who chose wrong almost always heard something. The explanation has two jobs:
1. show how the words in the recording become the correct option, so next time the student listens for the idea, not the same word;
2. show why the wrong option that borrows words from the recording is wrong, so the student stops choosing whatever word they heard.

Do not teach slogans (「注意转折词」「听前预测」「抓关键词」), and never advise previewing options for keywords. Every sentence must land on this question's own words.

## `reasonZh`: how the answer meets the recording

1. **First sentence: how the option meets the recording, in plain words.** The page prints no type label, so say it:
   - the option keeps the speaker's own word: 「男士直接说了生物学（Biology），选项沿用」;
   - the option says the same thing in other words, naming both: 「“推迟会面”就是萨拉说的中午前到不了、改到下午见（can't arrive before noon … meet this afternoon）」;
   - the option sums several things up: 「看房、谈学校、说新家，都围绕刚搬的新住处」;
   - it is worked out one step past the recording; write the premise and the step: 「男士感谢凯特周末招待，又说自己的航班快起飞了（My flight will take off soon），可见凯特是在送他」;
   - it is calculated; write the whole operation: 「约好 8 点到，路上 20 分钟，8:00 − 20 分钟 = 7:40 出发」.
   Never call it 换说法 or 同义替换 when the option keeps the speaker's word. Never open with 「本题询问」「题目问」, and never name the question type.
2. **Who said it, when it applies.** When the question is about one speaker, or about a plan that changed, make clear who said the deciding words and which time they refer to. When paraphrasing, retain any qualifier that affects the answer, including who, how many and for how long.
3. **As long as the question needs, no longer.** One stated fact: one sentence, about 40 Chinese characters, ending 「选 B」. Inference, calculation, or two places put together: up to about 80.
4. **Chinese first, English in brackets, only the deciding words** (one to three short word groups, `…` for a cut in `reasonZh` only). The evidence quote is printed above your text: never copy it again, and never leave English bare inside a Chinese sentence.

## `distractors`: the wrong options that borrow from the recording

Each question in the input carries `wrongOptions`: for every wrong option, `heardInRecording` (the option's content words and numbers the program found in this material's transcript) and `mustExplain`.

1. **`mustExplain: true` → this option MUST have a distractor entry.** The validator rejects a draft that leaves one out. Say what was heard and why it does not answer this question, in one or two sentences:
   - the word is there but means something else here: 「服务员说算错账单是个严重失误（terrible mistake），这句谈的是账单金额」;
   - it was the other speaker, or another person: 「烧烤是女士的安排，男士说的是还想去钓鱼」;
   - it is the wrong time, or a plan that changed: 「鲍勃上周五（last Friday）出院，男士这周六才去看他」;
   - it was said, then denied or turned around (but, actually, not, instead): quote the turn;
   - it answers a different question from the recording: 「记录数据是分组做实验时的分工，提前做完要做的是清理台面」;
   - it is a detail, not the point or purpose: 「书是介绍嘉宾时顺带提到的，整段话是在请嘉宾上台」;
   - a heard number used for the wrong thing, or the usual miscalculation.
   If the heard word is only incidental, still write one short honest sentence. Do not write a type name such as 原词复现、张冠李戴、偷换概念、无中生有 anywhere; the sentence itself shows the trick.
2. **`mustExplain: false` with some heard words**: explain it only if a student could plausibly choose it; otherwise omit.
3. **Nothing heard and nothing near it**: omit. Never write 「与原文不符」「原文未提及」 as an explanation of an option that borrows the recording's words.
4. Quote only the half-sentence that proves the point, Chinese first with the English in brackets, as in `reasonZh`.
5. Do not repeat `reasonZh`. If its first sentence already shows why an option is wrong, the distractor sentence adds only what is missing.
6. Never explain the official answer as a distractor. Omit `distractors` when no option needs one.

## Output

Return exactly one JSON object and nothing else. No markdown fence, heading, preface, or trailing comment. Use exactly the schema included in the caller's message; do not add fields. `wrongOptions` is input only: never copy it into the output.
