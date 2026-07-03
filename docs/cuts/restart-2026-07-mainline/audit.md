# 重启体检报告 — 主线体验（找题 → 组卷 → 导出）

Date: 2026-07-02 · Auditor: 小川 (main agent walkthrough + 3 路 subagent 代码审计)
Baseline: main @ bf44f01, verify-ci 全绿, 浏览器 console 零报错

## 怎么体检的

以一个真老师的动作走通全链路：自然语言搜"生态主题 C 篇" → 展开题组 →
加入草稿卷 → 打开草稿卷工作台 → 导出 PDF。再用思考模式搜一句自然语言。
代码层由 3 个审计 agent 佐证（搜索链路 / 草稿卷双面 / 全界面盘点）。

## 体检结论（一句话）

**组卷和导出的骨架是好的（A4 预览、学生卷 PDF、解析面都能打），
但"找题"这个主线入口在自然语言输入下基本失灵，且"草稿卷"存在两个
互不相通的同名面，老师会以为选题丢了。**

## 发现（按严重度）

### P0-1 自然语言找题失灵 — 分词器够不着 topic label

- 实测：搜「生态主题 C 篇」→ 推荐理由「匹配关键词：c、篇」→ 首位结果是讲
  fake reviews 的文章；搜「找一篇讲环境保护的阅读，中等难度」→ **0 结果**。
- 根因（audit-A）：`conciergeSearch.ts:86` `tokenize` 只按空白/标点切，
  CJK 连写不切分 →「生态主题」整词对 label 串
  `人与自然-自然生态-生态环境` 做 `includes` 永远失败。topic label
  已在 haystack（`:133`）但查询词够不着它。命中的 c/篇 与主题词等权
  （`:161`），同分退回 year DESC。
- 数据侧：26 个题组有「生态」标签；但全库 topic label 覆盖仅 126/273
  (~46%)；`difficulty` 字段全库统一 `medium`（无区分度）。
- 思考模式：2 次串行 DeepSeek、前端 6s 超时极易静默回落本地；且
  实测显示「没填 AI 密钥」——服务端 .env 有 key，但链路由前端持有的
  key 决定，老师没在 UI 里填过 key 就永远走本地弱链路。

### P0-2 两个互不相通的「草稿卷」— 老师会以为选题丢了

- 实测：结果卡点「加入草稿卷」→ 顶部 chip「当前草稿卷 · 1 组」（真
  Draft Paper，落库 POST /api/draft-papers/current/items 201）；但右下角
  浮动按钮「已选 0 题组」打开的是另一个也叫"草稿卷"的抽屉（旧 Paper
  Set 语义：题集标题/学生版教师版/试卷版讲义版），计数独立、互不相通。
  同屏可见 1 vs 0。
- CONTEXT.md 明确 Draft Paper ≠ Paper Set ≠ Assembly Basket；两面并存
  且共用"草稿卷"名字，违反自家 glossary。
- （audit-B 补充收敛方案，见下）

### P1-1 Draft Paper 工作台没有教师版出口

- 工作台导出只有：下载 PDF（学生卷）/ 浏览器打印 / 保存到个人空间。
- PRODUCT.md 的核心承诺是「导出学生版**和教师版**」；教师版开关只存在
  于旧抽屉（P0-2 那个收不到题的面）。主线走通的人拿不到教师版。

### P1-2 找题结果卡片信息密度低

- 卡片标题截断（"2026 年· 浙江 2026年1月浙…"），不显示 topic label、
  难度、篇位等已有维度；推荐理由是技术腔（"匹配关键词：c、篇"）。
  老师无法在列表层判断哪道题值得展开。

### P1-3 AI 能力的 Key 配置与使用场景割裂（audit-C）

- DeepSeek Key 输入/模型选择/推理开关**只在经典模式顶栏渲染**
  （App.tsx:3322-3352）；AI 取题台（默认首页）没有任何 key 配置入口，
  思考模式静默降级本地弱链路，打标按钮失败原因藏在 tooltip 里。
- 服务端 .env 有 key，但前端链路不知道——两套 key 体系没有对齐。

### P1-4 报错直渲染 + 危险操作无确认（audit-C，系统病）

- `error.message` 生渲染 50+ 处（App.tsx 30+ / MySpacePage 6 /
  DraftPaperWorkbench 10 / PaperImport* 8），英文技术报错直接给老师看。
- 删除题组（App.tsx:2294，catch{} 静默吞错）、删除导入文件（:1912）
  均无 confirm、失败无提示。
- 经典模式筛选列表无空态（App.tsx:3784）；AI 导题暴露原始 JSON
  （PaperImportAiWorkbench.tsx:139）。

### P2 杂项（walkthrough 所见）

- 解析面（Paper Surface C4）质量很好（证据高亮/答案依据/同义替换），
  但底部题目面板文字有左侧截断（"ich aspect..."，疑似 panel 布局裁剪）。
- Draft Paper 工作台顶部控件在桌面宽度下仍是移动式的全宽竖排。
- 首页在无结果时缺乏引导（"没找到匹配。可以换个说法…"之后没有可点的
  后备动作，如浏览全部/按卷浏览）。
- 搜索提交后输入框清空，老师无法微调重搜。

## 审计报告出处（三路 subagent，结论已吸收进本文件与 plan.md）

- audit-A 搜索链路诊断（opus）：P0-1 根因（tokenize:86 CJK 不切分 /
  等权计分:161 / 26 组生态 label 可达性 / label 覆盖 126/273）；
  思考模式 = 2 次串行 DeepSeek + 前端 6s 超时易静默回落。
- audit-B 草稿卷双面收敛（opus）：P0-2 是接线错误非数据丢失
  （onAdd 写 server draft，浮动按钮读 localStorage basket，
  App.tsx:3775/1389 vs :5657）；教师版/讲义版/DOCX 服务端渲染现成
  （print-renderer.mjs:34 isTeacher 分支），Draft Paper 只是写死参数
  （draftPaperStore.mjs:103-105,:597）；退役成本大头在旧面独有的
  每题分值/小节标题/保存题集（Paper Set 语义），已定延后为独立产品决策，
  classic 模式旧抽屉暂留。
- audit-C 界面地图+速赢清单（sonnet）：全视图地图（14 面：主线 11 /
  支线 2 / demo 残留 1）；经典模式未死——结构化五维筛选与 AI Key 配置
  的唯一入口；速赢清单 10 项见下；App.tsx 巨块记录
  （最大三块：handler 群 1295-2680、detail 视图 3858-5115、
  导入模态 5679-6592，仅记录不动）。

## 速赢清单（audit-C，挂账 follow-up，本轮不做）

1. 经典列表补空态（App.tsx:3784）
2. 删除题组 confirm + 失败提示（App.tsx:2294）
3. 组卷失败 alert 换人话（App.tsx:1385）
4. AI 模式打标失败原因可见（App.tsx:3391）
5. ConciergeDesk loading 态"取题中…"（ConciergeDesk.tsx:93）
6. AI 导题隐藏原始 JSON（PaperImportAiWorkbench.tsx:139）
7. AI 导题跳过项截断（PaperImportAiWorkbench.tsx:926）
8. 草稿卷下拉补 catch/disabled（DraftPaperWorkbench.tsx:391）
9. PI 报错去内部术语（PaperIntelligencePreview.tsx:153/216）
10. 删"后续会支持拖拽"承诺文案（App.tsx:5718）

## 刀法（本轮落地 1-2 刀，中规模授权）

见 plan.md。候选排序：
1. **刀①「让老师用人话找到题」**：修 tokenize CJK + topic-label 拆段
   进 haystack + 加权排序（topicLabel > 篇位 > 年份 > 泛词）+ 本地
   结构化 intent 解析（年份/篇位/题型/地区正则）。零 LLM、零延迟。
   （audit-A 的 S+M 方案）
2. **刀②「一个草稿卷」**：按 audit-B 结论收敛双面 + 教师版出口补进
   Draft Paper 工作台（若成本过大则先做最小防迷惑修复）。

## 结案（2026-07-02/03）

两刀均已合并，主线体检 P0 双双关闭：

- **刀① #226**（`feat(concierge)` @ 6169ace + 返工 c07d069）：真库 QA
  全过——「生态环境 阅读」→ 讲生态环境的 D 篇；「生态主题 C 篇」→
  纯阅读 C（生态题真库集中在 D 篇，兜底正确）；「2025 浙江卷」「七选五」
  硬过滤精准；「找一篇讲环境保护的阅读，中等难度，近三年」→ 环境类
  近三年题正确排序；英文 reading C 无回归。CR 冷读 + 返工增量复核双
  APPROVE（cr-1.md，54 断言入 CI）。返工修复三缺陷：中文「X 篇」篇位
  解析、topic-label 段前缀匹配（杀死 生态→人生态度 误命中）、维度命中
  不套「讲X的」文案；顺带发现并修复无 key 主路径完全不做维度过滤的
  存量缺陷。
- **刀② #225**（`feat(draft-paper)` @ 549c6ee）：浏览器 QA 全过——AI
  模式双面计数同步、浮动按钮直达工作台、教师版预览/PDF 含答案、学生版
  零泄漏、classic 旧抽屉无回归。CR 冷读 APPROVE（cr-2.md）。

## 第二轮结案（2026-07-03，刀③④⑤）

- **刀③ #227 教师版真解析**：导出时 paper-assets 内存 join 四题型（31 套
  全覆盖），零 DB 写（ADR-0008），学生版 byte 级不变（CR 独立 harness）。
  活体验证：教师版【解析】已是真讲评。挂账 #1 销账。
- **刀④ #228 主线审美打磨**：critique 27/40 的 P0-1/P1×2/P2/P3 修复——
  AI 头部去 slate（:root 零改、经典模式 computed-style 实测不变）、主 CTA
  墨色化、占位符 3.07→5.73:1、思考模式说明句、空态引导、移动端预览缩放
  + 窄屏 paper-row 竖排修复（主 agent 终审追加）。GitHub API 故障走本地
  squash（PR 已补关）。
- **刀⑤ #229 诚实降级**：乱码假命中治理（原返回 3 条自信"命中"→真空态
  +起始 chip）；三态诚实文案；weak 理由「可能相关」+碎片过滤。CR 两轮
  （round-1 抓出噪声地板误杀无空格真实查询的 Must Fix→DEV 用全 haystack
  DF+跨 run 多信号返工→round-2 变异测试后 APPROVE）。断言 85+230。
- 复评待办：下轮开工时重跑 /impeccable critique 看 27/40 涨幅。
  **→ 已做（2026-07-03，见下"第三轮"）。**

## 第三轮结案（2026-07-03，critique 复评 + 刀⑥）

- **impeccable critique 复评**（.impeccable/critique/2026-07-03T08-20-51Z__*.md，
  三路：opus 冷读 + sonnet 检测 + 主 agent 真库走查）：**27/40 持平，P0 2→0**。
  刀④⑤ 行为真库实测全部确认（诚实三态/真空态可达/暖化/教师版真解析/
  空态出口）。分数没涨是因为冷眼挖出基线没抓到的新问题（见新挂账）。
- **刀⑥ #230 首页默认 feed**（`feat(concierge)` @ ae48624）：空态/真空态
  渲染按卷分组浏览 feed（44 套 · 287 篇章，year DESC，8 套帽+显示全部）+
  chip 直搜 + 提交保留 query + eyebrow 去 slate + feed 行去「命中」搜索腔
  （variant=feed）。CR 冷读 APPROVE（六变异全抓红，断言改动逐条裁定合法，
  docs/cuts/home-default-feed/cr.md）；真库 QA 全过；37+230+85 断言绿。
  critique 的「识别优于回忆/美学极简/迭代搜索断裂」三项 backlog 一刀带走。

### 第三轮新挂账（按优先级）

1. **P1 三面色板漂移**：DraftPaperWorkbench.css / MySpacePage.css 整套
   裸 hex 平行色系（#24201b≠#1A1A1A 两种黑、#746b60≠#6B645C、#f2f0eb、
   #2f2a23）。跨面"差一点点"读作拼凑。修法=纯映射到 DESIGN.md token，
   不动结构。独立小刀。
2. **P1 生错误直渲染实锤**：个人空间 502 双条英文生渲染（真库实拍）；
   与首轮挂账 P1-4（50+ 处 error.message）同病，建议统一错误边界刀。
3. **P2 推荐理由视觉降级**：#9A9180 斜体承载正文（DESIGN.md 明令禁止）；
   weak 理由「可能相关：主题、c」泄漏分词 token。
4. **P2 AI 模式 topbar 按钮墙**：6+ ghost 按钮与找题无关，移动端占首屏
   370px 且按钮断字。收「更多」菜单是经典模式器官移植刀的一部分。
5. **P2 无障碍三缺口**：焦点环 rgba(26,26,26,0.08) 几乎不可见；结果行
   article onClick 键盘不可达；reduced-motion 只盖 5 个选择器
   （13 animation + 37 transition 未盖）。
6. **small verify-c6a10 陈旧断言**：`refresh API load preserves missing
   sample groups` 在 main 基线即红（App.tsx call-site drift），非功能病。
7. CR SW：feed 的 useState 断言名 "only" 强于正则（可加固）；chip 直搜无
   in-flight 锁（键盘捷径刀时一并补）。
8. dev 环境脚注：8787 被残留进程占用时 dev.sh 的 API 会 EADDRINUSE 静默
   死、vite 靠旧进程过健康检查——旧进程一死全站 502。dev.sh 可考虑
   fail-hard。

### 第二轮新挂账

- SW-3：aggregatePaperResults 不读 hit.weak，混合卷行头措辞可与通知条
  不一致（cr-5）。
- DF 粗地板残差：~270 组语料下，孤词（DF 1-2 且无伴随信号）会被当噪声
  （DEV 自报，随库增长自然缓解）。
- C8 render-model 守卫的 allow-list 需在下次动 print-renderer 时同步维护
  （cr-3 SW-1）；教师版切换后编辑预览静默回退（cr-2 SW-1）仍在。

### 挂账清单（首轮记录，按优先级）

1. **导入真题的教师版【解析】是元数据存根**（QA 新发现）：教师版 PDF
   里逐题解析渲染为 `paperId=...; assetVersion=...`——导入卷的真解析在
   文件型 paper-assets（ADR-0010），DB 字段只有出处存根。教师版要好用，
   需要导出链路接 paper-assets 解析或至少隐藏存根。**建议下一刀做。**
2. topic label 覆盖 126/273 (~46%)：回填走 I17 管线（scripts/import-pipeline）。
3. 思考模式 key 接线：服务端 .env 有 key 但链路由前端 key 决定；Key
   配置入口只在经典模式（P1-3）。
4. 速赢清单 10 项（已挂 spawn_task chip）。
5. CR Should Watch：教师版切换后编辑题目预览静默回退学生版（cr-2 SW-1，
   PDF 不受影响）；「保存到个人空间」固定学生版（cr-2 SW-2）；topic
   前缀匹配的 suffix 召回收窄（cr-1 SW-4）等，见两份 cr 文件。
6. 难度维度残废（全库 medium）：接 reading signals 是 L 级独立刀。
7. 找题结果卡片信息密度（P1-2 部分已被刀①的 topic chip 缓解，
   截断标题等仍在）。
