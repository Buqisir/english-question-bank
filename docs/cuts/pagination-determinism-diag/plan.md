# pagination-determinism-diag — 分页渲染不确定疑点诊断 + 裁决缓存一针加固

## Cut Size

small（诊断 + 5 行加固）；touches schema / data contract / product
boundary / teaching interpretation: **no**。CR-lite。

## 疑点原文（STATUS 开放账本，2026-07-15 DP-3 现场）

同一草稿卷同一序（做的都对考的都对，5 题组 A3），页面首载渲染 6 版，
随后同签名重渲变 7 版（断篇集合也随之变）；suggestion 仍命中旧 null
裁决 reused:true。嫌疑：字体加载 / 图片尺寸 / Chromium 池状态。

## 诊断结论（2026-07-16，loop 实测 + 代码体检）

1. **渲染器确定（疑点证伪）**：真数据 loop（本地 qa 卷 0709 QA终版，
   5 题组 A3，固定同一 print HTML 连渲 8 次，run1=冷启动）——页数 8/8
   一致、断篇集合 8/8 一致、输出 HTML 归一化掉 paged.js 每跑随机的
   `data-ref`/`data-split-*` UUID 后 **8 次逐字节相同**。冷暖无差。
   三嫌疑全不成立（print HTML 无 webfont、图片 data URI 内联、每渲
   新 page）。loop 脚本入档 `qa/diag-pagination-loop.mjs` 可重跑。
2. **签名体检无活洞**：签名={id,title,versionType,items(id/groupId/
   orderIndex/pb)}——凡在线上可改且会印上卷面的字段全在签名内
   （score 不可在工作台改，只随题组数据走；题组内容/模板在生产只随
   部署变，部署重启服务=两个内存缓存同清，不产生错位）。
3. **现场 6→7 的最经济解释**：学生版/教师版对比错位（两版分开缓存、
   页数天然不同；suggestion 命中旧 null 只证明学生版签名未变，7 版
   读数可以来自另一 versionType）；次选=瘦身局恢复原状不完全。
   生产 Linux 渲染确定性未实测（本机 macOS 证得），但 print HTML 无
   任何异步加载源，字体替换每机确定——概率最低。

## 加固（owner 拍板「同意」2026-07-16）

`reorderSuggestionCacheKey` 在签名外追加**当次断篇集合的 md5(12)**：
将来任何原因导致同签名下断篇变化（引擎升级/字体环境变化），旧裁决
自动失效重算——「证明了不会发生」升级为「就算发生也自愈」。同态二连
调用断篇同→哈希同→仍命中（verify-reorder-suggest CR MF-1 断言不变）。

## Verification

- `node scripts/verify-reorder-suggest.mjs` 30/0 真退出码；
- `node scripts/verify-draft-pagination-cache-trigger.mjs` 绿；
- `pnpm -C app run verify:all` 82/0/0。

## 裁决点清单

- [x] DP-1 诊断报告 + 加固方案 owner 拍板（2026-07-16「同意」）
- [x] DP-2 加固落地 + verify 全绿（本文件 Verification 三条，2026-07-16）
- [ ] DP-3 merge + main CI 绿；生产部署（与 gf-2020-ii-hint-repair 凑车）
