# ui-p1-panels — UI 审计 P1 面内批（审计 2026-07-10 报告 #4/#12/#5/#7/#14/#15/#3半/#13半）

- Cut size: **medium**（多条小修打包，各功能面）；touches schema/契约面：
  **no**（展示层；ConciergeDesk/DraftPaperWorkbench 属灰区文件，只做
  display 级修改，不动 reducer/状态契约/数据获取）。
- 并行边界（三刀同期，主代理已核文件面）：**本刀独占**
  paper-intelligence harness css/tsx（洞察面板一族）、
  `QuestionGroupDetailView.tsx`(+css)、`ConciergeDesk.tsx`(+css)、
  `DraftPaperWorkbench.tsx`(+css)、`paperBrowsePage.css`。
  **Forbidden**：`app/src/App.css`、`app/src/App.tsx`、AdminWorkbench
  （ui-p1-shell 刀独占）；`server/print-renderer.mjs`、
  `server/exports/docxRenderer.mjs`（draft-depassage 刀独占）；
  `shared-ui/papersurface/**`（无授权）。若某条修复确需动 App.css，
  **停下上报主代理**，不许越界。
- 审计原文：`.impeccable/critique/2026-07-10T05-30-00Z__full-project.md`
  L81/89/82/84/91/92/80/90 对应条目，DEV 必读。法度：DESIGN.md
  （Single-Hue/侧条禁令/Two-Font-Lanes/章程 chip 词汇）。

## 条目

1. **#4 解析页机器黑话**：选项解析卡英文枚举译教师语（对照表进代码
   常量，如 detail_word_misleading→「细节词误导」、object_mismatch→
   「对象错位」、not_mentioned→「文中未提及」，全枚举 DEV 从数据/
   代码枚举源逐一列全，不许漏译裸奔）；头部 meta 行
   （schema/prompt/model）收进 owner-only 折叠（isOwnerView gate 惯例）；
   `confidence 0.94`→「AI 把握度 94%」或随 meta 行收折叠（取改动小者）；
   「AI 初判，需教研复核」琥珀条保留。「题组未找到」chip 裸奔改
   人话降级文案。
2. **#12 洞察面板单色相+侧条禁令**：harness 内 16 处 Tailwind
   cool-gray（行号见审计 hex 表）归墨系 token；7 条 side-tab 撤除——
   错误项改 danger 浅底或整边框、正确项 teal-50 底染。
3. **#5 详情页字体 lane**：详情页 passage/小题区切衬线 lane（对齐
   整卷页 16/1.7），340px 滚动小盒放开或加「展开全文」（取体验好者，
   QA 截图对比）。
4. **#7 找题主面状态三缺**：加载态保留旧 feed 降透明（或 skeleton）；
   筛选按钮 `ConciergeDesk.tsx:354` 条件卸载改 disabled；输入框有值
   显 × 清除；无结果横幅补「返回浏览全部 N 套卷」出口（N 用真值）。
   display 级实现，不改搜索状态机。
5. **#14 保存弹窗不收场**：保存成功即收弹窗，toast/状态行承接
   「查看个人空间」入口；防重复保存（成功后按钮态收敛）。
6. **#15 工作台选中态同装**：学生版/教师版切换器选中段降
   teal-50 底+teal-800 字（章程 chip 选中态词汇），与「导出」主按钮
   拉开层级；「学生版/学生卷」措辞统一（择一全局用）。
7. **#3 半边——悬浮层遮挡**：加卷悬浮钮锚到纸面 gutter 不压文本区；
   讲评面板/抽屉底部预留 56px 净空（paperBrowsePage.css 范围内）。
   pill 的 admin 路由条件属 shell 刀，本刀不做。
8. **#13 半边——feature css 低对比暖灰**：本刀独占文件内 <4.5:1
   正文级小字升 `#6A6A64` 档（折叠入口/写作空态/讲评空态/侧栏当前项
   等，审计 L90 实测清单）。纸面页脚归 draft 编辑刀不做。
9. **shell 刀交办**：draft 家族按钮补 `:focus-visible`（用 shell 刀
   定下的 2px 实色 outline token，DraftPaperWorkbench.css 内接入）。

## Verify / QA

- verify:all 全绿、tsc 干净；`verify-draft-workbench-visual-unify` /
  my-space palette-hex 守卫如实过（换色走 token，不许绕守卫）。
- 浏览器 QA 逐条截图：解析卡中文枚举+meta 折叠（member 视角另截一张
  证 meta 不可见）、洞察面板无侧条、详情页衬线对比整卷页、找题加载
  态/清除×/无结果出口、保存成功收场、切换器选中态、整卷页悬浮钮
  不压指导语。证据入 docs/cuts/ui-p1-panels/qa/。
- DEV 断点锚：`wip(ui-p1-panels): impl complete, pre-QA`。
