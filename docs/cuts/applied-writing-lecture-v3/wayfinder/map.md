# 应用文讲评渲染 v3 · Wayfinder Map

State: human-decision (owner visual verdict on real-packet prototype head
`6ba221a267b6b4d2e5235e2d742cf607811b78aa` pending)
Current ticket: [AWL-V3-01 终版批注原型生产化](tickets/AWL-V3-01.md)

## Notes

- Teacher task: 在不打断原作文阅读流的前提下，把审题判断和可迁移亮点
  直接指回范文原句，供教师讲评；不是新增 AI 诊断面板。
- Owner-approved visual source: branch
  `github/codex/applied-writing-lecture-prototype-archive-20260722`, commit
  `f64038f`, `docs/cuts/applied-writing-lecture/prototype-annotate-v3.html`,
  Variant A `全局空白求交`.
- Algorithm source: the same commit's
  `docs/specs/2026-07-21-annotation-whitespace-pockets-design.md` and
  `docs/specs/2026-07-21-human-handwritten-leader-design.md`.
- `github/main` at claim: `1deec0f`. Production does not contain the approved
  annotation renderer or its short highlight-annotation payload.

## Decisions so far

- Variant A is frozen: original essay remains primary; annotations are always
  visible on two pages, with no cards, drawers, click-to-expand, or taller
  paper used to hide payload mismatch.
- Production must add a faithful short highlight-annotation payload; existing
  long `highlightExpressions[].note` remains the full analysis and is not
  truncated or rewritten at runtime.
- The selected prototype already fixes the 794 × 472 replacement host and the
  two-point grid order. Owner clarified that essay text stays Times New Roman;
  only annotation English uses Shantell Sans.
- Live local website measurement confirms lecture rail and paper reflow
  side-by-side. The host is the existing canvas: at 1470 × 719 it is
  794 px with a 612 px writing interior; v3 availability follows that measured
  canvas width rather than a guessed viewport breakpoint.

## Frontier

1. [AWL-V3-01 终版批注原型生产化](tickets/AWL-V3-01.md) — PM has closed
   MF-2..MF-5; MF-1 waits only on the owner's personal visual “过关” after
   inspecting both views of 2022 / 2024 temporarily injected into their real
   local paper pages. No DEV task exists.
2. [AWL-V3-02 22 组应用文解析全套重产](tickets/AWL-V3-02.md) — blocked by
   AWL-V3-01 closeout and its published production contract.

## Fog

- 11 卷缺失应用文解析的首次补产：待 22 组重产的生产管线与 owner 抽检
  成本实证后再切票。
- 读后续写是否复用纸面批注：不在本图，不能顺手进入本刀。
