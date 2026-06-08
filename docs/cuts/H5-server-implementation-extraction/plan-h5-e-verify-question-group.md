# H5-E Plan — verify-question-group owner extraction

Status: Ready for DEV (fresh agent) · Roadmap H5-E (P9) · depends on **H5-D (merged)**
Cut size: small/medium · touches schema/data-contract: **no** (server-internal; audit-JSONL shape is
the one contract to preserve) · mergeable solo.

## Objective
Move `verifyQuestionGroup` (~9349) + its private `callDeepSeekVerify` (~9462) out of `server/api.mjs`
into `server/ai-verify/verifyQuestionGroupService.mjs` behind `createVerifyImplementation({...})`.
Behavior byte-identical.

## Seam
- **Inject** (stay in api.mjs / come from elsewhere): `appendVerifyAudit` (DO NOT MOVE — it writes the
  JSONL that the `/api/ai/verify-trace` route at ~9611 reads back; the audit event shape is the frozen
  contract), `getQuestionGroupDetail` (central read hub, stays), `callDeepSeekWithFallback` +
  `normalizeDeepSeekModel` + `describeKeySource` (now re-imported from `completionRunner.mjs` via the
  H5-D destructure — inject the bindings), and any `jsonExtraction.mjs` helpers `callDeepSeekVerify`
  uses (`extractVerifyResultFromPayload`/`parseLooseVerifyResult`/etc. — import directly from the leaf
  or inject; no cycle).
- **Re-import** into api.mjs: `verifyQuestionGroup` only (called by the inline `/api/ai/verify-question-group`
  route at ~9697, which stays). `callDeepSeekVerify` is internal → not re-exported.

## Non-negotiables
- Preserve EVERY `appendVerifyAudit({...})` call site + event shape byte-identically (HTTP/parse/
  success/error boundaries). Module never imports api.mjs (no cycle).
- Grep ALL callers of both moved fns; re-export exactly what api.mjs still references.

## Verify (`scripts/verify-h5e-verify-question-group.mjs`, register in verify-ci + README)
Stub `callDeepSeekWithFallback`; assert the verdict envelope AND the emitted audit-JSONL lines are
byte-identical to pre-cut for fixed stubbed responses; assert `/api/ai/verify-trace` can still read them.
Include the **used-but-undefined guard** (every moved fn referenced in api.mjs is in the re-import).
Required green: verify-h5e, verify:all, node --check both, byte-identity diff vs main, import() smoke.
