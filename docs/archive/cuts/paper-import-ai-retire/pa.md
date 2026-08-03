# PA Review — paper-import-ai-retire（面 A「AI 导题」退役）

Reviewer: PA (fresh cold context, Opus high)
Branch: `claude/paper-import-ai-retire`
Under review: `docs/cuts/paper-import-ai-retire/plan.md` + `decisions.md` + ADR-0016

## Verdict: APPROVE WITH MUST FIX（1 MF，非阻塞级但必须落地才放 DEV）

Plan 主体扎实，5 个核实点全部按 plan 断言核对通过：multipart 确 orphan、App.tsx
恰 14 grep 行对应清单无 orphan、i1-splitter 死断言属实、i16a 段删除不漏活责任、
owner-gate/h11a 手术必要且方向对。唯一 Must Fix 是 owner-gate 里一处 plan 未点名的
连带残留（`openModeSample` 硬编码索引 + 注释计数）。它不会让 verify 变红（故非硬
阻塞），但会留一处「语义悄悄漂移 + 计数造假」的技术债，且正是 CR 会挑的类型。落一
条 plan 记录即可。

## 核实点 1 — D4 multipart 连带删（orphan 判定）— PASS

`grep -rn "paper-import/multipart\|parsePaperImportMultipart" server scripts app`：

```
server/paper-import-ai/routes.mjs:1   import { parsePaperImportMultipart } from '../paper-import/multipart.mjs'
server/paper-import-ai/routes.mjs:89  ...parsePaperImportMultipart(request, ...)
server/paper-import-ai/routes.mjs:152 ...parsePaperImportMultipart(request, ...)
server/paper-import/multipart.mjs:4   export function parsePaperImportMultipart(...)
```

唯一消费者 = `routes.mjs`（3 处都在同一文件）。删 routes.mjs 后 multipart 彻底
orphan（0 引用）。`verify-c7-paper-import-contracts.mjs` / `verify-c7-paper-import-publish.mjs`
均无 `multipart` 命中（引擎测试不碰它）。D4「连带删」稳妥，无活消费者。plan L127-129
的 DEV 删前复查 grep 是对的保险。**结论：连带删安全。**

## 核实点 2 — App.tsx 12-ref 清单一致性 — PASS（实际 14 grep 行 / 10 逻辑处，与清单一致）

`grep -n` 命中 14 行（plan 文字说「12 处」是逻辑处数口径，grep 物理行 14——因
useState / handler / 挂载块跨行）。逐行映射 plan 清单，无 orphan：

| 行 | 归属 | plan 处置 |
| --- | --- | --- |
| 79 | import | 删整行 ✓ |
| 567,570 | 路由态 useState 块 | 删整块 ✓ |
| 1684 | cross-reset in `openDraftPaperWorkbench` | 只删该行（函数留）✓ |
| 1721 | cross-reset in `openMySpace` | 只删该行（函数留）✓ |
| 1742,1754 | back handler useCallback | 整块删 ✓ |
| 1758,1761,1764 | open handler useCallback | 整块删 ✓ |
| 1817,1818 | 挂载块 | 整块删 ✓ |
| 1897 | prop 下传 | 删整行 ✓ |

2 处 cross-reset 上下文已抽验：L1684 处上下有 `setMySpaceRouteActive(false)` /
`setCurrentPiRoute` / `setDraftPaperRoute`（函数体其余保留）；L1721 处其下
`setMySpaceRouteActive(true)`（openMySpace 函数体保留）。两个 handler 确应保留、只
删这一行。**结论：清单与源一一对应，无隐藏 orphan；2 处 cross-reset 是 build 红线，
plan 已重点标注（DEV Readiness 核心红线）。**

## 核实点 3 — i1-splitter 死断言 L155 — PASS

`sed -n '145,161p'` 确认 `assertRouteContract()` 内：L149 `readRepoFile('server/paper-import-ai/routes.mjs')`（删后 ENOENT）、L151 `createPaperImportAiRoutes()`（删后无导出）、L155 `apiSource.includes('createPaperImportAiRoutes')`（本刀删 api.mjs 注册后为 false = 假红）、L152-157 route.pattern 断言全属旧态。留引擎断言 = `mammoth.extractRawText`（docxSplitter，KEEP）+ mammoth 依赖。`grep -n "splitter" scripts/verify-ci.mjs` 为空 = **不在 CI 注册表**，假红非 gate。plan L165 处置正确（删死断言 + 不 widen scope-guard 白名单）。**结论：死断言判定属实，处置正确。**

## 核实点 4 — i16a invalidationRouteFiles 段删除 — PASS（不漏活的 invalidation 责任）

- L60：off-repo fixture 缺失 → `process.exit(2)` 早 skip，CI 恒 skip（L505+ 段在 skip 后不执行）。
- L503-505：`invalidationRouteFiles` 唯一项 = `'server/paper-import-ai/routes.mjs'`；删 routes.mjs 后 L506 `readFileSync` 会 ENOENT（若有 fixture 环境跑到这里）。

**关键 PA 追查（是否漏活责任）**：全库 `invalidateTeachingFacetIndex` /
`invalidatePaperSurfaceAnalysisAvailability` 调用点 = `server/api.mjs`（定义 L314/322）、
`server/paper-import-ai/routes.mjs:189`、`verbProfileBackfillRoutes.mjs`。二者定义体
（api.mjs L314-324）是**运行中 web 服务的进程内内存缓存失效器**（`.invalidate()`），
不是磁盘写。离线 `import-pipeline` **从不调用**它们——它直接写盘，运行中的服务器靠
下次 cache miss / 重启重建缓存（这是 pipeline 发布的既有基线，本刀不改）。因此退役
AI publish HTTP 路由后，i16a 这段 source-contract 断言（只 grep routes.mjs 源码要求
teaching-invalidation ≥ surface-invalidation）**守的对象随路由一起消失**，不存在把
一个「活的失效责任」孤儿化的问题。plan L196-197 的定性（责任已在离线 publish 路径 /
web 层此守卫失去对象）准确。**结论：删除安全，非 CI 阻塞（仓库一致性 + 死代码清理）。**

## 核实点 5 — owner-gate 6 端点 + h11a noIpv6Callers — PASS（h11a 完全 OK；owner-gate 见 MF-1）

**h11a（CI gate，L67 注册）**：`noIpv6Callers` 唯一项 = `'app/src/services/paperImportAi.ts'`（L100-102）。L104 `for (const rel of [...ipv6Callers, ...noIpv6Callers]) { const src = read(rel) }` + L144 二次 `for (const rel of noIpv6Callers) { read(rel) }`——留则删文件后 `read()` ENOENT 硬红。须清空为 `[]`。L90 否定断言里 `paperImportAi` 是禁止-import 词表项，留着无害（plan L184 正确）。**h11a 处置完全正确。**

**owner-gate（CI gate）**：`sed -n '146,154p'` 确认 6 条 `/api/paper-import-ai/*`
端点（L147-153）+ L146 注释。删除必要性成立——`GATED_ROUTES.length` 动态计数
（L288/289/290/305 全用 `.length`，无需改数字），但**留着 6 条已删路由 → member 打
不存在的路由拿不到 403 → `memberBlockedCount` 假红**。plan L185-189 这层判断正确。

**但 plan 遗漏 L338 硬编码索引（→ MF-1）**：`openModeSample = [GATED_ROUTES[0],
GATED_ROUTES[12], GATED_ROUTES[18], GATED_ROUTES[27], GATED_ROUTES[31]]`。当前
GATED_ROUTES 布局（0-indexed）：legacy 0-11、**paper-import-ai 12-17（删）**、
topic-labels 18、verb-profile 19、question-groups 20-35、paper-sets 36-37。删掉
12-17 六条后，18 及之后全部前移 6，新长度 32（有效索引 0-31）：

- `[12]` 当前指 `/api/paper-import-ai/parse`（正被删）→ 删后自愈指向 `topic-labels/backfill`（仍是有效 gated route）。
- `[18]`/`[27]`/`[31]` 全部仍在界内（`[31]` = 新数组末元素 paper-sets PUT），**不会 undefined/crash**，assertion 仍 PASS。

所以**不会让 verify 变红**（故非硬阻塞）——但留下两处技术债：(a) L335 注释「not
the full 33」的计数变成 32（现已是过时值，删 6 后更错）；(b) `[12]` 这个采样索引原
本是**特意选来命中 paper-import-ai 路由**证明「open 模式下 AI 导题路由不被拦」，删后
悄悄改指别的路由——采样意图漂移、无人察觉。这正是 CR 会挑的「计数造假 + 语义静默漂移」。

## Must Fix

### MF-1 — owner-gate `openModeSample` 硬编码索引 + 注释计数随动

- **风险**：plan verify 随动章节（L185-189）只写了「删 6 条 endpoint + GATED_ROUTES.length 动态无需改数字」，未提 `scripts/verify-owner-gate.mjs:338` 的 `openModeSample = [GATED_ROUTES[0], [12], [18], [27], [31]]` 硬编码索引，也未提 L335 注释「not the full 33」。删 6 条后：verify 不会红（索引仍在界内），但 (a) `[12]` 采样从「AI 导题路由」静默漂到别的路由，采样意图丢失；(b) L335「33」计数变陈旧（正确值删后为 32）。这是 CR SW/MF 高发点，且违反本仓「改计数即回归护栏」纪律。
- **要求处置**：plan 在 owner-gate 条目下补一行——DEV 须同步 (1) 复核 `openModeSample` 五个索引删 6 条后仍指向有意义的分布式采样（建议改注释说明索引口径，或把 `[12]` 换成一个仍有代表性的索引）；(2) 更新 L335 注释里的路由总数（33 → 32）。若 owner/PM 认为采样索引可接受自愈漂移，则至少 plan 明记「索引采样容忍漂移、只修计数注释」作为 CR 免挑依据。**二选一，plan 须落文字。**

## Should Watch

- **SW-1（非阻塞）**：`app/src/services/httpClient.ts` 注释历史提 `paperImportAi`（inert），plan Forbidden 已记为独立清洁刀——同意保留，不在本刀动。
- **SW-2（非阻塞）**：`verify-owner-gate.mjs` 注释 L146「6; whole module; PA MF-2 corrected count」删端点时应连注释一并删（否则留悬空注释）——plan L185 已含「删注释 L147」，确认覆盖。
- **SW-3（非阻塞）**：i16a 是 CI 恒 skip 脚本，本刀改它属仓库一致性维护；将来若引入 off-repo fixture 到 CI，需确保 teaching-facet invalidation 的守卫在离线 publish 路径另有覆盖——非本刀责任，记 ADR-0016 挂账域。

## Data-Contract Notes

- 本刀**不碰** schema / data-contract / publisher 发布逻辑 / VIEW / `data/sql/**`（C5 + Forbidden 明列，V2 `git diff --stat` 自证）。已核 `invalidateTeachingFacetIndex` / `invalidatePaperSurfaceAnalysisAvailability` 是进程内内存缓存失效器（非数据写），退役 AI publish 路由不改任何磁盘数据契约。
- KEEP 命门（分析器 12 .mjs + 2 json + publisher/validator/storage）被离线 pipeline + verbProfileBackfill 当库函数复用，本刀零改动——「页面死引擎活」契约完整。
- 无跨卷 / 发布门 / 六题型门数据契约被触及。**无数据契约风险。**

## Must-Fix → plan.md checklist

- [ ] **MF-1**：plan「verify 随动 → 轻改(4) → verify-owner-gate」条目下，补 DEV 动作：(1) 复核/修 `verify-owner-gate.mjs:338` `openModeSample` 五个硬编码索引在删 6 条后的采样意义（或明记容忍漂移）；(2) 更新 L335 注释路由总数（33 → 32）。二选一落文字，供 CR 免挑。
