# motion-press-exit — plan.md（Emil 工艺账：按压/退出/弹层入场 + CSS 小账）

- cut size: **small（偏 medium 下沿）**；touches schema: no；data contract: no；
  product boundary: no；纯展示层（CSS 为主 + toast/dialog 挂载态与
  scroll helper 的少量 TSX）。
- PA: **不需要**。依据：2026-07-13 全站三路评审（impeccable critique，
  `.impeccable/critique/2026-07-13T15-58-11Z__full-project.md`）之 Emil 工艺
  评审（C），逐条 live 实证、无方向争议；owner 已拍板"分两刀先小后大，
  本刀先行"。零裁决点例行刀。
- 出处：`docs/cuts/motion-press-exit/emil-findings.md`（**施工依据全表**，
  含 file:line 与 live 证据，DEV 逐行照做，勿重查勿扩面）。
- 基线：main @ 5196bbe；分支/worktree `../wt-motion-press-exit`。

## Must Do（全部条目见 emil-findings.md 两张表，此处为分组契约）

1. **按压反馈系统**：修好两处半残 `:active`（base transition 补 transform）；
   给 findings 表列出的可按元素补 `:active` scale(0.97) + eased transform。
   统一走既有 motion token（`--motion-fast` + `--ease-out`），不发明新值。
2. **弹层入退场语法**：两个模态（draft-save、my-space confirm）backdrop
   淡入 + dialog fade/scale 入场、退出 ~120ms；两个菜单（导出、插入）
   入场 + trigger 边 origin；my-space 模态按钮补标准 transition。
   优先 `@starting-style`，需要兼容回退用 data-mounted 模式。
3. **toast transition 化**：`.draft-undo-toast` 与 `.pi-toast` keyframe→
   transition，入退同轴、退出快于入场；连续触发可平滑重定向。
4. **reduced-motion scroll helper**：抽一个共享 helper，四处
   scrollIntoView/scrollTo 统一 `reduced ? 'auto' : 'smooth'`。
5. **一致性/性能小账**：rail-item hover 与两个 toggle 补 transition；
   lecture-handle `right`→`translateX`；PaperSurface.css:366 token 归队；
   详情入场降档 hero-only 160ms、sections 不入场。
6. **B 路 CSS 小账**（findings 第二表）：搜索提交钮对比度 ≥3:1、topbar
   标题溢出、个人空间 h2→h3 层级、`--mint-soft` emerald→teal 系归队。
7. 所有动画补齐 `prefers-reduced-motion` 退化（全局 nuke 已在，新增
   transition 天然被覆盖即可，勿破坏现有覆盖）。

## Forbidden

- 不动搜索/推荐逻辑、URL 状态、卷名组合、rail 截断（全归刀2 信任裂缝）。
- 不动纸面渲染管线（paginationRenderer/chromiumPool/DOM 契约）与 iframe
  srcDoc 结构；`draftPaperPreviewHtml.ts` 本刀不碰。
- 不改 DESIGN.md 既有 token 值；新增 CSS 变量仅限弹层入退场需要且命名
  入 motion 家族。
- 不加依赖、不引入 spring/FLIP/bounce；emil-findings「明确不做」节照守。
- 不动 server / schema / 生产。
- verify-motion-tokens 白名单如需重锚，行号必须与最终 diff 一致（a3 刀
  9a1907a 判例）。

## Verification（worktree 内逐条）

```
pnpm -C app run verify:all
```

（含 verify-motion-tokens 守门与 tsc；DEV 自验可先跑最窄的
verify-motion-tokens 单步。）

## 裁决点清单（PM 断点锚）

1. 【DP-1】流水线内置（DEV → verify 复核 → fresh CR → MF 处置）。
2. 【DP-2】主代理浏览器 QA：按压反馈（加入草稿卷/搜索→/导出）、两模态
   入退场、两菜单 origin、toast 退出、reduced-motion 模拟一遍、
   详情打开手感 → merge → 盯 main CI。
3. 【DP-3】owner 观感 QA。
