# reading-analysis-retire — 孤儿支退役刀 plan

- Cut line: **medium**; touches schema / data contract: **no**; touches
  product boundary: **yes——PA-lite 降档**。降档理由（CR 须复核是否仍
  成立）：① 方向已由 owner 多次在 repo 记录里圈定（STATUS「归
  reading-analysis 孤儿支退役刀一并收」×2、flow-panel plan「退役另刀」、
  fixture-move plan「孤儿支本就在退役账上」），本刀是既定方向的执行；
  ② 完全可逆——纯前端删除 + verify 脚本退役，server 零改动，回滚 =
  revert；③ 无 schema / 数据契约触碰。
- 底稿：`reachability.md`（2026-07-16 Explore 全仓可达性图谱，
  删/留二分与陷阱项均以它为准；DEV 与 CR 必读）。

## 本刀收的挂账（销账清单）

1. UI 复评 P1：`?view=reading-analysis` 暖色孤岛（STATUS）。
2. UI 复评 P1：PI 默认 Preview 面含 backstage AI 标、URL 直达可见
   （STATUS）。
3. watch ledger「fig-token 残口：老解析页 harness 卷面」——页随刀退役，
   残口自灭（ledger 该节标 RESOLVED by 本刀）。
4. 12 个 c6a*/c6b* 僵尸 smoke 处决（STATUS 写 13，实数 12，随刀更正）。
5. flow-panel 刀承诺的「老解析页 `?view=paper-intelligence&surface=paper`
   退役另刀」。

## 目标

孤儿支（`?view=reading-analysis` 全支 + `?view=paper-intelligence` 两个
子面）从产品面、代码、verify 三层同刀退净；活面（paper-browse 讲评态、
详情页一张纸、concierge 入口）字节级不受伤；旧 URL 自愈不裸奔。

## Scope（按施工序）

1. **路由退役 + 旧 URL 自愈**（`main.tsx` / `App.tsx` / `AuthGate.tsx`）：
   - main.tsx 撤 raRoute/piRoute 解析与 `ReadingAnalysisDemoRoute` 挂载；
     App.tsx 撤 :991-1020 两子面挂载、:797-805 popstate 短路及相关
     import；AuthGate 注释顺清。
   - 自愈契约（判例：E6 legacy `similar=1` 自愈）：
     `?view=paper-intelligence…&paperId=<id>`（含 `surface=paper` 形）→
     replaceState 落 `?view=paper-browse&paperId=<id>&lecture=1`；
     无 paperId 的 `?view=paper-intelligence`、以及
     `?view=reading-analysis` / `?demo=reading-analysis` /
     `#reading-analysis` → 落主页。实现允许直接读 URLSearchParams 内联
     判断，`readingAnalysisRoute.ts` / `paperIntelligenceRoute.ts` 两个
     route 文件随刀删除，不留解析器。
2. **删 `features/reading-analysis/` 整目录**（图谱 §2：完全自包含，
   外部零 import）。
3. **删 `features/paper-intelligence/` 内孤儿文件 14 个**（图谱 §2
   可删清单，含零引用死码 `insight/insightChipShortLabel.ts`）。
   保留清单里的任何文件被误删都算出界。
4. **类型链手术（本刀最险一步，图谱陷阱项）**：把 `adapter/index.ts`
   导出的 `PaperSurfaceData`（及其直接依赖的纯类型）迁入
   `paperIntelligenceTypes.ts`，改写 7 个活 Adapter 的 import；然后删
   `adapter/`（index + piToPaper* ×3）与 `evidence/` 目录。若 tsc 揭出
   图谱未画到的更深耦合（如保留文件 import evidence 类型）→ 保留该
   类型文件本体、只删运行时，**停手上报不发明第二方案**。
5. **删静态资产** `app/public/reports/paper-intelligence/`（dist/ 镜像
   随构建自灭，不手动碰 dist）。
6. **verify 层退役与改锚（授权清单，逐条 rationale，禁止顺手放宽无关
   断言）**：
   - 整支删除：12 个 c6a*/c6b* + 2 个 smoke-*（reading-analysis /
     paper-intelligence-preview）+ 图谱 §4 B 类 19 支历史验收脚本。
     `scripts/README.md` 对应行与「C5 / C6 reading-analysis cuts」整节
     同刀清（housekeeping guard 管着 README 同步）。
   - A 类 7 支改锚：i14/i15/i4/i5/i9/section-chrome 六支——凡断言
     「Harness 源码含 X」者，改锚到活消费方（PaperBrowsePage /
     QuestionGroupDetailView）或改为退役断言（文件不存在），rationale
     逐条写进 diff 注释可查；`verify-paper-browse.mjs:1413` popstate
     断言改为断自愈契约（旧 URL → replaceState 新 URL）。
   - C 类仅注释提及的 11 支不动。
7. **新 verify** `scripts/verify-reading-analysis-retire.mjs`（注册进
   `verify-ci.mjs` + `scripts/README.md` 同刀原子）：
   - 退役断言：`features/reading-analysis/` 不存在；孤儿 14 文件 +
     adapter/ + evidence/ + 两 route 文件 + reports 静态目录不存在；
     App.tsx/main.tsx 源码零 `view === 'paper-intelligence'` 挂载分支。
   - 存活断言：保留清单抽锚——`PaperBrowsePage.tsx` 仍 import
     `paperIntelligence.css` 与 evidence 动线两文件；7 个活 Adapter 的
     `PaperSurfaceData` import 指向新落点且 tsc 由流水线全量证。
   - 自愈断言：静态断 App 源码含自愈改写；行为断言进 DP-2。
8. **DP-2 行为脚本**入档 `docs/cuts/reading-analysis-retire/qa/`
   （可重跑；rootDir 自脚本推导禁绝对路径、关键可见性几何断言、
   DP2_SCREENSHOTS 门控三判例全守）：
   - 旧 PI URL（带 paperId 两形）→ 落整卷页讲评态且锚定；
   - 旧 reading-analysis 三形 URL → 落主页；
   - 回归锚：整卷页讲评态四题型解析面板可开、详情页一张纸露一角
     正常（活面字节级不伤的行为证）。
9. **文档销账**：watch ledger fig-token 节标 RESOLVED；STATUS 主线
   一条 + 五项挂账勾销（含 13→12 更正）；UI 复评 P1 两项注记。

## Forbidden（出界即停）

- `server/**` 全部——特别点名 `server/search/paperSurfaceAvailability.mjs`
  （活的「看解析」可用性服务，产出 URL 长得像孤儿路由是历史巧合）与
  `server/reading-analysis/`（同名不同物的难度归一化，图谱 §5 双陷阱）。
- `app/public/paper-assets/**`（活体语料）。
- 图谱 §2 保留清单全部文件（活 Adapter ×7、Panel ×5、WritingPaperPage、
  registry、evidence 动线两文件、三份共用 css、
  `paperIntelligenceTypes.ts`、`concierge/paperSurfaceHref.ts`）——
  除第 4 步授权的 import 路径一行改写外不许动内容。
- 不做自愈之外的任何兼容层；不顺手重构活面。

## Contract-unlock

第 4 步要写 7 个 `*Adapter.ts`（guard-contract-files 硬护）。DEV 开工前
由 orchestrator `touch .claude/contract-unlock`，收官时移除。授权范围
仅限 import 语句改写；Adapter 逻辑变更即出界。

## 裁决点清单（PM 断点锚）

- [x] 裁0：owner 发令「准备孤儿退役刀」（2026-07-16）。
- [x] 裁1：owner 拍板开工（2026-07-16「听你的推荐」）——自愈契约两条
  默认照准：带 paperId 落讲评态、其余落主页，不留解析器兼容层。
- [x] 裁2：DEV 完成（c3c2c44，103 删/17 改/2 增），主代理在 worktree
  亲跑四命令真实退出码全 0（tsc / narrow 44 / verify:all 82-1-0 /
  DP-2 21），契约面 7 Adapter diff 亲核为单行 import 改写（2026-07-16）。
  注：本刀碰契约面，按 dispatch-protocols 路由卡走常规管线非 Workflow。
- [x] 裁3：fresh Opus CR APPROVE，0 MF / 3 SW / 1 NTH（cr.md）。越界
  2 文件裁为正当自然清理；SW1=自愈静态锚偏宽由 DP-2 行为测兜底，
  DP-2 保持常驻（qa/ 已入档可重跑）。
- [ ] 裁4：merge + main CI 绿。
- [ ] 裁5：owner DP-3（QA 表：旧 URL 自愈两条 + 讲评态/详情页回归两条）
  → 拍板部署生产。

## Verify（RM 闸口径）

流水线 verifyCmds：`tsc` → `node scripts/verify-reading-analysis-retire.mjs`
→ `pnpm -C app run verify:all` → DP-2 脚本。全过 + main CI 绿后 RM。

## 账单

（收官时填：流水线 tok + CR tok + 主代理出场次数。准备阶段已花：
Explore 图谱 149k。）
