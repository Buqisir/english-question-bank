# H5-D Plan — AI-completion transport + retry/fallback runner

Status: Ready for DEV (delegated to a fresh dev-hard agent; CR + RM follow)
Date: 2026-06-08
Roadmap: `docs/architecture/refactor-roadmap-2026-06.md` (cut H5-D, P8) · depends on **H5-C (merged)**
Cut size: medium · touches schema/data-contract/product-boundary: **no** (server-internal transport;
behavior-preserving; stub-fetch verifiable → mergeable solo)

## Objective

Move the DeepSeek / local-Qwen completion **transport** (request building, retry/abort/timeout,
thinking-mode fallback, provider dispatch) out of `server/api.mjs` into
`server/ai-providers/completionRunner.mjs` behind `createCompletionRunner({...})`. Behavior byte-identical.

## Move-set (current line numbers, post-H5-B/C; RE-DERIVE before editing — they shift)

`buildDeepSeekRequestOptions` (~5835), `normalizeDeepSeekModel` (~5856), `isLocalQwenModel` (~5863),
`normalizeAiChatModel` (~5868), `describeAiKeySource` (~5872), `describeKeySource` (~6172),
`delay` (~6180), `callDeepSeekCompletion` (~6184), `buildLocalQwenRequestOptions` (~6255),
`callLocalQwenCompletion` (~6275), `callDeepSeekWithFallback` (~6337).

Move byte-identically (re-indent into the factory is acceptable, as in H5-B; assert byte-identity
of bodies vs `main` after de-indent).

## DO NOT MOVE (interleaved / traps)

- **The ~300-line prompt-constant block between `describeAiKeySource` (~5876) and `describeKeySource`
  (~6172)** — `DEEPSEEK_*_PROMPT` etc. Frozen AI-parse contract, highest blast radius (roadmap defers
  it). Confirm the transport move-set does NOT reference these constants (it shouldn't — callers build
  `messages` from prompts and pass them in `context`). If it does, STOP and report.
- Everything at/after `normalizeSynonymMapping` (~6418) — reading-difficulty domain (future H5-J).
- **Do NOT de-dup `normalizeDeepSeekModel` against `server/ai-providers/deepseek.mjs`.** The api.mjs one
  is **flash-default**; deepseek.mjs is **pro-default**. They diverge intentionally — moving the
  flash-default one verbatim is required; unifying them is a behavior change.

## Factory seam

`createCompletionRunner({ fetchImpl, getDeepSeekMessageText, collectDeepSeekMessageTexts, ...any other
H5-C parse strategies the transport calls })`. The transport currently uses global `fetch`,
`AbortController`, `setTimeout` — inject `fetchImpl` (default to global `fetch`) so the verify can stub
it; `AbortController`/`setTimeout` are globals, keep as-is. Import the H5-C helpers from
`./jsonExtraction.mjs` OR inject them — pick whichever keeps behavior byte-identical and avoids a cycle.
The module must NOT import from `api.mjs`.

## Re-import surface — CRITICAL (the H5-B lesson)

`callDeepSeekWithFallback` / `callLocalQwenCompletion` / the model helpers / `delay` /
`describeKeySource` are called by ~10 parse functions that STAY in api.mjs.
**Grep EVERY move-set name for callers across api.mjs; re-export from the factory + destructure in
api.mjs EXACTLY the set that has any remaining api.mjs reference.** Missing one = runtime ReferenceError.
Place the factory instantiation + destructure where the consumers can resolve it (these consumers are
function declarations far below; destructure can sit near the other factory wiring — but verify with a
boot/smoke since callers are spread out).

## Verify (`scripts/verify-h5d-completion-runner.mjs`, registered in verify-ci + README)

Stub-fetch (I8/I13 precedent). Construct `createCompletionRunner({ fetchImpl: stub, ... })` and assert:
- provider routing: DeepSeek vs local-Qwen by model (`isLocalQwenModel`).
- retry behavior: stub returns failure N times then success → assert retry count + `delay` calls.
- thinking-mode fallback path (the documented fallback orchestration) returns the expected envelope.
- the returned envelope shape `{parsed, rawText, latencyMs}` (or whatever the real shape is) matches
  pre-cut for fixed stubbed responses.
- **flash-default preserved**: `normalizeDeepSeekModel('anything-unknown')` returns the flash/pro default
  EXACTLY as on `main` (capture from `git show main:`).
- **Used-but-undefined guard** (mandatory): for every moved fn still referenced in api.mjs, assert it is
  in the re-import destructure (the check that caught H5-B's `rowToImportFile`).

Required green: `node scripts/verify-h5d-completion-runner.mjs`, `node scripts/verify-i8-cloze-analysis.mjs`,
`node scripts/verify-i13-grammar-fill-analysis.mjs`, `node scripts/verify-relay-json-format.mjs`,
`npm run verify:all --prefix app`, `node --check` both files, byte-identity diff vs `main`.

## Allowed files
`server/ai-providers/completionRunner.mjs` (new), `server/api.mjs`,
`scripts/verify-h5d-completion-runner.mjs` (new), `scripts/verify-ci.mjs`, `scripts/README.md`,
`docs/cuts/H5-server-implementation-extraction/*.md`.

## Forbidden
`app/**`, `server/ai-providers/deepseek.mjs`, `server/ai-providers/chatCompletions.mjs`,
`server/ai-providers/gptRelay.mjs`, `server/prompts/**`, `prompts/**`, the frozen `DEEPSEEK_*_PROMPT`
constants, the reading-difficulty domain (≥ ~6418), any schema.
