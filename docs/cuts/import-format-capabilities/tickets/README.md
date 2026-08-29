# Tickets 与依赖

| Ticket | Outcome | Depends on | Priority |
| --- | --- | --- | --- |
| [01](01-source-region-review-pairing.md) | 原卷局部与真实 Screen 配对、稳定 issue locator（已实现；待真实 Owner QA） | — | P0，已完成技术前置 |
| [02](02-docx-semantic-table-closure.md) | 合并/空格等 DOCX 普通表语义闭合，嵌套表稳定拒绝 | — | P1 |
| [03](03-text-layer-pdf-materializer.md) | 文本层 PDF adapter 与 carrier-neutral parser（已实现） | — | P0，已完成 OCR 前置 |
| [04](04-media-layout-intent.md) | Universal media capture 与最小 shared layout intent | 01 | P1 |
| [05](05-table-presentation-intent.md) | 普通表的边框、相对列宽与对齐 | 01、02 | P1 |
| [06](06-scanned-pdf-ocr-evidence.md) | 扫描 PDF 的可核查 OCR observations 与人工确认（synthetic/public seam已实现；真实QA与`/ops/` UX待办） | 01、03 | P0，图片入口前置已完成 |
| [07](07-mixed-carrier-routing.md) | 按 role/page 精确路由已支持的 carrier adapters | 03、06 | P2 |
| [08](08-listening-audio-evidence.md) | Universal 导入保存 opaque listening audio evidence | — | P2 |
| [09](09-ordered-image-source-bundle.md) | 显式排序的题卷/答案图片页端到端进入三面 | 01、06 | P0，第一项业务发布能力 |
| [10](10-answer-source-shape-closure.md) | 详解版、纯答案键及题答同文件只提取同一种权威答案值 | —；PDF/image复用03/09 | P1 |
| [11](11-source-only-awaiting-answers.md) | 无答案来源安全暂存，补答案前禁止 Candidate/发布 | —；图片入口复用09 | P1 |

```text
01 ─────┬────▶ 04
        ├────▶ 05
        └────▶ 06
02 ──────────▶ 05
03 ─────┬────▶ 06 ─────▶ 07
        └────────────────▶ 07
08  （独立；只闭合 inactive evidence）
06 ──────────▶ 09
10 （独立 answer-shape seam；按 carrier 复用 03/09）
11 （独立 source-only 状态；图片 intake 复用 09）
```

Owner 指定的第一条发布主线是 `01 → 03 → 06 → 09`。01 已建立原图局部与真实 Screen
配对，03 已建立共享 ordered-item parser，06 已闭合synthetic扫描PDF raster/OCR/人工确认
seam；09再接题卷图片 + 答案图片并完成三面回归。02/04/05/07/08 不得抢占这条主线。这里的依赖
是技术前置，不授权自动开下一张 ticket，也不授权 publish 或 production 操作。
