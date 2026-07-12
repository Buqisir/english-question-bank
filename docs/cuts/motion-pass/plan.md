# motion-pass plan（DEV 执行契约）

cut size: medium；touches schema / data contract / product boundary /
teaching interpretation: **no**（CSS + 文档 + verify 脚本；PA 免——方向由
owner 2026-07-10 章程 + 主代理审计拍定，全程不碰契约面）。

依据：`docs/cuts/motion-pass/motion-audit.md`（发现编号 #1–#6 指它）。

## 目标

全站动效收 token + 统一曲线 + 补缺。**不做全站动效化。**

## P1 token 收编 + 统一映射（一个 commit）

1. 在 `app/src/App.css` 既有 `:root` 变量块中新增：

   ```css
   /* Motion tokens（motion-pass 2026-07-12）。五档时长 + 三曲线；
      签名时刻（七选五 0.9s 跳卡、skeleton 1.6s shimmer）豁免留字面值。 */
   --motion-micro: 80ms;     /* 高频密集微反馈（pi chip 类） */
   --motion-fast: 120ms;     /* hover / 颜色 / 小反馈 */
   --motion-base: 160ms;     /* toast、显形、小入场 */
   --motion-slow: 220ms;     /* 面板 / rail / 抽屉级 */
   --motion-entrance: 260ms; /* 页面级入场（fadeInUp、画线） */
   --ease-hover: ease;                             /* 颜色/hover */
   --ease-out: cubic-bezier(0.23, 1, 0.32, 1);     /* 入场/位移（强） */
   --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* 在屏形变（强） */
   ```

2. 全站（`app/src/**` 的 css/tsx，**排除
   `app/src/shared-ui/papersurface/PaperSurface.css`**）把手写时长按
   最近档映射成 token，单位统一 ms：
   - `80ms` → `var(--motion-micro)`
   - `0.1s` / `100ms` / `0.12s` / `120ms` / `140ms` → `var(--motion-fast)`
   - `0.15s` / `150ms` / `160ms` / `0.18s` → `var(--motion-base)`
   - `0.2s` / `200ms` / `0.25s` → `var(--motion-slow)`
   - `260ms` / `280ms` / `0.35s` → `var(--motion-entrance)`
   - 豁免（保字面值 + 行尾注释 `/* signature, token-exempt */`）：
     `pi-seven-card-jump 0.9s`、`concierge-skeleton-shimmer 1.6s`、
     reduced-motion 块里的 `0.01ms`。
3. 曲线映射：颜色/hover/背景类 transition → `var(--ease-hover)`；
   transform/opacity 入场与位移（含所有 `ease-out` 现值、fadeInUp、
   basket-count、filter-panel-in、各 line-draw/fade-in keyframes 调用处）
   → `var(--ease-out)`；`paperBrowsePage.css:36` 的
   `grid-template-columns` → `var(--ease-in-out)`。shimmer 的
   `ease-in-out` 保字面值（无限循环，豁免）。

## P2 修正 + 补缺（一个 commit）

4. 审计 #2：`paperIntelligencePaperSurfaceHarness.css:1553`
   `transition: opacity 0.15s ease-in` → `opacity var(--motion-base)
   var(--ease-out)`。
5. 审计 #3：App.css 9 处 `transition: all ...`（181/198/211/388/1294/
   1660/2962/3095/3135）改成显式属性列表——读该 selector 的 hover/态
   变化实际动了哪些属性（一般是 background、border-color、color、
   box-shadow、transform 的子集），只列实际变化的。
6. 审计 #5：`DraftPaperWorkbench.css` 给 `.draft-undo-toast` 补入场
   （条件挂载，动画随 mount 播放）：

   ```css
   .draft-undo-toast {
     animation: draft-undo-toast-in var(--motion-base) var(--ease-out);
   }
   @keyframes draft-undo-toast-in {
     from { opacity: 0; transform: translateX(-50%) translateY(8px); }
     to   { opacity: 1; transform: translateX(-50%) translateY(0); }
   }
   ```

   （现规则已有 `transform: translateX(-50%)`，keyframes 两帧都必须带
   上它，否则会横跳。）退化由 App.css 全局 reduced-motion 重置覆盖，
   不必单写。
7. 审计 #6：讲评栏 `grid-template-columns` 动画**机制不改**，只完成
   第 2/3 步的 token 化。
8. `DESIGN.md` 231 行「交互态 150–250ms」条款改为：
   「给每个动效配 `prefers-reduced-motion` 退化（App.css 全局重置已
   兜底）；时长走五档 motion token（micro 80 / fast 120 / base 160 /
   slow 220 / entrance 260ms），曲线走 `--ease-hover/--ease-out/
   --ease-in-out` 三 token，UI 动效不超过 300ms；签名时刻豁免需注释。」

## P3 verify 守门（随 P2 同 commit 或单独 commit）

9. 新增 `scripts/verify-motion-tokens.mjs`：扫 `app/src/**/*.css`（排除
   `shared-ui/papersurface/PaperSurface.css`），断言——
   - 无 `ease-in`（单词边界，放行 `ease-in-out`）；
   - 无 `transition: all`；
   - transition/animation 简写与 `*-duration` 中无裸时长
     （`\d+m?s`），豁免带 `token-exempt` 注释的行与 `0.01ms`；
   退出码非零即红。登记 `scripts/README.md`（marked yes）并加入
   `scripts/verify-ci.mjs`（同刀硬规矩）。

## Forbidden

- `app/src/shared-ui/papersurface/**`、print / PDF / export styling、
  `server/**`、任何 TSX 逻辑/结构改动（本刀零 TSX diff）。
- 不新增本 plan 未列的动效；不改 0.9s 跳卡与 shimmer 的值。
- 不动 reducers / state / data fetching（灰区文件规则）。

## Verify（DEV 自验 + verify 步复核同款）

- `node scripts/verify-motion-tokens.mjs`
- `pnpm -C app run verify:all`

## 裁决点清单（PM 断点锚）

- [x] 审计定稿 + plan 落库（主代理，本文件 commit）
- [ ] cut-pipeline 回执 MF 判定（主代理）
- [ ] 收口浏览器 QA：讲评栏开合 feel-check（卡则删动画、另立 small 刀）、
      undo toast 入场、抽查 3 处 hover 手感（主代理实点）
- [ ] owner PO QA（对照 `qa-checklist.md`）+ merge + main CI 绿
