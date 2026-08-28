# Tickets 与依赖

| Ticket | Outcome | Depends on | Priority |
| --- | --- | --- | --- |
| [01](01-source-region-review-pairing.md) | 原卷局部与真实 Screen 配对、稳定 issue locator | — | P0，推荐第一张 |
| [02](02-docx-semantic-table-closure.md) | 合并/空格等 DOCX 普通表语义闭合，嵌套表稳定拒绝 | — | P1 |
| [03](03-text-layer-pdf-materializer.md) | 文本层 PDF adapter 与 carrier-neutral parser | — | P0 |
| [04](04-media-layout-intent.md) | Universal media capture 与最小 shared layout intent | 01；caption 产品决定 | P1 |
| [05](05-table-presentation-intent.md) | 普通表的边框、相对列宽与对齐 | 01、02；表格产品决定 | P1 |
| [06](06-scanned-pdf-ocr-evidence.md) | 扫描 PDF 的可核查 OCR observations 与人工确认 | 01、03 | P0 |
| [07](07-mixed-carrier-routing.md) | 按 role/page 精确路由已支持的 carrier adapters | 03、06 | P2 |
| [08](08-listening-audio-evidence.md) | Universal 导入保存 opaque listening audio evidence | — | P2 |

```text
01 ─────┬────▶ 04
        ├────▶ 05
        └────▶ 06
02 ──────────▶ 05
03 ─────┬────▶ 06 ─────▶ 07
        └────────────────▶ 07
08  （独立；只闭合 inactive evidence）
```

01 先做，因为它是 04/05/06 的共同 QA seam；03 可在另一个不重叠 write surface 的任务中
并行。这里的依赖是技术前置，不授权自动开下一张 ticket，也不授权 publish 或 production
操作。
