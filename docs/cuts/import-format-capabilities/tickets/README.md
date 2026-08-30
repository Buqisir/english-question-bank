# Tickets 与依赖

| Ticket | Outcome | Depends on | Priority |
| --- | --- | --- | --- |
| [01](01-source-region-review-pairing.md) | 原卷局部与真实 Screen 配对、稳定 issue locator（已实现；待真实 Owner QA） | — | P0，已完成技术前置 |
| [02](02-docx-semantic-table-closure.md) | 合并/空格等 DOCX 普通表语义闭合，嵌套表稳定拒绝 | — | P1 |
| [03](03-text-layer-pdf-materializer.md) | 文本层 PDF adapter 与 carrier-neutral parser（已实现） | — | P0，已完成 OCR 前置 |
| [04](04-media-layout-intent.md) | 受限DOCX media、最小shared layout与人工确认门禁已实现；PDF自动取图/classifier仍partial | 01 | P1，部分实现 |
| [05](05-table-presentation-intent.md) | 普通表的边框、相对列宽与对齐 | 01、02 | P1 |
| [06](06-scanned-pdf-ocr-evidence.md) | 扫描PDF的可核查OCR observations与Agent对照闭合（confidence仅诊断；真实QA待办） | 01、03 | P0，图片入口前置已完成 |
| [07](07-mixed-carrier-routing.md) | 按 role/page 精确路由已支持的 carrier adapters | 03、06 | P2 |
| [08](08-listening-audio-evidence.md) | Universal 导入保存 opaque listening audio evidence | — | P2 |
| [09](09-ordered-image-source-bundle.md) | 显式排序的题卷/答案图片页经Agent closure、独立视觉前审进入成卷Owner QA（synthetic/public seam已实现；真实QA待办） | 01、06 | P0，第一项业务发布能力 |
| [10](10-answer-source-shape-closure.md) | 详解版、纯答案键及题答同文件统一权威答案；官方范文Teacher-only（已实现） | —；PDF/image复用03/09 | P1，已闭合通用answer-shape seam |
| [11](11-source-only-awaiting-answers.md) | 无答案来源安全暂存，补答案前禁止 Candidate/发布（已实现） | —；图片入口复用09 | P1，已闭合source-only生命周期 |

```text
01 ─────┬────▶ 04
        ├────▶ 05
        └────▶ 06
02 ──────────▶ 05
03 ─────┬────▶ 06 ─────▶ 07
        └────────────────▶ 07
08  （独立；只闭合 inactive evidence）
06 ──────────▶ 09
10 （独立 answer-shape seam；按 carrier 复用 03/09，已实现）
11 （独立 source-only 状态；图片 intake 复用 09，已实现）
```

Owner 指定的第一条发布主线是 `01 → 03 → 06 → 09`。01 已建立原图局部与真实 Screen
配对，03 已建立共享 ordered-item parser，06 已闭合synthetic扫描PDF raster/OCR/Agent closure
seam；09现已接通显式图片页、同一closure、Canonical与三面回归。11也已允许无答案的
DOCX/PDF/图片题卷先进入gitignored、不可物化/不可审核/不可发布的安全暂存。补到答案后，
10现已统一关闭详解版/纯答案键/题答同文件的提取边界。04现已闭合受限DOCX媒体裁剪、
共享布局、低清图派生和Owner逐图确认；剩余高价值gap是PDF producer自动局部取图/正文
关联，以及防止普通表格被截图化的classifier。任何真实QA或发布仍需另行明确授权。
