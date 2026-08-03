# 试卷格式归一化 — EQB Compact Spec

Status: ready
Worktree: `/Users/huangxuewei/Projects/wt-paper-normalization-20260724`
Branch: `codex/paper-normalization-20260724`
Planning fixed point: `515a0f1317c95d197c98a81a36ce425b4948bde2`
Risk: High — data-contract semantics, persistence, PaperSurface anchors, print/PDF and DOCX are all in scope.

## 问题

EQB 已有标准卷结构与排版标准，但完形填空和语法填空的同一语义事实仍由
raw marker、`questionNo`、numeric-only `stem` 和各 renderer 分别解释。
因此：

- `paper-2026-i` 的完形题号可在同一题目行输出成 `41. 41`；
- `paper-960d0f8d` 的 `56._____` 会被当成显示字符串，而不是统一的语义挖空；
- React PaperSurface、Print HTML 与 DOCX 会分别解析 marker、推题号、合并
  hint 和决定横线样式；
- 新导入资产即使含 supported group 的歧义，也没有统一的 normalization
  readiness gate。

问题不在 CSS，而在 source truth、semantic truth 与 presentation ruling
尚未分层。

## 终态

最小流水线为：

```text
source / draft paper-asset group
→ normalizePaperGroup
→ CanonicalPaperGroupV1 + source map + fingerprints
→ canonical validation
→ PaperSurface / Print HTML / DOCX adapters
```

首期只支持 `cloze` 与 `grammarFill`：

- 新导入在 publish 前对全部 supported groups 归一化；任一组
  `needs_review`，整次 publish fail closed。
- 成功结果以 additive `paper-normalized-groups-v1.json` sidecar 与同一
  paper asset version 原子发布；`paper-asset-v1` 继续保存 source truth。
- 屏幕、Print HTML 与 DOCX 从同一个 canonical group 和 blank ruling
  生成各自输出，不在 canonical path 重新解析 raw marker。
- `paper-2026-i` 的 cloze / grammarFill 与 `paper-960d0f8d` 的
  grammarFill 可在不写回资产的前提下做 compatibility normalization；
  其他历史资产保持 legacy path，不做全库迁移。

外部编译 seam 固定为：

```text
normalizePaperGroup(input) → ready(group, sourceMap, sourceFingerprint, semanticDigest)
                           | needs_review(issues)
```

`input` 只包含 `paperId`、`sourceAssetVersion` 和目标 group 对应的
group/questions/blanks 精确切片；不接收 React、DOM、数据库或 renderer。

## 关键不变量

### Semantic truth

1. Canonical 单位是 group，不建立伪装完整的 whole-paper AST。
2. `CanonicalPaperGroupV1` 只表达 group identity、按源顺序排列的
   text/blank inline nodes、questions、options、hint 与 source spans。
   Canonical group type 使用 paper-asset 拼写 `cloze | grammarFill`；
   `grammar_cloze` 只是在既有 DB/print detail 边界的 adapter 拼写，不进入
   canonical data。
3. 在 canonical tree 内，`questionNo` 只由 canonical question 持有；
   blank node 只引用 `questionId` 与 `blankId`。
4. Raw marker、横线字符、宽度、尾点、React state、answer key、
   analysis payload、print/DOCX metadata 不进入 canonical semantic data。
5. Blank identity 由 `group.blankIds` 与 `question.blankId` 建立；
   `content.blanks[blankId]` record 对 cloze 可选、对带 prompt 的 grammar
   可提供附加 source truth。Record 存在时必须与 group/question identity
   一致，但 cloze 不得因 record 缺省而失败。
6. Numeric-only presentation stem 仅在以下事实同时成立时归一为 `null`：
   `trim(stem) === String(questionNo)`、stem 只含数字、question 有
   `blankId`、正文存在对应 marker，且 marker/question/blank 一一对应。
   `1941`、`41 years`、`Question 41 asks ...`、`41. What ...` 不得删除。
7. 普通 prose、options、source order、`groupId`、`paragraphId`、
   `questionId`、`blankId` 逐字或逐项保持；只有有精确 source span 的
   supported marker 可替换为 blank node。
8. Source input 不被修改；同一输入重复运行产生相同 semantic output 和
   digest。Presentation ruling 不进入 semantic digest。
9. 本 normalizer 校验进入它的 draft group 已分配题号，不接管上游
   source-number → NCK1-number 映射，也不得按 marker 出现顺序重排或修题号；
   上游既有映射留痕继续由导题工序负责。

### Marker 与 hint

10. Cloze 支持 `__41__` 与 `_____41_____`。
11. GrammarFill 支持 `__56__ (hold)`、`__58__`、`56._____`、
   `57._____(absorb)`；parser 必须锚定完整 dialect，不扫描题号范围内的
   普通数字。
12. Marker hint 与 `blank.prompt` 相同则保留一个；只有一侧有值则采用该值；
    两侧都无则为 `null`；冲突则 `needs_review`。
13. Unsupported/ambiguous marker、数量不等、number mismatch、duplicate
    questionNo/marker、blankId conflict、hint conflict、overlapping source
    span、anchor unresolved 或 fingerprint mismatch 一律结构化
    `needs_review`；不得猜测、重排、静默吞掉或自动修源。

### Presentation ruling 与 anchors

14. `cloze` 与 `grammarFill` blank 为 `3.3em`；`sevenChoices` 为
    `4.6em`。数字在线上居中、无尾点，横线为单细线且 `nowrap`，hint
    紧随横线。
15. 完形 passage blank 与 option line 可各投影一次题号；同一 product
    slot 只能投影一次，禁止 `41. 41`。
16. Canonical PaperSurface path 接收 semantic nodes；不得把 blank node
    重新序列化为 marker，也不得 import raw-marker regex。
17. `PaperTextMap` 继续是只读 position oracle。Canonical adapter 从同一
    canonical group 同时生成可见 semantic content 与 TextMap；两者不得漂移。
18. Analysis 只叠加 supplement，不重建 paragraph/question/blank。
    `paperId`、`groupId`、`paragraphId`、`questionId`、`blankId` 与现有
    sentence-id 纪律保持；blank focus 由 `blankId → questionId` 建立。
19. Evidence 在 canonical visible text 上解析成 range；无法解析必须显式
    失败，不得静默丢失。

### Import、兼容与回滚

20. 新导入 supported groups 全部 ready 才可 publish；其他题型继续走现有
    gates，不要求整卷先 canonical。
21. Sidecar 只包含 `schemaVersion`、`paperId`、`sourceAssetVersion`、
    `normalizerVersion`，以及由精确 source slice 计算的 per-group source
    fingerprint、semantic digest 与 canonical group；不得包含原始
    PDF/DOCX、答案源、绝对路径、`generatedAt` 或 renderer state。
22. Sidecar 与 paper asset version 原子写入；只有同一 version 完整成功后
    才切换 `latest`。Version/fingerprint 不匹配时 canonical consumer
    必须拒绝该 sidecar。
23. Historical compatibility path 仅限上述三个 proof groups。Ready 才走
    canonical；`needs_review` 保持 legacy output 并向 host/diagnostic
    显式报告，不得写回 asset、SQLite 或 published version。
24. Legacy renderer 在本 initiative 内保留；回滚依赖 additive sidecar、
    capability selector 与 revert，不建设新的 flag 平台。

## 非目标

- Reading、sevenChoices 内容、writing、listening normalization；
- 整卷 canonical document、数据库 schema 重写或全历史资产写回；
- AI 自动裁决、后台 normalization review UI、decision state machine；
- 全题型 compatibility census、全局 evidence 重建或重新分句；
- 修改 source archive、复制完整 passage fixture、暴露 raw/answer source；
- 重写 PaperBrowse、Paged.js、整个 OOXML renderer 或清理全部 legacy branches；
- 生产配置、生产发布或部署。

## 验收合同

### Phase A — compiler、React、new-import gate

- `paper-2026-i / group-2026-i-cloze` 的 41–55 marker/question/blank
  一一对应；q41 canonical stem 为 `null`，options 与 prose 不变。
- 两种 grammar dialect 生成同形 semantic blank；hint 单源；`2026`、
  `25-30g`、`800g`、`3-5g`、`30g`、`10g` 逐字保留。
- Plain、PaperBrowse、analysis、lecture 使用同一 semantic digest；
  完形无同槽位双题号，grammar raw label 不进入 canonical renderer。
- Cloze 41–55 与 grammar q56/q57 可点击并聚焦正确 question；evidence
  range、lecture 开关与既有 anchors 不漂移。
- 宽屏与窄屏 computed style 证明 width、display、white-space、
  border-bottom、text-align 与 hint placement；不能只断言 class 存在。
- `validatePaperImportPackage` 和 `publishPaperImportPackage` 的公共行为证明：
  ready package 原子发布 sidecar；任一 supported group `needs_review`
  时零 DB/asset/latest 写入；失败回滚保留旧 latest。
- Tickets 01–06 完成后，以本规划 checkpoint 为 implementation base 做一条
  fresh top-level `$code-review` lineage；无 Must Fix 后再 provision 两个
  proof 页面给 owner QA，并运行 full verify/PR CI。Phase A 可独立停止和发布。

### Phase B — Print HTML、DOCX

- Proof groups 的 Print HTML 与 DOCX 消费 canonical group + shared ruling，
  不再解析 proof raw marker；semantic facts 与屏幕一致。
- Print HTML 保持 block order、pagination contract、A4 preview/PDF page
  span；DOCX 可实际打开并经 LibreOffice 转 PDF，OOXML fact checks 通过。
- Tickets 07–08 完成后，对 Phase A reviewed HEAD 之后的 Phase B diff
  运行一条 fresh independent review lineage，再由 owner 检查实际
  preview/PDF/DOCX，最后运行 full verify/CI。

### STOP

遇到 source fingerprint 漂移、普通 prose/数字改变、semantic digest 随
view 改变、canonical path 重新解析 marker、anchor issue 被静默吞掉、
supported import 可绕过 gate、sidecar/version 不匹配仍被消费，或 export
改变既有 pagination/OOXML 边界时，当前票立即停止并报告
`SPEC CONTRADICTS` 或具体 blocker；不得扩大范围。

## 测试 seams

1. **Compiler**：直接调用 pure `normalizePaperGroup`；真实资产只做
   manifest + minimal expected facts，malformed/negative cases 才使用最小
   synthetic fixture。
2. **React**：从真实 asset 经 canonical adapter 到 PaperSurface 的公共
   model/render seam，并在 `PaperBrowsePage` 真实路由做 click、lecture、
   evidence 与 computed-style browser checks。
3. **Import**：调用现有 `validatePaperImportPackage` /
   `publishPaperImportPackage`，使用临时 DB 与临时 paper-assets root 证明
   dry-run、原子写入、latest swap 和 rollback。
4. **Print**：调用 `buildPrintHtml`，再用现有 Vivliostyle/PDF verification
   与真实 A4 preview 检查 pagination 和视觉事实。
5. **DOCX**：调用 `createDocxRenderer` 公共 seam，检查解包后的 OOXML，
   再实际打开并用 LibreOffice 转 PDF。
6. 优先行为测试；source-regex assertion 只在没有公共 seam 且无法合理提升
   seam 时使用。Focused green 不替代 build、browser evidence、full verify
   或独立审查。

## 必要来源指针

- Repository authority: `AGENTS.md`,
  `docs/agents/issue-tracker.md`,
  `docs/steering/cut-workflow-protocol.md`。
- Product authority: `docs/product/nck1-paper-standard.md` 的洗卷与 publish
  gate；`docs/product/exam-paper-format-standards.md` 的 blank/pagination 与
  Import Normalization Principle。
- Anchor authority: `docs/adr/0003-paper-surface-interaction-model.md` 与
  `shared/papersurface/types.d.ts`。
- Import seams: `server/paper-import/validator.mjs`,
  `server/paper-import/publisher.mjs`,
  `server/paper-import/storage.mjs`。
- Proof asset A:
  `app/public/paper-assets/paper-2026-i/latest/paper-asset.json`,
  SHA-256 `fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf`。
- Proof asset B:
  `app/public/paper-assets/paper-960d0f8d/latest/paper-asset.json`,
  SHA-256 `2578eb70e069c6d39a6d92bbc5254a8c23ed08b152287c2c80167d2121df2a14`。
- Planning provenance only:
  `/Users/huangxuewei/Downloads/eqb-paper-normalization-execution-plan.md`；
  implementation tasks must rely on this tracked spec/tickets, not Downloads。
