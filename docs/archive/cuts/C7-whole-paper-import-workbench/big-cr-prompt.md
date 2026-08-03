# C7 Big CR Prompt

Send this short prompt to the external high-reasoning CR reviewer after
Codex DEV + Codex CR-lite + browser QA are complete.

```text
/BIG CR
Project: english-question-bank / PaperSurface
Cut: C7 — Whole Paper Import Workbench / 整卷导入工作台
PR: https://github.com/Buqisir/english-question-bank/pull/91
Mode: CR only. Do NOT implement. Do NOT edit files. Do NOT write code.

First sync and verify state:
- Fetch latest main and the PR branch.
- Confirm the reviewed checkout matches PR #91 head.
- Confirm the PR base is main.
- Read the PR changed files before judging.

First read:
- AGENTS.md
- .kiro/steering/README.md
- .kiro/steering/cut-workflow-protocol.md
- .kiro/steering/dev-completion-protocol.md
- docs/cuts/C7-whole-paper-import-workbench/pm-spec.md
- docs/cuts/C7-whole-paper-import-workbench/decisions.md
- docs/cuts/C7-whole-paper-import-workbench/dev-plan.md
- docs/cuts/C7-whole-paper-import-workbench/pa-review.md
- docs/adr/0004-c7-paper-import-atomicity.md
- docs/adr/0005-c7-versioned-file-protocol.md
- PR #91 body and commits

Role boundary:
Codex/GPT owns PM, DEV, CR-lite, local browser QA, RM, and sync.
You are the external big CR reviewer. Your job is to catch bugs,
contract drift, rollback holes, data-loss risks, false-positive tests,
security/path issues, and scope violations. Do not reopen product
planning unless implementation contradicts the locked C7 decisions.

Review focus:
1. Upload/validate API:
   - accepts only .docx/.json
   - enforces 5MB single file, 20MB total, 20 files
   - rejects code fences, JSON5/comments/trailing commas/top arrays,
     unknown schemaVersion, path-like filenames, invalid DOCX magic
2. Business validation:
   - Reading A-D missing group/question/answerKey/analysis blocks
   - Reading A-D answer mismatch blocks
   - unresolved support/trap quote blocks
   - unknown paragraphId blocks
   - repeated quote without occurrenceIndex blocks
   - unsupportedClaim evidence is stripped with warning
   - unknown fields are stripped with warning
   - non Reading A-D incompleteness warns, not blocks
3. Publish atomicity:
   - validate before writes
   - write versions/vN
   - DB transaction upsert
   - latest swaps only after DB commit
   - DB failure removes failed vN and leaves old latest usable
4. Search/PaperSurface:
   - Reading A-D get hasPaperSurfaceAnalysis + paperSurfaceHref only
     after real published completeness
   - 七选五/完形/语法/写作 do not get fake 阅读解析
   - latest and version links open PaperSurface
   - trapEvidence line works without PaperSurface renderer changes
5. Scope:
   - No PaperSurface renderer/shared protocol changes
   - No reading-analysis legacy rewrite
   - No silent PaperAssetV1 migration
   - No AI/OCR/PDF/image/txt/zip/import generation
   - No print preview/listening audio/writing scoring work

Run or inspect these if available:
- node scripts/verify-c7-paper-import-contracts.mjs
- node scripts/verify-c7-paper-import-publish.mjs
- node scripts/smoke-c7-paper-import-workbench.mjs
- cd app && npm run build
- git diff --check main...HEAD

Required output:
1. Verdict: APPROVE / APPROVE WITH CHANGES / REQUEST CHANGES
2. Must Fix: only blocking correctness, data-loss, security, or scope issues
3. Should Watch: non-blocking risks
4. Test/verify gaps: identify false positives or missing proof
5. Forbidden-scope audit
6. Merge recommendation

Do not produce a long implementation plan. If no blocking issue exists,
say so directly and keep the review tight.
```
