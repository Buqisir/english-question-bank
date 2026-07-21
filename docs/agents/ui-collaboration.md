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

任一命中即升级为常规 UI 风险分级 + 浏览器 / PO QA：TSX 改动、新交互、新
selector 结构、布局 / 滚动 / 定位变化、A4 / PaperSurface / print-preview
影响、响应式影响、或 owner 反馈"怪 / 不舒服 / 不像 A4"。评审按
`AGENTS.md` Dispatch map：Small 才可 CR-lite；Medium / Large 必须 fresh CR。

## UI 分支流程

从最新 `main` 开分支,commit 并 push,然后报告:branch、commit、changed
files、visual intent、QA status。多代理 UI 工作不直推 `main`,除非 owner
明确要快路径。
