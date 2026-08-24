# 01 — 阅读合同承认 `framed_columns`

Status: done
Blocked by: None
Next on PASS: `docs/cuts/reading-framed-columns/tickets/02-framed-columns-three-surface-render.md`
Terminal: no

Spec: `docs/cuts/reading-framed-columns/spec.md`

## What to build

让编译器、阅读 variant 和投影缝承认恰好两栏的 `framed_columns`。栏里只挂段落和表。每栏最多一个 `column_heading`，必须指向该栏里的一个段落。图、套栏、题目进栏、heading 指空或指错，一律失败。

本票只改数据合同和投影，不改 PaperSurface / 打印 / PDF，不改深圳一模正文。

## Acceptance criteria

- [x] `content.blocks` 接受 `framed_columns`；`columnCount === 2`。
- [x] 每栏子块只许 `paragraph` | `table`。
- [x] `column_heading` 可选；若有，必须是该栏一个现有段落的 `nodeId`。
- [x] 栏里出现 `figure`、再套 `framed_columns`、或把 question 放进栏 → `unsupported` / 等价失败。
- [x] 合成夹具：一栏带表、一栏只有段落，编译 + 投影 `ready`；拒绝用例不过投影。
- [x] 现有只有 paragraph / table / figure 的阅读卷回归不变。

## Out of scope

- 三面渲染
- 把深圳一模 figure 换成两栏
- 权威版本是否 bump：本票若改共享 shape，按 `AGENTS.md` 共享合同门禁准备，但发布权威由后续票在三面都认之后再动
- 格式②自动认框

## Result

Commit:
Verify:
- `node scripts/verify-paper-canonical-framed-columns.mjs` PASS
- `node scripts/verify-paper-canonical-foundation.mjs` PASS
- `node scripts/verify-paper-canonical-reading-publication.mjs` PASS
- `node scripts/verify-paper-canonical-seven-choices-publication.mjs` PASS
Notes:
- 字段名用 `columnHeading`（指向该栏一个段落 `nodeId`）。栏标题不是篇章 `title` / `subtitle`。
- 未 bump 权威；未改 PaperSurface / 打印 / PDF；深圳一模 Reading A 仍是 figure 正文。
- 下一刀是票 02。
