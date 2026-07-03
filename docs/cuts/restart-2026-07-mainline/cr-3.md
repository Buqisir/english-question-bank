# CR-3 — 刀③ 教师版真解析（paper-assets join）

Branch: `restart-3-teacher-analysis` (remote `github`, SHA `b4b174d`)
Baseline: `main` @ `5f9bf20`
Reviewer: fresh Opus CR-lite（未参与 DEV），worktree 隔离复现
Level: L4-adjacent（export/print 路径 + display-join，diff 小但触 print-renderer 边界）

## Recommendation

**APPROVE** — 无 Must Fix。核心不变量（零 DB 写 / 学生版零污染 / isMetaStub 无假阳性 /
HTML 转义 / 前朝守卫收窄仍能红）全部独立复现通过。三个 Should Watch 均不阻塞本刀。

---

## Changed Scope（对照 plan 刀③ 允许集）

| 文件 | 改动 | 判定 |
| --- | --- | --- |
| `server/print-renderer.mjs` | +`isMetaStub()`，解析赋值改走它 | 允许（plan 授权收窄 C8 边界） |
| `server/draft-paper/analysisText.mjs` | 新增降级器（read-only） | 允许（plan 指定新增） |
| `server/draft-paper/draftPaperStore.mjs` | teacher 分支注入 + `paperAssetsDir` 入参 | 允许 |
| `server/api.mjs` | `findPaperAssetGroup` 加 `paperId` 字段 + factory 注入 dir | 允许（只加字段） |
| `scripts/verify-restart3-teacher-analysis.mjs` | 新 verify（130 断言） | 允许 |
| `scripts/verify-c8-draft-paper-render-model.mjs` | 守卫改 allow-list | 允许 |
| `scripts/verify-ci.mjs` / `scripts/README.md` | 注册新脚本 | 允许 |

**Forbidden 面全部干净**：无 `app/src`、无 `domain/schema`、无 publisher/import 管线、
无 DB 写、writing/continuation 明确排除。8 文件全落 server/scripts。

---

## Findings

### Must Fix
无。

### Should Watch（记录，不阻塞本刀）

- **SW-1 · C8 allow-list 会随未来合法 diff 失效（fail-closed，方向安全）**：
  allow-list 用近乎字面的正则钉死本刀 10 行增 / 1 行删。独立复现：
  (a) 往 print-renderer 塞 `const UNRELATED_INJECTION=42` → C8 变红（`unexpected additions`）；
  (b) 把 `isMetaStub` 体改成 `return false` → C8 也红（行文本变了）。
  **它不会腐烂成"永绿"**——腐烂方向是"未来任何合法改动都会撞红，逼人重看守卫"，
  这是安全侧（fail-closed）。真正的隐患只是：下一个动 print-renderer 的 cut 必须
  连带更新这段 allow-list，否则 CI 红。可接受，记为 follow-up gate。

- **SW-2 · `findOwningPaperId` 是 `api.mjs::findPaperAssetGroup` 的第二实现**：
  analysisText 没复用 api 的 `findPaperAssetGroup`（避免 server 层循环依赖，合理），
  但两处扫描逻辑重复。将来若 asset 目录结构变（如 versions 布局），两处要同步改。
  非本刀 bug。

- **SW-3 · 全目录扫描量级**：32 个 asset 目录、单文件 ~130KB、合计 ~4MB。
  `findOwningPaperId` cache-miss 最坏读+parse 至多 32 文件，命中即早退；
  `paperIdByGroupIdCache` 保证每个 groupId 每次导出只扫一次。典型草稿 4–7 组 →
  最坏 ~7 次扫描，单次导出点击亚秒级。**当前可接受**。疼点在：asset 数涨到数百套，
  或草稿常态混入大量无 asset 来源的自造题组（每个都触发一次全扫且 cache 命中为 null）。
  届时应上跨导出的 groupId→paperId 索引缓存。DEV 自报量级评估属实。

---

## Self-Review Blind Spots（喂 Big CR 优先看这里）

- **真机 PDF 渲染未跑**：所有验证走 `buildDraftPrintHtml` HTML 字符串比对 +
  单题 ≤601 字符预算，未实际生成 PDF 确认"单题 ≤2/3 页"物理排版。字符预算是代理指标；
  600 字中文 + option 分析在极端 A4 缩放下的真实占页高度我无法从字符串证明。
- **真实 asset 覆盖只压测了 paper-zj-2026-jan（四题型齐）+ paper-2024-jia（缺 writing）**。
  其余 30 套 asset 的 analysis 文件字段完整性未逐套跑；若某套 analysis JSON 字段缺失
  （如 reading 缺 `optionAnalysis`），formatter 会安静产出较短文本或空——不会崩，但
  "静默降级到答案-only"这条路径我只在 jia 上验证过一次。
- **并发/多次导出的对象复用**：我确认 `getQuestionGroupDetail` 每次新建对象（DB 查询），
  故 in-place mutate `question.explanation` 不跨请求泄漏；但这依赖 api.mjs 该函数永不缓存。
  若未来有人给它加 LRU 缓存，teacher 注入的解析会污染后续 student 导出——**这是最脆的
  隐式契约**，值得在 store 注入点加一句"detail 必须是 fresh 对象"注释护栏（非本刀强制）。

---

## Verification Evidence（自跑，非抄 DEV）

- `verify-restart3-teacher-analysis.mjs`：**130 passed / 0 failed**（worktree 隔离）。
- `verify-c8-draft-paper-render-model.mjs`（clean）：**31 passed / 0 failed**。
- **DEV 自报①复现**：注入无关行 → C8 红（`unexpected additions: ["+const UNRELATED_INJECTION = 42"]`）✅；
  neuter `isMetaStub`→`return false` → C8 红 且 restart3 行为断言也红（3 failed：
  hides 解析 / never leaks paperId）✅ —— **双闸互补，纵深防御**。
- **学生版零污染（最高危面）**：独立 harness 比对 main-store vs branch-store 的
  `buildDraftPrintHtml(..., versionType:'student')` → **byte-identical: true**。
  注入受 line105 归一后的 `input.versionType === 'teacher'` 硬守，student 永不入分支。
- **isMetaStub 假阳性（危面）**：解析文本 `见 paperId=abc 处，assetVersion= 无关…`
  （中段含 paperId=/assetVersion=）→ **未被误隐藏**（正则 `^paperId=` 锚定行首，
  formatter 输出恒以中文标签打头，永不以 `paperId=` 起始）✅。
- **HTML 注入面（危面）**：hostile 解析含 `<tag>` / `"quote"` / `a<b>c` → 输出
  `&lt;tag&gt;` / `&quot;`，无裸标签泄漏 ✅（asset 文本经同一 `escapeHtml(explanation)`）。
- **零 DB 写（ADR-0008 不变量）**：analysisText 仅 `existsSync/readFileSync/readdirSync`，
  无 `.prepare/.exec/.run/UPDATE/INSERT/writeFile`；store 注入仅改内存对象字段。✅
- **findPaperAssetGroup 回归**：全仓仅两调用点（api.mjs:444/1608），均按属性取
  `.asset/.group`，additive `paperId` 对其惰性无害 ✅。
- **依赖存在**：`resolvePaperAssetReadPaths` 在 paper-import/storage.mjs 已导出 ✅。
- **CI 注册**：restart3 已入 `verify-ci.mjs` registry（第 72 行）✅ —— 真闸会跑，非手跑绿。
- **四题型降级样例可用性抽查**：reading（focus+evidence quote+错项 trap）/
  cloze（正答依据+distractor gloss+点拨）/ grammar-fill / seven-choices
  （mechanismSignals relation 优先）四家输出均为连贯教师用中文，非裸 JSON。

## DEV 三点自报裁决

1. **前朝守卫收窄** — 属实且可靠。收窄成 allow-list，无关注入仍红（已复现）；
   腐烂方向是 fail-closed（逼重看），非永绿。判为合格设计，记 SW-1。
2. **降级器措辞判断** — 抽查四题型真实输出，信息取舍合理（reading 含全部错项 trap、
   seven 用 mechanismSignals 优先、cloze/grammar 带点拨）。无不合理项需列 SW。
3. **findOwningPaperId 全扫不跨导出缓存** — 量级评估属实，当前亚秒级可接受；
   疼点条件（数百套 asset / 大量无来源自造题组）记 SW-3。

---

## Failure / Attack Angle

- **最可能的未来事故**：有人给 `getQuestionGroupDetail` 加缓存 → teacher 注入的解析
  串进 student 导出（跨版本污染）。当前靠"每次 DB 新建对象"的隐式契约挡住，无护栏注释。
- **allow-list 腐烂**：下个动 print-renderer 的 cut 若不同步更新 C8 allow-list，CI 红——
  烦但安全；真风险是被误当"flaky"直接放宽守卫（历史上本仓被 per-cut scope guard 咬过）。
- **静默答案-only 降级**：某套 asset 的 analysis JSON 字段残缺时，formatter 产空 →
  该题只剩【答案】无【解析】，不报错也不告警。老师不会知道是"本无解析"还是"join 掉了"。

## Follow-up Gate

- 刀④/后续任何触 `print-renderer.mjs` 的 cut：必须同步维护 C8 allow-list（SW-1）。
- asset 规模化前（数百套）：上跨导出 groupId→paperId 索引缓存（SW-3）。
- 建议（非本刀）：store 注入点加"detail 须 fresh、勿缓存"护栏注释（BlindSpot-3）。
