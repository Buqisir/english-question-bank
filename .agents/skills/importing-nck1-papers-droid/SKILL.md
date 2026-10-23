---
name: importing-nck1-papers-droid
description: "Fast NCK1 paper import in Droid: drives scripts/import-pipeline/fast-import.mjs (prep, after-proofread, finish, submit, report) for a scanned-PDF paper with listening audio through Source Materialization, the four frozen PDFs, a Review revision and the preprocessing report, with two rounds of parallel subagents. The Review target is the worktree binding (local runtime or production via the import_agent account). Use when the Owner asks Droid to 导题/试导 papers; promotion and publication stay with the Owner."
---

# Importing NCK1 papers in Droid (fast path)

Follow `docs/import/droid-fast-path.md`; `docs/import/agent-contract.md` remains the
authority. Talk to the Owner in Chinese. Never promote or publish.

Review commands go to the origin in `.amp/import-review-origin`. A loopback origin is
the local runtime. Any other origin is production, reached as the `droid-import`
import_agent account (password in Keychain service `eqbank-import-agent`); submit
there only for papers inside a current Owner batch authorization.

## Loop

1. `fast-import.mjs prep <id> --audio <file> --proofreaders <N> -- <init args>`
   (N ≈ pages / 2.5). Dispatch the printed round-1 prompts as N parallel workers.
   Several papers may prep at once; prep never contacts Review.
2. `fast-import.mjs after-proofread <id>`. Exit code 2 means a judgement stop: inspect
   the source page, fix the Materialization, log it in
   `imports/ocr-proofread/<id>/materialization-edits.json`, rerun with `--issues-resolved`.
   Dispatch the printed round-2 prompts (summaries, metadata, listening) in parallel.
3. A listening group left `review_required` because its first reading drifts at a
   window boundary: `fast-import.mjs asr-extra <id> --start … --end … --tag …`, then
   resume that worker with the new evidence paths.
4. `fast-import.mjs finish <id>`. Inspect every page of the four contact sheets and
   the printed writing-reference outline.
5. Nothing blocking: `fast-import.mjs submit <id>` uploads the Candidate and captures
   Screen tiles. Inspect the tiles.
6. `fast-import.mjs report <id> --screen "<what was checked>" --pdf "<what was checked>"`.

After any upstream fix, rerun with `--redo-from <step>`; authored round-2 parts are
reused by ID, so do not redispatch workers.

## Rules

- Keep every CLI gate; do not add re-checks the CLI already enforces.
- Workers write only their own output file and run check-only commands; the
  orchestrator owns every write to the paper directory.
- A failure the orchestrator cannot classify: read `fast/logs/<step>.log`, fix the
  cause (tool or data), and record it; never edit outputs to get past a gate.
- Production runs on a 2 GB host whose paper-status endpoint hashes every revision
  file and projects the revision on the request thread. Run Review-bound steps
  (after-proofread, submit, report) for one paper at a time, never bulk-read
  `GET /api/import-agent-reviews/papers/<id>` for other papers, and do not retry a
  slow read. For source dedup read `universal-source-manifest.json` through
  `GET /api/import-agent-reviews/revisions/<id>/files?path=…`.
- No formal verification suites before the Owner says Ship.

## Deliver

Report in Chinese: the Screen link, the four PDF paths with page counts, the
preprocessing report path, the revision id and its Review target, retained doubts,
total time, and every check as done, skipped or limited.
