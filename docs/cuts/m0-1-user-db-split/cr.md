# M0-1 两库分离手术 — CR（代码评审，冷读独立上下文）

审阅人：CR（小川，全新上下文，非本刀 DEV）  日期：2026-07-03
评审对象：`cut/m0-1-user-db-split` @ `d618342`（前两 commit 为 plan/pa 文档，未审）
review level：L4（schema 手术 + 持久化 + 迁移 + 导出路径）——按风险给足强度，未因 diff 行数少而降级。
分支状态：本地 `d618342` == `github/cut/m0-1-user-db-split`；工作树干净，无未提交改动。

## Verdict

**可合并（APPROVE）** — 无 Must Fix。

五条 PA Must Fix 全部落地并由 CR 独立反证（破坏契约后断言确实 FAIL）；连接开关对称、readOnly 归属、孤儿过滤链路、迁移幂等/行数断言、verify 假绿根除均已实测通过。Forbidden 清单干净。

## Changed Scope（与 plan 改动清单核对，无越界）

server/api.mjs（openUserDatabase + ensureUserDatabaseShape + warnIfShared + getDraftSearchContext 改造 + serverContext + 启动 ensure）、
draft-paper/draftPaperStore.mjs（双工厂注入 + 逐方法双连接 + JOIN 改单表 + 孤儿容忍 + 过滤）、
draft-paper/draftPaperRoutes.mjs（3 路由开双连接 + print-html readOnly 订正 + 空 html 400 守卫）、
my-space/mySpaceRoutes.mjs（9 处 openDatabase→openUserDatabase）、
search/semanticSearchService.mjs（纳入 getDraftSearchContext 依赖）、
data/sql/schema.sql（删四表 + 五索引）、
scripts/migrate-user-data-split.mjs（新增）、四个 verify/smoke 脚本、
app 前端三处（domain groupMissing 字段 + Outline 失效展示 + CSS）。
未触碰 import-pipeline / paper-import / PaperSurface / print-renderer；QUESTION_BANK_DB 语义未改。

## Findings

### Must Fix

无。

### Should Watch（记录，不阻塞本刀）

- **SW-1 迁移中断的窄窗**：copy 已提交（userDb COMMIT）但 DROP 前进程被杀 → 用户库有数据、共享库仍有四表。下一次跑脚本会因"用户库已有行"走 refuse 分支（exit 0，不 DROP），需 owner 手工介入。已实测 refuse 分支不误 DROP，且备份文件在。owner 本机一次性运行，可接受；不需本刀处理。
- **SW-2 refuse 路径 exit 0**：幂等 refuse / "无表可迁" 均 exit 0，仅真正行数不一致才 exit 1。语义正确（危险→非零，良性重复→零），但若未来接入自动化编排需注意"exit 0 ≠ 一定迁过"。当前 owner 手动跑，无碍。
- **SW-3 print-html 全孤儿草稿 → 400**：新增 `if (!html)` 守卫，空草稿或全部条目失效时打印返回 400「请先添加题组」。这是新行为（main 上空草稿走空串 200）。合理（不能打印空卷），且未碰 print 渲染契约。前端若对 400 有特定处理应在 QA 顺带看一眼，非阻塞。
- **SW-4 用户库无版本表**：ensure-only + 未来 ALTER 补列，与全仓一致；已挂账 M0-2 复评（pa.md SW-4 / plan PA Follow-Up）。本刀不做，正确。

## 对 DEV 自报盲点的逐条裁决

1. **deleteDraftPaperItem 仍开 bankDb**：**认可**。JOIN 已改单表（userDb-only），但返回体 `getDraftPaper({userDb,bankDb})` 需 bankDb 拼卡片，故仍开 bankDb。非跨侧 SQL，两连接 finally 对称 close（store.mjs:520/553-555 实测平衡）。不是泄漏。
2. **semanticSearch 纳入真实 draftContext（扩权）**：**认可且已证真**。移除 verify-h5h 里 `getDraftSearchContext` mock 后，真实搜索路径抛 `TypeError: getDraftSearchContext is not a function` → 证明 semanticSearchQuestionGroups 确实调用它，验证是行为验证非字符串验证。找题两主路径（listQuestionGroups + semanticSearch）都取真实 draftContext，其余 8 处单卡片路径走 EMPTY，符合 plan 决策 5。
3. **print-html 路由 readOnly 顺手订正**：**认可**。getDraftPaper / buildDraftPrintHtml 实测无任何 UPDATE/INSERT/last_printed_at 写；main 上 `readOnly:false` 是冗余。降为 userDb+bankDb 双 readOnly 是正确清理，未丢任何写副作用。
4. **migrate 脚本 import api.mjs 顶层副作用**：**认可，低风险**。api.mjs 的 `ensureDatabaseShape()` / `server.listen` 均在 `if (process.argv[1] && ...)` 守卫内；模块 eval 只跑 create* 工厂装配，不开 DB、不绑端口。migrate 只解构出 `ensureUserDatabaseShape`，import 重但无副作用。实测端到端迁移正常。

## Self-Review Blind Spots（CR 没把握、需 QA / Big CR 补的地方）

- **前端失效条目交互**：CR 只静态读了 Outline.tsx / CSS / domain 字段与 smoke 的 DOM 断言（`题组不存在` 文案 + `is-group-missing` class）。失效条目在工作台真实渲染（可删按钮可点、不可打印态、拖拽排序是否把失效条目算进 order）未做浏览器 QA。plan 验收 5 的「找题页 in_current_draft 按钮态」属 Browser QA 必测，CR 未覆盖——**移交 QA**。
- **8 个单卡片调用方的 in_current_draft 语义**：CR 判断它们是编辑/详情/create/update 路径，不消费按钮态，传 EMPTY 无害。但未逐路由跑前端确认这些返回的 card 不会被找题列表复用。低风险，但属 QA 可顺带验证项。
- **vivliostyle 真导出**：orphan smoke 的打印断言走 print-html（不依赖 vivliostyle 二进制），真正 exportDraftPaperPdf 的孤儿过滤仅静态读代码 + 依赖 buildDraftPaperExportInput 的 filter 已被 verify 断言覆盖；真 PDF 二进制导出未在本会话跑（owner 环境 smoke-c8 已绿，采信）。

## Verification Evidence（CR 独立重跑，非抄报告）

- verify-c8-draft-paper-contracts: **46 passed, 0 failed**
- verify-c8-my-space-contracts: **72 passed, 0 failed**
- verify-c8-print-ready-gate: **32 passed, 0 failed**
- verify-h5h-semantic-search: **79 passed, 0 failed**
- 反证（证明断言会 FAIL）：
  - schema.sql 重新加回 draft_papers → `schema.sql no longer defines draft_papers` **FAIL**（反向漂移断言有效）。
  - my_space_artifacts 注入 `pdf_blob BLOB` → BLOB 断言 **FAIL**（旧 null-match 假绿已根除：新增 `body located` 独立断言 + `Boolean(body) &&` 守卫，null 体 → false → 正确 FAIL）。
  - 移除 verify-h5h 的 getDraftSearchContext mock → 真实路径 **TypeError**（行为验证非字符串）。
- 迁移脚本端到端（合成 fixture，含一条孤儿 item i2→gX）：
  - RUN1 copy 1/2/1/1 → 行数断言通过 → 共享库四表 DROP（实测查 sqlite_master 为空）→ 用户库 1/2/1/1 → 备份文件保留。
  - RUN2（共享库已无用户表）→ "nothing to migrate" exit 0。
  - RUN3（共享库重现表 + 用户库已有行）→ **refuse，不 DROP**（实测共享库 dZ 行仍在）。
- 连接对称：store 9×(openUserDatabase + self-open bankDb) == 9×(userDb.close + bankDb.close)，全部 finally；routes 3+3 平衡。bankDb 均走 openDatabase() 默认 readOnly:true，写方法 userDb readOnly:false，纯读 userDb readOnly:true——readOnly 归属与 plan 清单一致。
- readOnly 缺文件语义：`DatabaseSync(missing, {readOnly:true})` 抛 ERR_SQLITE_ERROR；启动块 `openUserDatabase({readOnly:false}).close()` 在 `server.listen` 前建库建表，保证首个 readOnly 请求到达时文件已存在（自愈闭环成立）。

## Failure / Attack Angle（本刀可能怎么坏）

- 若 DEV 曾漏改某 store 方法仍 `openDatabase()` 查 draft_paper_items → 拆库后对已 DROP 的表报错。已 grep 全部 selectQuestionGroupCards / getDraftSearchContext 调用点，四表 SQL 均跑在 userDb，无跨侧残留。
- 若孤儿条目绕过过滤直达 getQuestionGroupDetail → 抛 `questionGroupId not found` 崩打印。过滤点在 getDraftPaperItems 标 groupMissing，buildDraftPaperBlocks / buildDraftPaperExportInput / 字数估算三处 `if(item.groupMissing) continue`/`.filter` 均已加；smoke 实测 print-html 跳过孤儿且 body 不含 orphan id、不崩、仍可删。链路闭合。
- 假绿攻击面（null-match 恒 PASS）已被 CR 主动破坏验证根除。
- 连接泄漏（长跑服务累积）：finally 对称已核，无裸开路径。

## Residual Risk

低。核心数据/迁移/连接层已由 CR 独立重跑 + 反证覆盖。剩余风险集中在**前端失效态交互 + 找题页按钮态**的用户可见回归，属 Browser QA 范畴（plan 验收 5 已列为必测），不阻塞代码合并但应在 RM 前完成 QA。

## Recommendation

**APPROVE**。无 Must Fix。合并前完成 plan 验收 5 的 Browser QA（草稿卷/个人空间回归 + 找题页 in_current_draft 按钮态 + 孤儿失效条目工作台展示）。合并时 ADR-0011 转 Accepted。
