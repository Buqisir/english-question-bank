# CR — draft-depassage-letter（fresh cold read）

审查人：CR 子代理（Opus）。diff 范围 `a467dbd..3be101b`（4 文件：
qa-notes / verify-print-renderer.mjs / print-renderer.mjs / docxRenderer.mjs）。

## Verdict：APPROVE

Must Fix：0　Should Watch：3

去字母彻底、大题头正确、DEV 两个「不可达」结论核验成立、Forbidden 面
零触碰、PA-lite 降档三条件全部成立。verify-print-renderer 复跑 68/0（含
真实 vivliostyle PDF），verify-h5g-docx-renderer 复跑 97/0。

---

## 审查轴逐条结论

### 1. 去字母彻底性 — 通过
- print + docx 两渲染器 blocks 分支的 `passageLabelMatch`/`sectionTitle`
  推导 + 渲染 + `.passage-letter` CSS/docx 段落全部退役，无残留。
- 全仓 grep：`passage-letter` 仅剩 (a) `app/src/shared-ui/papersurface/**`
  屏幕面（Forbidden 明确保留）、(b) `scripts/verify-paper-browse.mjs`
  屏幕面断言（未改，本刀不碰屏幕面）、(c) `scripts/review/**` 的
  `passageLabel`（难度标定，与卷面渲染无关）。print/docx 卷面两渲染器零残留。
- verify-print-renderer 旧断言更新**未削弱守卫**：反而更强——Test 8b 从
  「断言字母在场」翻成「断言零 passage-letter + `.passage-letter {` CSS
  已退役」的正向负断言，并新增大题头连续性断言。

### 2. 大题头正确性 — 通过
- 跨 section_header/page_break 不重置：`groupNum` 仅在 `question_group`
  分支自增，`section_header`/`page_break` 分支不触碰。Test 1 fixture 在
  g1、g2 之间**同时插入 section_header + page_break**，断言 g2 = `2、七选五`，
  真实证明连续不重置（非相邻两组糊弄）。
- 连续计数 vs 小题号互不干扰：`groupNum` 与 `questionNum` 独立计数器。
- score 缺失优雅省略：后缀由 `hasBlockScore = Number.isFinite(Number(block.score))`
  门控，缺失即整段省略。print/docx 同款门控。
- 教师版 group-meta：print 中 group-header 置于 `if (!isExam)` group-meta
  之上，group-meta 门控逻辑未改（见 SW-3 关于其 gate 语义的说明）。
- DOCX 样式层级：group-header run `size:22`(11pt) 半级低于 section_header
  `size:24`(12pt)，`heading:true` 走黑体族与 section_header 同族；print
  `.group-header` 用 `paperFontStackHeading`(SimHei) + 11pt，token 存在且
  与 `.section-header`(12pt) 同族。docx/print 双面 11pt 一致。

### 3. 两个「不可达」结论 — 核验成立，且外部直呼 API 风险已结构性排除
- **legacy items 分支**：核验两渲染器 legacy 分支源码——它们**本就不渲染
  任何 passage letter**（直接渲染 passage，无字母代码）。因此「去字母」目标
  与该分支无关；DEV 未给它加大题头亦在 plan 授权内（记录为事实）。
- **不可达论据充分性**：`buildDocxPayload/buildPdfPayload` 同时下发 items +
  blocks，正常 UI 路径 blocks 非空 → 走 blocks 分支。此「不可达」是加分项，
  **非承重**。承重的是：即便外部直呼 `POST /api/exports/docx` 传 items-only
  payload 命中 legacy 分支，该分支源码零字母渲染 → **不会渲出裸 token 或
  A-D 字母**。故裁定：外部直呼 API 走 legacy 分支**不构成字母/裸 token
  风险**，本刀不做 legacy 分支 = 零风险，成立。
- **handout buildDocumentXml 无 UI 可达**：该非-exam docx 路径本就无字母
  渲染，无可退役物；见 SW-2 关于其未获大题头造成的 print/docx 潜在不对称。

### 4. Forbidden 面自证复核 — 通过
- `app/src/shared-ui/papersurface/**`、`paperAssetSurfaceAdapter`、domain
  schema、`app/public/paper-assets/**` 均不在 diff 内。
- 七选五 A-G 选项池 / 文内挖空号 / 小题号逻辑零触碰（Test 6 挖空号、
  Test 1 七选五组仍绿）。`draftPaperPreviewHtml.ts` 不在 diff 内。
- 屏幕工作台/Outline 组标题不动（papersurface 只在 grep 里以既有文件
  出现，非本 diff 改动）。

### 5. 分支域守卫 — 通过
- `verify-paper-surface-module-v1.mjs`、`verify-paper-browse.mjs` 均**不在
  本 diff**（未改屏幕面守卫）。本刀只动 print/docx 卷面，域隔离正确。

---

## PA-lite 降档复核（plan 头三条件）

1. **可逆展示改动（一刀整体回退）** — 成立。纯渲染面，4 文件，无数据/schema
   迁移，`git revert` 即可整体退回字母态。
2. **渲染面/调用方清单实证** — 成立。`buildPrintHtml`/`buildExamDocumentXml`
   单一渲染入口；消费者为草稿卷/组卷导出族；legacy/handout 旁路已逐一核验
   源码无字母。清单实证充分。
3. **无 schema/编号数据变更** — 成立。`groupNum` 为渲染期局部计数器，未落库、
   未改 questionNum 数据契约。

三条件全部成立，PA-lite 降档正当。CR 认可无需回补 full PA。

---

## Should Watch（非阻塞）

- **SW-1 DOCX 大题头无提交级回归守卫**：新大题头仅由运行时 QA（字节级
  document.xml 解包 + `findLoneLetterParagraphs=0`）覆盖，
  `verify-h5g-docx-renderer.mjs` 未加 group-header 断言。print 面守卫扎实
  （Test 1/8b），docx 面无常驻断言。鉴于 QA 已做字节级验证、风险低，但
  未来 docxRenderer 重构可能静默破坏大题头而无测试拦截。建议后续补一条
  docx group-header 断言。
- **SW-2 print/docx handout 面潜在不对称**：print-renderer 在 exam+handout
  两路都渲大题头（group-header 在 isExam 判断之前无条件加）；docx 仅在
  `buildExamDocumentXml` 加，非-exam `buildDocumentXml` handout 路未加。
  当前 moot（handout docx 声称 UI 不可达且本无字母），但若 handout docx
  日后可达，PDF 有大题头、DOCX 无 → 两面发散。记录待将来。
- **SW-3 plan 措辞 vs 实际 gate**：plan「教师版 group-meta 保留」；实际
  group-meta 门控在 `!isExam`（printStyle），非 versionType。默认 exam
  样式下 group-meta 对学生/教师**都隐藏**（QA 已如实记录）。本刀未改此
  gate，行为无回归——仅记录 plan 措辞把 teacher-version 与 handout-style
  混同，避免后人误读。

## Self-Review Blind Spots（喂给后续 Big CR）
- docx 大题头零常驻断言（SW-1）——Big CR 若整合导出面回归套件，应把
  docx group-header 纳入。
- handout docx 大题头缺席（SW-2）是有意省略还是漏做，取决于 handout docx
  可达性的最终裁定；本刀按「不可达」放行，若该前提改变需重审。
