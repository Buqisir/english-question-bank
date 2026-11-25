# 04 — PDF

Status: done (branch), awaiting Owner sample approval
Blocked by: 01; application-writing-v4 ticket 04
Next on PASS: owner QA
Terminal: yes

## What to build

Spec D6 in `server/exports/companion-analysis/writing.mjs`, reusing the
application V4 blocks for task card, notes, expressions and the advanced essay.

## Acceptance criteria

- [ ] V3 fixture prints all eight blocks in the D6 order.
- [ ] V1 and V2 fixtures print byte-identical HTML to the baseline.
- [ ] Before/after page images sent to the Owner; approved.
- [ ] `node scripts/verify-ci.mjs` passes.

## Result

Commit: e5be32786 (branch only, not on main)
Verify: `node scripts/verify-companion-analysis-export.mjs` passes, with a new
  section that prints the 2026 Ⅰ trial fixtures (application V4 and
  continuation V3) and checks the block order, that every note, expression,
  pitfall, reading answer and essay paragraph is printed, no empty `<p>`, and
  that every class belongs to a component. Snapshot digests re-pinned for all
  35 papers: the page body of every one is byte-identical before and after
  (checked separately by hashing the HTML after `<body`); only the embedded
  stylesheet gained the WritingLecture rules. Live 2026 Ⅰ data in the old
  formats (reviewCard V2, continuation V2) also prints a byte-identical body.
  Full verify-ci: run with the push to main.
Notes:
- New PDF component WritingLecture in `components.mjs`, listed in
  `docs/product/companion-analysis-components.md`. Essays reuse ModelEssay
  (标准版 / 提高版 headings), the task-card labels reuse Label.
- The group heading opens the first block; each block name, each run-in label
  and each paragraph heading in 逐段看 is kept with its first item only, so long
  blocks can still run on into the next column (an earlier draft kept a whole
  paragraph's notes together and left half a page empty).
- Official essays from the source, if any, print after the lecture as
  参考范文.
- Owner sample page: https://claude.ai/artifact/4oXKFVwLob31DRw5Zp7zNc
  (2026 Ⅰ writing only: 10 pages in the old format, 4 in the new). Approval
  pending.
