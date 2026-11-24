# Direct speech in continuation sources and model essays (2026-11-24)

Question raised by a teacher: the given passages use direct speech sparingly,
so a continuation aligned with the source should use little direct speech too.
This note records the measurements; the decision is the Owner's.

## Method

- Direct speech: words inside “ ” or " " as a share of all words, and the
  number of quoted segments. Signs or notes in quotation marks also count, so
  the share slightly overstates speech.
- Reported speech: sentences with no quotation mark that contain said, asked,
  told, explained, replied, shouted, whispered and similar verbs. A rough proxy.
- Sources: every continuation task in `test-fixtures/retired-paper-assets`
  (2020–2026 national and Zhejiang papers) plus paper-mock-sz-2026-m1,
  deduplicated by story (the Ⅰ and Ⅱ papers of 2022–2024 share a story):
  20 stories. paper-zj-2026-jan is held out and excluded.
- Essays: four reference teacher essays and six reference student essays for
  2024–2025 papers (numbers only, no text kept here), our 7 V3 trial outputs and
  4 V2 trial outputs.

## Results

| group | n | median share of words in direct speech | range |
|---|---|---|---|
| source passages | 20 stories | 4% | 0%–36% |
| reference teacher essays | 4 | 23% | 14%–38% |
| reference student essays | 6 | 9% | 1%–13% |
| V3 standard (trial) | 7 | 18% | 4%–32% |
| V3 advanced (trial) | 7 | 17% | 7%–25% |
| V2 production (trial) | 4 | 15% | 1%–23% |

- 5 of 20 stories have no direct speech at all; only 3 go above 10%
  (2020 新高考Ⅰ 36%, 2020.1 浙江 22%, 深圳一模 2026 about 10%). Since 2021 no
  national or Zhejiang source goes above 11%.
- Across the 20 stories there are 49 quoted segments and 45 reported-speech
  sentences. Leaving out the three dialogue-heavy stories, reported speech
  outnumbers direct speech (about 40 to 25): the sources mostly tell what people
  said rather than quote it.
- Every group of continuations uses far more direct speech than the sources:
  teacher essays about 6 times, our trial outputs about 4 times, reference
  student essays about 2 times.

## Reading

- The teacher's observation holds for the sources, most clearly for 2021–2026.
- A continuation covers the turn and the resolution, where a few spoken lines
  are natural, so some rise over the source is expected. A rise of 4–6 times is
  not explained by that alone.
- Our prompts already ask for restrained dialogue (V2: dialogue only when it
  changes understanding, decision or relationship; V3 principles 3 and 5), yet
  the outputs still run at 15–18%. The wording is not biting.
- One expert source agrees: the 2022 effective-response paper keeps direct
  speech limited because its source has no dialogue
  (`docs/sources/continuation-writing/notes/03-chen-yusong-effective-response-2022.md`).
