# PA Report — I3-A Cloze AI Import

PA: 小川 | Date: 2026-05-27 | Cut: I3-cloze-ai-import

## Verdict

**APPROVE WITH MUST FIX** — 方向正确，但 plan 在 cloze section 检测、选项解析、和 PaperSurface 渲染路径上有三个必须堵上的规范缺口。

---

## Product Principle

教师一键导题 → 完形跟着 Reading + 七选五一起入库 → 能在 PaperSurface 看到完形内容。不搞完形 AI 解析，不搞语法填空，不动 schema。产品边界清晰。

---

## Exact UX / Architecture Model

现状：`?view=paper-import-ai` 已支持 Reading A-D + 七选五。I3-A 在此基础上追加：

1. **Parse** (`docxSplitter`)：在同一轮 parse 中识别完形 section → 提取 15 道题（q41-q55）、A-D 选项、答案键。
2. **Package** (`packageBuilder`)：产出同一个 paper-asset，含 `cloze` group + `answer-key.json`。不产出 `analyses/cloze-*.json`。
3. **Publish** (`publisher`)：QA links 中追加一条 完形链接。
4. **UI** (`PaperImportAiWorkbench`)：最小状态展示——检测到/已解析/答案缺失/冲突。

用户仍然一键操作。读完形不增加新按钮。不产生完形 AI 分析。

---

## Must Fix Before DEV

### MF-1: Cloze section detection depends on a keyword that real papers don't use

**Evidence**: `classifySectionLine` 用 `/完形/.test(text)` 检测完形。实测江苏苏锡常镇一模、2024 JSLK 等真实试卷，"完形" 二字不出现在 mammoth 提取文本中。实际结构是：

```
第三部分 语言知识运用 (共两节，满分30分)
第一节(共15小题；每小题1分，满分15分)      ← 这是完形
阅读下面短文，从短文后各题所给的A、B、C和D四个选项中...
[passage with __41__ through __55__]
41. A. ...		B. ...		C. ...		D. ...
...
第二节(共10小题；每小题1.5分，满分15分)    ← 这是语法填空
```

"语言运用"/"语言知识运用" 目前被 `classifySectionLine` 归类为 `grammar_or_language`，且该 part 下两节分别对应完形和语法填空。

**Required disposition**: plan.md Step 1 必须补充具体的 section 检测策略：要么通过 q41-q55 数字范围 + A-D 选项模式识别完形（而非依赖 "完形" 关键词），要么扩展 `classifySectionLine` 的 pattern，并说明如何区分同 part 下的完形和语法填空。

### MF-2: Cloze option format differs from Reading options — no parsing strategy defined

**Evidence**: 实测 DOCX 中完形选项是单行制表符分隔格式：

```
41. A. hesitantly 			B. instantly 			C. eventually 				D. gradually
```

每个题一行，包含全部 A-D 四个选项，用制表符（`\t`）分隔。这跟 Reading 的选项格式（每个选项可能单独成行，或有换行）完全不同。现有的 `extractInlineOptions` 依赖空白规整后的 A-D marker 识别，面对纯制表符分隔的单行四选项格式，可能需要调整或新增专用解析函数。

**Required disposition**: plan.md Step 1 必须说明完形选项的解析方式——复用还是新增函数，以及 tab-separated inline format 和 multi-line option format 两种情况的处理。

### MF-3: PaperSurface rendering path for cloze is not defined

**Evidence**:
- `app/src/features/paper-intelligence/` 中没有任何 "cloze" 引用。没有 cloze adapter、没有 cloze analysis panel。
- `server/search/paperSurfaceAvailability.mjs` 只处理 `reading` 和 `sevenChoices` 两种 groupType。完形 group 不会被 PaperSurface analysis availability 识别。
- `PaperBlockCanvas.tsx` 中有一行 `paper-options-inline` CSS class 针对 `groupType === 'cloze'`，说明旧版 PaperBlockCanvas 能渲染完形，但 PaperSurface 路径是 paper-intelligence，不是 PaperBlockCanvas。

Plan 说 "expose a 完形 QA link that opens the current PaperSurface / paper-intelligence route"。目前 paper-intelligence 接收到 `groupId=group-xxx-cloze` 时会怎样？没有 adapter，没有 analysis card。最可能的结果是白屏、报错、或 fallback 到空壳 paper view。

**Required disposition**: plan.md 必须明确——完形 QA link 打开后用户看到什么。选项：
- (A) 走 basic paper view（不依赖 analysis，直接渲染 paper-asset content blocks 中的完形内容）——需要确认 paper-intelligence 已经或可以支持此路径。
- (B) 不走 paper-intelligence，走其他已有路由。
如果 (A) 不可行且需要新增 renderer，I3-A 范围需要扩展，或切出一个前置 cut。

---

## Must Fix → Plan Disposition Checklist

| # | Must Fix | Required plan.md disposition | Status |
|---|----------|------------------------------|--------|
| MF-1 | Cloze section detection by keyword is unreliable | Step 1 补充 section 检测策略——基于 q41-q55 数字范围 + A-D 选项模式，不依赖 "完形" 关键词 | Open |
| MF-2 | Cloze option format (tab-separated inline) unspecified | Step 1 说明选项解析方式——处理 tab-separated 单行格式和多行格式 | Open |
| MF-3 | PaperSurface rendering path for cloze undefined | Step 3 或新增 Step 明确完形 QA link 的目标路由和渲染行为 | Open |

---

## Should Watch

### SW-1: Cloze passage + options interleaved in DOCX output

In the mammoth output, passage paragraphs and option lines are interleaved. Example from real DOCX: passage paragraph → `__41__` → next passage paragraph → `__42__` → … → option block (lines 41-55, one per question). The parser must separate passage text from option text correctly. The plan should note this interleaving pattern, but DEV can handle it.

### SW-2: No cloze analysis = no PaperSurface analysis card

Without `analyses/cloze-*.json`, PaperSurface analysis availability will not show a "完形解析" card. If the plan wants a plain paper view (no analysis overlay), this is fine. If users expect an analysis card, the plan should state explicitly that I3-A does NOT deliver one, and name which future cut will.

### SW-3: C7 validator non-reading completeness check

`validator.mjs`'s `validateNonReadingCompleteness` currently warns for missing questions/answer-keys in non-reading groups. For cloze, these should be blocking (not just warnings) when cloze is detected and published. The plan's Step 2 verification should confirm this.

### SW-4: DB group type mapping already exists

`publisher.mjs` line 18 maps `cloze: 'cloze'` in `groupTypeMap` and line 64 returns `'完形填空'` for cloze groups. The DB insertion path already handles cloze groups. No DB schema change needed.

---

## Allowed Files

Confirmed against plan.md `## Suggested Files`:

- `server/paper-import-ai/docxSplitter.mjs`
- `server/paper-import-ai/packageBuilder.mjs`
- `server/paper-import-ai/routes.mjs`
- `server/paper-import/publisher.mjs`
- `app/src/features/paper-import-ai/PaperImportAiWorkbench.tsx`
- `app/src/features/paper-import-ai/paperImportAiWorkbench.css`
- `app/src/services/paperImportAi.ts`
- `scripts/verify-i3-cloze-ai-import.mjs`
- `scripts/README.md`

Plus existing I1/I2 verifier scope updates as needed.

---

## Forbidden Files

Confirmed against plan.md `## Forbidden`:

- `schemas/**`
- Cloze AI analysis prompt / schema / contract / panel
- Grammar-cloze / 语法填空 import
- `shared/papersurface/**` — unless PA proves current renderer cannot display cloze (MF-3 may surface this)
- Search/list metadata expansion
- Generated `app/public/paper-assets/**`

Additional watch: MF-3 may require a PaperSurface / paper-intelligence routing clarification that touches `app/src/features/paper-intelligence/` without adding a full cloze adapter. If the resolution requires touching `app/src/App.tsx` or `server/search/paperSurfaceAvailability.mjs` for cloze QA link routing, those files should be added to Allowed Scope explicitly.

---

## Static Verify Requirements

Plan's verification section is adequate. Add one assertion:

- `verify-i3-cloze-ai-import.mjs` must include a case proving cloze QA link is accessible when PaperSurface / paper-intelligence renders the paper-asset with a cloze groupId and cloze questionId (covers MF-3).

---

## Browser QA Matrix

Plan's 5-row matrix is complete. Add one edge case:

| Case | Expected result |
|---|---|
| Paper with cloze but answer DOCX has only 41-45 range (missing 46-55) | Publish blocked with missing-answer message for specific questions |

---

## DEV Readiness

After MF-1, MF-2, MF-3 are dispositioned in `plan.md` by 阿澈:

- [x] Exact teacher action: 一键导题 → 完形跟着入库 → PaperSurface 可看
- [x] Exact before/after: before=完形被跳过(grammar_or_language_out_of_scope)，after=解析入库可查看
- [x] Current cut boundary: 导题入库可视化，不搞 AI 解析
- [x] Future cut boundary: 完形 AI 解析字段、讲评面板
- [x] Allowed files: clear
- [x] Forbidden files: clear with one MF-3 caveat
- [x] Verify scripts: specified
- [x] Browser QA: specified
- [ ] PO decisions: 0

---

## Open PO Decisions

0.
