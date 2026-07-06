# c7-paper-import-retire Plan — 退役 C7「整卷导入」网站界面

## Cut Size

medium（前端纯删 3 文件 + 后端薄路由 1 文件 + `App.tsx`/`AdminWorkbench` 拆除
入口 + `api.mjs` 去注册 2 行 + verify 随动）。可逆（纯删 UI + HTTP 包装，引擎
全留，git revert 即回）。

Touches schema, data contract, product boundary, or teaching interpretation:
**yes（product boundary）** —— 落地 ADR-0016「网站端零导题 UI」第 1 刀（3 刀
中最小最干净）。**不碰** schema / data-contract / publisher 发布逻辑 / server
引擎 / 看题基建。

Dispatch：medium 本可 PA-lite，但 owner 标准流程 + retire 刀先例
（ai-enhancement-retire 的 PA 抓到 2 处 build-breaking 漏删）→ **走完整 PA**。
verify 随动跨 3 类脚本（纯删 / 外科手术 / 保留引擎）+ 触及面 A scope-guard 的
跨刀边界，正是 PA 该压的风险。DEV = **dev-hard**（10 脚本 verify 外科手术 + 4
处易漏 cross-reset）。

## Objective

退役 `paper-import`（C7，`AdminWorkbench`「整卷导入」按钮 → `PaperImportWorkbench`
→ `/api/paper-import/{validate,publish,revalidate-latest}` 3 路由）。删网站页面
组件 + 前端 service + HTTP 路由 + 入口按钮 + `App.tsx` 路由态/handler/挂载/prop。
**后端引擎（publisher/validator/storage/multipart/分析器）全留**——被后台离线
管线 + 看题基建复用（ADR-0016 要害「页面死引擎活」）。面 A + legacy 是后续独立
刀，本刀完全不碰。

## Locked Product Decisions

见 `decisions.md`（D1–D3）+ `docs/adr/0016-website-zero-import-ui.md`。摘要：
- D1 只退 C7 一面；面 A / legacy 后续独立刀。
- D2 引擎全留（含 `multipart.mjs`——本刀仍被面 A `routes.mjs` import，三刀完成
  才连带删）；`verify-c7-*` 两脚本测引擎契约、保留 + 加防误删注释。
- D3 后端数据/发布路径零改动（`ensurePaperImportDatabaseShape` 建表 + storage
  静态服务留）。

## 硬契约（不得偏离；偏离 = CR 打回）

- **C1 删 C7 网站入口 + 页面 + 前端 service + HTTP 路由**：`AdminWorkbench`
  无「整卷导入」按钮；`?view=paper-import` 不再激活任何界面；`PaperImportWorkbench`
  组件 + `paperImportWorkbench.css` + `services/paperImport.ts` + `paperImportRoutes.mjs`
  全删。
- **C2 引擎 KEEP（命门，删了砸后台线 + 看题页）**：
  `server/paper-import/{publisher,validator,storage,multipart}.mjs` +
  `server/paper-import-ai/*` 全部**零改动**。`api.mjs` 只删
  `createPaperImportRoutes` 的 import + 注册，**保留** `ensurePaperImportDatabaseShape`
  建表 import + storage 静态服务 import。
- **C3 verify 三类随动 + 全绿**：见下「verify 随动」。纯删（h1c/smoke-c7）+
  外科手术（h1d/i16a/h11a/owner-gate 各删对已删物的断言/条目）+ 保留引擎测试
  （c7-contracts/c7-publish 加防误删注释）。**不整体删混合脚本**（会误伤引擎
  断言或脚本 ENOENT）。
- **C4 build 干净**：删 C7 后 `App.tsx` 无残留 `paperImportRouteActive` /
  `setPaperImportRouteActive` / `PaperImportWorkbench` 引用（4 处 cross-reset
  易漏，漏则 `noUnusedLocals`/`tsc -b` 硬失败）；`AdminWorkbench` 无残留 prop。
  `pnpm -C app build` 通过。
- **C5 后端/数据零改动**：`data/sql/**`、schema、VIEW、publisher 发布逻辑、
  import-pipeline、看题基建 —— 一律不碰（`git diff --stat` 自证）。

## 参考实现（DEV 照此逐条 grep 核对；行号会漂，符号 + 文件定位）

### 删除 —— 前端纯删文件（3）

- `app/src/features/paper-import/PaperImportWorkbench.tsx`（461，唯一 importer
  = `App.tsx:79`）
- `app/src/features/paper-import/paperImportWorkbench.css`（303，`.pi-import-*`
  独立命名空间）
- `app/src/services/paperImport.ts`（94，导出 `validatePaperImport` /
  `publishPaperImport`，全库唯一 caller = `PaperImportWorkbench`）
- 删完这 2 个前端文件后 `app/src/features/paper-import/` 目录应空（git 自动移除）。

### 删除 —— `App.tsx`（符号定位，逐个 grep）

- import：`import { PaperImportWorkbench } from './features/paper-import/PaperImportWorkbench'`（~79）
- 路由态 useState：`const [paperImportRouteActive, setPaperImportRouteActive] = useState(...)`
  （~568-571，含 `get('view') === 'paper-import'` 初始化）—— 整个 useState 删。
- **⚠️ 4 处 cross-reset（易漏，散在别的 handler 内，删这一行、留 handler）**：
  - `setPaperImportRouteActive(false)` 在 `openDraftPaper` 内（~1690）
  - `setPaperImportRouteActive(false)` 在 `openMySpace` 内（~1728）
  - `setPaperImportRouteActive(false)` 在 **面 A** 的 `paperImportAiOnBackToWorkbench`
    内（~1779）—— 面 A handler 保留，只删这一行 C7 cross-reset
  - `setPaperImportRouteActive(false)` 在 **面 A** 的 `openPaperImportAiWorkbench`
    内（~1801）—— 同上
- C7 back handler：`const paperImportOnBackToWorkbench = useCallback(...)`（~1750-1764）
  —— 整个 callback 删。
- C7 open handler：`const openPaperImportWorkbench = useCallback(...)`（~1783-1792）
  —— 整个 callback 删。
- 挂载块：`if (paperImportRouteActive) { return <PaperImportWorkbench onBackToWorkbench={paperImportOnBackToWorkbench} /> }`
  （~1854-1855）—— 整块删。
- prop 下传：`onOpenPaperImportWorkbench={openPaperImportWorkbench}`（~1938）—— 删。
- **收尾 grep**：`grep -n 'paperImportRouteActive\|setPaperImportRouteActive\|openPaperImportWorkbench\|paperImportOnBackToWorkbench\|PaperImportWorkbench' app/src/App.tsx`
  → **零命中**（`paperImportAi*` 命中是面 A，保留，勿删）。

### 删除 —— `AdminWorkbench.tsx`

- prop 类型：`onOpenPaperImportWorkbench: () => void`（~14）—— 删。
- 解构：`onOpenPaperImportWorkbench,`（~43）—— 删。
- 「整卷导入」按钮 JSX（~83-86，`<button ... onClick={onOpenPaperImportWorkbench}>
  <FileText size={18} /> 整卷导入 </button>`）—— 删。
- **`FileText` icon import 保留**：legacy「导入资料」按钮（~80）也用它，非 orphan。
- **面 A 保留**：`onOpenPaperImportAiWorkbench` prop/解构/按钮（~15/44/87-90，Sparkles）
  勿动。

### 删除 —— 后端

- `server/paper-import/paperImportRoutes.mjs`（70，整删；3 路由全 `ownerOnly`、
  UI-only，前端唯一 caller = `services/paperImport.ts`，`revalidate-latest` 前端
  零调用）。
- `server/api.mjs`：
  - import `import { createPaperImportRoutes } from './paper-import/paperImportRoutes.mjs'`（~27）—— 删。
  - 注册 `...createPaperImportRoutes(),`（~489，在 routes 数组内）—— 删。
  - **KEEP**：`ensurePaperImportDatabaseShape`（~28，publisher）+ storage import
    （~29，`cleanupPaperImportTempArtifacts`/`listPaperAssetVersions`/`resolvePaperAssetReadPaths`）
    —— 勿动。

### verify 随动（`verify:all` = `node scripts/verify-ci.mjs`，仅跑注册表，非 glob）

**纯删（2）：**
- `scripts/verify-h1c-paper-import-routes.mjs`（72，测已删路由文件）—— 删文件
  + 删 `verify-ci.mjs` 注册行 `'scripts/verify-h1c-paper-import-routes.mjs',`
  + 删 `scripts/README.md` 对应表行。
- `scripts/smoke-c7-paper-import-workbench.mjs`（188，测已删 workbench UI）——
  删文件。**不在 verify-ci 注册表**（仅旧 C7 cut 文档引用），无需改注册表。

**外科手术（4，均留注册表，只删对已删物的断言/条目）：**
- `scripts/verify-h1d-analysis-availability.mjs`：删 L~31 `const paperImportRoutes = read('server/paper-import/paperImportRoutes.mjs')`
  + L~50 `assert('Paper Import routes still invalidate through context', ...)`
  + L~51 `assert('Paper Import revalidate still reads through context', ...)`。
  **其余全留**（该脚本主体测 `paperSurfaceAvailability.mjs` 可用性缓存 + api.mjs
  委托 + fixture，与 C7 路由无关）。删这 3 行否则读已删文件 ENOENT。
- `scripts/verify-i16a-teaching-dimension-search.mjs`：`invalidationRouteFiles`
  数组删 `'server/paper-import/paperImportRoutes.mjs',` 一条（**保留**
  `'server/paper-import-ai/routes.mjs',`——面 A 还在）。否则 readFileSync 已删
  文件 ENOENT。
- `scripts/verify-h11a-http-client.mjs`：`noIpv6Callers` 数组删
  `'app/src/services/paperImport.ts',` 一条（**保留** `'app/src/services/paperImportAi.ts',`）。
  脚本对每条 `read(rel)`，否则 ENOENT。
- `scripts/verify-owner-gate.mjs`：删注释 `// server/paper-import/paperImportRoutes.mjs (3; whole module)`
  + 其下 3 条 endpoint（`/api/paper-import/validate`、`/publish`、`/revalidate-latest`）。
  **保留**面 A 的 6 条（`/api/paper-import-ai/*`）。

**保留 + 防误删注释（2，测引擎契约非 UI）：**
- `scripts/verify-c7-paper-import-contracts.mjs` + `scripts/verify-c7-paper-import-publish.mjs`：
  文件顶各加一行注释，如
  `// KEEP: tests the paper-import ENGINE (publisher/validator) contracts, not the retired C7 UI/routes. See ADR-0016. Do not delete when retiring import UI.`
  内容逻辑**零改动**。

**跨刀边界·非阻塞 hygiene（1，不在 verify-ci，但 import 已删文件成 landmine）：**
- `scripts/verify-i1-paper-import-splitter.mjs`（面 A scope-guard，**不在 verify-ci**，
  `verify:all`/CI 都不跑；Cut 2 面 A 退役时整删）：现 L~10 `import { createPaperImportRoutes } from '../server/paper-import/paperImportRoutes.mjs'`
  import 了本刀删除的文件 → 直接 `node` 运行会 load 崩。**外科清理**（非 gate，
  防 landmine）：删 import L~10 + `const c7Routes = createPaperImportRoutes()`（~156）
  + 3 条 C7 route 断言（~164-166）+ stale forbidden 条目 `file === 'app/src/features/paper-import/PaperImportWorkbench.tsx'`（~143，
  连带修其上一行 `||` 链尾）。**只删这些，别动面 A 断言**。

## Forbidden

- 不碰 `server/paper-import/{publisher,validator,storage,multipart}.mjs`（引擎，
  KEEP）。
- 不碰 `server/paper-import-ai/**`（面 A + 分析器，Cut 2 才动）。
- 不碰 `api.mjs` 的 `ensurePaperImportDatabaseShape` / storage import / 建表 /
  静态服务。
- 不碰 `data/sql/**`、schema、VIEW、publisher 发布逻辑、`scripts/import-pipeline/**`。
- 不碰面 A 的 `?view=paper-import-ai` 路由态 / `openPaperImportAiWorkbench` /
  `paperImportAiOnBackToWorkbench`（只删其内的 C7 cross-reset 一行）/
  `AdminWorkbench` 面 A 按钮。
- 不碰 `EntryModal`（`mode="edit"` 编辑，非导题入口）。
- 不改 `verify-c7-paper-import-contracts/publish` 断言逻辑（只加注释）；不动
  `verify-i1-paper-import-analysis` / `verify-i1-paper-import-route`（本刀 diff
  不触发其 scope-guard）。
- **DEV 不许 spawn 子代理**（classic-retire 刀 3 血泪：转包并发编辑 + token
  翻倍）。全部编辑在本 DEV 上下文内完成。

## Suggested Files

删文件：`PaperImportWorkbench.tsx` / `paperImportWorkbench.css` /
`services/paperImport.ts` / `paperImportRoutes.mjs` / `verify-h1c-paper-import-routes.mjs`
/ `smoke-c7-paper-import-workbench.mjs`。

改文件：`app/src/App.tsx`（import/state/4 cross-reset/back+open handler/挂载/prop）
/ `app/src/features/admin/AdminWorkbench.tsx`（prop 类型+解构+按钮）/ `server/api.mjs`
（2 行）/ `scripts/verify-h1d-analysis-availability.mjs` / `scripts/verify-i16a-teaching-dimension-search.mjs`
/ `scripts/verify-h11a-http-client.mjs` / `scripts/verify-owner-gate.mjs` /
`scripts/verify-ci.mjs` / `scripts/README.md` / `scripts/verify-c7-paper-import-contracts.mjs`
（注释）/ `scripts/verify-c7-paper-import-publish.mjs`（注释）/
`scripts/verify-i1-paper-import-splitter.mjs`（hygiene）。

## Verification

- C1：`pnpm -C app run verify:all` 全绿（含 owner-gate/h1d/i16a/h11a 手术后）。
- C2：`git diff --stat` 确认 `server/paper-import/{publisher,validator,storage,multipart}.mjs`
  + `server/paper-import-ai/**` + `data/sql/**` + publisher 发布逻辑 **零改动**。
- C3：`pnpm -C app build`（`tsc -b` + vite）通过（4 处 cross-reset 全删、无 orphan）。
- C4：`grep -rn 'paperImportRouteActive\|PaperImportWorkbench\|openPaperImportWorkbench'
  app/src/App.tsx app/src/features/admin/AdminWorkbench.tsx` 零命中（`paperImportAi*`
  除外，属面 A）。
- C5：`grep -rn "from.*paper-import/paperImportRoutes\|createPaperImportRoutes" server scripts`
  → 除 hygiene 清理后应零命中（面 A 的 `routes.mjs` 不 import 它）。
- C6：Browser QA（见 Matrix）。

## Browser QA Matrix

用 forced-auth temp DB（owner + member 双视角，见记忆
`website-consumption-only-principle` 第 25 棒 preview_fill 血泪：走
`fetch /api/auth/login` + reload，勿用 preview_fill）。

| Case | Expected |
| --- | --- |
| owner 打开管理台（`?view=admin` 或入口） | 「导入」区只剩「导入资料」+「AI 导题」两颗按钮；**无「整卷导入」** |
| 直接访问 `?view=paper-import` | 不激活任何整卷导入界面（落回正常工作台，无崩溃/白屏） |
| member 视角管理台 | 同 owner（管理台 owner-only，member 本就无入口；无 C7 残留） |
| 看题 / 详情页读已存解析 | 正常（storage 静态服务 + 分析器未动，看题基建完好） |
| 面 A「AI 导题」入口 | 仍在、可点开（本刀不碰面 A） |

## DEV Readiness

- 依赖：本 plan + `decisions.md` + `docs/adr/0016-website-zero-import-ui.md`。
- 建议 DEV 顺序：
  1. 删 6 个纯删文件（3 前端 + 路由 + h1c + smoke-c7）。
  2. `App.tsx` 手术（先删挂载块 → 删 import → 删 back/open handler → 删 useState
     → **删 4 处 cross-reset** → 删 prop），**每步增量 `tsc`**。
  3. `AdminWorkbench.tsx`（prop 类型 + 解构 + 按钮；FileText 留）。
  4. `api.mjs`（2 行）。
  5. verify 外科手术（h1d/i16a/h11a/owner-gate）+ 注册表（verify-ci 删 h1c 行）
     + README（删 h1c 行）+ c7-contracts/c7-publish 加注释 + splitter hygiene。
  6. `pnpm -C app build` + `pnpm -C app run verify:all` + Forbidden 自查。
- ⚠️ 核心红线：**4 处 cross-reset**（1690/1728/1779/1801）漏删 = build 崩
  （面 A scope-guard 不在 CI 兜不住这个，靠 `tsc`）。删 useState 前先把 4 处 +
  back/open handler + 挂载 + prop 的引用清干净。
- ⚠️ verify 手术**只删对「已删物」的断言/条目**，别动同脚本里测引擎/面 A/可用性
  的断言（h1d 主体、i16a 的面 A 条目、h11a 的 paperImportAi 条目、owner-gate 的
  面 A 6 条 —— 全留）。
- DEV 档位：**dev-hard**（Sonnet high）—— 4 处易漏 cross-reset + 10 脚本 verify
  三类手术。

## PA Follow-Up Decisions

（PA 评审后回填。）
