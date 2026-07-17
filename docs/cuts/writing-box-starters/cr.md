# CR — writing-box-starters（fresh 冷读）

审阅人：fresh CR（未参与实现）。审阅对象：impl 提交 `f0e9de6`（对比父 `22cfb2a`）。
只读实现 + 亲跑 verify，不改实现。

## Verdict

**APPROVE**（0 Must Fix）。硬契约 6 条全部成立；Forbidden 零触碰；scope 无漂移；
verify 真实退出码 0，且证到的是真风险不是空断言。DP-3 owner 实卷目检仍是 owner
的活（plan checklist 未勾），那是渲染刀铁律的收口，不是本 CR 能替代的。

## 核契约（逐条）

| # | Locked Decision | 结论 | 证据 |
|---|---|---|---|
| 1 | api.mjs 加性 `detail.writingTask`（有 writingTaskId 且 asset 命中才附加，消费方可选链） | ✓ | `server/api.mjs:1708-1720`，三元 spread `...(writingTask ? {...} : {})`，无命中零字段。端到端由真 asset 生成的 QA 样张反证（见下） |
| 2 | print 续写框印两句、第一句贴顶、第二句 50%、原文照印无前缀、框 145×57 不变、应用文框空 | ✓ | `server/print-renderer.mjs:243-256` + CSS `.writing-starter-line--1{top:1mm}` / `--2{top:50%}`；`position:absolute` 不改框流，框高不变。字体走 body 继承 = paperFontStack / 10.5pt（`:487-488`），符合"正文字体" |
| 3 | DOCX 单格改两行、各≈半高、Times/size21、无前缀、应用文单格空 | ✓ | `server/exports/docxRenderer.mjs:309-319`；rowHeight1=round(h/2)、rowHeight2=h-rowHeight1 → 总高守恒；无 `insideH` 边框 → 两行仍读作一框；`paragraph(text,{size:21})` 默认 rFonts=Times New Roman |
| 4 | 学生版/教师版都印 | ✓ | docx verify 对 `['student','teacher']` 双跑，两版都含两句 starter |
| 5 | 无 starters（缺数据/空/<2）兜底空框不抛错 | ✓ | 两渲染器均 `Array.isArray && length>=2` 守门；docx 兜底串 = 刀前字节（`tblPrGrid` 抽取后拼回 `<w:tbl>+tblPrGrid+<w:tr…<w:p/>…`，逐字对齐旧串） |
| 6 | 草稿卷两出口经共用渲染器自然获得，verify 证到 | ◐ | `verify-draft-paper-docx.mjs` 绿（16 检），但**无 starter 专项断言**；draft 走同一 `docxRenderer`/`buildPrintHtml`，共用层被直测覆盖 → 见 Should Watch |

### 端到端证据（DP-2 层）
DEV 用 paper-2026-i 真 asset 出的 QA 样张，四份都含两句真段首语：
- `qa/writing-box-starters-{student,teacher}.docx` → `word/document.xml` 含两句原文
- `qa/writing-box-starters-{student,teacher}.pdf` → pdftotext 抽出两句原文

真 asset `wt-2026-i-continuation.continuationStarters` = 两句（application 无 starters），
与 verify fixture 一致。这条链证明 api.mjs 组装 → 渲染器 端到端通（verify 脚本自己是
直接注入 `detail.writingTask`、绕过 api.mjs 组装的，组装环节由样张补证）。

## Forbidden（零触碰，已核）
impl 提交 `f0e9de6` 仅动：`server/api.mjs`、`server/print-renderer.mjs`、
`server/exports/docxRenderer.mjs`、两个 verify 脚本、`qa/*`。
- 屏幕面 `app/src` / PaperSurface：未碰 ✓
- schema/DB/migration/导入管线/`paper-assets/**` 数据：未碰 ✓
- `tokens.mjs`：未碰（新 CSS 用硬值 1mm/3mm/50%，不加 token）✓
- 排版标准文档：未碰 ✓

注：`validator.mjs` / `verify-c7-*` 的改动属**上一刀** dash-optionbank-gate（`22cfb2a`），
非本刀。本刀提交面干净，无 scope 漂移。

## verify 牙口（不看"测过了"看它测了啥）
- print/docx 两脚本都**先红后绿**：先断言"无 writingTask → 框仍空、无 starter 文本泄漏"，
  再断言 happy path。负例真能把两态区分开 → 断言有牙。
- verbatim 断言用 `<w:t xml:space="preserve">${STARTER}</w:t>` 全等 / `writing-starter-line--1">Daniel` 正则，
  真验了"照印且无 Paragraph N: 前缀"。
- 亲跑退出码：print 83/0、docx 122 检 0 失、draft 16 检 0 失、`verify:all` 83/1skip/0 → `EXIT:0`。
- 文本转义到位：docx 走 `run()`→`escapeXml`，print 走 `escapeHtml`，starter 文本不会破 XML/HTML。

## Should Watch（非阻断）
1. **§6 draft 出口无 starter 专项断言**：draft 两出口共用 `docxRenderer`/`buildPrintHtml`，
   共用层已直测，但 plan 说"verify 要证到"draft 出口本身。当前靠"同一函数"推断，
   没有一条断言直接从 draft 路径抽出 starter。风险低（共用层强覆盖），但字面未完全兑现。
2. **docx "TWO-ROW" 断言偏松**：`(xml.match(/trHeight…/g)).length >= 2` 是全 document 计数
   （应用文 1 行 + 续写 2 行 = 3，`>=2` 恒过），并未隔离"续写框恰好 2 行"。verbatim 两句断言
   补了实质覆盖，但该断言的 label 比它实际证明的强。
3. **docx 行高 hRule=exact 固定**：未来若出现超长段首语（现数据单行放得下 145mm），
   exact 行会裁切。现数据安全，换新 asset 时留意。
4. **print starter 字号靠继承**：`.writing-starter-line` 未显式设 font-size，继承 body 10.5pt。
   现在对，但 body 基准若改，starter 静默跟随。符合 plan"正文字体"意图，仅记一笔。

## 结论
实现与契约一致、边界干净、验证有牙。放行至 DP-3（owner 实卷目检：段首语位置/字体/
不撞框/第二句 50% 起笔），那是 owner 的收口，不是本 CR 的活。
