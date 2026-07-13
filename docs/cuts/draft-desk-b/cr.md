# draft-desk-b — Big CR（整刀 fresh 冷读终审）

- 日期：2026-07-13
- 审查人：CR（fresh 独立 context，冷读全刀，不受步1–4 CR-lite 的 0MF 锚定）
- baseline reviewed：`git diff 292c058..0f1ca05`（= PR #285 头 vs github/main；33 文件 / +2543 −470）
- 分支/头核对：working tree = 主仓库，branch `draft-desk-b-step1-pagination-renderer`，HEAD `0f1ca05`，clean。`github/main` = `292c058`（与 baseline 一致）。无 BRANCH CONFLICT。
- 复核方式：冷读全 diff + 亲手重跑改动过的 source-structure verify（不采信「CI 绿」）+ 独立审 forbidden-scope 门自身的改造。

## Verdict

**APPROVE**（0 Must Fix）

方向落地扎实、7 MF 全部结构性兑现、Forbidden 边界真守、verify 换向诚实、无越权、无数据/安全面回归。四份 CR-lite 的 0MF 结论经冷读复核站得住，未发现被逐步锚定掩盖的跨步累积问题。Should Watch 全部为已立案的后续清理，不 block merge。建议 owner 产品 QA（DP-3）过后收口合并。

## Must Fix

无。

## PA 7 MF → plan/代码 处置检查表（逐条闭环）

| MF | 落实 | 证据 |
|---|---|---|
| MF-1 paged.js 本仓 spike gating | ✅ | `spike-gate-dp1.md` 四条硬验收全过、引擎选定；plan 步0 gating。 |
| MF-2 单次渲染 parity（禁双引擎） | ✅ | `paginationRenderer.mjs` 模块头锁死「一 page → paged.js → 同页 serialize + 同页 page.pdf()」单入口，禁未分片 page.pdf() 有注释级封堵；`exportDraftPaperPdf` 消费 `pagination.pdfBytes`（同一次渲染）；renderer 确定性 verify（e2e job）。 |
| MF-3 DOM 契约（.preview-page + data-group-id） | ✅ | `paginationDomContract.mjs` 位置性补 id、按共享 `data-ref` 归并跨页分片、映射 `.preview-page`；**不改 print-renderer**（下游 wrapper）。dom-contract verify（e2e job）。 |
| MF-4 render 与非布局编辑解耦 | ✅ | `draftPaperPaginationSignature`（布局字段 + title）= 唯一签名；`draftPaginationCache` LRU8、key=`id::versionType`；前端 `itemsLayoutKey`+title+versionType 才触发 fetch。cache-trigger verify 14/14（我复跑绿）。studentLabel/updatedAt-only 不触发（QA #6 实证）。 |
| MF-5 break-hint 回归（PO-1 延后） | ✅ | 客户端分页 IIFE 全删，`.break-hint` 不注入，`pageBreakSuggestions` 字段保留不消费；render-model 门断言反向锁「NOT rendered」。 |
| MF-6 Chromium 生命周期/并发/异步 | ✅ | `chromiumPool.mjs`：懒启、`disconnected` 懒重连、`exit` hook 兜底、串行队列（失败不卡后续）、全 async 无 execFileSync、常驻 context、`closeChromiumPool` 可控关闭。perf verify（本地，warm ~700-800ms<1s）。 |
| MF-7 Forbidden + 连带门 | ✅ | print-renderer / exportImplementation / schema / buildPageBreakSuggestions / print-ready-gate 魔法数字 均未触碰（diff 清单 + forbidden-scope 门 `print renderer file untouched` PASS 实证）。 |

PA Follow-Up SW-1..SW-5 亦闭环：SW-4 页脚级联=DP-1(b)；SW-5 = owner 拍板「退役不迁移」，`recentDraftPdfExports`/`draftPaperPrintSignature`/`clearRecentDraftPdfExport`/`preferRecent` 全部无残留运行时引用（grep 仅命中注释）。

## Forbidden-Scope Audit（含门自身改造复审）

- **门自身改造**：`verify-c8-forbidden-scope.mjs` 退役了 C8-PR-A 时代的 `allowedPrefixes` 白名单 + 「My Space/答案版不存在」时序断言。冷读确认这是**真退役、非放松**——被删的两块本就永久过期（My Space/答案版早已上线为真功能），且它们让门对几乎所有非-C8-PR-A diff（含纯 docs）恒红，训练 reviewer 无视。**载荷断言（forbidden 前缀栅栏 + `print renderer file untouched` + 导入 fixture 二进制）原样保留、未削弱**。
- **实证**：在 HEAD 用真 baseline（github/main=292c058）跑该门 → 8 PASS / 0 FAIL，`print renderer file untouched` 是对真实 33 文件 diff 的非空断言，非 vacuous。
- **前缀 spot-check（≥3）**：diff 未触 `papersurface/`、`reading-analysis/`、`paper-intelligence/`、`public/reports/`、`public/paper-assets/`、`print-renderer.mjs`（diff-stat + 门双证）。Covered by verify。

## CR-lite 盲区审查结论（0MF ×4 是否掩盖累积问题）

冷读专挑「主代理连续冷读可能瞎的跨步接缝」，逐条查实无雷：

- **步2 契约在步3/4 消费方的隐式假设**：paginationDomContract 的 `groupIds` = `items.filter(!groupMissing).map(groupId)`，positional 首见序映射。潜在坍缩点=同一 groupId 出现在两 item 上 → data-group-id 重复、前端 `groupAnchors` 按 groupId 键坍缩。查 `addGroupToDraftPaper`（store:622-625）**已去重**（重复 group 返回既有 itemId，不新增行），故每卷 groupId 唯一，映射与锚点安全。非回归。
- **前端 fetch 效应 eslint-disable**：pagination-fetch 与 groupAnchors 两处 `eslint-disable exhaustive-deps` 均有具名内层函数 + 明确依赖注释，与既有 scrollspy 同型；deps 精确（`draftPaper?.id/title` + `itemsLayoutKey` + `versionType`），printHtml merge 保持 items 数组引用不变 → 不误触发 pagination 二次渲染。核对无隐性 re-render 风暴。
- **退役 printHtml 死流量 effect（SW-K）**：Workbench:199-212 仍在 versionType 变时拉全 draft 取 printHtml，而 browserPrint 已改吃 paginatedHtml → printHtml 客户端消费点归零。确认为**无害多余请求**（非 bug、非回归），DEV 已申报归后续 printHtml 收缩刀。
- **DP-title 同族失真面**：双缓存已按拍板铲除，模块内只剩一签名一缓存；title 入签名，改标题触发重排（QA #6 页脚四处同步实证）。

## verify–QA gaps（覆盖诚实性 + 挪 e2e 后有无留洞）

- **三换向断言诚实**：render-model×2、my-space×1 全部锚定新管线的等价证明点（`getDraftPaperPagination`/`pdfBytes`/`exportDraftPaperPdf(userId, draftPaperId)`），非放松。我复跑 render-model 35/35、my-space 84/84、cache-trigger 14/14、c8-contracts 50/50、error-copy(12 计数)、visual-unify(3 白名单行) 全 exit 0。
- **两 Chromium verify 挪 e2e**：renderer + dom-contract 已入 e2e job 专步（server chromium 安装后）；perf 刻意留本地（绝对延迟在共享 runner 易抖，符合 plan）。合计无洞。
- **coverage note（非本刀新增，pre-existing）**：`verify-print-pdf-export-flow.mjs`（37 条真服务真 API 行为断言，本刀 SW-D 修 fixture 后成为 PDF 出片 parity 的详尽证明）**仍不在任何 CI job**（verify-ci 与 e2e 均无）。它换线前也不在 CI（SW-D：坏在 main 无人知），故非本刀引入的洞；且 PDF 出片 happy-path 由 e2e job 的 `smoke-golden-path.mjs` 端到端兜底（步4 CI 首跑正是它抓到 400）。建议后续把它挂进 e2e job（与另两 Chromium verify 同址、零增量安装成本）。→ Should Watch。

## Should Watch（非阻塞）

- **SW-J（已立案）**：两处导出路由错误码映射仍查死子串 `'vivliostyle'`，且 Chromium/pagedjs 渲染中途崩溃落 generic 400 而非 5xx。**确认止于「不精确」**：ownership 404 精确匹配先行（route:283 / mySpaceRoutes:184），不被 503 的 `'not found'` 子串遮蔽，无泄漏/无数据面后果。顺手清死子串即可。
- **SW-K（已立案）**：printHtml 死流量 effect（见上）。归后续 printHtml 面收缩刀，连带评估 API 字段瘦身。
- **SW-F/G/H（已落实/明确留置）**：LRU8 + `id::versionType` 键已落；single-flight 锁按令留置（池串行兜底，浪费不出错）。
- **CR-新增·pagination 路由 user-scope 直测缺口（低）**：新 `GET /:id/pagination` 未进 user-scope HTTP 跨用户矩阵（矩阵含 GET/PATCH/items/print-html + my-space borrow）。其 ownership 闸与兄弟路由结构同构，且底层 `getDraftPaper(id,userId)` 强制经 my-space borrow 路径行为实证 → 低风险；建议后续补一条 `GET /:id/pagination` 跨用户 404 断言收口。
- **CR-新增·print-pdf-export-flow 无 CI 家（低）**：见上 verify–QA gaps。

## Scope notes

无越权。改动面全部落在 PA「Allowed Files」预期内 + 新增 `server/draft-paper/` 三模块（renderer/pool/domContract，plan 明许）。旧孤儿路由 `exportImplementation.mjs` 未动；schema 未动；`buildPageBreakSuggestions`/print-ready-gate 未撞。`createDraftPaperStore` 的 `exportDir`/`rootDir` 出参为收窄（调用方多传无害，api.mjs 零改），接受。

## Recommendation

**APPROVE — 可合并**，前置 = DP-3 owner 产品 QA（parity 肉眼 + 交互回归）过（步5 matrix 9/9 + QA-1 修复已由主代理走完，剩 owner 亲验）与合并后 main CI 绿。上线前置（生产机 chromium 安装/常驻内存实测/暖延迟实测入 go-live-record）按 plan 步5 独立跟踪，不阻塞本 PR 合并。SW-J/SW-K/两条 CR-新增覆盖缺口归后续清理刀。
