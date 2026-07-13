# draft-desk-b — DP-1 判定：步0 paged.js gating spike **全过，引擎选定 paged.js**

- 日期：2026-07-12
- 判定人：主代理（per plan.md DP-1「主代理判定」）
- 脚本与原始输出存档：`spike/`（spike-pagedjs-gate.mjs + followup + 各自 output.txt；
  decision.md 引用的上一轮原生引擎 spike 也一并存档为 spike/spike-headless-pagination.mjs）
- 试卷：26.3重庆市巴蜀中学高三月考（七）英语试卷（9 组题含长阅读，同 decision.md spike 那份）

## 四条硬验收结果

| # | 验收 | 结果 | 证据 |
|---|------|------|------|
| a | 长阅读段落边界正确跨页 | **过** | VPP 长阅读 page 4→5 段内按行自然断开续排（"…These" → "customers are then rewarded…"），与 page.pdf() 的 pdftotext 逐字一致；无整题推下页留白 |
| b | `@page @bottom-center counter(page)` 页脚（含 addDraftFooterCss 级联，SW-4） | **过** | PDF 9/9 页页脚 =「2026年广东省高三一模英语试卷 · N」（draft 级联**赢过** print-renderer base rule，符合浏览器级联语义）；活页面同样呈现（paged.js 走 CSS var + `::after` 生成） |
| c | 暖实例单次渲染延迟 | **过** | 暖实例全程 ~490ms（baseLoad 52 + polyfill 注入 115 + paged.js 分页 130 + 序列化 35 + page.pdf() 155）；chromium.launch 冷启 120–265ms。远低于 PO-2「loading + debounce」可接受预算 |
| d | 序列化分页 DOM ⇄ page.pdf() 肉眼一致 | **过** | 同一 page 对象先序列化再 page.pdf()；剥 script 回放 9 页 vs PDF 9 页，逐页文本对比 9/9 全一致；page 1 / page 6 截图 vs pdftoppm 渲染肉眼逐行一致（换行断词位置相同） |

确定性附验：同卷 3 次渲染 PDF 页数 9/9/9、序列化 DOM 字节数逐字节一致（1053183×3）。

> **步1 勘误（2026-07-12,cr-step1-lite.md）**:①上表 (c) 的 ~490ms 是 spike 误用轻量
> `chromium_headless_shell` build 测得;生产只装全量 chromium build(`channel:'chromium'`),
> 真实暖延迟 ~700-800ms,仍在 1s 预算内但余量收窄。②"逐字节一致"实为字节**长度**一致;
> pagedjs 每次渲染给 `data-ref`/`data-split-*` 发随机 UUID,归一后才真正逐字节一致
> (verify-draft-pagination-renderer.mjs 已按此断言;不影响步2 单次渲染内的 data-ref 归并)。

## DEV 必须吃进去的三个实操发现

1. **序列化前必须剥掉 `<script>`**（步1）：`page.content()` 会把注入的 paged.js polyfill
   （~900KB）一起带出来，前端回放时 polyfill 重跑分页、把页面翻倍（实测 9 页涨到 12 页）。
   服务器产出的分页 HTML 必须去 script（回放实测剥后 9/9 稳定）。
2. **margin-box 文本走 CSS var + `::after`，`textContent` 拿不到**（步2/verify）：页脚断言
   别用 textContent，用 pdftotext（PDF 侧）或 `getComputedStyle(el,'::after').content`（DOM 侧）。
3. **PagedConfig 必须在注入 polyfill 之前 set**（步1）：polyfill 在 script-eval 时同步读
   `window.PagedConfig`，且 document 已 interactive 时立即自动跑。
4. （顺带）`section.question-group` 及内部结构在 paged.js 分页 DOM 中完整保留（带
   data-ref/data-split-to 等 paged.js 属性）——步2 下游 wrapper 补 `data-group-id` 的
   映射路径成立（跨页拆分的 group 会出现 data-split-* 多片段，映射时按 data-ref 归并）。

## 结论

按 plan.md DP-1：四条全过 → **引擎选定 paged.js，进入步1**（服务器分页渲染器 + 实例池）。
无需触发 fallback 降级路径。
