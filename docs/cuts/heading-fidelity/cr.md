# heading-fidelity — Fresh CR（冷读）

Reviewer: fresh CR（未参与实现，只读 + 写本文件）。
Base→HEAD: `6059152..78344aa`（plan df0f433 / impl f636e08 / DP-2 78344aa）。
方法: 读 plan.md 拿契约 → git diff 全量改动 → 逐条核对硬契约 / Forbidden /
验证有无牙 / scope 漂移。DEV 报告与 qa-notes 当输入，不当真相；四条 verify
本人重跑取真实退出码；样张 DOCX 解包逐 run 核字号字体。

---

## Verdict: APPROVE_WITH_MUST_FIX

代码契约全部成立且经我独立复跑坐实，Forbidden 零触碰，验证有真牙。
唯一 Must Fix 是 **DP-2 归档证据（qa-notes.md）对样张内容作了不实描述**——
不是代码缺陷，但会给 owner 的 DP-3 目检喂错误前提，必须更正档案。

---

## Must Fix

### MF-1 — qa-notes.md 谎报样张含「篇章标题」，实测样张里根本没有

`qa-notes.md` 页面结构第 2 条写：「question_group（阅读理解 A，含篇章标题
「A New Way to Learn」）→ 篇章标题」，并据此把 DP-2 勾成「样张（含 部+节+
**篇章标题** 同框页）入档」。

实测不成立。我把 `heading-fidelity-sample.docx` 解包，`word/document.xml`
全文 `<w:t>` 文本按序为：卷名 → 部标题「第一部分…」→ 大题头「一、阅读理解…」
→ passage 正文「Scientists have found…」→ 小题 → 节标题「第一节…」→ 大题头
「二、语法填空…」。**没有任何「A New Way to Learn」/篇章标题 heading**。

根因：样张走的是 exam 路径。`buildDocumentXml({printStyle:'exam'})` 在
docxRenderer.mjs:1016 直接转发到 `buildExamDocumentXml`，而 exam builder
**从不渲染 `detail.passage.title`**（draft-depassage-letter 刀早已退掉篇章
标题/字母，改渲大题头）。篇章标题这一档只存在于 handout 分支
（`buildDocumentXml` 的 `printStyle!=='exam'` 支路）。所以 exam 样张结构上
就装不下篇章标题。

影响权衡：DP-3 owner 目检清单实际只列「部/节字重缩进层级 / 10.5pt 会不会显得
弱 / 卷名 20pt 观感」——**不含篇章标题**，故样张对真正的 DP-3 目检项是够用的
（部+节+卷名齐全）。因此这不阻断代码上产，降为 Must Fix 而非 BLOCK。但归档
证据里写着「含篇章标题」是假的，未来 agent/owner 会照单全信。

修法（二选一，取轻）：
- 改 qa-notes.md，如实说明 exam 样张不含篇章标题（只有 部/节/卷名/大题头），
  篇章标题档仅 handout builder 产出，此样张不覆盖；或
- 另出一份 handout builder 样张证明篇章标题 21pt 落地（非必要，见 SW-1：
  handout 无活调用方）。

推荐前者——一句话订正档案即可，别为死路径额外产物。

---

## Should Watch

### SW-1 — 篇章标题 22→21 改在死路径，今日无活 UI 触达

Locked Decision 3 的篇章标题归一只落在 `buildDocumentXml` 的 handout 分支
（docxRenderer.mjs:1078 / 1152）。我核 app/src：`setPaperExportStyle(` 在
全 app 零调用，`usePaperDraft.ts:149` 默认 `'exam'`——handout 分支今日无
任何 UI 可达（与 draft-numbering-style 既有注释一致）。

叠加事实：print-renderer **完全不产篇章标题 heading**（只把 passage 正文渲成
`.passage`），exam DOCX builder 也不产。故**所有活路径上，标准 §4「阅读篇章
标题 A/B/C/D」这一档当前无任何渲染器输出**——这是 draft-depassage-letter 的
既有状态，非本刀引入。本刀对该档的归一正确且被测试直驱覆盖
（verify-h5g assertHeadingFidelity ④ handout 分支实测 "Reading Passage" sz21
过），但无用户可见面。owner 知悉即可，不需动作。

### SW-2 — verify 里一条陈述串已过期（非断言体）

`scripts/verify-print-renderer.mjs:521` 断言描述仍写
「half-step below .section-header **12pt**」，但 `.section-header` 本刀已归
10.5pt。断言体本身只查 `.group-header` 11pt，逻辑没错、照过；只是这句人读
描述过时。源码注释（Locked Decision 4）已同步更新，这条 verify 描述串漏改。
小事，随手可清。

---

## 证据（本人复跑 / 核对）

**四条 verify 亲跑，真实退出码 0：**
- `node scripts/verify-print-renderer.mjs` → 92 passed / 0 failed（含 Test 3b
  新断言：part class + 黑体 bold + padding-left:0；section class + SimSun +
  padding-left:21pt + 非 bold；h1 20pt 且无 18pt 残留；base 10.5pt 且无 12pt
  残留；非匹配标题回落 --part）。
- `node scripts/verify-h5g-docx-renderer.mjs` → 148 checks passed（含
  assertHeadingFidelity ①卷名 sz40 ②part SimHei/黑体 bold sz21 无 w:ind
  ③section Times/宋体 非 bold sz21 w:left="420" ④handout 篇章标题 sz21
  ⑤无 24/28/32 残留 ⑥回落 part，exam+handout 双风格）。断言有真牙——查字体、
  字重、字号、缩进、负例残留，非只数 pass。
- `node scripts/verify-draft-paper-docx.mjs` → 16 checks passed（大题头未误伤）。
- `pnpm -C app run verify:all` → 83 pass / 1 skip（off-repo fixture 缺失，非
  真测）/ 0 fail。与 DEV 报告一致。

**Forbidden 零触碰：** `git diff --name-only` 无 `app/src`、asset 数据、
`.sql`、schema、migration；`.group-header` 样式（Locked 4）未改。改动面仅
headingKind 新文件（+2 .d.ts/.d.mts）、print-renderer、docxRenderer、两条
verify、plan/qa 文档。

**硬契约逐条成立：**
- Locked 1 单源：`headingKind.mjs` 纯 ESM 无 app/server 依赖；部/节正则 +
  保守回落 part。print 与 docx 双面共用，无第二份正则。✓
- Locked 2 print：`.section-header` 拆基类（10.5pt+间距）+ `--part`（黑体栈
  bold 顶格 padding-left:0）+ `--section`（宋体栈 regular padding-left:21pt）；
  h1 20pt 字体栈维持。✓
- Locked 3 docx：`docxSectionHeaderParagraph` part=SimHei/黑体 bold sz21
  无 ind；section=默认 Times/宋体 regular sz21 `w:left="420"`；篇章标题
  sz22→21；卷名 sz32→40；两处 builder（exam 转发 + handout）同步。✓
  （run 无 heading→默认 Times/宋体 = 书宋，match「Song regular」；`indentLeft`
  确为 paragraph 支持项，非静默丢弃。）
- Locked 4 大题头不动：`.group-header` 11pt / docx sz22 he:true 原样；样张实测
  两处 sz22 均为大题头文本（「一、阅读理解」「二、语法填空」），非篇章标题。✓
- Locked 5 分页保护：base 类名 `.section-header` 仍挂在 part/section 两态上，
  `break-after: avoid` 规则命中不变（Test 3 §3b 过）。✓

**标准 §4/§5 交叉核对（21pt 缩进是否 = 2 字符）：** §4 写节标题「缩进 2 字符
(x≈89pt)」，§5 写题干首词「缩进位(89pt，2 字符)」、题号悬挂 68pt——89pt 是
距页左的**绝对位**，2 字符相对缩进 = 89−68 = 21pt。实现 padding-left:21pt /
w:left="420"(twips=21pt) 与此自洽，无漂移。

**样张 DOCX 解包核字号字体：** sz 分布 {21×12, 22×2(均大题头), 40×1}；rFonts
{SimHei/黑体×3, Times/宋体×15}——部标题黑体、节标题宋体、卷名 40 全部落地。
唯缺篇章标题（见 MF-1）。

---

## scope 判定

无 scope 漂移。改动严格落在 plan「Scope（可改文件）」清单内，篇章标题虽改在
死路径但属 Locked Decision 3 明列（「两处 builder 同步」），非自作主张。
