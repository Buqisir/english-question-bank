# UI 协作操作规程(UI Collaboration Protocols)

宪法 `AGENTS.md`「UI Collaboration」的操作细则。**UI 刀时才读**,不在
session 必读税内。编辑边界与契约 hook 机制(核心法条)在宪法本体;本文件
是灰区、快路径、升级触发与分支流程。

## 灰区文件

`SevenChoicesAnalysisPanel.tsx`、`DraftPaperWorkbench.tsx`、
`PaperIntelligencePaperSurfaceHarness.tsx` 可接受 display-only UI 修改,
但严禁改动 reducers、state contracts、data fetching、URL state、adapter
inputs / outputs、跨组件同步。

## Atomic UI fast path

仅当**全部**成立才可走原子快路径:CSS-only diff、无新 class / data
attribute / selector 结构、无 TS / TSX 改动、无布局或滚动行为变化、纯视觉
参数、小 diff、不碰 `shared/papersurface/**` 或 print / PDF / export
styling。此路径仍需主代理轻量 sanity check,不是零评审。

## 升级触发

任一命中即升级为常规 UI 风险分级 + 浏览器 / owner QA：TSX 改动、新交互、
新 selector 结构、布局 / 滚动 / 定位变化、A4 / PaperSurface /
print-preview 影响、响应式影响、或 owner 反馈"怪 / 不舒服 / 不像 A4"。
普通 UI 由 `/implement` 完成评审；触及 PaperSurface、print/export 或其他
高风险边界时，再手工新开独立顶层 `/code-review`。

## UI 分支流程

从最新 `main` 开分支，commit 后报告 worktree、branch、HEAD、changed
files、visual intent、QA status，并返回唯一可复制 `Next`。同一 UI
worktree 同时只允许一个顶层写任务。

## 写 CSS 与 token 的纪律

2026-10-13 从 `DESIGN.md` §7 移入（design-canon 立项 2026-07-14，出处：
poolside / StyleX / vibe-designing-playbook 三址调研）。这几条不是视觉规范，
是 agent 写 CSS 和 token 时的施工纪律，防止「token 覆盖不到就现场编字面量」
「叠加样式谁赢全靠猜」这类会悄悄侵蚀设计系统的坏习惯。视觉规则见 `DESIGN.md`。

**The No-Literal-Fallback Rule（禁止现场兜底）.** agent 遇到 token 体系覆盖
不到的取值（既有 token 不合适、又没有对应新 token），**禁止**现场拼一个字面量
颜色/间距/时长顶上。正确做法：显式记一条缺口到 `docs/design-gaps.md`（格式：
日期 / 位置 / 想要的值 / 临时方案），攒批等 owner 拍板收编成正式 token 或既有
token 的扩展用法。临时方案本身仍要写清楚落在哪一行、用了什么权宜值，方便日后
订正。

**The Explicit-Cascade Rule（覆盖顺序显式化）.** 同一元素上多个 class 叠加、
容易产生覆盖冲突的组合样式，后写的那条样式规则必须在注释里说明「本条覆盖 X，
因 Y」，写清楚覆盖了谁、为什么该它赢。这是 agent 写 CSS 的纪律条款，不做
lint/构建期强制，全靠自觉与 code review 抓。

**同步更新钉色的 CI 断言.** 改颜色 token 时，同步更新钉死该颜色的 CI 断言，
否则回归护栏会误报（原 `DESIGN.md` §6，2026-07-05）。
