# draft-desk-a — Fresh CR (cold read)

审查人：CR 子代理（fresh context，未参与实现）。
基线：`eb72f7a`；审查 range `eb72f7a..HEAD`（HEAD=`ab30231`）。
worktree：`/Users/huangxuewei/Projects/eqb-wt-draft-desk-a`，分支 `eqb-wt-draft-desk-a`，工作树干净。

## 结论：APPROVE（0 Must Fix）

介质是一把 medium 级 product-surface 可逆重构（outline→rail + overlay 贴纸 +
iframe 自适应高度 + scrollspy/分页建议）。跨文档坐标数学与接线层由续做会话新写，
但已经过 owner 实点浏览器 QA 全项过（含 scale 0.917 缩放带实测），静态 verify 三本
全绿且断言随行为如实更新。无阻断缺陷。下列 Should Watch 均不阻断本刀。

## Changed Scope（与 plan 文件面核对）

- `DraftPaperOutline.tsx` 删除、`DraftPaperRail.tsx` 新建、`DraftPaperWorkbench.tsx/.css`
  重构、`draftPaperPreviewHtml.ts` 组标记+分页建议——全部在 plan 允许文件面内。
- `verify-c8-draft-paper-render-model.mjs`（8 断言）、`verify-draft-workbench-visual-unify.mjs`
  （白名单行号 381→451）——属 plan Forbidden 的 verify 基建，但断言直接引用已退役的
  DraftPaperOutline / 因 CSS 增长而行号漂移，属"断言与本刀重构直接冲突"允许同刀更新，
  已在脚本注释注明来由。合规。
- Forbidden 全部未碰：`git diff --name-only` 无 `shared/papersurface/**`、`server/**`、
  print-renderer、domain/schema/Adapter。printHtml 生成路径未动（本刀只改屏显预览包装）。
- moveItemTo / deleteItem / togglePageBreak 签名与 reducer/state 契约未改（tsx L68/L521/L536）。
- 无新依赖（lucide-react 既有）、无新 localStorage、无题组数据契约改动。
- 暖米色只出现在 iframe 内（`.break-hint` #a09a8a 等，属"纸"，色温法允许）；
  workbench.css 新增行零 hex/gradient（grep 确认），工具页范围保持中性。

## Findings

### Must Fix

无。

### Should Watch（记录，不阻断本刀）

1. **hover 贴纸锚点用了陈旧 previewScale（跨文档闭包）。** `handleIframeLoad`（tsx L308）
   注册的 `mouseover` 监听闭包捕获的是那次 onLoad 渲染时的 `computeGroupAnchorTop`／
   `previewScale`。iframe 仅在 `previewHtml`(srcDoc) 变化时重载，而 `previewScale` 由
   ResizeObserver 改变**不**触发重载 → 监听器不重绑。后果：在 900–1050px 窗宽带内
   （scale<1 且 rail 仍可见）**先缩放再 hover 且期间无任何编辑**时，贴纸竖向锚点用旧
   scale 计算 → 轻微错位；任一编辑触发重载即自愈。纯视觉、有界、可自愈，非数据问题。
   对照：scrollspy effect 把 `previewScale` 放进了依赖数组（L363）会重订阅，唯独
   mouseover/click 委托没有。修法（若日后处理）：把 `previewScale` 纳入需重绑的路径，
   或在 mouseover 里读 ref 而非闭包值。

2. **组标记是位置性 1:1 耦合，无运行时护栏。** `tagGroupSections`（preview ts）按下标把
   `GROUP_IDS[index]` 贴到第 index 个 `.question-group`，依赖 printHtml 的 section 顺序/
   数量与 `nonMissingItems`（filter !groupMissing，item 序）严格一致。DEV 已在注释论证
   server buildDraftPaperBlocks 跳过 groupMissing 故一致。数量不匹配时是"多余 section 不贴
   标 / 尾部 id 空置"的优雅降级（不崩、不误贴）；但**顺序**若分歧会静默误贴（scrollspy/
   贴纸/hint 指向错组）。server 不可碰属设计约束，QA 真实数据（8 页）目标定位正确。留观：
   无断言守此不变量，未来 server 侧顺序变更会静默漂移。

3. **scrollToGroupInPaper 沉降巡检无 unmount 清理。** settle 循环（tsx L375）在组件卸载后
   仍会跑到 deadline（≤5s）才由 cancel() 摘除 window wheel/touch/keydown 监听；期间
   computeTarget 因 iframeRef 为空返回 null，不会误滚。有界（≤5s）泄漏，无副作用。可在
   卸载 effect 里调 `scrollSettleCancelRef.current?.()` 收尾。

4. **拖拽排序未做真拖（QA 限制，非代码缺陷）。** 合成 HTML5 drag 不可靠，QA 用上移/下移
   验了共享的 moveItemTo→PATCH 通道。rail 的 onDragStart/onDrop 接线读代码正确
   （setDraggedItemId→handleDrop→moveItemTo→persistItems）。建议 owner 观感 QA 时顺手拖一把
   （QA 记录已注明）。

## Self-Review Blind Spots（喂后续 Big CR 时先看这里）

- 缩放带坐标数学：我从代码推演 `iframeRect.top + offsetTop * previewScale` 正确
  （iframe 内 getBoundingClientRect 不受父层 CSS transform 影响，故乘 scale 补偿成立），
  且 QA scale 0.917 实测差 17px（内边距级）。但我未在浏览器复现多档 scale，17px 是否
  在更极端窄屏放大到肉眼可感，仅有单点实测。
- 上条 Should Watch #1 的陈旧 scale 是我静态推演出的，未浏览器复现其可见程度。
- 分页脚本 flatten 后 `data-group-id` 下沉到子节点的完整性（跨页组的最后一页子节点是否
  仍带标记、scrollspy 取组顶是否总取到"首个"带标记子节点）我按代码判断正确
  （getGroupIframeOffsetTop 用 querySelector 取第一个匹配 = 组首），但未在多页跨页组上
  逐页核验。

## Verification Evidence（CR 独立复跑，非抄 DEV 数字）

- `npx tsc --noEmit`（app）：exit 0。
- `verify-draft-workbench-visual-unify.mjs`：20 passed / 0 failed。两条白名单行
  L188、L451 经 `awk` 确认均为 `color: #ffffff;`（真白前景，非调色板色）。
- `verify-c8-draft-paper-render-model.mjs`：34 passed / 0 failed。
- `verify-paper-draft.mjs`：146 passed / 0 failed。
- 断言可证伪抽查："preview iframe height is driven by measured content" =
  `!cssIncludes('height: 1188px') && workbench.includes('nativeContentHeight')`——
  若回退固定像素高度，首句转 false → 断言失败。非恒真。
- Forbidden 从 diff 文件名核（非听 DEV 说）：无 server/papersurface/print/domain。
- grid `minmax(0, 1fr) 224px`（css L242）合 plan 形态 2；`@media (max-width:900px)`
  隐 rail + 单列（css L564-571）合形态 9。

## Failure / Attack Angle

- **最可能的假绿点**是 visual-unify 白名单行号 re-pin（381→451）——若 DEV 借重钉行号
  把新混入的暖米色 hex 挡在白名单外，就是"改护栏不改因"。已排除：grep 该文件 diff
  新增行零 hex/gradient，暖色全在 iframe（preview ts）内，护栏扫的是 workbench.css
  仍零违规 hex，白名单两行确为 #ffffff。护栏对工具页暖色的约束力未被削弱。
- **静态 verify 证不到的真实行为**（跨文档滚动/hover/点击/缩放）由 owner 实点 QA 承接，
  清单逐项过，缩放带与 scrollspy/贴纸/分页建议点击生效均有实测证据。verify 强度
  （grep 级）+ 浏览器 QA 的组合与本刀风险（medium UI 重构、无数据/导出/持久化面）匹配。

## Residual Risk

低。无数据契约/导出/持久化/print 触碰；接线层缺陷即使发生也表现为局部视觉错位或
静默定位漂移（可自愈或优雅降级），非数据损坏。真拖拽与陈旧-scale 两点建议 owner
观感 QA 顺手覆盖。

## Recommendation

**APPROVE** — 0 Must Fix。四条 Should Watch 记录留观，均不阻断合并。收口由主代理执行。
