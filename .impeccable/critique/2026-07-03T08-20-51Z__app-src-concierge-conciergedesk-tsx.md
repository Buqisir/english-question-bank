---
target: AI 主线三面（取题台/草稿卷工作台/个人空间）复评
total_score: 27
p0_count: 0
p1_count: 3
timestamp: 2026-07-03T08-20-51Z
slug: app-src-concierge-conciergedesk-tsx
---
# Critique — AI 主线三面（AI 取题台 / 草稿卷工作台 / 个人空间）· 复评

Date: 2026-07-03 · 三路综合（A=设计评审 opus 源码冷读 + B=确定性检测 sonnet + 主 agent 真库浏览器走查），A/B 互相隔离后综合。
基线：27/40 @ 2026-07-03T06-01-35Z（刀④#228 审美打磨、刀⑤#229 诚实降级合并前）。

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | 系统状态可见 | 3 | 四态齐+aria-live；但提交清空 query，chip 回填后旧结果仍同屏（实测状态错位） |
| 2 | 贴近现实 | 4 | 术语泄漏治理范本级（reason.ts 剥 6 类管线标记）；weak 理由仍漏 token「主题、c」 |
| 3 | 用户可控 | 3 | 工作台删除有 8s 撤销 toast（基线缺项已修）；取题台无清空/重置出口，desk 加入后不可撤 |
| 4 | 一致性 | 2 | 病灶转移：slate 按钮墙已灭，但三面各一套裸 hex 色板（#24201b≠#1A1A1A 等）+ eyebrow 仍 slate #64748b |
| 5 | 防错 | 3 | 删文件有 confirm、删题组有撤销；删文件夹无二次确认 |
| 6 | 识别优于回忆 | 3 | 起始 chip 三态兜底（基线缺项已修）；无搜索历史，迭代靠记忆重打 |
| 7 | 灵活高效 | 2 | 零专家路径：chip 点击不触发搜索、无批量加入、结果行 article 键盘不可达 |
| 8 | 美学极简 | 3 | 取题台本身干净值 4；AI 模式 topbar 仍挂 6+ 无关按钮（移动端占首屏 370px、按钮断字） |
| 9 | 错误恢复 | 2 | 取题台已达 3-4（诚实三态+真空态可达）；但个人空间 502 生渲染「Failed to load My Space: 502」×2（实拍），工作台 10+ 处 error.message 直出 |
| 10 | 帮助文档 | 2 | 思考模式有说明句了（基线缺项已修）；仍无任务级引导 |
| **Total** | | **27/40** | Acceptable — 分数持平但构成换血：两个 P0（假命中/slate 门面）已灭，剩余是 P1 摩擦 + 新暴露的系统债 |

## 与基线的差异（刀④⑤ 的回执，真库实测确认）

- ✅ 假命中→诚实三态：乱码→真空态「没找到匹配」+起始 chip；弱命中→「没有精确匹配，以下是主题相近的题组」
- ✅ slate 按钮墙→暖 ghost（computed style 实测无蓝）；checkbox accent-color 赭红 #B8323C
- ✅ 占位符 #6B645C 硬编码达 5.73:1；思考模式说明句在
- ✅ 主 CTA「加入草稿卷」墨色填充，加入后变「✓ 已在草稿卷中」，双面计数同步
- ✅ 个人空间空态有出口「去组一份卷子」（A 路的"死胡同"判定已过时，浏览器证伪）
- ✅ 教师版真解析（iframe 内实测【答案】A+【解析】考查…，非存根）
- ✅ 移动端无横向溢出

## Anti-Patterns Verdict

- **LLM 判定（A）**：不是一眼假。真正的软肋是"三块面板出自三只手"：取题台走 token（#FFFDF8/#1A1A1A/#6B645C），草稿卷/个人空间走一套平行裸 hex（#f2f0eb/#24201b/#fbfaf7/#2f2a23/#746b60）——纸白、墨黑各差一点点，读作"合成感"。取题台推荐理由用 faint-ink #9A9180 斜体承载正文（DESIGN.md 明令禁止）。
- **确定性扫描（B）**：detect.mjs 0 findings（exit 0）。No-Blue 字面量仅剩经典区 workflow-card #2563eb；side-stripe ≥2px 共 8 处（经典区为主，6 处未溯源归属）；backdrop-filter 4 处全在经典区；z-index 干净；em dash 全在注释里；**reduced-motion 大缺口**：App.css 13 处 animation + 37 处 transition 只有 5 个 concierge 选择器有退化，MySpacePage 的 transition 零覆盖。
- **浏览器取证（主 agent）**：eyebrow「LOCAL-FIRST ENGLISH QUESTION BANK」computed color = rgb(100,116,139) = slate #64748b——**走 CSS 变量间接绑定，grep 抓不到，只有活体能抓**。展开的篇章卡左缘仍有色条（side-stripe 实拍）。overlay 注入跳过（共享 dev server），以 computed-style 实测代替。
- **三路交叉**：A 的"死胡同"被浏览器证伪（已修）；B 的字面量扫描漏掉 var 间接 slate（浏览器补上）；A 的色板漂移是本轮唯一新 P1，基线两轮都没抓到。

## Priority Issues

- **[P1] 三面色板漂移**：DraftPaperWorkbench.css / MySpacePage.css 整套裸 hex 平行色系（#24201b、#2f2a23、#746b60、#f2f0eb）vs token 系。老师跨面时纸白墨黑"差一点点"，直接削"可信"。修：纯映射替换到 DESIGN.md token，不动结构。→ /impeccable polish
- **[P1] 迭代搜索断裂**：提交清空 query（useConciergeDesk.ts:232,244）+ chip 只回填不搜（ConciergeDesk.tsx:146）+ 旧结果与新输入同屏。自然语言取题的核心是迭代逼近，现在每轮都要凭记忆重打。修：提交后保留 query；chip 点击直接搜。→ 刀⑥ 同刀带走
- **[P1] 生错误直渲染**：个人空间 502 双条英文生渲染（实拍）；工作台 10+ 处 error.message 直出。这是 audit P1-4 的存量系统病，本轮活体撞上。修：错误边界统一人话+重试出口。→ /impeccable harden
- **[P2] 推荐理由视觉降级+token 泄漏**：AI 的核心解释用 #9A9180 斜体（<4.5:1 风险）；weak 理由「可能相关：主题、c」把分词 token 漏给老师。修：升 #6B645C 去斜体；weak 理由改人话或并入维度词。→ /impeccable clarify
- **[P2] AI 模式 topbar 按钮墙**：6+ ghost 按钮与找题无关（App.tsx:3317-3412），移动端占首屏 370px 且按钮文字断字。修：只留 个人空间+切模式，其余收「更多」。→ /impeccable distill
- **[P2] 无障碍三缺口**：焦点环 rgba(26,26,26,0.08) 几乎不可见；结果行 article onClick 键盘不可达；reduced-motion 覆盖缺口（B 路量化）。→ /impeccable audit
- **[P3] eyebrow slate 残留**（var 间接绑定）；分页建议卡孤立 4px 圆角；iframe 预览无 loading 骨架；「自动保存」与卷名下拉配对歧义（基线遗留）。

## Persona Red Flags

- Alex（键盘流）：chip 点了不搜（期待点=搜）；无 / 聚焦、无批量加入（20 题组=20 次点击）；结果行 Tab 不到。
- Jordan（新手）：首屏 5 秒能懂"在这里搜题"（比基线强，chip 功劳）；「思考模式」仍是黑话；加入后无"去草稿卷看看？"闭环。
- Sam（无障碍）：#9A9180 正文级使用违自设 AA 门；焦点环不可见；难度色点 aria-hidden 但 pill 有文字兜底（尚可）；保存状态无 aria-live。

## Minor Observations

- 「最近草稿卷」下拉与「自动保存」label 的配对歧义仍在（基线遗留）。
- ConciergePaperRow badge 函数挂着 'paper'/'mixed' 死分支（"reserved for future intent"）。
- reason.ts mtime 5 月，晚于其余 concierge 文件两个月，覆盖面值得复查。
- concierge ::placeholder 硬编码 #6B645C 而 .ai-key-input 用 var(--muted)——Color-Lock 允许，但两种写法并存。
- dev 环境脚注：8787 被残留旧 API 进程占用时 dev.sh 的新 API 会 EADDRINUSE 静默死、vite 靠旧进程过健康检查——旧进程一死全站 502。

## Questions to Consider

1. 取题台清空 query 又不留历史——是有意"一次一搜"，还是没想清楚迭代才是自然语言检索的核心价值？（刀⑥ 应正面回答）
2. 草稿卷/个人空间的裸 hex 是"没来得及 token 化"还是有人真觉得 #24201b 更好看？前者是 P1 债，后者是 Color-Lock 被悄悄破了两页——得拍板。
3. 「思考模式」开关把"更准 vs 更慢"的技术权衡甩给老师——这是不是产品该自己做的决定？（key 接线挂账时一并想）
