# Reading Analysis — Quote Coverage Report

Generated: deterministic by `scripts/reading-analysis-report.mjs`

Source: `app/src/features/reading-analysis/sidecar/index.json` (13 samples)
API:    `http://127.0.0.1:8787`

## Summary

- total groups: 13
- ok groups: 13
- failed groups: 0
- total sidecar entries: 31
- hits: 28
- misses: 3
- miss rate: 9.7%

## Miss Reason Breakdown

| reason | count |
|---|---:|
| not_found | 0 |
| cross_sentence | 3 |
| multiple_matches | 0 |

## Per Group Coverage

| groupId | title | case | entries | hits | misses |
|---|---|---|---:|---:|---:|
| `g-9b30c735-6824-4897-a938-6d5c42bee39a` | 2023 浙江卷（1月）阅读 B — jump on that bandwagon | normal-hit | 3 | 3 | 0 |
| `g-150f444a-808d-4ae7-b129-4d54ea7b9489` | 2023 浙江卷（1月）阅读 A — Explorers Camp | normal-hit | 3 | 3 | 0 |
| `g-d948a878-d4cb-46b8-938f-ff5adb78add9` | 2023 浙江卷（1月）阅读 C — Project Debater | cross-sentence | 2 | 1 | 1 |
| `g-f99df5e8-5d1c-4193-8ed9-a53b7273cfa5` | 2023 浙江卷（1月）阅读 D — Solar farms | partial-quote | 2 | 2 | 0 |
| `g-775ad76c-8382-4acc-be18-7282f8555a38` | 2021 新课标Ⅰ卷 阅读 B — Page Turner | same-sentence-multi | 3 | 3 | 0 |
| `g-9c52ac23-4dee-46a3-bec5-d7e989debf9b` | 2025 新课标I 阅读 C — Take Back Our Streets | long-quote | 2 | 2 | 0 |
| `g-2266045f-4f53-43e2-acb9-fecff1f2a5bc` | 2025 新课标I 阅读 D — Microplastics + boiling | cross-sentence | 2 | 1 | 1 |
| `g-9a602eb7-691d-4b18-9fb8-bc3e40edddcd` | 2025 新课标Ⅱ 阅读 C — Houseplant boom | same-sentence-multi | 3 | 3 | 0 |
| `g-de05a235-7aab-492a-bca8-e4be6d626336` | 2025 新课标Ⅱ 阅读 D — wastED restaurant | cross-sentence | 2 | 1 | 1 |
| `g-4d8ec5a1-3c82-4707-b894-d61211d08ef4` | 2025 浙江卷（1月）阅读 A — Interlibrary Loan | long-quote | 2 | 2 | 0 |
| `g-6d8e85bb-8616-4304-b51b-309d0143f773` | 2025 浙江卷（1月）阅读 B — Don't talk about food | punctuation-difference | 2 | 2 | 0 |
| `g-d0481f78-8f75-40da-8ac3-39c2baf9e97d` | 2025 新课标I 阅读 B — Ninth-grade writing | punctuation-difference | 2 | 2 | 0 |
| `g-2a3e3f2a-4845-45bb-b4f5-a98d552be6dc` | 2021 全国乙 阅读 D — Open offices and creativity | long-quote | 3 | 3 | 0 |

## Miss Details

### `g-d948a878-d4cb-46b8-938f-ff5adb78add9` / Q1

- kind: evidence
- reason: cross_sentence
- group: 2023 浙江卷（1月）阅读 C — Project Debater
- quote:

> a software program called Project Debater beat its human opponents, including Noa Ovadia, Israel's former national debating champion. Brilliant though it is, Project Debater has some weaknesses.

### `g-2266045f-4f53-43e2-acb9-fecff1f2a5bc` / Q2

- kind: evidence
- reason: cross_sentence
- group: 2025 新课标I 阅读 D — Microplastics + boiling
- quote:

> this process relies on the water containing enough calcium carbonate (碳酸钙) to trap the plastics. In the study, boiling hard water containing 300 milligrams of calcium carbonate led to an almost 90 percent drop in plastics.

### `g-de05a235-7aab-492a-bca8-e4be6d626336` / Q2

- kind: evidence
- reason: cross_sentence
- group: 2025 新课标Ⅱ 阅读 D — wastED restaurant
- quote:

> But last month, one popular New York City restaurant tried a different way: It changed its menu to exclusively (专门) offer food that would otherwise be thrown away. For two weeks in March, Greenwich Village's Blue Hill restaurant was renamed wastED, and served items like fried skate cartilage, a juice pulp burger, and a dumpster diver's vegetable salad.

## Notable Hits with Coexistence

| groupId | Q | option | kind |
|---|---|---|---|
| `g-9b30c735-6824-4897-a938-6d5c42bee39a` | 1 | B | evidence |
| `g-150f444a-808d-4ae7-b129-4d54ea7b9489` | 1 | A | evidence |
| `g-775ad76c-8382-4acc-be18-7282f8555a38` | 1 | A | evidence |
| `g-775ad76c-8382-4acc-be18-7282f8555a38` | 1 | B | trap |
| `g-9a602eb7-691d-4b18-9fb8-bc3e40edddcd` | 1 | D | evidence |
| `g-9a602eb7-691d-4b18-9fb8-bc3e40edddcd` | 1 | A | trap |
| `g-2a3e3f2a-4845-45bb-b4f5-a98d552be6dc` | 1 | A | evidence |

## Initial Recommendation

Hit rate 90.3% across 31 entries from 13 groups.

Sample size is at or above the working floor (30 entries), but coverage is still narrow and skewed toward 阅读 reading prompts. The numbers below are a first-look snapshot, not evidence of representativeness — keep adding real samples before discussing any matcher policy change.

- Cross-sentence misses: 3. Expected for the current single-sentence matcher; sidecar authors can either tighten the quote to a single sentence or accept the miss until matcher policy is revisited.
- multiple_matches: 0 in current sample. If real candidates show up later they should be flagged in this section, not silently disambiguated.

Do not introduce fuzzy matching, adjacent-sentence concatenation, or token-level matching at this stage. Continue observing as the sidecar grows.
