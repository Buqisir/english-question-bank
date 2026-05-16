# Reading Analysis — Quote Coverage Report

Generated: 2026-05-16T09:29:32.687Z

Source: `app/src/features/reading-analysis/sidecar/index.json` (5 samples)
API:    `http://127.0.0.1:8787`

## Summary

- total groups: 5
- ok groups: 5
- failed groups: 0
- total sidecar entries: 13
- hits: 12
- misses: 1
- miss rate: 7.7%

## Miss Reason Breakdown

| reason | count |
|---|---:|
| not_found | 0 |
| cross_sentence | 1 |
| multiple_matches | 0 |

## Per Group Coverage

| groupId | title | case | entries | hits | misses |
|---|---|---|---:|---:|---:|
| `g-9b30c735-6824-4897-a938-6d5c42bee39a` | 2023 浙江卷（1月）阅读 B — jump on that bandwagon | normal-hit | 3 | 3 | 0 |
| `g-150f444a-808d-4ae7-b129-4d54ea7b9489` | 2023 浙江卷（1月）阅读 A — Explorers Camp | normal-hit | 3 | 3 | 0 |
| `g-d948a878-d4cb-46b8-938f-ff5adb78add9` | 2023 浙江卷（1月）阅读 C — Project Debater | cross-sentence | 2 | 1 | 1 |
| `g-f99df5e8-5d1c-4193-8ed9-a53b7273cfa5` | 2023 浙江卷（1月）阅读 D — Solar farms | partial-quote | 2 | 2 | 0 |
| `g-775ad76c-8382-4acc-be18-7282f8555a38` | 2021 新课标Ⅰ卷 阅读 B — Page Turner | same-sentence-multi | 3 | 3 | 0 |

## Miss Details

### `g-d948a878-d4cb-46b8-938f-ff5adb78add9` / Q1

- kind: evidence
- reason: cross_sentence
- group: 2023 浙江卷（1月）阅读 C — Project Debater
- quote:

> a software program called Project Debater beat its human opponents, including Noa Ovadia, Israel's former national debating champion. Brilliant though it is, Project Debater has some weaknesses.

## Notable Hits with Coexistence

| groupId | Q | option | kind |
|---|---|---|---|
| `g-9b30c735-6824-4897-a938-6d5c42bee39a` | 1 | B | evidence |
| `g-150f444a-808d-4ae7-b129-4d54ea7b9489` | 1 | A | evidence |
| `g-775ad76c-8382-4acc-be18-7282f8555a38` | 1 | A | evidence |
| `g-775ad76c-8382-4acc-be18-7282f8555a38` | 1 | B | trap |

## Initial Recommendation

Hit rate 92.3% across 13 entries.

Cross-sentence misses: 1. Lowest-risk fix is an "adjacent-sentence concatenation" probe BEFORE introducing fuzzy matching — try locating the quote across pairs of consecutive sentences in the same paragraph. Defer fuzzy / token-level matchers until cross_sentence misses exceed ~20% of total entries.

Overall miss rate 7.7% is below the 20% upgrade threshold; do NOT add fuzzy matching yet.
