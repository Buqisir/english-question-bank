# H5-C Plan — AI-completion JSON / verify-verdict extraction leaf

Status: Ready for DEV
Date: 2026-06-08
Roadmap: `docs/architecture/refactor-roadmap-2026-06.md` (cut H5-C, P4)
Cut size: medium · touches schema/data-contract/product-boundary/teaching-interpretation: **no**
(server-internal pure helpers; behavior-preserving; run-form verifiable → mergeable solo)

## Objective

Move the self-contained pure-function island that turns raw provider text/payloads
into parsed JSON + normalized verify verdicts out of `server/api.mjs` into a new
dependency-free module `server/ai-providers/jsonExtraction.mjs`. Behavior byte-identical.

This is the leaf the AI-completion transport runner (H5-D) will import; it must land first.

## Scope (the contiguous island, api.mjs 6625–7238)

Move these 16 functions verbatim into `server/ai-providers/jsonExtraction.mjs`:

`parseJsonFromString`, `isPlainObject`, `extractBalancedJsonCandidates`,
`parseJsonObject`, `normalizeVerifyVerdict` (module-level), `inferVerifyVerdictFromText`,
`getDeepSeekMessageText`, `collectDeepSeekMessageTexts`, `parseLooseVerifyResult`,
`extractJsonCandidates`, `extractVerifyResultFromPayload`,
`extractReadingParsePayloadFromPayload`, `normalizeVerifyResultObject`,
`extractFirstJson`, `safeTruncate`.

**Public exports** (called outside the region → re-imported by api.mjs): exactly these 8 —
`parseJsonFromString`, `getDeepSeekMessageText`, `collectDeepSeekMessageTexts`,
`parseLooseVerifyResult`, `extractVerifyResultFromPayload`,
`extractReadingParsePayloadFromPayload`, `extractFirstJson`, `safeTruncate`.
The other 7 stay module-private (used only internally by the public ones).

## Non-negotiables (behavior preservation)

- **Delete the dead `extractBalancedJson` (6637)** — confirmed read-nowhere; distinct from
  the live `extractBalancedJsonCandidates` (6686). This is the one flagged deletion.
- **Do NOT unify the 3 `normalizeVerifyVerdict` variants.** They are genuinely divergent
  (different accepted-token vocabularies / precedence):
  1. module-level `normalizeVerifyVerdict` (6773) — appears unreferenced (its 2 call sites
     are shadowed by inner closures); **preserve verbatim**, do not delete (preserving is
     safe + critic-mandated; a later cut may remove after independent confirmation).
  2. inner closure inside `parseLooseVerifyResult` (7001) — moves with its parent.
  3. inner closure inside `normalizeVerifyResultObject` (7184) — moves with its parent.
- `delay` (7240) is NOT in scope (belongs to H5-D). Stop the move at `safeTruncate`'s close.
- Module is zero-dependency: no factory, no injected state, no imports from api.mjs.
- api.mjs gains one `import { ...8 } from './ai-providers/jsonExtraction.mjs'` and loses the
  16 inline definitions; every existing call site resolves through the import unchanged.

## Verify strategy

Add `scripts/verify-h5c-json-extraction.mjs` (pure imports, no server boot):
- Golden table-driven fixtures over the verify-verdict vocabulary
  (correct / answer_wrong / explanation_wrong / both_wrong / uncertain / "" empty) for
  `extractVerifyResultFromPayload` + `parseLooseVerifyResult`, asserting outputs match the
  pre-cut behavior captured from main.
- Nested-payload shapes (string→json, choices[].message, code-fenced ```json, deep recursion)
  for `extractFirstJson` / `extractReadingParsePayloadFromPayload`.
- `getDeepSeekMessageText` / `collectDeepSeekMessageTexts` across content / reasoning_content /
  array-parts / nested-choices.
- `safeTruncate` boundary (≤max, >max with ellipsis, non-string).
- Assert `extractBalancedJson` is absent from api.mjs AND jsonExtraction.mjs, while
  `extractBalancedJscandidates`… (sic: `extractBalancedJsonCandidates`) is present and unchanged.
- Register in `scripts/verify-ci.mjs` + one-line entry in `scripts/README.md`.

Required green before done:
```
node scripts/verify-h5c-json-extraction.mjs
node scripts/verify-i8-cloze-analysis.mjs        # exercises verify-verdict path via stub
node scripts/verify-i13-grammar-fill-analysis.mjs
npm run verify:all --prefix app
git diff --check
node --check server/api.mjs && node --check server/ai-providers/jsonExtraction.mjs
```

## Allowed files

- `server/ai-providers/jsonExtraction.mjs` (new)
- `server/api.mjs`
- `scripts/verify-h5c-json-extraction.mjs` (new)
- `scripts/verify-ci.mjs`, `scripts/README.md`
- `docs/cuts/H5-server-implementation-extraction/*.md`

## Forbidden files

- `app/**`, `server/ai-providers/deepseek.mjs`, `server/ai-providers/chatCompletions.mjs`,
  `server/prompts/**`, `prompts/**`, any DB schema, any other `server/` module.

## CR focus (fresh session)

1. Byte-identical move? (diff the moved bodies against pre-cut HEAD)
2. All 3 verdict variants preserved un-unified?
3. Only `extractBalancedJson` deleted; `extractBalancedJsonCandidates` untouched?
4. Public export set exactly the 8 outside-callers; no over-export, no missing import?
5. No new circular import (module imports nothing from api.mjs)?
