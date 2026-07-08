# ui-panel-reunify（UI 一致性刀②：解析面板归队墨绿章程）— DEV 执行契约

cut size: medium; touches schema/data-contract/product boundary/teaching
interpretation: no（纯 display/CSS；grey-zone 文件仅 display 编辑）。
背景与证据：`docs/cuts/ui-coherence/audit.md` 优先问题 ②。

## 历史决定作废声明（本刀的合法性来源）

`paperIntelligencePaperSurfaceHarness.css` 头注释（:58-97）记录的 PR #52
PA「warm pencil + ink」独立配色方向，经 owner 2026-07-07 拍板**作废**，
统一归队根目录 `DESIGN.md` 墨绿章程（真中性底 + 单一墨绿强调 + token
语义色）。头注释里「证据语义保留色」的**语义区分原则保留**（解析面板的
支持/陷阱语义不与强调色混淆），但色值一律换成章程 token。

## 色彩映射表（机械执行；只改 CSS 变量定义与直写色值，不改选择器结构）

harness 自建变量（`.pi-ps-harness` 的 `--pi-ps-*` 定义处集中改）：

| 现值 | 改为 |
|---|---|
| `--pi-ps-assistant-bg: #f8f6f1`（暖米右栏底） | `var(--eqb-color-bg)`（#F6F6F4） |
| `--pi-ps-insight-ink: #2f2923` | `var(--eqb-color-text)` |
| `--pi-ps-insight-muted-ink: #6f665a` | `var(--eqb-color-text-muted)` |
| `--pi-ps-insight-chip-bg: #f3f0e8` | `var(--eqb-color-surface-2, #EDEDEA)`（若无该 token 用 #EDEDEA） |
| `--pi-ps-insight-chip-border: #e3ddd3` | `var(--eqb-color-border, #D8D8D2)` |
| `--pi-ps-insight-active-bg: #f0ebe2` | teal-50 `#EAF1ED` |
| `--pi-ps-insight-active-border: #7a6a58` | teal-200 `#A5CDBD` |
| `--pi-ps-insight-hairline: #e3ddd3` | `var(--eqb-color-border-subtle, #E8E8E4)` |

解析面板直写色值（右栏 `pi-ps-analysis-*` 一带，逐个 grep 替换）：

| 现值 | 语义 | 改为 |
|---|---|---|
| `#6f7b8f`（option-zh 中文释义，slate 蓝） | 次要文字 | `var(--eqb-color-text-muted)` |
| `#2a7c4f` / `rgba(42,124,79,*)`（answer 字/correct 边） | 支持语义 | success `#059669` / `rgba(5,150,105,同透明度)` |
| `#1f6f47`（correct 徽标字） | 支持语义 | success `#059669` |
| `rgba(232,245,233,*)`（correct 浅底） | 支持语义底 | `var(--eqb-color-success-soft)`（沿用现有 token） |
| `#7a5a2b`（trap 徽标字，棕） | 陷阱语义 | warning `#d97706` |
| `rgba(245,158,11,*)`（trap 徽标底） | 陷阱语义底 | `var(--eqb-color-warning-soft)` |
| `rgba(92,82,70,*)`（暖灰边线） | 分隔线 | `rgba(30,30,28,同透明度)`（中性 ink 基） |
| `#e2e2e2` 等散落硬编码边线 | 分隔线 | `var(--eqb-color-border-subtle)` |

**不许碰**：`shared/papersurface/**` 与 `shared-ui/papersurface/**`（卷面
内 evidence 高亮 mint/amber 是锁定契约）。`blockquote` 的 emerald
`border-left`（audit 提到的越界）先定位：在契约区文件内则**不改**、写进
报告 watch；在 app 侧才按 success token 归队。

## 其它两项

1. **字体**：`.pi-ps-harness` 的 `font-family: system-ui...`（约 :117+8）
   → `inherit`（工具壳统一 Inter；卷面内衬线由 papersurface 自管，不受
   影响——截图核实）。
2. **`transition: width`**（约 :858+8）：布局属性动画，改为不动画或
   transform 方案；若改动画方式，保持/补 `prefers-reduced-motion` 退化。
3. **头注释改写**：:58-97 注释更新——warm-pencil 方向标记 superseded
   （owner 2026-07-07，归队 DESIGN.md），证据语义保留原则用 token 语言
   重述；`Paper Surface (C4)` 相关陈述如与现状不符一并修正。

## Forbidden

- `shared/papersurface/**`、`shared-ui/papersurface/**`、`server/**`、
  schema、`*Adapter.ts`、AppTopbar（刚合并的刀①产物）。
- 不改 TSX 逻辑/状态/数据流（harness TSX 原则上不动；确需 className 级
  display 修改先在报告说明）。
- 不加依赖。不顺手修刀③-⑥范围的问题。

## 验收（DEV 自证后报告）

1. `npm run build --prefix app` 绿。
2. grep 证明：app/src 内（契约区外）不再出现 `#f8f6f1 #2f2923 #6f665a
   #f3f0e8 #e3ddd3 #f0ebe2 #7a6a58 #6f7b8f #2a7c4f #1f6f47 #7a5a2b`。
3. 钉色 verify 排查：grep scripts/verify-*.mjs 是否钉了上述旧色值；有则
   同刀更新断言（DESIGN.md 明文要求），并在报告单列每一处改动理由。
4. 相关 verify 复跑绿（至少：verify-c6b1-option-anchored-analysis、
   verify-i0d-seven-choices-surface、verify-i14-grammar-fill-analysis-surface、
   verify-i9-cloze-analysis-surface；以 grep 排查结果为准增减）。
5. Playwright 截图（1440×900）：卷面-阅读/七选五/完形/语法填空四页，
   目视右栏为中性底+墨绿/语义 token；计算色断言：契约区外无 hue∈[200,260]
   蓝、无 warm cream 面板底。环境：`node --env-file-if-exists=.env
   server/api.mjs`（8787）+ `cd app && npx vite preview --port 4173
   --strictPort`；URL 参数参照
   `?view=paper-intelligence&source=paper-asset&paperId=paper-2024-i&surface=paper&groupId=group-2024-i-reading-a&questionId=q-2024-i-021`
   （seven-choices/cloze/grammar-fill 换对应 groupId/questionId，见
   docs/cuts/ui-shell-unify/plan.md 同款）。跑完杀进程。截图放
   /private/tmp/claude-501/-Users-huangxuewei-Projects-english-question-bank/9adddf3b-2f53-4faf-bf50-a4aefe6df666/scratchpad/dev-panel/。
6. 完成报告：改动文件清单、映射表逐行落实情况、blockquote 定位结论、
   钉色断言改动清单、verify 结果、截图路径、已知风险。
