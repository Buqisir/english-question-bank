# draft-desk-b — 步2 CR-lite(DP-2 步间闸,主代理冷读)

- 日期:2026-07-12
- 对象:PR #285 @ 86cf1df(`paginationDomContract.mjs` 新增 + `draftPaperStore.mjs` 扩展 + 两个 verify)
- 复核方式:主代理冷读 diff + 亲手重跑 verify
- 结论:**过闸,0 Must Fix**;**但步3 开工前有一个 owner 裁决点(DP-title,见下)**。

## 亲手复跑

- `verify-draft-pagination-cache-trigger.mjs`:14/14 绿(此脚本无浏览器依赖,已注册进 verify-ci)
- `verify-draft-pagination-dom-contract.mjs`:32/32 绿(含 SW-A figure 行为断言)
- 步1 回归:renderer 25/25 绿
- PR CI:verify + e2e 双绿(dev push 后)

## 冷读判定

- DOM 契约:`.preview-page` + 位置性 `data-group-id`,跨页拆分片段按共享 `data-ref` 归并(含 template 副本,单线性 pass),数量不符 fail-loud。契约冻结写进模块头,下游禁依赖 pagedjs_* 内部类。设计正确。
- SW-A **实锤并修复**:`setContent`(about:blank)下站内路径 `<img>` 零网络请求(空 control 实验证明)。修法 = imageMode:'file' + base64 data URI 内联,自包含、不依赖静态路由,与 renderPaginatedPaper 契约零耦合。方案对。
- 缓存解耦:新 `draftPaperPaginationSignature`(仅布局字段)与旧 `draftPaperPrintSignature`(Vivliostyle 线 30s 缓存)分离,旧线未触碰——正确,步4 再迁。
- studentLabel 排除签名:grep 证实不进任何打印输出,无争议。

## ⚖️ DP-title:owner 裁决点(步3 开工前拍)

**事实**:标题印在每页页脚(`addDraftFooterCss` 的 `@page @bottom-center`,DP-1 验收 (b) 验的就是它)。plan 步2 字面写"改标题不触发 render",dev 依此把 title 排除出缓存签名(Option A)——后果实测:改标题后缓存命中,预览/PDF 页脚**沿用旧标题**,直到下次布局编辑才刷新。

- **Option A(已按 plan 字面 ship)**:改标题不重排,快;但页脚静默陈旧 = 违反柱子2「所见即所印」。
- **Option B(dev 与 PM 一致推荐)**:title 入签名,改标题触发重排(~700-800ms,PO-2 已拍的「重新排版中…」loading 态天然兜住)。页脚永不陈旧。

**PM 推荐:B。**parity 是本刀立身之本;A 省下的一次重排换来的是一类静默失真。改动量一行 + verify 断言反转,步3 开工前拍掉即可。

## 新挂账(Should Watch)

- **SW-F(步3+)**:`draftPaginationCache` 无 TTL 无容量上限,entry 含 pdfBytes+paginatedHtml(~1MB+/卷),多卷长会话内存缓涨。步3 接路由时给个简单上限(如 LRU 保 8 卷)或复用 30s TTL 思路。
- **SW-G(低)**:缓存 key = draftPaperId 单键,签名含 versionType → student/teacher 交替预览互踢缓存(每次切换重渲,浪费不出错)。步3 若做双版切换预览,key 带上 versionType 即可。
- **SW-H(步3+,dev 自报)**:getDraftPaperPagination 无 single-flight 锁,同卷并发 miss 双渲染(池串行,浪费不出错)。路由接上后若成本真实再做。
