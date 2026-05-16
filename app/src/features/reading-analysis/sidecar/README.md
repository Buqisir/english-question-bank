# Reading Analysis Sidecar Samples

Hand-curated sidecar entries used by the Reading Analysis demo route and by
`scripts/reading-analysis-report.mjs`. Samples are picked to cover the
boundary cases of the current single-sentence quote matcher; the matcher
itself is intentionally NOT changed by adding new samples.

## Authoring rules

- Every quote must come from real `QuestionGroupDetail` content (passage or
  option text). Do not synthesize evidence that does not exist in the source.
- Every group's `data/<groupId>.json` must be referenced from `index.json`.
- Each group carries 1–3 entries; we go for boundary coverage, not volume.
- A group with 0 sidecar entries is allowed and renders as plain reading +
  question without dashed lines.

## Cases

| case                   | meaning                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `normal-hit`           | Quote is a single sentence (or substring) and should hit cleanly.                                                                       |
| `partial-quote`        | Quote is a mid-sentence substring; verifies that `includes()` is enough.                                                                 |
| `long-quote`           | Quote is a long single sentence; checks that the matcher and downstream UI cope with multi-clause spans.                                 |
| `same-sentence-multi`  | Stem evidence + 1+ option link land on the same sentence; selector should keep all annotations and emit `same_sentence_multi` tags.      |
| `cross-sentence`       | Quote intentionally spans two sentences; the current single-sentence matcher will produce a `cross_sentence` miss. Documented, not bug.  |
| `punctuation-difference` | Quote uses a different apostrophe / dash / spacing variant than the source; `normalizeQuote()` should still hit.                       |

## Samples

| groupId                                           | questionNo | case                  |
| ------------------------------------------------- | ---------: | --------------------- |
| `g-9b30c735-6824-4897-a938-6d5c42bee39a`          |          1 | normal-hit            |
| `g-150f444a-808d-4ae7-b129-4d54ea7b9489`          |          1 | normal-hit            |
| `g-d948a878-d4cb-46b8-938f-ff5adb78add9`          |          1 | cross-sentence        |
| `g-f99df5e8-5d1c-4193-8ed9-a53b7273cfa5`          |          1 | partial-quote         |
| `g-775ad76c-8382-4acc-be18-7282f8555a38`          |          1 | same-sentence-multi   |
| `g-9c52ac23-4dee-46a3-bec5-d7e989debf9b`          |          1 | long-quote            |
| `g-2266045f-4f53-43e2-acb9-fecff1f2a5bc`          |          2 | cross-sentence        |
| `g-9a602eb7-691d-4b18-9fb8-bc3e40edddcd`          |          1 | same-sentence-multi   |
| `g-de05a235-7aab-492a-bca8-e4be6d626336`          |          2 | cross-sentence        |
| `g-4d8ec5a1-3c82-4707-b894-d61211d08ef4`          |          1 | long-quote            |
| `g-6d8e85bb-8616-4304-b51b-309d0143f773`          |          1 | punctuation-difference |
| `g-d0481f78-8f75-40da-8ac3-39c2baf9e97d`          |          1 | punctuation-difference |
| `g-2a3e3f2a-4845-45bb-b4f5-a98d552be6dc`          |          1 | long-quote            |

## Coverage targets

- ≥ 12 groups, ≥ 30 entries.
- ≥ 3 cross-sentence samples (intentional misses).
- ≥ 2 punctuation/whitespace difference samples.
- ≥ 2 long-quote samples.
- `multiple_matches` only if a real candidate exists in the live API; do not
  fabricate one. If found, add it explicitly here.

## Why no `multiple_matches` sample yet

The matcher emits `multiple_matches` when the leading 30 normalized chars of
a quote appear in 2+ separate sentences. None of the real groups currently
in the live SQLite has produced that case for any reasonable sidecar quote.
If a real candidate shows up later (e.g. a passage that repeats the same
clause across paragraphs), add it explicitly rather than synthesizing one.

## Why some 2026 groups are excluded

The 2026 浙江卷（1月）题目版 reading groups (e.g. `g-6e87fbdf`,
`g-76da9842`) currently store empty `options` arrays in the live API. The
selector correctly rejects them with `unsupported-question-type`. They will
become eligible once their 答案版 counterparts land.
