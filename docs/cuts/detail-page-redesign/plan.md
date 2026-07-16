# detail-page-redesign（详情页重设计：速览头 + 一张纸露一角）

- cut size: **medium**；契约面：**no**——`shared/papersurface/**` 零改动
  （只读挂载走既有 props 形态），`app/src/domain/` 不动，schemas 不动。
- **产品真源 = spec**：`docs/specs/2026-07-15-detail-page-redesign-design.md`
  （owner approved，原型 `?detailVariant=paper-peek` 真数据实点通过）。
  本 plan 只补工程化细节；**页面结构/负空间三条/数据契约/退役清单/边界/
  错误边角全以 spec 为准，拍板语义不得重开**。
- **PA 降 PA-lite**（降档理由）：方向审查已由 brainstorming 全程 + 原型 B
  owner 逐步拍板完成（spec 头注明）；无契约面。CR 复核降档是否仍成立。
- 路由：无契约面 + plan 预写充分 → cut-pipeline 流水线。

## 施工要点（spec 之外 DEV 需要的工程事实）

1. **重写面**：`app/src/features/question-detail/QuestionGroupDetailView.tsx`
   （现 836 行）按 spec 页面结构重写；App.tsx 改动收最小面（保留 openDetail
   数据通路，退役不再需要的 parse-props 传递）。
2. **原型三件整删**（spec 退役清单）：`DetailPaperPeekPrototype.tsx` /
   `detailPaperPeek.css` / App.tsx `?detailVariant=paper-peek` 接线。
   正式实现**重写不搬运**原型代码。
3. **「相似篇章」入口随迁（E6 交接）**：现详情页已挂
   `features/similar-passages/SimilarPassagesPanel`（E6，spec 动作行补录）。
   新动作行 = `[加入草稿卷](主) [看整卷] [讲评] [相似篇章]（编辑/删除
   owner-only 次位）`；「相似篇章」点击仍为原地展开面板（速览头下方）。
   Panel 组件本体不改（共享件）。
4. **一张纸**：spec 数据契约——`parsePaperIdFromHref(paperSurfaceHref)` →
   fetch `/paper-assets/<paperId>/latest/paper-asset.json`（无 latest 走
   fallback）+ figures manifest（best-effort）→ 按 groupType 走五个现有
   adapter 构建单组模型只读挂载（`lectureFocus=null`、`onFocusIntent`
   noop、无 answers/evidence）；writing 组走 WritingPaperPage 包裹（原型
   已验证路径）。默认露一角 ~340px、顶部页边距裁掉、底部白→白渐隐 +
   「展开卷面」丸，展开可收起。
5. **chips 数据源**（spec 一期范围）：阅读 = reading 解析 per-question
   `questionType` 计数（**先核字段覆盖率**，缺失显示「未标注」不造假）；
   语法填空 = 该卷 assets `analyses/grammar-fill-analysis-v2.json` 本组
   `facetKey` → `grammarFillFacetRegistry.ts` 文案计数；完形/七选五一期
   只显示题数。**若某数据源实际位置/形态与 spec 假设不符 → 停手上报，
   不发明第二数据通路。**
6. **既有 verify 锚随刀更新（授权清单，逐条带 rationale，禁止顺手放宽
   无关断言）**：本页结构重写会正当移动以下锚——
   - `verify-classic-retire-2.mjs` / `verify-analysis-layering.mjs`：
     QuestionGroupDetailView useState 精确计数与逐声明断言（figure-render
     豁免随 bespoke 渲染退役重议；新内部 state 集合按 E6 判例逐声明钉死）。
   - `verify-analysis-layering.mjs`：AnalysisDisclosure 在本页的断言改为
     **退役断言**（零挂载，spec Verify 要点①）。
   - `verify-paper-browse.mjs`：详情页 看整卷/看解析 锚随新动作行标记更新
     （行为语义不变：`buildPaperBrowseLectureHref` href + SPA 拦截 +
     中键可用）。
   - 其它 grep `QuestionGroupDetailView` 命中的断言同纪律处理。
7. **新 verify 脚本** `scripts/verify-detail-redesign.mjs`（注册进
   `verify-ci.mjs` + `scripts/README.md` 同刀原子）：
   - 静态：详情页源码零 `AnalysisDisclosure` 挂载；PaperSurface 挂载 props
     钉死只读形态（`lectureFocus={null}` / noop `onFocusIntent` /不传
     answers·evidence）；原型三件零残留（含 `detailVariant` 接线）。
   - chips 数据：阅读 questionType 覆盖率核数落断言（真值计数，缺失走
     「未标注」分支断言）；语法填空 facetKey→registry 全命中（复用 D1
     registry 完备性）。
8. **DP-2 行为脚本**入档 `docs/cuts/detail-page-redesign/qa/`（可重跑）：
   - 纪律（E6 两条判例）：rootDir 从脚本自身位置推导，**禁止绝对路径**；
     关键可见性用**几何断言**（boundingBox 宽/位置），不止 DOM 存在。
   - 场景：四题型各一组实点（速览头 meta/标题/大意/chips/话题丸）+
     writing 组 + 露一角→展开→收起 + 无标签组 + 无纸组降级占位 +
     「相似篇章」面板展开 + 「加入草稿卷」计数+1 + member 视角
     编辑/删除不可见（isOwnerView gate 现状规则）。

## Forbidden

- `shared/papersurface/**`、`app/src/domain/`、`schemas/`、`*Adapter.ts`
  零改动（契约锁 hook 在岗，无解锁）。
- 解析内容（答案/证据/讲评文案）零进入本页（spec 负空间①，结构性保证
  而非自律）。
- 找题 feed 卡、整卷预览、讲评态、组卷台、`SimilarPassagesPanel` 组件
  本体不在 scope。
- 生产入口不回流（ADR-0015）；暖纸边界：页壳中性、纸卡自暖（不新增
  色彩决策）。
- spec 拍板语义不得重开（含负空间三条与「露一角 ~340px」默认姿态）。

## Verification（流水线 verifyCmds 照抄）

1. `pnpm -C app run build`
2. `node scripts/verify-detail-redesign.mjs`
3. `pnpm -C app run verify:all`
4. `node docs/cuts/detail-page-redesign/qa/dp2-detail-redesign.mjs`

## 裁决点清单（PM 断点锚）

- [ ] 裁1 plan 落锤 + commit
- [ ] 裁2 流水线收口审读（DEV 回执 + verify 步原始退出码 + CR verdict）
- [ ] 裁3 CR MF 处置
- [ ] 裁4 merge 主树 + main CI 绿
- [ ] 裁5 owner DP-3（Chrome 实点四题型 + 边角）→ 部署（强制裁决点）
