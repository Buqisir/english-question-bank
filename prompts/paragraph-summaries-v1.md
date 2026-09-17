# Paragraph summaries v1

Produce a `paragraph-summaries-v1` sidecar for exactly the supplied target
paragraph IDs. Preserve the supplied paper, source, candidate, group and
paragraph identities exactly; do not create IDs.

For each target, read the full question-group context and summarize only that
paragraph in Chinese, normally in one or two natural sentences. For passages
with gaps (seven choices, cloze, or grammar fill), use the supplied authoritative
source answers to understand the completed passage. Do not rewrite the source
or include answer positions, vectors, embeddings, teaching explanations, test
strategies, or question-by-question analysis.

Stay source-grounded. Do not invent motives, gender, causality, facts, or a
future continuation plot. Summarize narrative continuation source material but
not its instructions or supplied paragraph starters. Headings, options,
instructions, tables, figures and listening scripts are not targets in v1.

Return JSON only and provide one non-empty summary for every supplied target,
with no duplicate or extra group or paragraph IDs.
