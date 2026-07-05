# ai-enhancement-retire — PA Review

Reviewer: PA (fresh Opus, independent context). Baseline: worktree @ `8553f43`
(= `github/main`@40291b9 状态；detail-consume-only / PR #258 已上线). 所有
file:line 均独立 grep 核实，未信 plan 断言。

## Verdict: APPROVE WITH MUST FIX

三条核心命脉验证全 **SOUND**：删 B 的 5-state WRITE 不伤 member READ 命脉、
导题入库删 `showAiEnhancementPanel` 后自洽、Forbidden 守得住。但发现 **2 个
Must Fix**：一处 plan 删除清单遗漏（漏删致 build 崩），一处 plan C5「B 无专属
verify」断言**错误**（删 B 会让 `verify-classic-retire-2.mjs` 变红）。两条都是
技术精化、0 Open PO Decision，PM 压进 plan 后即可 DEV。

---

## 核心验证结论（逐条 + 证据）

### 1. READ/WRITE 可干净切吗（最高风险）—— SOUND

`openDetail`(App.tsx:1080) 独立回填全部 5-state，**不依赖 B**：
- reading: `setReadingParseResult(detail.readingParseResult)`(1113) +
  `setVerifyResult(detail.readingVerifyResult)`(1118)
- cloze/seven/grammar: 回填 parse + `setVerifyResult(build*VerifyResult(detail, …))`
  本地派生（1125/1132/1139，调 `buildClozeVerifyResult`@526 /
  `buildSevenChoicesVerifyResult`@573 / `buildGrammarVerifyResult`@479）

`runAiEnhancementAnswerParse`(1489-1588) 的 `if (selectedDetail?.id === detail.id)`
sync 分支写同一批 setter（1498-1572），但这是**冗余的现场刷新**，member READ 命脉
完全由 `openDetail` 回填 + `build*VerifyResult` 派生驱动。删整个函数后：5-state
声明(692/695/700/705/710) + `openDetail` 回填 + `build*` 派生全部保留 → **member 看
已存解析不断**。切法与 detail-consume-only 同款，确认无「只被 B 写、openDetail 不
覆盖」的 setter。

### 2. 导题入库自洽 —— SOUND

- `handleCommitDraftGroup`(1802)：`setQuestionGroups([saved, ...])`(1814) 在
  `showAiEnhancementPanel([saved],'append')`(1817) **之前**，列表刷新独立于 B。删
  1817 一行自洽。
- `handleBatchCommitObjectiveDraftGroups`(1828)：`setQuestionGroups`(1876) +
  `refreshQuestionGroups()`(1880) 均在 `showAiEnhancementPanel(savedGroups,'replace')`
  (1883) **之前**。删 1883 一行自洽。
- `updateAiEnhancedQuestionGroup`(1454)：两处 caller（1495 / 1628）**均在 B 内**
  （runAiEnhancementAnswerParse 与 handleRunAiEnhancement）。随 B 删，无外部依赖。
  导题入库列表刷新走上述 `setQuestionGroups`+`refreshQuestionGroups`，不依赖它。

### 3. B 删除清单完整吗 —— **有遗漏（MF-1）**；无共享符号误列

- 渲染块边界确认：`{aiEnhancementTargets.length > 0 && …}` = **3091-3202**，干净嵌在
  batchCommit 面板（收于 3089）与 objectiveDraft 面板（起于 3204）之间，删后视图自洽。
- 类型/常量/工厂(106-343)、state(786-802，9 个)、useEffect(978-989)：grep 确认
  **App.tsx-only**（`grep AiEnhancementTask|createAiEnhancementStatus|…` 跨文件零命中），
  随 B 删安全。
- **共享符号未被误列**：`aiApiKey`/`aiModel`/`aiThinkingMode`（14 命中，B 外大量使用）、
  `DEFAULT_AI_MODEL`（267/716/2437 B 外使用）、`setQuestionGroups`/`setSelectedDetail`
  均在 plan「保留」清单，正确。
- **遗漏 → MF-1**：plan handler 删除清单（plan L67-80）**未列** `toggleAiEnhancementTask`
  (1471) 与 `toggleAiEnhancementTopicLabelSelection`(1477)。二者是 B-only（唯一 caller
  在渲染块 3119 / 3167），删渲染块后必成 orphan → `noUnusedLocals` + `tsc -b` **build
  硬失败**。

### 4. import 清理判据准吗 —— SOUND

plan 列的 12 个 service import（`parse*Request`/`save*Request`/`verify*Request`/
`generate*Request`/`bindTopicLabelsRequest`）逐个 grep：**每个恰 2 命中 = import 行
+ 唯一 usage**，usage 全在 B 内（1491-1704，落在 runAiEnhancementAnswerParse /
handleRunAiEnhancement / handleBindAiEnhancementTopicLabels 三函数区间）。**无一个被
`openDetail`(1080-1140) 或 `build*VerifyResult`(479-620) 调用** → 删 B 后 12 个全
unused，须从 import 删。判据准确。`Save` lucide 图标(9) 唯一用处在 3185（B 渲染块内），
删 B 后 unused，须删。

### 5. verify 真无 B 专属吗 —— **否（MF-2，plan C5 断言错误）**

plan C5 称「grep 确认 `aiEnhancement` 在 `scripts/` 零命中」。**该 grep 漏了大小写**：
`scripts/verify-classic-retire-2.mjs:202-203` 硬断言：

```
'App.tsx still defines runAiEnhancementAnswerParse (AI Enhancement panel, kept)',
/async function runAiEnhancementAnswerParse\(/.test(appTsx),
```

这是 detail-consume-only 刀为「保留 AI Enhancement 命脉」而钉的断言。本刀**删掉正是
这个函数** → 该断言 fail。`verify-classic-retire-2.mjs` 在 verify-ci 注册表
(scripts/verify-ci.mjs:80)，`verify:all` = `node ../scripts/verify-ci.mjs`
(app/package.json:13) → **删 B 后 `verify:all` 必红**。C5「B 无专属 verify，保持
全绿即可」直接违背事实。其余脚本（`ai-enhancement-panel`/`showAiEnhancementPanel`/
`handleRunAiEnhancement`）scripts/ 零命中，确认只有这一处。

### 6. Forbidden 守得住吗 —— SOUND

B 三函数区间(1413-1746) grep `paperImportAi`/`PaperImportWorkbench`/`features/
paper-import`：**零命中** → 删 B 不牵连 A、不牵连普通导题 workbench。B 不含 `server/`
调用（走 `services/questionGroups.ts` client）。全局 AI 配置(aiApiKey/aiModel/
aiThinkingMode)与 `handleBackfillTopicLabels`(1747，caller 2377=AdminWorkbench 批量
回填，用 `backfillTopicLabels` 非 B 服务)均在 B 外，保留。Forbidden 守得住。

---

## Must Fix（阻塞 DEV）

### MF-1 — 补齐删除清单：两个 B-only toggle handler

**风险**：plan handler 删除清单遗漏 `toggleAiEnhancementTask`(App.tsx:1471) 与
`toggleAiEnhancementTopicLabelSelection`(App.tsx:1477)。二者 B-only（唯一 caller
3119 / 3167，均在渲染块内）。DEV 若照 plan 逐条删、删了渲染块却漏删这两函数 →
`noUnusedLocals` build 崩。

**处置**：plan「参考实现 → handler」清单**追加**这两个函数为删除项，标注「B-only，
caller 在 3091-3202 渲染块内，随 B 删」。

**plan.md 落点**：`## 参考实现 → 删除 → handler` 小节（L67-80 之后补两行）。

### MF-2 — 修 C5 断言错误：`verify-classic-retire-2.mjs` 需删「kept」断言

**风险**：plan C5 断言「B 无专属 verify、`verify:all` 保持全绿即可、`verify-ci`
注册表不需增删」**错误**。`scripts/verify-classic-retire-2.mjs:201-204` 断言
`runAiEnhancementAnswerParse` **仍存在**（detail-consume-only 遗产，phrased「kept」）。
本刀删该函数 → 断言 fail → `verify:all` 红。DEV 若信 C5「保持全绿即可」会直接 ship 红。

**处置**：
- 修 C5：改为「B 有一处遗产 verify 断言需删——`verify-classic-retire-2.mjs`
  L201-204 断言 `runAiEnhancementAnswerParse` still defined，本刀删该函数后须**删
  这条断言**（非反转，是删除；该函数确应消失）」。
- 同步修 L192-193 注释「populated by openDetail's 回填 **+ the AI Enhancement sync
  branch**」→ 去掉「+ AI Enhancement sync branch」（sync 分支随 B 删；5-state 现只
  由 openDetail 回填驱动）。
- **保留** L195-199 的 5-state「still defines READ-only state」断言（5-state 声明
  692/695/700/705/710 存活，断言仍绿——已核）。
- **保留** L205-208 `handleBackfillTopicLabels` 断言（该函数 B 外、存活——已核）。
- `verify-classic-retire-2.mjs` 留在 verify-ci 注册表（文件不删，只改内部断言）→
  注册表 + README 无需动。

**plan.md 落点**：改写 `## 硬契约 C5` + `## Verification C5` + 建议在
`## Suggested Files` 补 `scripts/verify-classic-retire-2.mjs`（删「kept」断言 + 修注释）。

---

## Should Watch（非阻塞，DEV 留意）

- **SW-1**：删 B 后逐个 grep 每个 service import 的其余 caller 再删（plan 已嘱）。
  PA 已预核 12 个全 unused，DEV 复核即可，非新增风险。
- **SW-2**：`App.css` 的 `.ai-enhancement*` 分两处（2554-2680 主块 + 3019-3021
  响应式 `@media` 内的三条选择器），别只删主块漏了 3019-3021。
- **SW-3**：删 `Save` lucide import(App.tsx:9) 时确认 App.tsx 别处不用（grep 仅
  3185 一处 = B 内，删后无 caller，安全删）。
- **SW-4**：增量 `tsc`（plan 已嘱）——先删渲染块再删 handler，避免删 state 后
  一次性大面积 TS 崩、难定位。

---

## Must Fix → plan.md 落点 checklist

| MF | 风险 | plan.md 必须记录 | 落点 |
| --- | --- | --- | --- |
| MF-1 | 漏删 `toggleAiEnhancementTask`(1471)/`toggleAiEnhancementTopicLabelSelection`(1477) → build 崩 | 删除清单追加这两 B-only handler | 参考实现·删除·handler |
| MF-2 | C5「B 无专属 verify」错误：`verify-classic-retire-2.mjs:201-204` 断言 `runAiEnhancementAnswerParse` kept → 删 B 后 verify:all 红 | C5 改为「删该断言 + 修 L192-193 注释；保留 5-state/backfill 断言」 | 硬契约 C5 + Verification C5 + Suggested Files |

**Open PO Decisions: 0**（两条均技术精化，无需 owner 拍板）。DEV 可在 PM 压进
plan 后开工。
