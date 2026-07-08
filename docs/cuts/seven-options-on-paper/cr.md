# CR — seven-options-on-paper

Verdict: **APPROVE** (可合并，无 Must Fix)

Cold read of `git diff 7dfd55b...worktree-agent-a362d1a7cb0fb7fc4` (single commit
79790b5). Diff is 362 insertions / 0 deletions across 7 files — purely additive.

## 判断项复核结论

1. **PaperSurface 高危面纪律 — PASS.** 现有渲染路径（reading/cloze/grammarFill/
   writing）在 diff 里一行未改。新块只在 `{sections.map(...)}` 之后、全局题目
   列表之前，通过 `{optionBank && optionBank.length > 0 && ...}` 门控插入。
   `optionBank` 未传时严格零渲染、零副作用（无空容器、无占位）。C1/C2 满足。

2. **契约文件改动 — PASS，无联动缺口.** `shared/papersurface/types.d.ts` 是
   纯新增一个可选字段 `readonly optionBank?: ReadonlyArray<PaperQuestionOption>`
   （紧跟 `questions` 后），既有形状零改动。关键点：parity 检查
   `verify-paper-surface-mjs-declaration-parity.mjs` 只遍历 `shared/papersurface`
   下的 `.mjs` 运行时模块（anchorKeys / blankPattern / segmentPaperText /
   tokens）并要求各自的 `.d.ts`/`.d.mts` 声明对齐。`types.d.ts` **没有** `types.mjs`
   运行时伴生，不在 parity 覆盖范围，故不需要联动改 `.d.mts`。实跑 parity =
   17 passed / 0 failed，确认未打破。

3. **零交互承诺 — PASS.** `PaperSurfaceOptionBank` 只输出 `<ol>/<li>/<span>` +
   className，**无任何** `data-paper-*` / `data-pi-*` 锚点、无 `onClick`、不进
   `onFocusIntent`。因此不可能被 harness 的 evidence/clue 选择器
   （`data-paper-evidence-id` 等）命中。C3 满足，且 verify 用提取函数体后的
   负向断言钉死（`!includes('paperSurfaceAnchorAttrs')` + `!/data-p[ai]-/` +
   `!/onClick|onFocusIntent/`）。

4. **两个消费点接线对称性 — PASS.** 两处都取 sevenChoices 模型的 `.options`：
   PaperBrowsePage 用 `entry.kind === 'sevenChoices' ? entry.model.options :
   undefined`；harness 用 `sevenChoicesModel?.options`，其中 `sevenChoicesModel`
   是 `useState<SevenChoicesSurfaceModel | null>(null)`，仅 sevenChoices source
   赋值，故非七选五时天然为 `undefined`。空值降级两处一致。harness line 1457
   右栏 option list 同样吃 `sevenChoicesModel.options` —— 卷面池与解析面板同源
   同数据，无漂移。C4/C5 满足，adapter 未改（Forbidden 遵守）。

5. **新断言质量 — PASS，具备失败能力.** 18-21 四组共 12 项断言。含一条真动态
   断言（`import` 真 adapter + 真 fixture `seven-choices-analysis-v1.json`，跑
   `buildSevenChoicesSurfaceModel` 后校验 7 条 A-G label/text 非空）——非同义
   反复。其余为钉死具体接线代码的正则。空池不渲染由 `optionBank.length > 0`
   门控断言把守。实跑 verify-paper-browse = **98 passed / 0 failed**（86→98，
   +12 确认）。

6. **主树污染 & 导出面 — PASS.** diff 仅触碰 app/ · shared/ · scripts/ · docs/，
   无主树绝对路径残留引用。`server/**`（print-renderer / docxRenderer）零改动，
   Forbidden 遵守；导出面「A-G 逐小题重复」既有 bug 未被本刀触碰，另立账正确。

## Should Watch（非阻塞）

- **`.ps-option-label` 复用耦合**：新块沿用 per-question option list 的
  `.ps-option-label`（`font-weight: 700`）。这是本刀刻意的 token 复用（plan §排版），
  但意味着未来若有人改 `.ps-option-label` 会同时影响两条渲染路径。当前无问题，
  记一笔耦合点。
- **`.ps-option-bank-text` 无对应 CSS 规则**：renderer 给了这个 className 但
  CSS 只定义了 `.ps-option-bank` / `.ps-option-bank-item`。文本靠 item 继承字体，
  行为正确、无 bug；className 是留给未来样式挂点的空位，无害。

## Self-Review Blind Spots（喂 Big CR）

- C7（右栏 `pi-seven-clue-mark` overlay 不偏移）**无法脚本化**，只有真机 QA 一条
  链背书。新块插在正文*之后*、marks 依赖的都是 DOM 中在其之前的元素，理论上
  不移位，但这条契约的唯一证据是 DEV 自报 QA，CR 未独立复现。
- 「`opt.text` 不含 A-G 前缀」（否则双字母）同样只由真机 QA 覆盖，无脚本断言。
