---
target: 草稿卷工作台+个人空间 一致性审计
total_score: 26
p0_count: 3
p1_count: 5
timestamp: 2026-07-08T18-39-33Z
slug: app-src-features-draft-paper-my-space
---
# Critique: 草稿卷工作台 + 个人空间（vs 站内基准页一致性）

## Design Health Score（Nielsen 10）

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | 系统状态可见 | 3 | 自动保存状态语义色到位；A4 预览无页码交代 |
| 2 | 贴近真实世界 | 3 | 文案口吻好；outline 面包屑数据库腔 |
| 3 | 用户控制/自由 | 3 | 删除 8s 撤销好；my-space 用原生 confirm 双标准 |
| 4 | 一致性与标准 | 1 | 两页整体未接入 token 系统（55+24 处硬编码 vs 1 处 var()），基底色拿错，主按钮幽灵化，全局按钮类零复用 |
| 5 | 防错 | 3 | 空态禁用导出、disabled 齐全 |
| 6 | 识别优于回忆 | 3 | outline 信息够用，分页建议主动 |
| 7 | 灵活高效 | 3 | 拖拽+↑↓双通道；无快捷键无批量 |
| 8 | 美学与极简 | 1 | 灰压灰无纵深，墨绿签名近乎清零，my-space 大空面板 |
| 9 | 错误恢复 | 3 | describeError 统一文案 |
| 10 | 帮助文档 | 3 | inline 提示到位 |
| **Total** | | **26/40** | Acceptable（需显著改进） |

## Anti-Patterns Verdict

- LLM 评审：个人空间会被一眼认出"admin 网盘套壳"（左树+右列表+三幽灵钮），正是 DESIGN.md 明令拒绝的形态；工作台是"能跑没打磨"。病根不是用错颜色，是**抽干了墨绿签名**。
- 确定性扫描：detect.mjs 对两页和对照组均 0 findings（该检测器不查色彩纪律）；手工统计坐实——DraftPaperWorkbench.css 硬编码 55 处 vs var() 1 处，MySpacePage.css 24 vs 0；全局按钮类（.primary-button 等）两页零引用，全部自造类名。
- 反转发现（两路独立同结论）：对照页 paper-browse 自身 15/15 色值脱离 DESIGN.md（暖米色系）——归一目标是 DESIGN.md token 体系，不是 paper-browse。
- 浏览器 overlay：跳过（登录门禁+共享 owner Chrome），截图证据由 Assessment A 提供。

## Priority Issues

- [P0] D1 工作台 A4 纸面 box-shadow:none border:0 裸浮渐变桌上，纸与背景糊死 → 加 Resting 阴影 0 1px 2px rgba(30,30,28,.06)，去渐变桌。/impeccable polish
- [P0] D2 保存弹窗主按钮「保存」白幽灵与「取消」同权重 → 主按钮墨绿实心。/impeccable polish
- [P0] M1 个人空间 admin 网盘套壳、通篇零墨绿签名 → 信息架构重构或至少还回签名系统。/impeccable shape
- [P1] D3/D4/M2 两页全硬编码 hex + 页基底误用 #EDEDEA（应 #F6F6F4）→ 全量 token 化。/impeccable extract+polish
- [P1] D5 导出菜单原生 details，展开右侧溢出裁切 → 自定义浮层菜单。/impeccable polish
- [P1] M3 下载/打开/删除三连白幽灵，删除无 danger 语义 → 主操作墨绿、删除 danger。/impeccable polish
- [P2] D6 双层顶栏打架；D7 outline 三行灰面包屑；M4 原生 confirm；M5 双 20px 标题打架
- [P3] D8 渐变桌；M6 空态大片死白；#92400e 越板；纯黑阴影 rgba(0,0,0,.12) 应改 ink 系

## Persona Red Flags

- Alex：导出 details 无键盘导航且溢出；无批量/快捷键重排。
- Sam：disabled #9A9A93 对白 ~2.8:1 不达标；幽灵主按钮无非颜色冗余差异。
- 备课老师：纸面无阴影分不清纸与背景；my-space 是网盘不是"我的备课成果"，情感联结断裂。

## Minor Observations

- paper-browse/解析页的暖纸自洽+有阴影+有墨绿所以顺眼；修这两页别被它的暖色带偏。
- 分页提示用 warning 琥珀语义偏了（分页不是警告）。
- workbench 移动端断点用了 var(--line)——作者知道 token 存在，坐实"半接入"。

## Questions

1. 个人空间是"网盘"还是"我的备课台"？决定微调还是重构。
2. 工作台"桌面隐喻"保留做足还是放弃回归中性？现在两头不到岸。
3. 主按钮幽灵化是刻意省墨绿还是漏了？Green-Pen Rule 省的是装饰性墨绿，不是签名性墨绿。
