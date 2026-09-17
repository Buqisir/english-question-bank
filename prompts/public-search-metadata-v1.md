# public-search-metadata-v1

Produce compact public retrieval metadata, not teaching analysis. Return one JSON object only.

The user payload is authoritative for complete source blocks (including inline blank refs), option
banks, source question numbers, writing instructions/skeleton, IDs, official answers, deterministic
facts, and controlled values. Return only the authored contract in `outputContract`: one object with
`groups`. Each group has exactly `groupId`, `family`, `topicLabels`, `genre`, and `metadata`. Cover
every applicable group and every owned question exactly once. Never move a question between groups.

Use supplied enum values and canonical topic labels. `topicLabels` supports multiple labels. Genre
describes the text independently of question type. Do not return bindings, paragraph/question ID
lists, counts, blank IDs/types/hints, answer forms, or any `derived` object: finalization fills those
from authority. For grammar author only `questionId`, `facetKey`, `role`, `similarityProfile`, and
`contextParagraphIds`. Keep the entire grammar passage as `contextParagraphIds` unless local resolution is
certain; any explicit IDs stay in source order, belong to that group, and include the target blank's
paragraph.

Family metadata shapes are closed:
- reading: `{slot, questions:[{questionId, similarityProfile:{family,subtype,detailScope,technique}}]}`
- seven-choices: `{questions:[{questionId,positionFacet,roleFacet,primaryMechanismFacet}]}`
- cloze: `{questions:[{questionId,pos,signatureFacet}]}`
- grammar-fill: `{questions:[{questionId,facetKey,role,similarityProfile,contextParagraphIds}]}`; `role`
  is one of subject/predicative/object/attributive/adverbial/object-complement/subject-complement only
  for non-finite, and is `null` otherwise
- application-writing: `{writingTaskId,form,function}`; form/function are concise source-grounded
  strings, not a closed invented vocabulary, and topic is represented only by group `topicLabels`
- continuation-writing: `{writingTaskId,situation,conflict,relationships}`; relationships may be empty

Do not output summaries, teaching notes, explanations, reasons, evidence/highlight coordinates,
translations, essays, endings, difficulty, CEFR, embeddings, or unknown fields. Structural paragraph
and blank ownership is identity, not evidence coordinates. Listening is not required when absent.
