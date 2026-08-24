# 03 — 深圳一模 Reading A 换成 `framed_columns`

Status: ready
Blocked by: `docs/cuts/reading-framed-columns/tickets/02-framed-columns-three-surface-render.md`
Next on PASS: independent Standards / Spec review
Terminal: yes

Spec: `docs/cuts/reading-framed-columns/spec.md`

## What to build

格式② 为 `paper-mock-sz-2026-m1` Reading A 显式派生 `framed_columns`（不是从 PDF 认框）。导语和 Contest Rules 之间不再用 figure 当正文。格鲁吉亚文打字；三行国名是真表；`A Puzzle` / `The Solution` 是两栏的 `column_heading`。

现有 PNG 留在 `figures/` 当原料/证据。`[图:]` 仍只在 `groups.json`。更新 `nck1-paper-standard` §8 与 `verify-nck1-new-paper-locks`：落地后认两栏正文，不再要求这张 figure 当 Canonical 正文。

## Acceptance criteria

- [ ] 浏览 / 打印 / PDF：IOL 导语 → 两栏真字真表 → Contest Rules。无 `[图:]`，无重复导语/规则。
- [ ] 右侧不再出现被切掉的 `the`（因为不再靠那张图当正文）。
- [ ] 台灯、Q33 仍是图。
- [ ] `verify-nck1-new-paper-locks` 与 `verify-nck1-standard paper-mock-sz-2026-m1` 按新正文全绿。
- [ ] 格式③ / 广东一模阅读块表不变。

## Out of scope

- Q33 流程图、应用文台灯 overlay
- PDF 自动认文本框
- 第二份真卷

## Result

Commit:
Verify:
Notes:
