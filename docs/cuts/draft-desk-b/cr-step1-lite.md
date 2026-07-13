# draft-desk-b — 步1 CR-lite(DP-2 步间闸,主代理冷读)

- 日期:2026-07-12
- 对象:PR #285 @ b0d9f34(`server/draft-paper/paginationRenderer.mjs` + `chromiumPool.mjs` + 两个 verify)
- 复核方式:主代理冷读全 diff + **亲手重跑** verify(不采信 DEV 自报绿)
- 结论:**过闸,0 Must Fix,进步2**。整刀 merge 前仍需 fresh Opus CR(AGENTS.md large 刀规矩,本文件不代替)。

## 亲手复跑结果

- `verify-draft-pagination-renderer.mjs`:25/25 绿(确定性:3 次渲染页数一致、HTML 归一 UUID 后逐字节一致、每组落页一致、script 全剥、PDF magic header)
- `verify-draft-pagination-perf.mjs`:2/2 绿(暖实例 711ms < 1s 预算;渲染中事件循环 67 ticks 不阻塞)
- `verify-c8-draft-paper-contracts.mjs`:50/50 绿
- PR CI:verify + e2e 双绿
- forbidden-scope 历史失败:确认 pre-existing(diff 不含其相关文件;dev 亦 stash 实证),见挂账 SW-E

## 冷读判定

代码质量高,plan 契约全部落实:单 page 同源出双产物顺序锁死并写成模块头硬契约、禁止未分片 page.pdf() 有注释级封堵(单入口)、spike 三个实操发现全部吃进(剥 script / PagedConfig 先于注入 / 归一随机 UUID)、串行队列失败不卡后续、崩溃懒重连、exit hook 同步兜底、pageCount 双源交叉校验 fail-loud。Forbidden 全守(print-renderer/exportImplementation/schema 未触碰)。

## 挂账(Should Watch,不 block 本步)

- **SW-A(步2/4 必验)**:渲染器用 `page.setContent()`(base = about:blank),含 figure 图片的卷若 img src 为相对/站内路径会加载失败 → 图高塌陷 → 分页错。步2/4 接线时必须用含 figure 的卷实测一次(有 `verify-c8-figure-render` fixture 可借)。
- **SW-B(步5 CI 决策)**:两个新 verify 标 `no` 不入 CI——main verify job 的 `npm ci` 不给 `playwright-core` 装浏览器(只有 e2e job 为 app 的 playwright 装)。步5 收口前拍板:verify job 加 chromium 安装步,或挪进 e2e job。
- **SW-C(延迟余量修正)**:真实暖延迟 ~700-800ms,非 spike 的 ~490ms(spike 误用了轻量 headless_shell build;生产只装了全量 chromium build,池子已按生产实况用 `channel:'chromium'` 并靠常驻 BrowserContext 拉回 ~100-150ms)。预算内但余量小;生产机硬件未验,PO-2 loading 态兜底。spike-gate-dp1.md 已补勘误注记。
- **SW-D(步4 前置修复)**:`verify-print-pdf-export-flow.mjs` 在 **main 上就崩**(其 cloze fixture 的 materialText 无挖空标记,撞上 print-renderer.mjs:361 的 blank-count 一致性 assert;该脚本不在 verify-ci 名单,坏了没人知道)。步4 验收依赖它 → 步4 开工前先修 fixture。另:plan.md 步5 把它误写作 `verify-c8-print-pdf-export-flow`,实际无 c8 前缀。
- **SW-E(步5 处理)**:`verify-c8-forbidden-scope.mjs` 对 github/main 的 diff 按 C8-PR-A 时代硬编码 allowlist 检查,draft-desk-b 一切改动(含纯 docs)都撞。步5 的 MF-7 复核时要么更新该门、要么明确其历史门定位,不能静默留红。
- **语义澄清(已修文档)**:确定性的"逐字节一致"= 归一 pagedjs 每次渲染随机生成的 `data-ref`/`data-split-*` UUID 之后。步2 的 group 映射只在单次渲染内用 data-ref,不受影响。
