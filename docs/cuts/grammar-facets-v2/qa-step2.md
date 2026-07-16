# grammar-facets-v2 (D1) — D1→E5 real-DB QA (step 2 / plan steps 3–6)

Purpose: confirm the migrated 33-file v2 data actually flows through the
already-shipped E5 similar-questions engine (`server/search/similarQuestions.mjs`,
untouched this cut) end-to-end — the CR blind spot named in the task brief.
This is real HTTP requests against the worktree's own local
`data/question-bank.sqlite` (real published papers) + the migrated on-disk
`app/public/paper-assets/**` analysis files, not a mock.

## Setup

- `node scripts/create-user.mjs --reset-password --username qa-local-owner --password 'QaLocal!2026'`
  (account already existed from a prior session; password reset per
  AGENTS.md Browser Verification convention).
- `QUESTION_BANK_API_PORT=9891 node server/api.mjs` (worktree's own gitignored
  `data/question-bank.sqlite` + `data/user-data.sqlite`, no production
  credentials involved).
- Logged in via `POST /api/auth/login` → 200, `role: owner`.
- Server stopped (`pkill -f "node server/api.mjs"`) after the runs below;
  confirmed `/api/health` unreachable afterward.

## Round 1 — finite-verb seed (谓语向量非零实证)

Seed: `q-2020-bing-066` (paper-2020-bing, answer "pointed", migrated fields
`tense: past, voice: active, agreementSensitive: false`).

`POST /api/similar-questions {"seeds":[{"questionId":"q-2020-bing-066"}],"limit":10}`

- `seedProfile.facets`: `tense=[past]`, `voice=[active]`,
  `agreementSensitive=[false]` — confirms the migrated blank's fields flow
  into the seed vector unchanged (buildRawFacetIndex's `...entry` spread,
  per similarQuestions.mjs's own data-contract-lock comment).
- Top result: `group-2020-jia-grammar-fill`, **score 69900** (non-zero —
  the required proof), reason chip `谓语相似：时态+语态`
  (tense+voice match, matches the 4+2=6 point tier of the 7/6/4/2/1/0
  vector scoring scheme), plus a `topic-match` secondary reason.
- Second/third results score 60000 (tense-only match tier), consistent with
  the layered scoring design.

## Round 2 — non-finite seed (role + form chip)

Seed: `q-2024-i-058` (paper-2024-i, answer "to give", migrated fields
`role: adverbial, form: to-do`).

`POST /api/similar-questions {"seeds":[{"questionId":"q-2024-i-058"}],"limit":10}`

- `seedProfile.facets`: `role=[adverbial]`.
- Top results: `group-2024-ii-grammar-fill` and `group-2023-yi-grammar-fill`,
  both **score 999900**, reason chips `同款：非谓语作状语 · to-do` and
  `同款：非谓语作状语 · done` respectively — confirms the `role` (7-way,
  post-migration-correction vocabulary) and `form` (to-do/doing/done,
  chip-only per program.md) both flow correctly.

## Round 3 — facetKey branch (词形转换重铸 owner-decision verification)

Seed: `q-2020-i-064` — one of the 8 owner-adjudicated suspects (`accurate`
→ `accuracy`, migrated to `grammar-fill.given.conversion.adjective-to-noun`
per owner's 2026-07-15 disposition, not the script's alternate old bucket).

`POST /api/similar-questions {"seeds":[{"questionId":"q-2020-i-064"}],"limit":10}`

- `seedProfile.facets`: `facetKey=[grammar-fill.given.conversion.adjective-to-noun]`
  — confirms the owner-decided reclassification (not the pre-migration
  `given.derivation.verb-to-noun` label) is what the engine actually reads.
- Top results include `group-2025-ii-grammar-fill` matching `q-2025-ii-063`
  (`absent`→`absence`, another of the 8 owner decisions) at **score 990000**,
  reason chip `同考点：given.conversion.adjective-to-noun` — two
  independently-adjudicated owner decisions now correctly recognize each
  other as "same考点" matches, which they would NOT have done under the old
  mis-filed v1 labels (one was `derivation.verb-to-noun`, the other
  `derivation.noun-to-adj`, per suspects.md).

## Conclusion

All three grammar-fill branches (`verb-vector` / `non-finite role+form` /
generic `facetKey`) produce non-zero-scored, correctly-labeled matches
against the real migrated corpus through the unmodified E5 engine. No
`similarQuestions.mjs` code was touched to make this work — confirms the
plan's data-contract lock ("tense/voice/agreementSensitive have exactly one
read path — the blank entry itself") held exactly as designed.
