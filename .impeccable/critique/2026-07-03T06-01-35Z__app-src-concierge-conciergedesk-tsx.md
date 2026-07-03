---
target: AI 主线三面（取题台/草稿卷工作台/个人空间）
total_score: 27
p0_count: 2
p1_count: 2
timestamp: 2026-07-03T06-01-35Z
slug: app-src-concierge-conciergedesk-tsx
---
# Critique — AI 主线三面（AI 取题台 / 草稿卷工作台 / 个人空间）

Date: 2026-07-03 · 双路评估综合（A=设计评审 opus + B=确定性检测 sonnet，互相隔离后综合）

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | 系统状态可见 | 3 | 状态可见但不诚实：乱码也返回"命中" |
| 2 | 贴近现实 | 4 | 老师语言（命中N个篇章/学生·教师版），强项 |
| 3 | 用户可控 | 3 | 缺撤销删题组 |
| 4 | 一致性 | 2 | AI 页头部 slate vs 暖纸正文；同排三控件三种脸 |
| 5 | 防错 | 3 | 删题组无确认 |
| 6 | 识别优于回忆 | 3 | 空首页要老师凭空造查询 |
| 7 | 灵活高效 | 2 | 零键盘效率线索 |
| 8 | 美学极简 | 3 | 草稿面克制耐看；首页"空"≠"简洁" |
| 9 | 错误恢复 | 2 | 真空态几乎不可达（永远兜底） |
| 10 | 帮助文档 | 2 | 思考模式/AI 导题零解释 |
| **Total** | | **27/40** | Acceptable（草稿工作台单独可到 33+，门面拖分） |

## Anti-Patterns Verdict

- **LLM 判定**：草稿卷工作台=North Star 真身，无 AI 味；AI 取题台在两点被一眼看穿——裸原生 checkbox「思考模式」+ 六个 Tailwind slate 默认三件套头部按钮插在暖纸里。
- **确定性扫描**：detect.mjs 0 findings（exit 0）。grep 证据：9 处 side-stripe ≥2px（7 处经典模式区 var、2 处硬编码 hex App.css:4740/4774 在主线卡片上）；0 gradient text；5 处 uppercase（均为小 label，合规）；0 z-index 999。
- **overlay**：跳过（共享 dev server），fallback=CLI-only。
- **双路交叉**：A 的 P0-1（slate 头部）检测器抓不到（它是 token 绑定问题非 pattern）；B 的 side-stripe 硬编码两处 A 未单独点名——并入刀④清理；B 的经典模式 workflow-card（#2563eb 蓝 + backdrop-filter 玻璃拟态）与 A 的清退建议一致。

## Priority Issues

- **[P0] AI 取题台头部整排 slate（No-Blue 铁律违反）**：`.ghost-button` 吃 `:root` 的 slate token，`home-mode-ai` 未 re-scope。修：AI 模式作用域内重绑暖 token，:root 不动（护经典回归）。
- **[P0] 检索无声降级"假命中"击穿信任**：乱码返回 3 条自信"命中"；真空态不可达。修：匹配分阈值+诚实降级文案+真空态可达（→ 刀⑤，搜索行为面）。
- **[P1] 主 CTA「加入草稿卷」幽灵化**：与次操作等权、「解析」还是下划线 a。修：主操作墨色填充（button-primary 规范），次操作统一 ghost 形态。
- **[P1] 主输入框占位符 3.07:1**：#9A9180 违反自定 AA 门。修：#6B645C（5.73:1），一行。
- **[P2] 首页"空"+裸 checkbox**：默认 feed 是 I16 已批方向（大活，另立刀⑥）；checkbox 本轮修（accent-color 暖化+说明）。
- **[P3] 个人空间空态死胡同；移动端 A4 预览左缘被裁**。

## Persona Red Flags

- Alex（键盘流老师）：零键盘线索；假命中逼他逐条核对反而更慢。
- Jordan（新老师）：落地空白页全程在猜；思考模式无解释；空间空态死胡同。
- Sam（无障碍）：占位符 3.07:1；基础语义（aria-live/label/landmark）意外地好，加分。

## Minor Observations

- 「自动保存」label + 卷名下拉的配对有歧义（实为最近草稿卷切换器）。
- 导出 details/summary 与墨色按钮交互模型不一致（可接受）。
- 经典模式 workflow-card：#2563eb border-left + backdrop-filter，双违反，入清退清单。

## Questions to Consider

1. 无 key 时"AI 取题台"名不符实——外壳与里子的诚实性（刀⑤部分回应；key 接线在挂账）。
2. slate 头部是"没改完"不是"不敢改"——升格为上线阻断项（本轮刀④修）。
3. 草稿工作台的设计语言反向输出给首页 = 修 P0 最短路径（刀④采用）。
