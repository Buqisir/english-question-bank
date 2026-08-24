# 03 — 深圳一模 Reading A 换成 `framed_columns`

Status: done
Blocked by: `docs/cuts/reading-framed-columns/tickets/02-framed-columns-three-surface-render.md`
Next on PASS: independent Standards / Spec review
Terminal: yes

Spec: `docs/cuts/reading-framed-columns/spec.md`

## What to build

格式② 为 `paper-mock-sz-2026-m1` Reading A 显式派生 `framed_columns`（不是从 PDF 认框）。导语和 Contest Rules 之间不再用 figure 当正文。格鲁吉亚文打字；三行国名是真表；`A Puzzle` / `The Solution` 是两栏的 `column_heading`。

现有 PNG 留在 `figures/` 当原料/证据。`[图:]` 仍只在 `groups.json`。更新 `nck1-paper-standard` §8 与 `verify-nck1-new-paper-locks`：落地后认两栏正文，不再要求这张 figure 当 Canonical 正文。

## Acceptance criteria

- [x] 浏览 / 打印 / PDF：IOL 导语 → 两栏真字真表 → Contest Rules。无 `[图:]`，无重复导语/规则。
- [x] 右侧不再出现被切掉的 `the`（因为不再靠那张图当正文）。
- [x] 台灯、Q33 仍是图。
- [x] `verify-nck1-new-paper-locks` 与 `verify-nck1-standard paper-mock-sz-2026-m1` 按新正文全绿。
- [x] 格式③ / 广东一模阅读块表不变。

## Out of scope

- Q33 流程图、应用文台灯 overlay
- PDF 自动认文本框
- 第二份真卷

## Result

Commit: `b0de44fe`
Verify:
- `node scripts/verify-paper-canonical-framed-columns.mjs` PASS（合同夹具 + 深圳一模真块编译）
- `node scripts/verify-nck1-new-paper-locks.mjs` 8 passed（锁改名为 `published format ② PDF pair keeps Reading A puzzle as framed_columns`）
- `node scripts/import-pipeline/verify-nck1-standard.mjs paper-mock-sz-2026-m1` 22/22 POST-PUBLISH
- 真点击 Screen：`?view=paper-browse&paperId=paper-mock-sz-2026-m1` 登录后点 Reading A；IOL 导语 → 等宽两栏真表真字 → Contest Rules；无 `[图:]`；点 Q21 / Q22 后 `framed_columns` 仍在
- Print HTML / PDF：`introAt < puzzleAt < contestAt`；格鲁吉亚文 / Brazil / Argentina；无 `[图:]`；PDF 两栏宽 636/636
- 广东一模 published 资产无 `framed_columns`；格式③ 锁仍绿
- `pnpm -C app verify:paper` 与一次 `pnpm -C app verify:all` 预检失败：厨房里 `RetainedWritingLecture.tsx` 既有 TS 谓词错误（TS1230 / TS2322；本票未改该文件）
Notes:
- 格式② 派生写明 `makeSz2026M1ReadingAFramedColumns()`，不是从 PDF 认文本框。
- JSON 字段仍是 `columnHeading`（票 01/02 grilling）。票面「What to build」里的 `column_heading` 是旧称。
- 原卷 `"Uruguay"further` 缺空格按桌面 PDF 第 1 页保留。字母对应按原图 / IOL：`რ→R, ა→A, გ→G, ე→E`（不采用 OCR 的 `ზ→G`）。
- Puzzle PNG 留 `figures/`；`[图: fig-paper-mock-sz-2026-m1-reading-a-puzzle-1]` 只在 staged `groups.json`。Canonical 正文无 figure、无 `[图:]`。
- 台灯仍是 `writing-application-lamp.png` overlay。Q33 仍是 figures PNG + 选项 `[Fig.]`，未收成 `framed_columns`，未改 overlay。
- 未 bump 权威。未把 `compiler.mjs` PDF-pair figure 编译入口带进本票。派生接线仍在未提交的格式② PDF-pair adapter 厨房里。
- 独立审查：Standards 无硬违规；Spec 有一条「Q33 应进 Canonical figure」——与本票 Out of scope /「不要动 Q33 overlay」冲突，不改。
- Owner QA 视觉（2026-08-24）：栏内对照表无格、收窄稍居中、行距松开；表后问句只略隔开，短栏底部留白，不把内容顶到框底。已收成共享渲染约定，不为单卷 CSS。权威：`exam-paper-format-standards.md` §3c；导题：`nck1-paper-standard.md` §8；下一卷：spec「下一卷怎么干」。
