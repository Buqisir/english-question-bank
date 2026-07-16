# reading-analysis-retire — Fresh CR（冷读 diff）

**Verdict: APPROVE**（0 Must Fix / 3 Should Watch / 1 Nice-to-have）

Reviewer: fresh Opus CR, cold read of `git diff main...reading-analysis-retire`
（122 文件：96 删 / 24 改 / 2 增）。未重跑主代理已亲证项（tsc / 新 verify /
verify:all / DP-2 真实退出码全绿），CR 只复核 diff 语义与断言强度。

---

## Changed Scope（冷读实测）

- 删 96：`features/reading-analysis/` 整目录（21 ts/tsx + css + 13 sidecar json
  + index.json + README）、`paper-intelligence/` 内 14 孤儿文件 + `adapter/`(4)
  + `evidence/`(3) + `paperIntelligenceRoute.ts`、静态镜像
  `app/public/reports/paper-intelligence/`(2)、12 c6a/c6b + 2 smoke + 19 B 类
  历史验收脚本、2 越界文件（`reading-analysis-report.mjs` +
  `reports/reading-analysis-quote-coverage.md`）。
- 改 24：`main.tsx`/`App.tsx`/`AuthGate.tsx`（路由退役 + 自愈）、7 活 Adapter
  （import-only）、`paperIntelligenceTypes.ts`（类型迁入）、7 A 类 verify、
  2 B 类 verify、`verify-ci.mjs`、`scripts/README.md`、STATUS/watch-ledger。
- 增 2：`verify-reading-analysis-retire.mjs`、`qa/dp2-reading-analysis-retire.mjs`。
- **零改动确认**：`server/**`、`app/public/paper-assets/**` 在 diff 名单中零出现。

---

## 八项重点逐项结论

**1. 保留清单零误伤 — PASS。** 逐一对照 reachability §2 keep-list 核 96 个删除：
7 活 Adapter、5 *AnalysisPanel、WritingPaperPage(+css)、registry、
`preview/paperIntelligenceEvidenceLine.tsx` + geometry、`paperIntelligence.css`、
`paperSurfaceLectureHighlights.css`、`paperIntelligenceTypes.ts`、
`concierge/paperSurfaceHref.ts` 无一在删除名单内。`server/**`、`paper-assets/**`
字节级零 diff（确认自 diff 文件名单，非报告口径）。

**2. A 类 verify 改锚未放宽 — PASS（1 SW）。** i4/i5 真改锚到活消费方
`PaperBrowsePage.tsx`（仍验 import + groupType 路由，语义等价且有效）；
i14/i15/i9/section-chrome 降为退役断言（!existsSync），rationale 诚实说明
"harness-side 内部结构无 1:1 存活落点，再锚即断言臆造内部"——符合 plan 步 6
授权的退役替代。各脚本非 Step-3 断言（availability gate、PaperSurface.tsx
forbidden-scope guard）逐一比对**未动**，无顺手放宽。paper-browse:1413 popstate
断言已改成自愈契约断言：负断言 App.tsx 不再短路 + 正断言 main.tsx 有 replaceState
自愈。唯 main.tsx 侧断言用宽松 `.includes`/OR 锚（见 SW1）。

**3. 越界 2 文件裁定 — 正当自然清理。** `reading-analysis-report.mjs` 的整条
import 图（selector `selectReadingAnalysisFromDetail` + annotation
`summarizeQuoteDiagnostics` + sidecar/index.json）随本刀全删；留下即断链坏脚本。
`reports/reading-analysis-quote-coverage.md` 是其产物，全仓仅 `.gitignore`
一处引用。两者不在 plan 明列删单内、DEV 已自报，但既非 Forbidden 又证据确凿为死
物——判为可接受清理，不回滚。（遗留死 gitignore 行见 NTH1。）

**4. 2 支非 A 类脚本小修 — PASS。** verify-radius-family：删两条退役 CSS 的
BASELINE ratchet 条（`harness.css` + `readingAnalysis.css`），是**收紧非放宽**
（允许的非家族圆角变少），rationale 在位。verify-architecture-housekeeping：删
一条针对已删 host-interaction 脚本的 README 行断言，README↔registry 交叉校验
不变量仍在，rationale 在位。二者皆 B 类删除的必然机械后果，无夹带放宽。

**5. 自愈实现正确性 — PASS。** `main.tsx:healRetiredOrphanRoutes()` 严格照契约：
PI+paperId → `?view=paper-browse&paperId=<id>&lecture=1`（surface 无关，正确覆盖
`surface=paper` 形）；PI 无 paperId → `location.pathname`（主页）；
reading-analysis/`demo=`/`#reading-analysis` → 主页。replaceState 在首渲前同步
执行，旧 URL 不入历史。App.tsx boot 读 `view === 'paper-browse'`（:123）落讲评态，
自愈落点可承接。popstate 短路已干净移除、`currentPiRoute` state 与 PI import 全清、
AuthGate 注释更新——无路由残枝、无死 import（新 verify 三重负断言 + tsc 双证）。

**6. PA-lite 降档理由仍成立 — PASS。** ① 方向 owner 多记录圈定=既定方向执行，
对；② 纯前端删除 + verify 退役、server 零改动、回滚=revert——diff 无 server/**
证实完全可逆；③ 无 schema/数据契约触碰——类型迁移是纯 TS type 搬家（read-only
类型，非持久化），确认成立。

**7. 新 verify 脚本质量 — PASS（2 SW）。** 退役断言（existsSync）与存活断言
（PaperBrowsePage import 源码正则、PaperSurfaceData 落点正则）为真检，回归即 FAIL。
已注册 verify-ci.mjs + README（"yes"）。自愈组用宽松 token `.includes`（SW1）、
adapter import 断言有软 OR fallback（SW2）——但 tsc 证解析、DP-2 证行为，整刀非
fake-green。DP-2 经核为真 Playwright 行为测（launch chromium + dev server，①②
断自愈落 paper-browse 同 paperId + lecture-open 几何，③ 断三形落主页非空白，
回归锚四题型面板 + 详情页 peek），rootDir 自推导、DP2_SCREENSHOTS 门控——三判例守。

**8. 文档销账 — PASS。** watch-ledger fig-token 节标 RESOLVED 说明准确；
STATUS 13→12 更正、fig-token 挂账、UI 复评两 P1 全用删除线保留历史、诚实注销，
无越权改写、无 overclaim。

---

## Findings

### Must Fix
（无）

### Should Watch（非阻塞）

- **SW1 — 自愈静态断言锚过软。**
  `scripts/verify-reading-analysis-retire.mjs`（自愈组）与
  `scripts/verify-paper-browse.mjs:1413` 的 main.tsx 自愈断言用宽松
  `mainSrc.includes("'paper-intelligence'") && ...includes('replaceState')` /
  OR 兜底——注释散文里也含这些 token，即便自愈逻辑被误删、只要注释在，静态断言
  仍绿。失败场景：未来 refactor 破坏 heal 逻辑但留注释 → 静态 verify 假绿，唯
  DP-2 能抓；而 DP-2 不在 verify-ci（是流水线 DP 手动闸）。**须确保 DP-2 长期作为
  闸口跑**，否则自愈失去自动回归网。非阻塞：本刀 DP-2 已真绿实证。

- **SW2 — adapter import 断言软 OR fallback。**
  `verify-reading-analysis-retire.mjs` 活 Adapter 循环里
  `(src.includes('PaperSurfaceData') && !src.includes("from './adapter/index.ts'"))`
  第二析取项过宽。非阻塞：同循环第二条 `!src.includes("from './adapter/")` 为硬负
  断言，且 tsc 全量证 import 真解析。

- **SW3 — popstate 对残留 PI 历史条目的降级路径。**
  自愈仅 boot 时对当前 entry 生效；若同会话历史栈深处残留 `view=paper-intelligence`
  条目，Back/Forward 触发 popstate 现落主页（旧逻辑是 reload）。PI 组件已删无法渲染，
  故落主页是安全降级、无空白/崩溃。极端边角（PI 本就仅 URL 直达、退役后无人再生成
  该 URL），非阻塞。

### Nice-to-have

- **NTH1 — 死 gitignore 行。** `.gitignore:59`
  `!reports/reading-analysis-quote-coverage.md` 的 un-ignore 例外，其目标文件本刀已删，
  规则悬空。无害，可顺手清。

---

## Self-Review Blind Spots

- **tsc / verify:all / DP-2 未由 CR 亲跑**：分支在共享对象库、主树未 checkout，CR
  依赖主代理已证的真实退出码（复核纪律授权）。若"verify:all 82/1/0"中那 1 项非
  skip 而是 fail，CR 无法从 diff 独立证伪——但该项与本刀退役无源码耦合关系时不阻塞，
  Big CR 若介入应首验此点。
- **深层类型耦合**：CR 只核了 PaperSurfaceData 形状字节级等价 + 7 Adapter import
  单行改写；plan 步 4 所警示的"图谱未画到的更深 evidence 类型耦合"最终由 tsc 兜底，
  CR 未逐类型追。tsc 绿即证无残耦，但这是 CR 信任 tsc 而非独立追证的一处。
- **DP-2 断言真值**：CR 读了 DP-2 结构确认是真行为测且断言会 fail-on-regression，
  但未亲跑确认其 21 检确实覆盖了 lecture-open 几何的真实可见性（依赖主代理 21 绿）。

## Failure / Attack Angle

最可能的失败不是删错文件（keep-list 交叉核 + tsc 已封死），而是**自愈静态网的软锚
（SW1）掩盖未来 heal 逻辑回归**：一个后续 agent 若"重构"main.tsx 打断
paper-intelligence→paper-browse 的 replaceState 但保留说明注释，verify-ci 全绿放行，
生产旧分享链接静默落主页而非讲评态——只有仍在跑的 DP-2 能拦。防线是保证 DP-2 留在
流水线闸口。次高角度是 SW3 的历史栈残留，但降级安全，不构成攻击面。

## Residual Risk

低。纯前端删除 + 类型搬家，server/数据契约零触碰，完全可逆（revert）。活面字节级
未伤（keep-list + tsc + DP-2 回归锚三证）。残留风险集中在自愈静态断言强度，由真
行为测 DP-2 兜底。

## Recommendation

**APPROVE。** 无 Must Fix。三条 Should Watch 均非阻塞、由 DP-2/tsc 承接真值证明；
建议合并后确保 DP-2 保留为流水线/DP 闸口以守自愈回归（SW1）。
