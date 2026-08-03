# CR — legacy-import-retire (ADR-0016 第3刀 / 末刀)

> 独立冷读审查（fresh cold context）。审已提交 diff（PR #265，feat 6979d23，base main@ec23627）。
> 纯删刀，+138/-8437，22 文件。逐条 grep/sed + build/verify 实证。

## Verdict

**APPROVE**（0 Must Fix）

纯删刀执行外科级干净。三条 PA MF（handleDelete/handleEntrySaved 函数体保留、savedPapers
全删、4 helper 删）全部正确落地。KEEP 命门 git-stat + 符号级双证零改动。build 0 TS 错、
verify:all 61/1skip/0fail、serverContext smoke OK、residue grep 空。DEV 超 plan 的额外孤儿
删除逐个 grep 实证零消费者，5 个连带 verify 脚本全是合法 assert-absent（非 gutting）。
member 组卷/看题/删题/存题 KEEP 面无回归。

## 冷读清单核验

### 1. KEEP 命门零改动 ✅
`git show 6979d23 --stat` 不含 `server/paper-import*/`、`server/paper-import-ai/`、
`import-pipeline`、`verbProfile`、`verify-c7-*`。唯一 paper-sets 触动 = `routes.mjs`（-4，
删 `/api/paper-workflows` 单路由，文件保留其余组卷命脉路由）。`selectPaperSetSummaries`
存活（api.mjs:2456 def + 2494/2504 两消费者）。`server/imports/` 整删。

### 2. "parse" 命名撞车 ✅
删干净：`parseImportFile`/`fetchImportFileParse`/`parseStatusByFileId`/`activeImportParse`/
`ImportFileParseResult` 全 0 命中。KEEP 存活：questionGroups.ts 9 个 parse-回填 fn 全在
（parseClozeGroup/…/saveReadingParseResult/verifyQuestionGroup），App.tsx 19 处 parse-回填
state/service 引用在位。外科区分成功。

### 3. MF-1 handleDeleteQuestionGroup / handleEntrySaved 函数体保留 ✅
两函数（App.tsx:506 / :524，`async function` 声明）函数体完整（delete+draft 移除+导航 /
group 更新+draft patch+detail 重取）。onDelete@923 / onSaved@948 wiring 在位。
`refreshPaperWorkflows` 全库 App.tsx 命中 = 0（仅那两行调用被摘，body 未 gut）。

### 4. MF-2 savedPapers 全删无悬空 ✅
`savedPapers`/`setSavedPapers`/`fetchPaperSets` 在 App.tsx + questionGroups.ts 命中 = 0。
member 组卷走 `paperDraft`（DraftPaperWorkbench 自管），不依赖 savedPapers。无悬空。

### 5. MF-3 4 helper 删 / 5 helper KEEP ✅
删净：`sanitizeFileName`/`inferImportFileType`/`normalizeExamTitle`/
`extractDeclaredExamTitleFromText` 在 api.mjs 命中 = 0。KEEP 存活：cleanDraftText(3)/
normalizeDraftText(2)/normalizeAnswerValue(6)/timestampPrefix(2)/groupTypeLabels(11)。

### 6. serverContext 完整性 (smoke) ✅
`node -e "import('./server/api.mjs')"` → SMOKE OK。13 shorthand + 8 wrapper + importDir 删后
无断引用（.mjs 无 tsc，此为关键硬闸）。

### 7. DEV 超 plan 的额外删除 + verify 脚本改动 ✅
**额外孤儿**（逐个 grep 全库非-verify 引用 = 0，独立实证非信 DEV）：
findExportFile / listObjectiveBankRows / groupsBySectionTitle / objectivePaperSections /
postImportBundleDraft / fetchPaperWorkflows / fetchPaperSets — 全 0 消费者，合法孤儿收敛。
`createBasketItem` App.tsx import 删（其两 call site 随模态删），但模块 export 在
paperDraftModel.ts 存活 + usePaperDraft.ts 4 处消费（member组卷核心，未触动）——正确。

**5 个连带 verify 脚本**——全是合法 assert-absent（删符号→原断言必红→反转断言其不存在），
非 gutting 真断言：
- **h10a**（paper-set 路由 KEEP 面）：KEEP 断言（paper-sets$ / paper-sets/([^/]+)$ /
  模块 import / serverRoutes 注册 / createPaperSet/getPaperSet/listPaperSets context）**全留**；
  只 paper-workflows 相关翻 assert-absent，路由数 5→4 匹配。**KEEP 面完整。**
- **paper-draft**（member 组卷 KEEP 面）：`patchBasketItemFromSavedGroup` / `usePaperDraft`
  import / replaceDraft body 守卫等 member 断言**全留**；仅删符号（createBasketItem import、
  replaceDraft/setPaperTitle/setVersionType call-site 计数）翻 `===0`。**KEEP 面完整。**
- **h12a**：handleEntrySaved body 断言（fetchQuestionGroupDetail/setDataStatus）留，
  仅 refreshPaperWorkflows 翻 assert-absent。
- **classic-retire-2**：compactPreview 随模态删 → detailHelpers import 断言改为 dangling-
  inline-copy 守卫（意图保留：无 inline 重复）。App.tsx 确无 detailHelpers 引用/inline dupe。
- **classic-retire-3**：handleBuildObjectivePaperSet 删 → 行为检查改为 absence 断言。
所有翻转都带 ADR-0016 cut3 溯源注释。owner-gate 12 端点删 + 长度相对取样
（GATED_ROUTES[0]/[len/2]/[len-1]），无索引塌陷。

### 8. App.css 混合规则手改 ✅（附 1 SW）
KEEP 选择器存活：.group-card(21)/.detail-hero(6)/.detail-section(6)/.basket-item(2)。
手改新增的共享规则（.checkbox-field/.form-error/.entry-footer 等）是 member/EntryModal UI，
未误伤。**SW-1**：@media 响应式块内残留 7 处孤儿 `.workflow-*` / `.batch-import-grid`
选择器（App.css:2165-2226），逗号并入 KEEP 共享规则未摘干净——纯死 CSS，零运行时/build
影响（plan §E 自认「孤儿 className 无害但应清」）。非阻断。

### 9. paperDraft 冻结 flag ✅
`paperDraft.setPaperTitle/setVersionType/replaceDraft` 在 App.tsx call-site = 0。DEV 判断准确：
member组卷 UI = `DraftPaperWorkbench.tsx`（**不在本刀 diff**）自管本地 `versionType` useState
（:97）+ 自己的 picker 按钮（:455/:463），**不消费** paperDraft 这两个 setter。setter 零调用
是 baseline 冻结态（有 useState 默认值兜底），非本刀引入的 member 回归。

## Must Fix

无。

## Should Watch（非阻断）

- **SW-1**：App.css:2165-2226 @media 块内残留孤儿 `.workflow-overview/-stage-grid/-summary-grid/
  -card-head` + `.batch-import-grid` 选择器（逗号并入 KEEP 响应式规则未单独摘）。死 CSS，
  无害。留待后续清洁刀，或本刀顺手摘（可选）。
- **SW-2**（承 plan）：paperDraft.setPaperTitle/setVersionType 现零 App.tsx 调用点 =
  已知 tracked gap（无 UI 再驱动整卷标题/版本），非本刀 scope，DEV 已在 paper-draft verify
  注释登记为「Known Risks」。owner 若要网站端再驱动这两值需另立刀。

## Self-Review Blind Spots（喂后续 Big CR）

- 未做真机 Browser QA（forced-auth owner 视角）：管理台「导入」区空 / 「数据维护」只剩
  主题标签 / 删题组+EntryModal 存题不崩 / `?view=` 深链不白屏——静态证据强（build+verify+
  smoke+符号级 KEEP 存活），但 owner 侧真机 QA（plan §验收 6）仍建议补一遍。
- verify:all 的 1 skip = `verify-i16a-teaching-dimension-search`（off-repo fixture 缺失），
  与本刀无关，非本刀遮蔽。
