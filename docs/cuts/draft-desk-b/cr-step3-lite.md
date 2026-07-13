# draft-desk-b — 步3 CR-lite(DP-2 步间闸,主代理冷读)

- 日期:2026-07-12
- 对象:PR #285 @ 950c296(前端吃服务器分页 HTML + 常驻叠按钮 + DP-title 修复 + SW-F/SW-G)
- 复核方式:主代理冷读全 diff + 亲手重跑 verify(不采信 DEV 自报绿)
- 施工备注:步3 由两个 DEV 会话接力完成(前任实现后被误触终止,断点锚
  checkpoint `c4df095` 接住;续派 DEV 冷读前任 diff 后自验收口,amend 为
  950c296——checkpoint 未推过远端,amend 安全)。断点锚纪律第三次实战兑现。
- 结论:**过闸,0 Must Fix**;1 条新挂账 SW-I + 1 nit。CI 见下。

## 亲手复跑(全部原始退出码 0)

- `verify-draft-pagination-cache-trigger.mjs`:14/14 绿(含 DP-title 反转断言:改
  title 触发、studentLabel/updatedAt-only 不触发)
- `verify-draft-pagination-dom-contract.mjs`:32/32 绿
- `verify-draft-pagination-renderer.mjs`:25/25 绿(步1 回归)
- `verify-c8-draft-paper-contracts.mjs`:50/50 绿
- `verify-c8-draft-paper-render-model.mjs`:35/35 绿(门被退役触及,同刀更新,见下)
- `verify-draft-workbench-visual-unify.mjs`:20/20 绿
- `tsc --noEmit`(app):0 错
- PR CI 首跑:e2e 绿、verify 红——`verify-error-copy-mainline.mjs` 把 workbench 的
  describeError 调用点数写死 11,步3 的分页错误文案是第 12 处(正是该门要强制的
  模式,门计数过期,非行为回归)。主代理直接修计数+注释(950c296 后追加 commit),
  本地 18/18 绿,重推后 CI 双绿(见 commit log)。此门不在 draft-paper narrow 集,
  DEV 与主代理本地都没跑到——**它在 verify-ci 里,这正是「全套只信 CI」纪律的用例**。

## 冷读判定

- **DP-title Option B 落实正确**:`title` 入 `draftPaperPaginationSignature`,
  签名注释把步2 的"披露冲突"叙事改写为拍板记录;verify 断言反转并保留完整
  来龙去脉。DEV 真 Chrome 实测页脚随标题更新(这正是本裁决要堵的 parity 缝)。
- **路由**:`GET /api/draft-papers/:id/pagination` 与相邻路由同构
  (resolveDataUserId user-scope、versionType 400 校验、sendDraftMutationError);
  响应只带 paginatedHtml/pageCount/reused,**不漏 pdfBytes**(步4 界面)。
- **SW-F 落实**:LRU 上限 8,用 Map 插入序 delete+set touch 实现,正确。
- **SW-G 落实**:缓存 key = `${draftPaperId}::${versionType}`,versionType 先归
  一再进 key;双版切换不再互踢。SW-H 按令未做(注释已更新为"路由已接,见真实
  成本再做")。
- **客户端分页整体退役**:`paginateA4Preview` IIFE(贪心量高分页/页脚/break-hint
  注入)全部删除;`buildA4PreviewHtml` 薄壳化为纯屏幕卡片样式(不碰 paged.js 已
  算好的页盒尺寸)。PO-1 落实:`.break-hint` 不注入,`pageBreakSuggestions` 字段
  保留不消费。
- **render-model 门同刀更新**(plan 步5 预判兑现):新断言方向正确且更强——
  断言退役代码**不存在**(210mm/paginateA4Preview 缺席)+ 薄壳仍钩在 `.preview-page`
  契约上 + PO-1 不渲染建议。不是放松门,是门随架构换向。
- **常驻叠按钮**:每组一枚、锚点走 computeGroupAnchorTop 原数学(滚动不变性
  论证保留);按钮 onClick 直连 moveItem/togglePageBreak/deleteItem 同一套
  handler,与 rail 零分叉。**SW-3 多页锚点处理漂亮**:契约给 template 母本也打了
  data-group-id,但 template 内容是惰性 DocumentFragment、querySelector 不下钻,
  首个命中必然是首个**渲染**片段——组从第 3 页开始按钮就锚在第 3 页。DEV 真
  Chrome 实测确认。
- **PO-2 简单版落实**:400ms debounce + requestId 丢弃陈旧响应;重排中旧预览
  原样可见可交互,只叠一枚 pointer-events:none 的「重新排版中…」徽章。
- **visual-unify 白名单行号顺移**(188/452 → 188/294/476):新 loading 徽章
  `color:#ffffff` 合白名单惯例。行号白名单本身脆,但系既有模式,不新开账。

## 新挂账(Should Watch)

- **SW-I(步5 QA 前顺手修或明确接受)**:重排**失败**时若屏上已有旧预览,
  `paginationStatus='error'` 只改状态——错误文案只在无预览的空态分支渲染,
  用户看到的是**无任何提示的陈旧预览**(静默失真,恰是本刀反对的事,只是发生在
  error 这个罕见路径)。修法很轻:error 时也叠一枚徽章(复用 repaginating 样式
  换文案)。
- **nit(不开账)**:首次加载也吃 400ms debounce,首屏白等一拍。若 QA 觉得慢,
  `paginatedHtml === ''` 时跳过 debounce 即可。

## 预存噪音确认(非本步引入)

- `verify-c8-forbidden-scope.mjs` 16/20 失败 = SW-E 既有账(C8-PR-A 时代
  allowlist 过期),DEV 在步2 头(86cf1df)detached worktree 复现同款;其真正在
  乎的 forbidden-PREFIX 断言全过。步5 MF-7 处置。
- eslint:DraftPaperWorkbench.tsx:191 一处 + 全仓 49 处均为既有(git blame
  2026-05-23 起),本步 diff 未触碰。

## Forbidden 复核

print-renderer.mjs / exportImplementation.mjs / schema / buildPageBreakSuggestions
+ print-ready-gate 魔法数字 / exportDraftPaperPdf(步4)/ A4A3 形态:全部未触碰
(diff 文件清单直接证实)。

## 浏览器 QA(DEV,真 Chrome via claude-in-chrome,localhost)

10 页真卷「0709 英语草稿卷」:分页加载(共 10 页+页脚)/常驻按钮全组显示(首组
无分页钮,fullIndex===0 闸)/SW-3 组落第 3 页按钮锚第 3 页/scrollspy 随滚/rail
双向跳转/叠按钮 toggle 分页 10→9 页往返/改标题页脚同步(DP-title)/console 零错。
owner 产品 QA 与 pa.md 8 场景 matrix 留 DP-3。
