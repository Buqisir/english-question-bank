# lecture-rail-scroll-fix — 审计 P1#2 复测定性（2026-07-10，主代理亲测）

审计条目：`.impeccable/critique/2026-07-10T05-30-00Z__full-project.md` L79
（讲评导航失灵，审计自标「疑似回归，需复测定性」）。

## 定性结论

- **① rail 点击不滚动 = 真缺陷，已复现**：main（figure-render 合并后）
  本地 dev，`?view=paper-browse&paperId=paper-2026-i&lecture=1`，点
  rail「36-40」→ rail 高亮切换、**卷面不滚动**（仍停 Reading A 顶部）。
  挑题态/讲评态审计称同样复现。修复面：PaperBrowsePage.tsx 的 rail
  锚点滚动目标容器（audit 刀法：滚动目标容器错了）。
- **② 七选五点空面板空态 = 审计误报**：STATUS 2026-07-09 事实澄清
  在案——卷面七选五的空为纯 span 不可点是**设计**，选题入口=深链+
  面板内开合。不立修。但审计同条附带的「挑题态加入草稿卷悬浮钮
  入侵讲评态」是真问题，与 ui-p1-panels #3 悬浮层条目同族，若
  panels 刀未覆盖则归本刀。
- **③ scrollspy 高亮漂移**（视口 36-40 高亮 56-65）：待 ① 修复后
  复测——很可能是同一滚动容器错位的副产物。

## 排队

- 修复面 PaperBrowsePage.tsx（+可能 paperBrowsePage.css）与
  ui-p1-panels 刀的 css 所有权冲突 → **串行于 ui-p1-panels 收口后**，
  small/medium 视诊断深度。
