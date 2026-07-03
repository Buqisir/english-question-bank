# M0-4 用户数据隔离 — cr.md（阿澈 Big CR，独立冷读）

Reviewer: CR（阿澈角色，独立上下文，reviewer ≠ implementer）
Date: 2026-07-03
Diff under review: `git diff f2dedd9..83f8059`（7 实现 commit，19 文件 +1306/−181）
契约输入: plan.md（bee5c1c 后压缩含 PA MF-1/2/3）、pa.md、ADR-0014、review-levels（L4）

## Verdict

**APPROVE**

迁移三路径（fresh / v2 / 半迁移）推演正确并实证收敛；圈范围以「触及三张
顶层表的每一条 SQL」为准逐条对齐无漏；PA 三条 MF 的处置全部落地并有针对性
断言；50 断言的 verify-user-scope 真覆盖验收 1–3（含借导出旁路 404、owner
无特权、半迁移重入）；c8 两脚本断言升到新契约且窗口正则重量窗；Forbidden
边界零触碰（router / 前端 / applyAuthGate / session 契约 / 共享馆）。全量
verify:all 63 通过 0 失败。DEV 自报三个 Blind Spots 我逐条实测裁决，均安全。
无 Must Fix。

## 我实跑的验证命令

- `node scripts/verify-user-scope.mjs` → 50 passed, 0 failed
- `node scripts/verify-c8-draft-paper-contracts.mjs` → 50 passed, 0 failed
- `node scripts/verify-c8-my-space-contracts.mjs` → 84 passed, 0 failed
- `node scripts/verify-h5h-semantic-search.mjs` → 80 passed, 0 failed
- `node scripts/verify-h5i-steward-service.mjs` → 61 passed, 0 failed
- `node scripts/verify-h10b-ai-proxy-routes.mjs` → 36 passed, 0 failed
- `node scripts/verify-h1g-question-group-routes.mjs` → 64 passed, 0 failed
- `pnpm -C app run verify:all` → PASS 63 / SKIP 1（off-repo i16a fixture）/ FAIL 0
- 自写探针 `probe-fresh.mjs`：fresh 库 ensure → user_version=3、folders 有
  user_id、复合索引在、第二次 ensure 幂等（独立验证 verify 未直接覆盖的
  fresh 路径，因为 fresh 走的是「列已在→跳 ADD、folders 已新形→跳 rebuild」
  分支，与 v2 路径不同码路）

## 迁移正确性（最高风险面，实证 + 静态双查）

三路径全推演并实测：

- **fresh 库**（探针）：user_version=0 → 主 exec 建新形表（列已在）→ 分支内
  ADD COLUMN 守卫全跳过、`foldersHadUserIdBeforeRebuild=true` 故 rebuild 跳过
  → 无条件块建复合索引 → version=3。正确、无冗余 rebuild。
- **v2 旧库**（verify fixture 3）：列缺→ADD 回填 'local'、去重 UPDATE 跑一次、
  DROP 旧单列索引、folders 无 user_id → 走 rebuild、foreign_key_check 零违规、
  复合索引 index_info=2 列、旧行经 open 模式可读、version=3、二次 ensure 幂等。
- **半迁移库**（verify fixture 3，PA MF-2）：draft_papers/artifacts 已 ADD、
  folders 未 rebuild、version 卡 2 → 重入：folders rebuild 补上、数据不丢、
  收敛 v3。实证 folder 行 name+user_id 完整。

时序硬约束（PA MF-2）**照办**：`PRAGMA foreign_keys=OFF/ON` 在 `BEGIN…COMMIT`
**外**（c8-my-space 有专门断言比较 offIndex<beginIndex && onIndex>commitIndex，
真断言不是恒真）；rebuild 主体单个 BEGIN…COMMIT 包住 create/insert/drop/rename；
COMMIT 后 foreign_key_check 断言零行。`user_version < 3` 而非 `=== 2`（c8 断言
`/userVersion < 3/ && !/userVersion === 3/`）。ADD COLUMN 用 PRAGMA table_info
列存在守卫（双保险，fresh 与 old 同 version=0 靠列存在性区分）。

去重 UPDATE 已从主 exec 挪进 `< 3` 分支（c8 断言用
`if (userVersion < 3)[\s\S]{0,1300}UPDATE draft_papers[...]id NOT IN` 定位到
分支内，非全局）。

## 圈范围完备性（逐 SQL 对，非方法计数）

- draftPaperStore：9 个自开方法签名全带必填 userId 并下传
  getCurrentDraftPaperRow/createDraftPaper/markCurrentDraftPaper；三个子表入口
  （addGroupToDraftPaper / patchDraftPaperItem / deleteDraftPaperItem）新增
  `SELECT ... WHERE id=? AND user_id=? AND status='active'` 父表命中守卫（此前
  零归属校验，本刀补上）；restoreDraftPaperItem 经 addGroupToDraftPaper 透传
  命中。SELECT/UPDATE/DELETE 全 `AND user_id=?`，INSERT 全写 user_id。
  getDraftPaperItems/normalizeDraftItemOrder 只碰 draft_paper_items 保持无
  userId（父已圈，SW-2 正确不误加）。
- mySpace：listMySpace WHERE + LEFT JOIN **两侧**都圈（SW-3
  `dp.user_id = a.user_id`）；saveMySpaceArtifact folderId 校验带 user_id、
  artifact user_id 取调用方参数不反推（MF-3）；download/delete 均 `AND user_id=?`。
- AI 三入口（MF-1）：question-groups / semantic-search / steward 三条 handler 取
  resolveDataUserId 下传；semanticSearchQuestionGroups + questionBankStewardSearch
  两服务签名加必填 userId（第 5 位 append，不移位既有 stub），steward 转发给
  内嵌 semanticSearch；getDraftSearchContext(userId) 沿两注入链打通。
- 无 stray caller：全仓 grep 确认所有 store/service 调用点已同步新 arity。

## DEV 三个 Blind Spots 逐条裁决

1. **404 映射范围超 plan 字面（PATCH/DELETE items/restore/print-pdf 从
   400/503→404）** — **安全，非越权。** 关键实证：前端
   `app/src/services/draftPapers.ts` / `mySpace.ts` 对这些路由**一律 `!response.ok`
   统一抛错**，无 `status===400` 特判——400→404 对产品层完全透明，同样的
   报错 UX。且这是安全需求的**必然推论**：跨用户回 404 与真缺失回 400 不可
   并存（会泄露存在性），DEV 把两者统一成 404 是正确实现而非越权。print-pdf
   route 的 `NOT_FOUND_MESSAGES.has(message)` 先于 `'not found'` 子串匹配，
   避免跨用户 id 误报 503。裁决：记 Should Watch（已验证 benign），非 MF。

2. **updateDraftPaper 防御性 `AND user_id=?`** — **不改合法行为。**
   getDraftPaper 已先 gated 归属并 throw not-found；title UPDATE 的
   `AND user_id=?` 对同用户恒真、冗余但无害。裁决：接受。

3. **plan 外碰 verify-h10b / verify-h1g stub 补 resolveDataUserId** —
   **纯加性。** 补 authMode:'open' + resolveDataUserId 实现让 handler 不炸，
   新增「userId 转发」正向断言，无削弱既有断言。裁决：接受。**订正**：DEV
   自报只提 h10b/h1g，实际 h5h/h5i 也改了（加第 5 位 userId + 新增「missing
   userId throws」断言）——同为纯加性，实测全绿，但 blind-spot 自报不完整，
   记 SW 供 handoff 留痕。

## Should Watch（非阻塞）

- **SW-A（404 语义扩面）**：open 模式下 draft mutation 族 not-found 由 400→404。
  已验证前端透明。若未来前端对这些路由加 status 特判，需回看此改动。
- **SW-B（blind-spot 自报不全）**：DEV 漏报 h5h/h5i 两脚本改动；已实测纯加性
  全绿。留痕以校准下次自报纪律。
- **SW-C（'local' 存量行不自动认领）**：ADR-0014 决策 1，owner 追认清单已挂。
- **SW-D（assembly-basket localStorage 换账号残留 / per-user 文件目录不做）**：
  ADR-0014 排除项，无隐私载荷，挂 SW 不做。
- **SW-E（复合索引重建依赖 DROP+CREATE 顺序）**：仅在 `version<3` 分支 DROP
  旧单列索引后无条件块 CREATE 复合 IF NOT EXISTS。真实升级路径 version 只在
  DROP+CREATE 后才到 3，不存在「version≥3 但仍是单列索引」的库。非风险，记录
  以防未来手改 version。

## Follow-up Gate

- **M0-5 前无新 schema 交集**（ADR-0014 后果）：M0 收官用户库定格 v3。M0-5
  （AI 日限额）若新增用户表查询，必须带 user_id 圈——verify-user-scope 两用户
  隔离断言是防线，新查询漏圈需 CR + verify 惯例兜底。
- **Browser QA（PM 亲跑，阻塞 RM 合并前）**：static verify 抓不到按钮态串号
  （M0-1 教训），plan 验收 5 的两格必须人工跑：①找题页 in_current_draft 按人
  正确；②**两 member 的 AI 语义搜索 + AI 管家结果卡片按钮态互不串（MF-1）**；
  ③退回开放模式后 owner 日常流零变化。QA 前核进程新鲜度、用完清账号。

## Self-Review Blind Spots（我拿不准的，供后续 gate）

1. **并发写连接下的迁移原子性**：ensure 只在启动唯一写连接跑一次
   （api.mjs:4285），单进程单连接。若未来有多进程/多写连接同时启动触发 ensure，
   rebuild 的 BEGIN…COMMIT 与另一连接的交互我未压测（node:sqlite 默认
   busy_timeout 行为未查）。当前部署形态（单服务进程）不触发，但 M1 多实例部署
   前值得复核。
- 2. **foreign_key_check 的诊断范围**：rebuild 后只对 my_space_artifacts.folder_id
   FK 断言零违规。我未独立构造「artifact.folder_id 指向已 DROP 的旧 folder」
   的脏库验证 check 会捕获——verify fixture 的 artifact 指向存在的 folder，
   属 happy path。ON DELETE SET NULL 语义下 rebuild 保 id 不变，理论安全，但
   脏数据边界未实测。
- 3. **浏览器层按钮态串号我无法在 CR 静态面证伪**：MF-1 的核心风险是 AI 结果
   卡片跨 member 串号，verify-user-scope 只证了 API 层 getDraftSearchContext
   按 userId 取值正确（fixture 1 的 in_current_draft 按钮态断言 + 服务层
   userId 必填断言），未起真前端两 profile。这条只能靠 PM Browser QA 兜底，
   我在 Follow-up Gate 已钉死为合并前阻塞项。
