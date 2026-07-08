# 当前状态（medium / large cut 收官时更新）

Last updated: 2026-07-08（analysis-layering + paper-browse 双刀并行）

## 现在是什么

- **已上线** https://eqbank.cc：邀请制登录（ADR-0012）、owner/member
  两档（ADR-0013）、用户数据隔离（ADR-0014）、AI 全局日限额（M0-5）。
  香港轻量云单机 + Caddy + systemd + R2 每日备份（launch-deploy）。
  服务器实况见 `docs/cuts/launch-deploy/go-live-record.md`。
- **产品分界**（ADR-0015/0016）：生产在后台 Agent，网站只消费
  （找题 → 看题 → 组卷 → 导出）。网站端导题 UI 已全部退役
  （PR #263-265）；后端分析器作为库函数保留给离线管线。
- 节奏（launch-roadmap）：M0 五刀 ✅ → M1 部署脚手架 ✅ → M1 go-live
  ✅（2026-07-07 已核实补档，见下）→ **当前处于 M1「owner 独用」阶段**
  → M2 = 邀 2-3 位同事。
- go-live 已核实（2026-07-07，小川经腾讯云 TAT 只读核实，
  `docs/cuts/launch-deploy/go-live-record.md`）：Node v24.18.0 无需
  `--experimental-sqlite`、eqb+Caddy active、enforced 模式（1 owner /
  0 member）、R2 备份 cron 每天成功推送（1016 对象/50MB）。**动生产的
  红线已解除**。生产部署 commit 已于同日 data-orphan-cleanup 收尾时
  推进到 `4ff8c3b`（与 main 同步，含 #263-268）。

## 主线焦点

- 2026-07-08：**双刀并行收官**（首次并行流水线试跑成功，worktree 隔离，
  各自 PA-lite/plan→Sonnet DEV→fresh Opus CR→浏览器 QA→独立 PR）：
  - **刀A 解析分层**（PR #279）：详情页解析两层披露——答案行常显，其余
    收进默认折叠「展开解析」，组级四大块各自带标题折叠；新组件
    AnalysisDisclosure 自持状态，QuestionGroupDetailView 零 useState
    护栏原样保住。「一句话考点」中间层不做客户端假货，字段留给导题
    管线产真数据（挂账，与超纲词同轨）。
  - **刀B 整卷预览页**（PR #280）：`?view=paper-browse&paperId=...`，
    整卷按 asset content.blocks 流式渲题组卡（复用 PI adapter 喂只读
    PaperSurface，本体零字节改动）+ 部/节/题组目录锚点 + 加入草稿卷
    （复用状态机）；入口=详情页「看整卷」。两皮结构第一皮；第二皮
    （成卷 A4 预览切换）另刀。刻意不做：移出/整卷加入/试卷列表页。
  - QA 方法沉淀：本地 QA fixture 用户脚本化登录（cookie 注入，代理不碰
    密码）；本地库无解析数据时造 [QA夹具] 数据验分层。
  - 新跟进项（均为存量债，非两刀引入）：route-integration 16 项 main
    同挂旧断言、module-v1 的 App.tsx 冻结断言过宽（均不在 CI）、路由层
    无 popstate 处理（Back 键 URL 变视图不变，与 draft/mySpace 同病）。
- 2026-07-08 晚：**paper-browse-polish 收官**（PR #281，small，owner 实测
  960d0f8d 报障→当晚修复：题号重复/旧格式挖空归一/写作 block 双渲/
  段首语双前缀）。同晚 **High 档构思定向**：产品三主打改为
  **时效/解析/相似题**（原创生产线降级——owner 实测出题差强人意）；
  《相似题维度标准 v1》定稿
  （`docs/product/similar-question-dimensions.md`，六题型维度表 +
  配相似宪法「只有配一个动词」+ 语法单空整段上下文铁律 + 分期点亮，
  Phase 1 靠现有 topic label 即可上线）。下一刀序（owner 已认）：
  flow-hover（整卷页流式化+悬浮显形）→ 配相似动线 → 练习纸 →
  用过标记/「我考过的卷」→ 时效流；数据轨=导题管线加考点标注工序。
  存量数据账：960d0f8d 段首语双前缀、七选五 A-G 缺失同批清洗。
- 2026-07-08：**刀⑤渲染保真收官**（PR #278，large，PA+CR+owner-QA 三审）。
  四套渲染面（屏幕 PaperSurface/写作页/PDF/DOCX）归排版标准 v2 单一权威：
  token 单源化（Issue #30 Gate 2 关门）、屏幕 16px→14px、PDF/DOCX 补挖空
  样式+写作框+页脚页码+rFonts、§3b 分页纪律入标准、PaperSurfacePrototype
  死码清除、4 个过期 PR 冻结 verify 退役。Chunk D（I10 句首挖空）经 PA
  实证真资产不复现，剔刀挂账。owner-QA 实卷目检抓到 3 个 verify 数不出的
  视觉 bug（text-indent 撞字/DOCX 缺缩进/空题干渲染），已修——**渲染刀
  收官必须过实卷目检**成为流程教训（cut-note 有 QA 生成脚本）。
  新账：①**七选五 A-G 候选句未入库**（paper-2026-i 数据缺口，导题工序洞，
  补数据+validator 强制字段）②写作框段首语（需动 api.mjs，小刀）
  ③heading 字号归一（CR SW-B）。生产部署待 owner 拍板。
  候选新刀（owner 方向已聊）：解析分层微调（小刀）→ 整卷预览页
  （新东方式流式挑题+题组量子操作，medium）→ 超纲词入导题管线；
  练习模式（流式+可起标题，区别于真题卷面）挂账。
- 2026-07-08：**导题 agent 化前两刀收官**。刀①《新课标一卷标准》v1
  （`docs/product/nck1-paper-standard.md`，owner 终审：结构/题号/
  分值/答案红线/听力原料先存/图文条款+保真分级）。刀②
  nck1-import-runbook（PR #277，medium）：`docs/import/agent-runbook.md`
  工序书 + 首导 **paper-2026-i**（PDF 格式②首通，听力/figures 原料
  齐，45 答案 DEV+CR 300DPI 双核），`verify-nck1-standard.mjs`
  17 项 gate；validator 最小放宽（.pdf 源，PA-lite 经 CR 认可）；
  酸测试两轮制（fresh Sonnet 盲跑，第 1 轮抓到 validator 契约空档）；
  CR MF1 为误报（RM 一手证据裁决，CR 自行更正，记录在 cr.md）。
  台账 `docs/import-ledger.md` 建立。**2026 卷仅在本地库，生产同步
  待 owner 拍板**。后续刀：③听力入库（PA）④图表契约+提取
  ⑤渲染保真（PA，PaperSurface 高危）；甲/乙/浙旧格式按需接入。
- 2026-07-08：**黄金路径 E2E 收官**（PR #276，medium，Sonnet DEV +
  fresh Opus CR APPROVE，SF1 已收）：`scripts/smoke-golden-path.mjs`
  在 enforced 登录态下 owner/member 双视角各走一遍
  登录→找题→详情→加草稿卷→组卷→导出 PDF（真 vivliostyle %PDF 字节），
  18 项检查；CI 新增独立 e2e job（~1.5min），每个 PR 自动跑。这是
  2.6 万行零单测前端的第一条行为级防线（此前 61 个 verify 全是源码
  grep）。member-detail-gate 五面隐藏也从 grep 断言升级为浏览器真断言。
  DEV 上报待议：详情页「加入草稿卷」按钮文案加入后不刷新（功能正确，
  内联反馈缺失，小刀候选）。下一把：导题管线 agent 化（owner 圈了再动）。
- 2026-07-07/08：**UI 一致性系列六刀全部收官**（PR #269-#274，均经
  Sonnet DEV + fresh Opus CR + CI；4 个 CR Must Fix 全部闭环）：
  ① 外壳统一（AppTopbar/返回统一/去 C4）② 解析面板归队墨绿（作废
  PR #52 warm-pencil）③ token 大扫除（焦点环/圆角/阴影/语义色/AA）
  ④ AI 内部数据 member 隐藏 ⑤ 找题体验（loading 骨架/标题列宽；烂点#4
  经实证已不存在）⑥ 打磨杂项（死 CSS 六组/口吻人话化/思考开关/焦点环
  家族/overlay 归中性/分类色豁免落档 DESIGN.md）。烂点清单 6 项全清。
  审计基线 26/40（`docs/cuts/ui-coherence/audit.md`）；生产部署与复评
  见 go-live 记录后续。此前收官：process-slim、data-orphan-cleanup。

## 开放账本（立刀候选，owner 圈了再动）

- UI 烂点清单：`docs/cuts/ui-facade/ui-blemish-list.md`（owner 曾圈
  「按顺序全做」，剩余项待核对）。
- ~~数据孤儿清理~~（2026-07-07 data-orphan-cleanup 刀收官，PR #268 +
  生产收尾完成：fe8e7a65/ee10da87 本地+生产 DB 均购清（SQL 在
  `data/sql/cleanup-2026-07-orphan-papers.sql`）、paper-960d0f8d 缺
  latest/ 已修复、`verify-paper-assets-consistency.mjs` 挂 CI 且在生产
  实跑 164 checks 全绿。生产同批部署到 `4ff8c3b`（带上 #263-268），
  eqb+Caddy active、eqbank.cc 200。生产 DB 购清前有
  `question-bank.sqlite.bak.orphan-cleanup.*` 备份。）
- 测试夹具漏在生产数据路径（data-orphan-cleanup 刀发现）：
  `paper-2024-jslk-english` 不是垃圾而是 ~25 个 verify 脚本就地消费的
  扁平结构 fixture，但它住在被生产 serve + R2 备份的
  `app/public/paper-assets/` 里（生产备份对它天天报 501）。独立刀：搬去
  `test-fixtures/` + 批量改脚本路径 + 生产侧清残留；一致性 verify 里的
  KNOWN_FIXTURES 白名单同刀移除。
- launch-deploy 挂账：DOCX/讲义版接 Draft Paper 工作台（server 能力
  现成，small cut）；难度维度重建（依赖 reading signals join，
  ADR-0015 已把假 medium 下线）。（topic label 已实测 273/273 全覆盖，
  从账本移除。）
- 导题管线 agent 化（owner 2026-07-07 提出，**排在 UI 大改之后**）：
  目标是「跟 Agent 说导这套题，它识别格式 → 按标准做解析 → 导入」。
  要件：给 Agent 的导题入口（现有 `scripts/import-pipeline/` 是底子）+
  导题标准/要求文档化（格式识别、解析配方、质量 gate）。附带评估：要不要
  一个 owner 看「导了什么/值得看什么」的面板——注意 ADR-0015 网站只消费
  的边界，若做属 owner-only 纠错运维档或后台产物报告，不进网站主面。
- 备份可恢复性演练：R2 有对象但未做过 restore 演练，上线级别应补一次。
- member 详情再收一档：**已收（PR #275，2026-07-08）**。答案对比统计 +
  verify-list 对 member 隐藏（isOwnerView gate，同刀④），
  `verify-classic-retire-2.mjs` 三条断言改 owner-gated 真检查（63/63）。
  其余生产 QA owner 已过，无别的问题。生产已同步（2026-07-08）。
- **《试卷排版标准》v2 定稿（owner 2026-07-08 终审）**：
  `docs/product/exam-paper-format-standards.md` 重写为带数值的唯一
  权威（金样卷 NEEA + 2026 卷双源实测 + 命题人社区共识互证；
  2026 PDF 实为 WPS 仿制件——骨架可信、字符级不可信；七选五挖空
  线长于完形 3:2 实测定谳）。广东 QA 单数值口径废止。**刀⑤渲染
  保真施工图就绪**（四渲染面收拢/PDF·DOCX 补挖空与写作框/DOCX
  补字体/屏幕 16px→14px 等比/I10/死码清理/Issue#30 Gate2 关门），
  owner 圈了即立刀。三项低置信待 owner 实物复核（题号句点/语法
  空线长/边距名义值），不阻塞。
- UI 复评（2026-07-08，六刀后）：26 → **31/40**（快照
  `.impeccable/critique/`）。剩余：[P1] 两个未迁移解析孪生面
  （`?view=reading-analysis` 暖色孤岛 + PI 默认 Preview 面含 backstage
  AI 标，URL 直达可见）——**归 reading-analysis 孤儿支退役刀一并收**；
  [P2] 效率轴（键盘捷径/批量加卷）owner 圈了再动；[P3] 返回措辞一主
  两例外。
- PaperSurface watch ledger：`docs/paper-surface-watch-ledger.md`。

## 更新纪律

medium / large cut 收官（RM 闸过后）顺手更新本页：改「主线焦点」一两
行、勾掉或新增账本项。保持一页以内，不写成日报。
