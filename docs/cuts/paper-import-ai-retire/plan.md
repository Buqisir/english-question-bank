# paper-import-ai-retire Plan — 退役面 A「AI 导题」网站界面

## Cut Size

medium-large（前端纯删 4 文件 + 后端删 2 文件[routes + 连带 orphan multipart] +
`App.tsx`/`AdminWorkbench` 拆除入口 + `api.mjs` 去注册 2 行 + **12 个 verify 三类
手术**）。可逆（纯删 UI + HTTP 包装层，引擎全留，git revert 即回）。

Touches schema, data contract, product boundary, or teaching interpretation:
**yes（product boundary）** —— 落地 ADR-0016「网站端零导题 UI」第 2 刀。**不碰**
schema / data-contract / publisher 发布逻辑 / server 分析器引擎 / 看题基建 /
import-pipeline。

Dispatch：**走完整 PA**（面 A 比 C7 复杂 —— 删前端牵连 8 个前后端一体 verify 的
跨层瘦身 + multipart 连带删决策[D4] + 3 个 grill 开放问题的落定[D3/D5]，正是 PA
该压的风险）。DEV = **dev-hard**（Sonnet high：2 处易漏 cross-reset + 8 脚本
verify 外科瘦身 + Sparkles orphan + i16a 死数组）。

## Objective

退役 `paper-import-ai`（面 A）：`AdminWorkbench`「AI 导题」按钮 →
`PaperImportAiWorkbench` → 6 个 `/api/paper-import-ai/*` 路由。删网站页面组件 +
前端 service + HTTP 路由（含唯一消费者 orphan 的 `multipart.mjs`）+ 入口按钮 +
`App.tsx` 路由态/handler/挂载/prop。**分析器全留**（KEEP 命门，被后台离线管线 +
verbProfileBackfill 复用，ADR-0016 要害「页面死引擎活」）。legacy「导入资料」=
Cut 3 独立刀，本刀完全不碰。

## Locked Decisions

见 `decisions.md`（D1–D5）+ `docs/adr/0016-website-zero-import-ui.md`。摘要：
- D1 只退面 A；legacy = Cut 3。
- D2 分析器全留（KEEP 命门零改动，`git diff --stat` 自证）。
- D3 `routes.mjs` 纯删（HTTP 包装无库价值；离线管线直接 import 分析函数）。
- D4 `multipart.mjs` 连带删（routes.mjs 唯一消费者，删后彻底 orphan；PA 压）。
- D5 8 混合 verify 原地瘦身（留引擎断言，删死断言）；分析器不挪目录（挂账）。

## 硬契约（不得偏离；偏离 = CR 打回）

- **C1 删面 A 网站入口 + 页面 + 前端 service + HTTP 路由**：`AdminWorkbench` 无
  「AI 导题」按钮；`?view=paper-import-ai` 不再激活任何界面；`PaperImportAiWorkbench.tsx`
  + `paperImportAiAnalysisView.ts` + `paperImportAiWorkbench.css` +
  `services/paperImportAi.ts` + `paper-import-ai/routes.mjs` + 连带 orphan 的
  `paper-import/multipart.mjs` 全删。
- **C2 分析器 KEEP（命门，删了砸后台线 + 看题页）**：`server/paper-import-ai/`
  下**除 `routes.mjs` 外的全部**（12 个分析器 .mjs + 2 个 json）**零改动**；
  `server/paper-import/{publisher,validator,storage}.mjs` 零改动。`api.mjs` 只删
  `createPaperImportAiRoutes` 的 import + 注册，**保留** `ensurePaperImportDatabaseShape`
  建表 + storage 静态服务 + 其余全部。
- **C3 verify 三类随动 + `verify:all` 全绿**：整删 2（i1-route / h11b）+ 原地
  瘦身 8（i1-analysis/i1-splitter/i2/i3/i4/i5/i8/i13：删死断言留引擎断言）+ 轻改 4
  （verify-ci / h11a / owner-gate / i16a）。**不整体删混合脚本**（会误伤引擎断言）。
- **C4 build 干净**：删面 A 后 `App.tsx` 无残留 `paperImportAiRouteActive` /
  `setPaperImportAiRouteActive` / `PaperImportAiWorkbench` / `openPaperImportAiWorkbench`
  / `paperImportAiOnBackToWorkbench` 引用（2 处 cross-reset 易漏，漏则
  `noUnusedLocals`/`tsc -b` 硬失败）；`AdminWorkbench` 无残留 prop + `Sparkles`
  import orphan 清除。`pnpm -C app build` 通过。
- **C5 后端/数据零改动**：`data/sql/**`、schema、VIEW、publisher 发布逻辑、
  `scripts/import-pipeline/**`、`verbProfileBackfillService.mjs`、看题基建 —— 一律
  不碰（`git diff --stat` 自证）。
- **C6 Browser QA**（见 Matrix）。

## 参考实现（DEV 照此逐条 grep 核对；⚠️ 行号已被 Cut 1 打漂 1~42 行，一律符号 + 文件定位，勿信行号）

> 血泪①实证：本清单行号取自 **Cut 1 (main@75c7a74) 之后**的当前源，已逐个 grep
> 核验；但 DEV 编辑时仍以符号为准（下方行号仅供快速定位，编辑前 grep 确认）。

### 删除 —— 前端纯删文件（4）

- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`（937，唯一 importer
  = `App.tsx` 的 import 行）
- `app/src/features/paper-import-ai/paperImportAiAnalysisView.ts`（97）
- `app/src/features/paper-import-ai/paperImportAiWorkbench.css`（616，`.pi-ai-shell`
  独立命名空间）
- `app/src/services/paperImportAi.ts`（288，6 个 fetch 封装 + 类型）
- 删完这 3 个 `paper-import-ai/` 文件后该目录应空（git 自动移除）。

### 删除 —— `App.tsx`（符号定位，全 12 处已 grep 核验）

`grep -n 'paperImportAi\|PaperImportAi\|paper-import-ai' app/src/App.tsx` 命中 12
处，处置：

- **import**（~L79）：`import { PaperImportAiWorkbench } from './features/paper-import-ai/PaperImportAiWorkbench'`
  —— 删整行。
- **路由态 useState**（~L567-571）：`const [paperImportAiRouteActive,
  setPaperImportAiRouteActive] = useState(() => { ... get('view') === 'paper-import-ai' ... })`
  —— 删整个 useState 块（5 行）。注意其下 `adminRouteActive` useState 独立，勿碰。
- **⚠️ 2 处 cross-reset（易漏，函数保留、只删这一行）**：
  - `setPaperImportAiRouteActive(false)` 在 **`openDraftPaperWorkbench`** 内
    （~L1684，其上是 draft-paper URL 设置，其下 `setMySpaceRouteActive(false)` /
    `setCurrentPiRoute` / `setDraftPaperRoute`）—— handler 保留，只删这一行。
  - `setPaperImportAiRouteActive(false)` 在 **`openMySpace`** 内（~L1721，其上
    `setDraftPaperRoute(...)`，其下 `setMySpaceRouteActive(true)`）—— handler 保留，
    只删这一行。
- **面 A back handler**（~L1742-1756）：`const paperImportAiOnBackToWorkbench =
  useCallback(() => { ... setPaperImportAiRouteActive(false); setMySpaceRouteActive(false) }, [])`
  —— 整个 callback 删（含其内两行 set）。
- **面 A open handler**（~L1758-1767）：`const openPaperImportAiWorkbench =
  useCallback(() => { ... url.searchParams.set('view', 'paper-import-ai') ...
  setPaperImportAiRouteActive(true); setMySpaceRouteActive(false); setCurrentPiRoute(...) }, [])`
  —— 整个 callback 删。
- **挂载块**（~L1817-1819）：`if (paperImportAiRouteActive) { return
  <PaperImportAiWorkbench onBackToWorkbench={paperImportAiOnBackToWorkbench} /> }`
  —— 整块删（3 行 + 上下空行归一）。
- **prop 下传**（~L1897）：`onOpenPaperImportAiWorkbench={openPaperImportAiWorkbench}`
  —— 删整行（在 `<AdminWorkbench ...>` 的 props 里）。
- **收尾 grep**：`grep -n 'paperImportAi\|PaperImportAi\|paper-import-ai' app/src/App.tsx`
  → **零命中**。

### 删除 —— `AdminWorkbench.tsx`

- **icon import**（L1）：`import { FileText, Plus, RefreshCw, Sparkles, Tag } from
  'lucide-react'` —— 删 `Sparkles`（**已确认 orphan**：Sparkles 仅在下方按钮用一次；
  FileText[L78 导入资料]/Plus[L262]/RefreshCw[L156]/Tag[L103] 都还在用，留）。
- **prop 类型**（~L14）：`onOpenPaperImportAiWorkbench: () => void` —— 删。
- **解构**（~L42）：`onOpenPaperImportAiWorkbench,` —— 删。
- **「AI 导题」按钮 JSX**（~L81-84）：`<button className="ghost-button" type="button"
  onClick={onOpenPaperImportAiWorkbench}><Sparkles size={18} />AI 导题</button>`
  —— 删整块。
- **保留**：「导入资料」按钮（`onOpenImportPanel`，legacy = Cut 3）+ 数据维护面板
  全部勿动。

### 删除 —— 后端

- `server/paper-import-ai/routes.mjs`（199，整删；6 路由全 `ownerOnly`、UI-only）。
  D3：纯删。它 import 的分析器/publisher/multipart 都是**被 import 方**，删消费者
  不影响它们。
- `server/paper-import/multipart.mjs`（整删，D4 连带 orphan）。**删前 DEV 复查**：
  `grep -rn "paper-import/multipart" server scripts app` → 删 routes.mjs 后应**零
  命中**。若非零，停并报告（说明还有活消费者，回退 D4）。
- `server/api.mjs`：
  - import（~L26）：`import { createPaperImportAiRoutes } from './paper-import-ai/routes.mjs'`
    —— 删。
  - 注册（~L487）：`...createPaperImportAiRoutes(),`（在 routes 数组内）—— 删。
  - **KEEP**：`ensurePaperImportDatabaseShape` / storage import / 建表 / 静态服务 /
    其余全部 —— 勿动。

### verify 随动（`verify:all` = `node scripts/verify-ci.mjs`，仅跑注册表，非 glob）

**整删（2）：**
- `scripts/verify-i1-paper-import-route.mjs`（全 App/service/page/css/README 断言，
  零引擎断言 —— 已通读确认）—— 删文件 + 删 `verify-ci.mjs` 注册行（~L46）+ 删
  `scripts/README.md` 表行（~L63）。
- `scripts/verify-h11b-paper-import-ai-view.mjs`（137，测 `paperImportAiAnalysisView.ts`
  + `PaperImportAiWorkbench.tsx` 的 14-names 契约 —— 两文件都删）—— 删文件 + 删
  `verify-ci.mjs` 注册行（~L66）+ 删 `scripts/README.md` 表行（~L47）。

**原地瘦身（8，删死断言、留引擎断言；统一手术 + 各自特异点）：**

统一删除项（每个都有）：
1. `import { createPaperImportAiRoutes } from '../server/paper-import-ai/routes.mjs'`
2. `const routes = createPaperImportAiRoutes()` + 任何 `createPaperImportAiRoutes({...stub})`
3. 所有 `routes.some(... route registered ...)` / `route.pattern.test('/api/paper-import-ai/...')` 断言
4. `const routeSource = readRepoFile('server/paper-import-ai/routes.mjs')` + 基于
   `routeSource` 的断言
5. 引用已删前端的断言：`serviceSource`（`services/paperImportAi.ts`）、`pageSource`
   （`PaperImportAiWorkbench.tsx`）、`appSource`（App.tsx 面 A 断言）、`apiSource`
   里 `createPaperImportAiRoutes` 相关断言

统一保留项：`buildPaperImportAiPackageFiles(...)` 引擎调用 + `analyze*ImportCandidate`
+ `docxSplitter`(`parseReading*`) + facets json —— 这些是各题型引擎的真实测试。

| 脚本 | 保留的引擎断言（核心） | 特异点 |
| --- | --- | --- |
| `verify-i1-paper-import-analysis.mjs` | analyzeReading + packageBuilder（build/answer-conflict） | L436 `publish route reuses C7 publisher` 断言 routeSource → 删；`server/paper-import-ai/` scope 前缀（~L359/L384）留（目录还在） |
| `verify-i1-paper-import-splitter.mjs` | docxSplitter（mammoth 抽取）+ splitterSource | **不在 verify-ci 注册表**（非 gate）。删 L155 `apiSource.includes('createPaperImportAiRoutes')`（钉旧态、本刀删注册）+ L152-157 route 断言。⚠️ scope-guard 白名单（allowed）对本刀跨文件删除会假红，属**预期**（非 CI），**不 widen** |
| `verify-i2-seven-choices-ai-import.mjs` | analyzeSevenChoices + packageBuilder（7 处 build） | serviceSource(L686-687)/pageSource(L691) 删 |
| `verify-i3-cloze-ai-import.mjs` | packageBuilder（4 处 build） | serviceSource(L321) 删 |
| `verify-i4-grammar-fill-ai-import.mjs` | packageBuilder（4 处 build） | serviceSource(L342) 删 |
| `verify-i5-writing-ai-import.mjs` | packageBuilder（5 处 build，application/continuation） | serviceSource(L433-434) 删 |
| `verify-i8-cloze-analysis.mjs` | analyzeCloze + packageBuilder（6 处 build，含 stub 注入） | serviceSource(L749-750)/pageSource(L753)/routesWithStub(L741-742) 删 |
| `verify-i13-grammar-fill-analysis.mjs` | analyzeGrammarFill + packageBuilder + facets json | serviceSource(L857)/pageSource(L861)/routesWithStub(L849-850) 删 |

> 每个瘦身后**必有实质引擎断言剩余**（已核验：build 调用数 3~7 处/脚本），故全部
> 保留、不整删。瘦身后逐个 `node scripts/verify-<x>.mjs` 应 PASS（i1-splitter 除外，
> 其 scope-guard 假红非 gate）。

**轻改（4）：**
- `scripts/verify-ci.mjs`：删 2 行注册 —— `'scripts/verify-i1-paper-import-route.mjs',`
  （~L46）+ `'scripts/verify-h11b-paper-import-ai-view.mjs',`（~L66）。**8 个瘦身
  脚本的注册行全留**（i1-splitter 本就不在注册表）。
- `scripts/verify-h11a-http-client.mjs`：`noIpv6Callers` 数组（~L100-102）删唯一项
  `'app/src/services/paperImportAi.ts',` → 变**空数组** `[]`（脚本 L104/L147 对每条
  `read(rel)`，留则 ENOENT）。**h11a 在 verify-ci = CI gate，硬要求**。**不改** L90
  的 httpClient 否定断言（regex 里 `paperImportAi` 是禁止列表项，留着无害）。
- `scripts/verify-owner-gate.mjs`：删注释 `// server/paper-import-ai/routes.mjs (6;
  ...)`（~L147）+ 其下 6 条 endpoint（~L148-153，`/api/paper-import-ai/*`）。**owner-gate
  用 `GATED_ROUTES.length` 动态计数，无需改数字**；但**必须删**（否则 member 打
  已删路由拿不到 403 → `memberBlockedCount` 假红）。**owner-gate 在 verify-ci =
  CI gate，硬要求**。保留 legacy-import 12 条 + 其余全部。
- `scripts/verify-i16a-teaching-dimension-search.mjs`：删 `invalidationRouteFiles`
  段（注释 ~L499-502 + 数组 `[ 'server/paper-import-ai/routes.mjs' ]` ~L503-505 +
  其后 `for` 循环 ~L506-515）。routes.mjs 是**唯一**数组项，删后循环失去对象，
  且 `readFileSync(routes.mjs)` 会 ENOENT。**注意**：i16a 在 CI 因 off-repo fixture
  缺失于 L60 `process.exit(2)` 早 skip（L507 在 skip 后不执行），故这是**仓库一致性
  维护**（防有-fixture 环境崩 + 死代码清理），非 CI-gate 阻塞。CR 复核：AI publish
  路由退役后，teaching-facet invalidation 责任已在离线 publish 路径（publisher /
  import-pipeline）承担，web 层此守卫失去对象。

**不碰（scope 前缀 / 引擎断言，逻辑不受影响）：**
- `verify-c7-paper-import-contracts.mjs` L218 `'server/paper-import-ai/'`（前瞻触发
  前缀，目录 + 分析器还在）—— 不碰。
- `verify-i16b`（analyzeReading/packageBuilder must-NOT-contain-topicLabels，引擎
  KEEP）、`verify-i16c`（analyzeGrammarFillVerbProfile + facets/analyzeGrammarFill）、
  `verify-i7`/`verify-i11`/`verify-i14`/`verify-relay-json-format`（import 分析器）、
  `verify-i6`（注释提 packageBuilder 行号，引擎不改不漂）—— 全不碰。

**README（scripts/README.md）**：删 h11b 表行（~L47）+ i1-route 表行（~L63）。
owner-gate 描述行（~L131）含「paper-import-ai whole modules」属历史描述性文字，
非精确计数，**不改**（C7 同款留法）。

## Forbidden

- 不碰 `server/paper-import-ai/` 下除 `routes.mjs` 外的任何文件（12 分析器 + 2 json）。
- 不碰 `server/paper-import/{publisher,validator,storage}.mjs`（引擎，KEEP）。
- 不碰 `scripts/import-pipeline/**`、`server/grammar-verb-profile/verbProfileBackfillService.mjs`。
- 不碰 `api.mjs` 的 `ensurePaperImportDatabaseShape` / storage import / 建表 / 静态服务。
- 不碰 `data/sql/**`、schema、VIEW、publisher 发布逻辑。
- 不碰 legacy「导入资料」（`onOpenImportPanel` / `openImportPanel` / 数据维护面板 =
  Cut 3）。
- 不碰 `EntryModal`（`mode="edit"` 编辑，非导题入口）。
- 不改 `verify-c7-paper-import-contracts/publish`（引擎测试，C7 已加防误删注释）。
- 不改 `app/src/services/httpClient.ts`（KEEP；其注释历史提 paperImportAi，inert
  无害 → 记 SW，独立清洁刀）。
- 不改 `verify-i16b`/`verify-i16c`/`verify-i7`/`verify-i11`/`verify-i14`/`verify-i6`/
  `verify-relay-json-format`（引擎断言 KEEP）。
- **不 widen** `verify-i1-paper-import-splitter` 的 scope-guard 白名单（它不在 CI，
  假红非 gate；widen 反而扩大维护面）。
- **DEV 不许 spawn 子代理**（classic-retire 刀 3 血泪：转包并发编辑 + token 翻倍）。
  全部编辑在本 DEV 上下文内完成。

## Verification

- V1：`pnpm -C app run verify:all` 全绿（含 owner-gate/h11a 手术后；i16a 仍
  skip；8 瘦身脚本注册的 6 个[i1-analysis/i2/i3/i4/i5/i8/i13 —— i1-splitter 非
  注册表]PASS）。
- V2：`git diff --stat` 确认 KEEP 命门**零改动**：`server/paper-import-ai/`（除
  routes.mjs）+ `server/paper-import/{publisher,validator,storage}.mjs` +
  `data/sql/**` + `scripts/import-pipeline/**` + `verbProfileBackfillService.mjs`。
- V3：`pnpm -C app build`（`tsc -b` + vite）通过（2 处 cross-reset 全删、Sparkles
  orphan 清、无 `noUnusedLocals` 报错）。
- V4：`grep -rn 'paperImportAi\|PaperImportAi\|paper-import-ai' app/src/App.tsx
  app/src/features/admin/AdminWorkbench.tsx` → 零命中。
- V5：`grep -rn "paper-import-ai/routes\|createPaperImportAiRoutes\|paper-import/multipart\|parsePaperImportMultipart" server scripts app`
  → 零命中（8 瘦身 verify + api.mjs + routes.mjs + multipart 全清）。
  `grep -rn "services/paperImportAi\|from.*paperImportAi'" app` → 零命中。
- V6：Browser QA（见 Matrix）。

## Browser QA Matrix

用 forced-auth temp DB（owner + member 双视角）。⚠️ 走 `fetch /api/auth/login`
（`credentials:include`）+ `location.reload()` 切换视角，**勿用 preview_fill**
（记忆 `website-consumption-only-principle` 第 25 棒血泪：preview_fill 设 DOM value
不触发 React onChange，受控表单静默失效）。

| Case | Expected |
| --- | --- |
| owner 打开管理台（`?view=admin`） | 「导入」区只剩「导入资料」一颗按钮；**无「AI 导题」** |
| 直接访问 `?view=paper-import-ai` | 不激活任何 AI 导题界面（落回正常工作台，无崩溃/白屏） |
| member 视角管理台 | 管理台 owner-only，member 本就无入口；无面 A 残留 |
| 看题 / 详情页读已存解析 | 正常（storage 静态服务 + 分析器未动，看题基建完好） |
| legacy「导入资料」入口 | 仍在、可点开（本刀不碰，Cut 3 才退） |

## DEV Readiness

- 依赖：本 plan + `decisions.md` + `docs/adr/0016-website-zero-import-ui.md`。
- 建议 DEV 顺序：
  1. 删 6 个纯删文件（4 前端 + `routes.mjs` + `multipart.mjs`[删前 grep 复查 orphan]）
     + 2 个整删 verify（i1-route + h11b）。
  2. `App.tsx` 手术（先删挂载块 → 删 import → 删 back/open handler → 删 useState →
     **删 2 处 cross-reset** → 删 prop），**每步增量 `tsc`**。
  3. `AdminWorkbench.tsx`（prop 类型 + 解构 + 按钮 + **Sparkles import**）。
  4. `api.mjs`（2 行）。
  5. verify 瘦身 8 + 轻改 4（verify-ci 删 2 行 / h11a 空数组 / owner-gate 删 6 端点 /
     i16a 删 invalidationRouteFiles 段）+ README 删 2 行。
  6. `pnpm -C app build` + `pnpm -C app run verify:all` + V2/V4/V5 grep 自查。
- ⚠️ **核心红线**：
  - **2 处 cross-reset**（openDraftPaperWorkbench / openMySpace 内，函数保留只删行）
    漏删 = `noUnusedLocals` build 崩（i1-splitter scope-guard 不在 CI 兜不住，靠
    `tsc`）。删 useState 前先把 2 处 + back/open handler + 挂载 + prop 清干净。
  - **KEEP 分析器零改动**（V2 `git diff --stat` 自证；grep 到 `importMode:
    'paper-import-ai'` 是引擎标记字符串，勿删）。
  - **verify 瘦身只删对「已删物」的断言**（routes/service/page/app/api），**留**
    引擎断言（packageBuilder/analyze*/docxSplitter）。
  - **Sparkles orphan** 删按钮后从 lucide import 去掉（漏则 `noUnusedLocals` 崩）。
- DEV 档位：**dev-hard**（Sonnet high）。

## PA Follow-Up Decisions

（待 PA 回填 —— fresh Opus high。重点压：D4 multipart 连带删是否稳妥 / 8 瘦身
verify 引擎断言是否真能干净剥离死断言 / i16a 段删除是否漏了活的 invalidation 责任 /
App.tsx 12 refs 是否恰为清单所列无 orphan。）
