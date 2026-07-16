# reading-analysis 孤儿支可达性图谱（2026-07-16，Explore 侦察入档）

只读侦察结论，供 plan.md / DEV / CR 复用。核心问题：删什么安全、什么不能删。

## 1. 路由入口清单

| 文件:行 | 内容 |
|---|---|
| `app/src/main.tsx:6-8` | import ReadingAnalysisDemoRoute / parseReadingAnalysisRoute / parsePaperIntelligenceRoute |
| `app/src/main.tsx:26-32` | `piRoute` / `raRoute` 解析 |
| `app/src/main.tsx:34-37` | `raRoute.kind === 'reading-analysis'` → `<ReadingAnalysisDemoRoute />`——**reading-analysis 唯一挂载点** |
| `app/src/App.tsx:27-28,34` | import PaperIntelligencePreview / RouteMatch 类型 / Harness |
| `app/src/App.tsx:991-1020` | `paper-intelligence` 两个子面唯一挂载点（`surface=paper` → Harness；否则 Preview） |
| `app/src/App.tsx:797-805` | popstate 显式短路：这两个 view → `window.location.reload()` |
| `app/src/auth/AuthGate.tsx:38-43` | 注释提及两支（注释级，随刀清理） |

Demo/dev 别名：`?demo=reading-analysis`、`#reading-analysis`
（`readingAnalysisRoute.ts:145-183`），同样仅 main.tsx 生效。

关键事实：`isReadingAnalysisCandidate` / `buildReadingAnalysisHref` 在
app/src 内**零调用方**；两页均已无页内入口，仅 URL 直达。

## 2. 二分结论

### `features/reading-analysis/`：整目录孤儿，可整体删除

目录（21 个 ts/tsx + css + sidecar 13 个 json + index.json）完全自包含；
除 main.tsx 引两个入口文件外，外部（paper-browse / concierge /
question-detail / shared-ui）**零 import**。`readingAnalysis.css` 仅
`ReadingAnalysisView.tsx:28` 引用。

### `features/paper-intelligence/`：必须拆分，不能整目录删

**保留（被活面直接消费）**：

| 文件 | 活面消费方 |
|---|---|
| `paperAssetSurfaceAdapter.ts` | `QuestionGroupDetailView.tsx:58`、`PaperBrowsePage.tsx:71,75` |
| `sevenChoicesSurfaceAdapter.ts` | Detail:63、Browse:80、`useSevenChoicesPaperHighlights.ts:3` |
| `clozePaperViewAdapter.ts` / `grammarFillPaperViewAdapter.ts` / `writingPaperViewAdapter.ts` | Detail:64/68/69、Browse:84/88/92 |
| `clozeAnalysisSurfaceAdapter.ts` / `grammarFillAnalysisSurfaceAdapter.ts` | Browse:97/102 + 各自 Panel |
| `WritingPaperPage.tsx` + `writingPaperPage.css` | Detail:52、Browse:66 |
| 五个 `*AnalysisPanel.tsx` | `PaperBrowsePage.tsx:105-109` |
| `useSevenChoicesPaperHighlights.ts`、`grammarFillFacetRegistry.ts`、`writingPageModel.mjs/.d.ts/.d.mts` | 活 Adapter 直接依赖 |
| `paperIntelligenceTypes.ts` | 被 7 个活 Adapter 直接 import type |
| `preview/paperIntelligenceEvidenceLine.tsx` + `paperIntelligenceEvidenceLineGeometry.ts` | `PaperBrowsePage.tsx:114`（阅读跨栏证据动线） |
| `paperIntelligence.css` | `PaperBrowsePage.tsx:115` 直接 import（活面共用样式源） |
| `paperSurfaceLectureHighlights.css` | `paperBrowsePage.css:19` `@import`（活）+ 孤儿 harness css `@import`（同一文件两处引用） |

**类型链陷阱（文件暂不可单删，运行时函数却是死码）**：

`adapter/index.ts` 导出的 `PaperSurfaceData` 类型被 7 个活 Adapter
`import type` 引用（`paperAssetSurfaceAdapter.ts:32` 等 7 处）；而
`adapter/index.ts` 对 `piToPaperTextMap/Questions/Evidence.ts` 做值
import，`piToPaperEvidence.ts:18-19` 又值 import `evidence/index.ts` →
`paperIntelligenceEvidence.ts` / `paperIntelligenceEvidenceTypes.ts`。
运行时函数 `buildPaperSurfaceDataFromPi()` **只被孤儿 Harness**
（`PaperIntelligencePaperSurfaceHarness.tsx:125,888`）调用。单纯删文件
= 7 个活面文件 tsc 红；要清死码必须同刀把 `PaperSurfaceData` 类型迁到
不依赖 `piToPaper*`/`evidence/*` 的落点并改写 7 处 import。

**仅孤儿页可达（可删）**：

```
PaperIntelligencePreview.tsx            （App.tsx:27,1012）
PaperIntelligencePaperSurfaceHarness.tsx（App.tsx:34,1000）
LegacyAnalysisPanel.tsx                 （Harness:135）
distractorLabels.ts                     （Preview:65）
structureBrace.tsx                      （Harness:134、HarnessStructureRows:21）
paperSurfaceHostInteraction.ts          （Harness:180）
groupChromeBlocks.ts                    （Harness:185）
paperIntelligencePaperSurfaceHarness.css（Harness:197）
insight/insightChipLabel.ts             （Harness:131）
insight/insightChipShortLabel.ts        （零引用纯死码）
insight/HarnessInsightPanelContent.tsx  （Harness:132）
insight/HarnessStructureRows.tsx        （Harness:133）
preview/paperIntelligencePreviewModel.ts（三个孤儿消费）
preview/AnchoredPopover.tsx             （Preview:63,536,857）
```

## 3. 静态资产

- 可删：`app/public/reports/paper-intelligence/paper-2024-xkb1-reading/`
  （report.json + input.json；仅 Preview:162-163 / Harness:582-583 的
  `source=legacy-report` 分支读取；dist/ 镜像随构建重生）。
- **不可删**：`app/public/paper-assets/**`——paper-browse /
  question-detail 活体语料，与孤儿页共用。

## 4. 测试与 verify

### c6a*/c6b* 僵尸 smoke：实数 12 个（STATUS 写 13，差 1，已更正）

```
verify-c6a-2-reading-a-analysis.mjs      verify-c6a7-reading-c-analysis.mjs
verify-c6a3-reading-analysis-bridge.mjs  verify-c6a8-reading-d-analysis.mjs
verify-c6a4-paper-asset-analysis-loader.mjs  verify-c6a9-open-reading-cd-analysis-entry.mjs
verify-c6a5-search-entry-e2e.mjs         verify-c6a10-concierge-local-search.mjs
verify-c6a6a-reading-b-analysis.mjs      verify-c6b1-option-anchored-analysis.mjs
verify-c6a6b-open-reading-b-analysis-entry.mjs  verify-c6b2-analysis-entry-gate.mjs
```

全部 12 个**不在** `verify-ci.mjs` registry（82 项）内，删除不动 CI 数字。

### A 类：在 CI 名单内、直接读 Harness 源码做断言，必须同刀改（7 个）

| 脚本 | 位置 | 退役后行为 |
|---|---|---|
| `verify-i14-grammar-fill-analysis-surface.mjs` | :371-375 | existsSync 兜底空串 → 断言 FAIL |
| `verify-i15-grammar-fill-blank-focus.mjs` | :122-125 | readSrc 直接抛错 |
| `verify-i4-grammar-fill-ai-import.mjs` | :341-345 | 抛错 |
| `verify-i5-writing-ai-import.mjs` | :426-430 | 抛错 |
| `verify-i9-cloze-analysis-surface.mjs` | :199-206 | 断言 FAIL |
| `verify-paper-browse.mjs` | :875,921,923,1413 | 抛错；且 :1413 显式断言两 view 的 popstate reload 短路——退役后此断言语义需重设计 |
| `verify-section-chrome-on-solo-surface.mjs` | :166-170 | 抛错 |

### B 类：不在 CI 内、整支绑定孤儿源码的历史验收脚本（整支退役）

`verify-reading-analysis-{route,selector,view-state,linking,annotation}.mjs`
×5、`verify-paper-intelligence-{cut-d1,preview,interactive-preview,
evidence-audit,route-integration,paper-surface-harness,
paper-surface-evidence,paper-surface-insight}.mjs` ×8、
`verify-c5a-paragraph-structure-anchors.mjs`、
`verify-c5b-structure-brace.mjs`、`verify-c5b-po-qa-contract.mjs`、
`verify-paper-surface-host-interaction.mjs`、
`verify-paper-surface-module-v1.mjs`、
`verify-i1-paper-import-splitter.mjs`。

### C 类：CI 内但仅注释/路径提及，不实际读孤儿源码，无需改动

`verify-c7-paper-import-contracts.mjs`、`verify-detail-redesign.mjs`、
`verify-classic-retire-3.mjs`、`verify-figure-render.mjs`、
`verify-grammar-facets-v2.mjs`、`verify-h1d-analysis-availability.mjs`、
`verify-h5j-reading-difficulty.mjs`、`verify-i0e-seven-choices-entry.mjs`、
`verify-i1-paper-import-analysis.mjs`、
`verify-paper-assets-consistency.mjs`、`verify-radius-family.mjs`。

### 手跑 Playwright smoke（无 CI 挂载，随刀退役）

`scripts/smoke-reading-analysis.mjs`、
`scripts/smoke-paper-intelligence-preview.mjs`。

## 5. server 端：零改动，两处同名陷阱

- 两孤儿页无专属 API，数据是静态 JSON fetch。
- `server/search/paperSurfaceAvailability.mjs` 的 `buildPaperSurfaceHref()`
  （:42-53）产出 `?view=paper-intelligence&surface=paper&…` 形字符串随
  详情下发，但**所有前端消费方都不直接跳转**——`ConciergeGroupCard.tsx:
  125-134`、`QuestionGroupDetailView.tsx:210,429-454`、`App.tsx:739-763`
  均经 `concierge/paperSurfaceHref.ts` 抽 paperId 改写成 paper-browse
  讲评 href。**此 server 文件是活的，不许动。**
- `server/reading-analysis/readingDifficultyNormalizer.mjs`（api.mjs:43）
  是同名不同物的阅读难度归一化服务，**与孤儿页无关，不许动**。

## 6. 全仓关键词扫尾

`view=reading-analysis` / `view=paper-intelligence` 在非 docs 代码中的
命中仅限：main.tsx、App.tsx、两个 route 文件、AuthGate 注释、
`concierge/paperSurfaceHref.ts` 历史格式注释、上列 verify/smoke 脚本。
无 UI 组件 onClick/href 硬编码残留。
