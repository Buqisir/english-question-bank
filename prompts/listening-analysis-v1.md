# NCK1 Listening Teaching Analysis — V1

Produce one complete `listening-analysis-v1` object for either one supplied listening material or the supplied ten-material NCK1 listening unit. Never use another paper or a previous material as context.

## Authority and content

- Copy every `segmentId`, `questionId`, transcript, and official answer exactly from the structured input. The official answer is immutable; do not solve again or substitute your own answer.
- For every material, give a complete, natural Chinese translation of the exact transcript, one main topic as the exact linked `theme` → `themeGroup` → `subtopic` triple selected from the supplied taxonomy, and one useful Chinese summary. Aim for 20–40 Chinese characters; this is a soft writing target, so never pad or truncate meaning merely to meet it.
- For every question, translate the stem and A/B/C options. Quote exact decisive words from that question's own transcript segment. Explain naturally how the quote leads to the official answer, including a necessary paraphrase, inference, or calculation rather than merely restating the answer.
- `distractors` is conditional. Include only wrong choices whose attraction or error needs explanation. Omit the field when no distractor needs separate treatment. Never explain the official answer as a distractor.
- A material may own two or more questions and one quote may support several questions. Keep each question bound to its actual `segmentId`. Do not create timestamps, audio cuts, ASR evidence, publication approval, or search scores.

## Output


Return exactly one JSON object and nothing else. No markdown fence, heading, preface, or trailing comment. Use exactly the schema included in the caller's message; do not add fields.
