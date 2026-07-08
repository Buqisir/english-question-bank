# 刀A 解析分层微调（analysis-layering）plan

- Size: **medium**（单组件信息架构重排 + 交互新增；无 schema/契约变更）。
- 起因：owner 2026-07-08——详情页解析"给的太多太全太杂"。
- 摸底（2026-07-08，file:line 已核实）：`QuestionGroupDetailView.tsx`（743 行）
  每题平铺最多 6-9 个 `<p><strong>label：</strong>` 同权重字段，全部常开，
  组件零折叠原语；组级块（脉络/重要词块/故事大意/串词成篇/文章主旨/
  全文翻译）同样常开。数据无现成"一句话考点"字段。

## 设计决定（主代理 UI direction，owner 复核点见验收）

**两层披露，不造假中间层**：

- **常显层（默认可见）**：题干/选项本体 + **答案行**（AI 推荐答案 +
  answerText/answerMeaning 之类的一行式答案信息）。阅读题的答案行 =
  推荐答案；完形 = 答案 + answerText；语法 = 答案；七选五 = 答案 + optionText。
- **收起层（点「展开解析」出现）**：该题其余全部解析字段
  （翻译/策略/定位句/答案句/解析/语言特征/同义替换/干扰项分析/
  位置上下文/提示词意思/挖空句翻译），保持现有字段顺序不重排内容。
- **组级块同策**：脉络、重要词块、故事大意、串词成篇、文章主旨、
  全文翻译各自默认收起，标题行可点展开（标题行常显，用户知道有什么）。
- **不做**"一句话考点"中间层：数据无此字段，客户端截断=假货。该字段
  留给导题管线（AI 产出真考点一句话）——记入开放账本，与超纲词同轨。
- owner-only 的 AI 验证块 / answer-compare 维持现状（ui-boundary-trim
  已处理，本刀不碰 member/owner 边界）。

## 实现约束

- `QuestionGroupDetailView.tsx` 有「零内部 useState」硬护栏
  （`verify-classic-retire-2.mjs:62-67`）。**不破护栏**：新建小子组件
  `AnalysisDisclosure.tsx`（自持 useState 的通用折叠块，标题行 +
  aria-expanded，参照 `PaperAssetAnalysisPanel.tsx:70-185` 的可达性做法），
  QuestionGroupDetailView 保持无状态，只是把现有字段包进子组件。
- 样式沿用现有 token（焦点环/圆角/语义色已在 ui-token-sweep 收拢），
  不引入新颜色；展开按钮口吻人话化（「展开解析」/「收起」）。
- 展开状态不持久化、不进 URL（会话内点开即可，60 分先落地）。

## Forbidden

- 不动 server / API / 数据 shape；不动 member/owner 门（verify-list、
  compareBox、confidence 维持原 gate）；不动 PaperSurface 系；
  不动搜索结果页;不改解析文案内容本身。
- 不在 `QuestionGroupDetailView.tsx` 内加 useState（护栏保持）。

## 验收

- 行为级：`verify-classic-retire-2.mjs` 维持全绿（零 useState 断言不放宽）；
  新增/扩展 verify 断言：默认渲染不含收起层字段文本、点击后出现
  （可用 E2E 或组件级断言，优先挂进 `smoke-golden-path.mjs` 详情页一步）。
- 浏览器 QA：member+owner 双视角截图（qa 账号 .env.qa），四种题型各一张
  默认态 + 展开态，收官交 owner 复核信息层级手感。
- `pnpm -C app run verify:all` + CI 绿。

## 派工

Sonnet DEV medium（worktree 隔离，与刀B 并行）→ fresh Opus CR。
