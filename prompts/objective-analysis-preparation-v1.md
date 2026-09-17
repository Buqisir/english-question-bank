# Objective Analysis Preparation Draft — V1 (local pilot)

Append this supplement after the type-specific contract and teaching schema for
the local cloze/grammar pilot. It does not change the accepted schema or the
publication workflow. The coordinator prepares the draft with
`scripts/import-pipeline/prepare-objective-analysis.mjs` and then runs the
existing type-specific validators and identity checks. A draft is not an accepted analysis.

The coordinator's single-group and full-paper paths use the grammar type
validator's existing alternative-answer rules. Never change the official key,
silently select a different source, or bypass a validator to claim acceptance.

## Keep explanations sufficient and accurate

- Give the correct answer's decisive contextual or syntactic reason. One clear
  sentence is enough when it explains the step; retain needed reasoning for
  harder questions rather than enforcing a word count.
- For each required distractor, state its meaning in the complete sentence and
  the concrete contextual mismatch. An imagined temptation is NOT required,
  consistent with the cloze prompt/doctrine. Include it only when a real
  textual overlap helps explain the choice; do not invent motives or events.
- A grammatical alternative can be wrong in this context. Do not turn that
  contextual preference into an invented universal grammar or usage rule.
  Evaluate the whole construction, including words following the blank.
- Keep classification and evidence fields complete. Prose may be plain; it must
  not overstate evidence or replace explanation with an internal label.

## Let the program produce mechanical fields

This section overrides only draft packaging requirements for the following
fields, not answers, source texts, quotations or semantic associations:

1. Omit every range's numeric `start` and `end`. Retain its exact `quote`,
   `textId` and `paragraphId`; translation paragraph records also retain
   `sourceParagraphIds`. Select quotes unique within the specified paragraph.
   If a needed quotation is repeated, provide verified explicit offsets to
   disambiguate that occurrence or report a blocker. Never silently pick first.
2. `completedSourceTexts` entries retain `textId` and `paragraphId` but omit
   `text`. The program completes the original paragraph using authoritative
   answers and the existing spacing/hint rules.
3. Selected sentences retain exact `sourceText`, `paragraphId`, `sentenceId`,
   question links, explanation and translation; omit `displayText`. Use
   `underlineTexts` for 1–3 exact short fragments of the correctly completed
   sentence, not `underlineRanges`. The program produces display and ranges.
4. An answer-insertion's English `quote` is the exact authoritative inserted
   answer text (the option text, not its letter, for cloze). Preserve its blank,
   question, paragraph and completed-text IDs. The program identifies the actual
   insertion by blank identity, even if that answer appears elsewhere.

Everything semantic remains your work: complete translation, source-paragraph
mapping, evidence selection, matching Chinese passages, and question/sentence
links. The Chinese quote must express the selected English evidence, not just
the answer or a nearby sentence. Do not put alignment commentary in teaching
prose. Do not change an original source or silently repair a source anomaly.

The full Chinese translation must include the meaning of every filled answer.
`[blankNo]` is a label beside that translated meaning, never a replacement for
it. For example, translate an inserted `happy` as `[12]高兴`, not just `[12]`.
Keep every required label exactly once and in source-question order.

For grammar, when the official key contains slash-separated alternatives,
`blanks[questionId].answer` must contain one accepted alternative, not the joined
list. Explain the alternatives when relevant without changing the official key.
This does not change the existing mechanical completion rule: completed source
text uses the official key verbatim, so an answer-insertion's English quote
still contains that exact official text, including its slash when present.

Write one JSON draft file. Check its structure, answer agreement and exact
quotations once; do not spend model work calculating routine offsets. No second
style pass, advisor or automatic repair. Report unresolved semantic/source
issues separately in the final delivery, without adding forbidden JSON fields.
