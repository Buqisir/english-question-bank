# 刀⑤ 渲染保真（render-fidelity）cut note

2026-07-08 收官。PR #278。PA（Opus high，APPROVE WITH MUST FIX，三条全闭环）
→ 分 chunk Sonnet DEV → fresh Opus CR（APPROVE，无 Must Fix）→ owner-QA
实卷目检三轮 → CI 绿。

## 落地

- **Chunk A**：`shared/papersurface/tokens.mjs` 扩排版 primitives（10.5pt/14px、
  行距 1.714、边距 91/79px、中英/标题字体栈三分）；屏幕 PaperSurface +
  写作页 16px→14px 全 token 化；PaperSurfacePrototype 死码（854+462 行）删除。
- **Chunk B**：`server/print-renderer.mjs` 归标——@page 24/21mm + 页脚页码
  17.5mm、18 磅行距、挖空样式（`shared/papersurface/blankPattern.mjs` 单源，
  屏幕/PDF/DOCX 三面同 regex）、写作答题框（§8 mm 尺寸）。
- **Chunk C**：`server/exports/docxRenderer.mjs` 归标——rFonts（Times/宋体，
  卷名部标题黑体）、正文 size 21、双 sectPr 边距、真页脚 part
  （PAGE/NUMPAGES 域）、挖空下划线 run、写作框表格、段首缩进 420 twips。
- **Chunk D（I10 句首挖空）剔刀**：PA F1 实证真资产不复现（库内语法填空
  均为 `__NN__` 双侧形态），watch-ledger 继续挂账，触发条件=真资产出现
  2-空格句首挖空。
- **§3b 分页纪律**（owner 拍板）：段落可跨页 / 单个小题不拆 / 标题·横线·
  写作框不跨页——标准 v2 增补 + print CSS break 规则 + verify 断言。
- 治理：4 个过期 PR 冻结 verify 退役；`verify-print-renderer` 进 CI（CR SW-A）。

## owner-QA 实卷目检抓到的（行为级 verify 数不出的）

1. print 挖空题号被 inline-block 继承的段落 text-indent 推出横线撞字
   →`.print-blank { text-indent: 0 }`；
2. DOCX 正文段首缩进缺失 → `w:firstLine="420"`；
3. 空题干题渲染缺策 → 完形题号+选项同行（真卷形态），语法填空文后不出
   空题号行（print/DOCX 双面同策）。

教训入档：**渲染刀收官必须过实卷目检**——verify 能数 span 个数，数不出
"题号有没有压在线上"。QA 生成脚本可复用（会话 scratchpad
`gen-owner-qa-artifacts.mjs`，真 paper-2026-i 全组 + questionNumberStart=21）。

## 新账（收官时立）

- **七选五 A-G 候选句未入库**（paper-2026-i 数据缺口，导题工序的洞）：
  asset `content.blanks` 只有语法填空提示词，A-G 七句无处可寻，该卷七选五
  无法复原可作答卷面。补数据 + nck1 标准/validator 增强制字段。
- 写作框段首语印在框内（§8）：数据未暴露给渲染器，需动 `server/api.mjs`，
  小刀跟进（owner 拍板空框先行）。
- 部标题黑体范围（CR SW-B）：heading 字号未全部归一 10.5pt「不放大」，
  节/部识别粗粒度，跟进小刀。
- 完形选项行间距、洗卷重编号与文中挖空号对齐(组卷子集场景)——观察项。
