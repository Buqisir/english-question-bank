# 当前状态（medium / large cut 收官时更新）

Last updated: 2026-07-08（UI 整改日：四刀+基建，三刀并行 worktree）

## 现在是什么

- **已上线** https://eqbank.cc：邀请制登录（ADR-0012）、owner/member
  两档（ADR-0013）、用户数据隔离（ADR-0014）、AI 全局日限额（M0-5）。
  香港轻量云单机 + Caddy + systemd + R2 每日备份（launch-deploy）。
  服务器实况见 `docs/cuts/launch-deploy/go-live-record.md`。
- **产品分界**（ADR-0015/0016）：生产在后台 Agent，网站只消费
  （找题 → 看题 → 组卷 → 导出）。网站端导题 UI 已全部退役
  （PR #263-265）；后端分析器作为库函数保留给离线管线。
- 节奏（launch-roadmap）：M0 五刀 ✅ → M1 部署脚手架 ✅ → M1 go-live
  ✅（2026-07-07 已核实补档，见下）→ **当前处于 M1「owner 独用」阶段**
  → M2 = 邀 2-3 位同事。
- go-live 已核实（2026-07-07，小川经腾讯云 TAT 只读核实，
  `docs/cuts/launch-deploy/go-live-record.md`）：Node v24.18.0 无需
  `--experimental-sqlite`、eqb+Caddy active、enforced 模式（1 owner /
  0 member）、R2 备份 cron 每天成功推送（1016 对象/50MB）。**动生产的
  红线已解除**。生产部署 commit 已于同日 data-orphan-cleanup 收尾时
  推进到 `4ff8c3b`（与 main 同步，含 #263-268）。

## 主线焦点

- 2026-07-10：**similar-rail（E2）收官**（merge cb35cd3，CR APPROVE 0 MF，
  主代理复核 184+72 绿）：讲评栏「配相似」CTA + 右栏原地结果态 + 勾选
  乐观入草稿卷，主打功能一条龙首次可用。CR 亮点：SW-1 用 label 黑名单
  优于 plan 的 kind 白名单（裁定入 cr.md）。SW 挂账：新 reason kind 默认
  渲染、FE 配方文案表可漂移、DEV 未打 checkpoint（流程提醒）。owner QA
  待做。下一步：E3 次入口+concierge 换引擎；fig-token P0 / 解析字段
  roadmap 待 owner 拍板。
  （merge 3871421/efcc40e，双 CR APPROVE 0 MF，主代理复核 29+20+73 绿）：
  相似题引擎 API 落地（零 AI 确定性配方打分，复用 i16a）；草稿卷
  student_label 种子字段（懒 ALTER 迁移，卷面硬边界双层封锁+CR SW 直收
  扩 backstop，owner QA 过 2026-07-10）。CI 插曲：新 verify 缺 off-repo fixture 守卫致一次真红，
  已补 exit-2 SKIP 惯例（5ee053b）。E2 plan 已就位（e2e38ad，吸收 CR 三条
  硬交接），owner 拍板开刀施工中。
  program：docs/cuts/similar-questions/（七问 grilling 全落锤，原型入档）。
- 2026-07-09：**scissor-select-feel 收官**（merge 066c5e2，CR APPROVE 0 MF，
  worktree 复核 177+70 绿）：剪刀线零占位（16px 标准节奏回归+静息减墨
  0.18）、hover=通宽墨·淡选区罩（teal-600 2%，owner 原型四裁点拍板，
  prototype.html 入档）、操作簇 sticky 跟随。**owner QA 过**（2026-07-09，
  含 Should Watch 两项：高单元 sticky 初始位、窄屏 band 贴边）。详见 cut 目录。
- 2026-07-09：**one-sheet-paper 收官（毛边⑤）**（merge 8388b4d，fresh CR
  APPROVE 0 MF，verify-paper-browse 177 绿 + 主树 verify:all 71 绿均主代理
  亲跑复核，owner 实测待做）：整卷页卷面合成单一白纸容器（题组独立白卡
  退役，阴影只打整纸一次），节标题/指导语进纸内换卷面字体；九道剪刀线
  语义落地（阅读四篇每篇字母前一条、单组节在节标题后指导语前且指导语
  并入题组 hover/剪走单元、writing 组走 CSS 兄弟选择器零碰 forbidden）。
  判定纯按「节下题组数」不 hardcode groupType。QA 截图 6 张入 cut 目录。
  插曲：DEV 中途机器死机重启，worktree 半成品完整存活，续派 DEV 补
  verify 断言 44-52 收尾。CR Should Watch 挂账：① --ps-page-width/--ps-ink
  两 var 未注入恒走兜底（视觉对但非 token 驱动）；② 指导语并组依赖
  「紧邻」，新卷导入若夹入其他 block 会退化（当前数据无此形态）；
  ③ 写作组 hover 提亮含节标题行（已披露取舍）。
  - 新方向讨论中：**草稿卷去篇章字母**（owner 提议，2026-07-09）——草稿卷
    =练习单非仿真卷，A/B/C/D 是源卷结构属性不该带走；改大题号徽标+题型
    标签。小川同意方向；编号语义 owner 已拍板=**大题序号连续 1、2、3…**
    （小题号全卷另行连续），七选五 A-G 选项字母与整卷页居中字母不在
    范围。排队在 UI 队列后，待写 plan 开刀。
- 2026-07-09：**flow-panel 刀 3 收官**（merge 2c42e29，fresh Opus CR
  APPROVE with should-fix 零 Must Fix，verify:all 70 绿 + 主代理
  Playwright 补验 13/13，main CI 绿 run 29013048718）：入口带态（详情/搜索卡
  「看解析」→整卷页讲评态+锚定+预选题，`buildPaperBrowseLectureHref`
  前端换算，server 零改动）+ URL 契约（lecture/questionId 进 URL，
  replaceState 同步，刷新/分享还原姿态）+ App 级 popstate 落地
  （Back/Forward 四路由同步，PI/reading-analysis 走 reload 兜底）+
  七选五高亮/证据连线样式抽共享（paperSurfaceLectureHighlights.css
  单源，手抄副本销）+ 小尾巴三清（scrollspy 临界去抖/深链沉降期点题
  竞态抑制/窄屏空态文案）。老解析页 URL 直达保留，页内入口已全迁，
  退役与 reading-analysis 孤儿支同刀（挂账）。CR Should Watch 挂账：
  ① verify-c6a3 一条断言基线已 stale 且未注册 CI（tiny fix 另刀）；
  ~~② 七选五深链只预选不展开手风琴~~（owner QA 后拍板即修，追刀
  00c6f13：选中七选五题自动展开该题衔接链，append-only 手动开合照旧，
  页面外控 state 面板零触碰，Playwright 4/4+截图）；③ owner PO QA 建议
  覆盖窄屏抽屉+触屏。**flow-panel 三刀全收，owner QA 过**。事实澄清：
  卷面上七选五的空本不可点（无 stem/空为纯 span），七选五选题入口
  =深链+面板内开合，深链修复即闭合全部缺口。
  - **生产已部署 d2194d8**（owner 拍板，2026-07-09）：pull→装依赖+build
    →restart 分步流程；eqb+caddy active、health 200、eqbank.cc 200
    （服务器侧+本地双测，新 bundle hash 已上线）、
    verify-paper-assets-consistency 生产实跑 169/169 绿。带上=刀3+
    七选五追刀+CI paths-ignore。当日 GitHub runner 饿死三连均为假红
    （签名：runner=none 零步骤 15min 超时，rerun --failed 单踢即绿）。
- 2026-07-09：**双刀收官——flow-panel 刀 2 + home-editorial**（owner PO QA
  「过」，merge bb1ac30+e07f755，verify:all 71 绿，CI 待确认后此条销）：
  - **flow-panel 刀 2**：讲评栏=解析页五面板真身搬家+点题联动（点卷面
    题→右栏解析；点面板证据→卷面高亮）。owner 实测两轮修复补齐卷面
    显影层：七选五衔接句五色高亮、阅读证据滚动+跨栏虚线（含干扰项
    琥珀线）。**卷面显影原则**入 plan（阅读=动线/原位型=证据高亮/
    七选五=衔接句高亮）。窄屏蒙层改纯视觉暗化（点题穿透，CR 裁定正确）。
  - **home-editorial 两轮**：找题页「开门见卷」——命令行（搜索+思考
    模式+筛选折叠+库存计数一行）+ 年份分组档案（整年份组分页，组头
    真值计数）+ 试卷行编辑化（宋体卷种签名/主题升位/题型串退役）+
    展开态卷面目录（九宫卡阵/绿边条退役，悬浮操作簇）。审美章程
    （签名唯一/结构编码真相/好默认）入 plan；「UI 刀先装审美 skill」
    成惯例。CR M1（组头计数失真）主代理收口。
  - 挂账：七选五高亮+连线样式为 harness css 手抄副本→刀 3 抽共享；
    2026-i 语法填空 `__NN__` 点空不着（数据形状，入数据健康清单）；
    scrollspy 跨组临界抖动+把手偶发首点（刀 3 顺手）；讲评面板手机
    空态文案。**教训**：显影层 parity 须列显式验收项；source-grep
    断言可固化错误行为，数据真实性优先行为/夹具断言。
  - 下一刀：flow-panel 刀 3（入口带态+链接迁移+URL/popstate+样式
    抽共享+小尾巴清单），owner 定下会话做。
  - **生产已部署 95dffc5**（owner 拍板，2026-07-09）：pull→eqb-build→
    restart 分步流程；eqb+caddy active、health 200、eqbank.cc 200
    （服务器侧+本地双测）、verify-paper-assets-consistency 生产实跑
    169/169 绿。CI 插曲两则记录在案：e2e 冒烟没跟上悬浮显形（修=先
    hover）；GitHub runner 饿死致 e2e 15min 超时假红（rerun 即绿，
    诊断依据=job runner_id:0 零步骤执行）。
- 2026-07-09：**flow-panel 刀 1 收官**（merge 7c89222，CR APPROVE，main CI
  绿）。整卷页一页两姿态骨架落地：rail 贴左+卷面居中+右缘讲评把手+右栏
  组级速览（scrollspy 跟随答案行/深读链接），窄屏抽屉+触屏主代理
  Playwright 补验 11/11（DEV 沙箱缩不了视口，QA 记录в qa-notes.md）；
  CR should-fix 主代理直收（Esc 关讲评+还焦，f654137）。**待 owner 实测
  手感后再开刀 2**（点题联动+五面板搬家）。并行新刀 **home-editorial**
  方向已过（找题页试卷行+展开态卷面目录化，方向稿 artifact v2），卷种
  标注三候选待 owner 拍板后写 plan；「UI 刀先装审美 skill」入记忆与惯例。
- 2026-07-09：**flow-hover Chunk A 收官 + Chunk B 撤刀改道 flow-panel**。
  - Chunk A（整卷页流式化+悬浮显形+rail scrollspy+触屏兜底）合并
    93bc7d4，CR APPROVE，main CI 绿。题组卡头部退役，卷面连续。
  - Chunk B（尾部解析杆）施工完成后 owner High 档定向**撤刀**：每组
    一根杆重新切碎卷面。分支 7c13124 留档（答案行逻辑供移植）。
  - 新方向 **flow-panel 三刀**（owner 拍板，`docs/cuts/flow-panel/plan.md`）：
    整卷页一页两姿态——挑题态（rail 贴左+卷面居中）/讲评态（右栏解析
    整条，宽度恒定，复用解析页五面板）。开关选姿态、点题选内容；
    刀 3 入口带态（详情/搜索「看解析」→讲评态锚定），链接迁移后老
    解析页退役（备用牌：聚焦态）。刀 3 顺路承载 popstate/URL 债。
    UI 轨队列相应更新：flow-panel 刀 1→2→3 替代原 flow-hover 后续。
- 2026-07-09（UI 整改日második波：owner 边用边报，五刀+一事故）：
  - **生产导出 PDF 事故闭环**：根因=生产机从未装 zip/LibreOffice/CJK 字体
    （DOCX→PDF 线自 go-live 起断路，E2E 走 vivliostyle 线未暴露）。已装
    +QA 实测 200/%PDF/中文正常，依赖清单入 go-live-record 追记。挂账：
    health 暴露导出线就绪状态。
  - **解析卡信息分层三连**（owner 逐层拍板，主代理直修 small）：考点框架
    折叠（3f97eab）→ 解题提示完形/语法双砍（数据保留）→ 匿名「展开细节」
    抽屉退役，证据定位改命名折叠（7dfd55b）。设计原则落地：**折叠条必须
    有名字**。挂账：M2 邀同事前给考点框架加一行白话导语。
  - **seven-options-on-paper**（合并 9d75efb，CR APPROVE 纯加零删）：
    七选五卷面正文后渲染 A-G 选项池（纯展示零交互），PaperSurface 层
    实现→整卷页自动继承。DEV 顺手实证一个**既有**导出 bug：print/DOCX
    七选五把 A-G 池按小题重复 5 遍（挂账另刀）。
  - **add-to-draft-feel**（合并 f8e03b3，CR APPROVE）：owner 报障加题
    1-2s 才反馈→乐观翻转+失败回滚+后台对账；draftPaperStore 注入批量
    print-ready（5 题 81ms→27ms）。销 #276 旧账（详情按钮不刷新）。
    CR Should Watch：快速分次连点+GET 乱序的自愈型瞬时闪回。
  - **section-chrome-on-solo-surface**（合并 27d06cb，CR-lite）：解析页
    单题组卷面回溯渲染节标题+指导语（全题型统一，writing 走既有机制），
    治"纸空落落"。owner 同议题裁定：语法填空不撑 A4 高度（屏幕面高度
    随内容，A4 归导出面）。
  - **流程事故落账**：七选五 DEV 在主树建分支污染主代理提交（已复位，
    文件零写入）；后续派工 prompt 已写死 worktree 纪律（pwd 确认+禁碰
    主树路径），AGENTS 待补硬条款。主代理同款教训：合并必须在主树执行。
  - **UI 一致性双刀收官+部署 455fc16**：impeccable 双路审计（26/40，
    快照 .impeccable/critique/）→ owner 三板（个人空间=备课成果卡片架/
    暖纸边界入 DESIGN.md/P0+P1 全做）→ 并行双刀均 CR APPROVE：
    ① draft-workbench-visual-unify（A4 纸 Resting 阴影、保存主按钮
    墨绿、hex 51→3、导出菜单浮层化）② my-space-shelf（网盘→卡片架、
    文件夹降 filter chips、danger 语义+自定义 alertdialog、hex 归零；
    弹窗键盘 should-fix 主代理收）。两刀各挂 palette-hex=0 CI 护栏。
    prod 三重验证绿。挂账：paper-browse 壳层暖米收编、smoke-c8-my-space
    孤儿脚本、faint-ink token 缺位、rename/deleteMySpaceFolder 孤儿
    export。纪律：my-space DEV 违规自 push+开 PR（#284，代码无碍已
    合并收编）——派工 prompt 约束再加固。
  - **1.0 盘点+方向讨论**（owner 发起）：主线四步（找题→看题→组卷→
    导出）全部闭环。小川建议 M2（邀同事）提前于配相似，owner 未拍板，
    待 High 档深聊。

- 2026-07-08（UI 整改日，四刀+基建，性能/入口/精美化三刀并行 worktree）：
  - **幽灵样例题组**（7e56e30）：硬编码 sample 不再混入正式列表，仅留
    离线兜底；库内 48 个 0 题题组全为写作类（按设计），无脏数据。
  - **list-groups-perf**（合并 1a8438f，CR APPROVE）：/api/question-groups
    3.9s→55ms——print-ready 批量化（一条 IN SQL + 一次资产扫描），杀掉
    N+1 与每请求 ~3GB 的 paper-asset 重复解析；parity 273/273 挂 CI
    （verify-list-groups-perf）。剩余卡顿=owner 至香港节点线路波动，
    代码无可治。
  - **简介折叠**（2134e3e）：完形/语法填空解析面板篇章简介 details 化，
    聚焦空后自动收起。
  - **paper-row-browse-entry**（合并 a5e7d8a）：首页卷行「看整卷」入口，
    href→paperId 解析收敛 concierge/paperSurfaceHref.ts。
  - **cloze-panel-polish**（合并 53b77f0，CR APPROVE+should-fix 已修）：
    pi-cloze/pi-gf 从零补全 CSS 对齐七选五 idiom；信息分层（证据+提示
    折进「展开细节」）；证据类型中文 chip 映射（cloze 5/gf 12，owner
    可复核文案）。解析内容层复读（同一考点三遍）属导题 prompt 层，
    另立刀。
  - 基建：`scripts/setup-worktree.sh` worktree 一键预热（入 AGENTS
    并行段）。流程教训：DEV 自报 verify 绿需主代理复核证据；verify
    命令禁 `| tail` 吞退出码。
  - **生产已部署 b391f20**（2026-07-08 晚，owner 拍板：2026卷+刀⑤+刀A/B+本日四刀一次上线）：prod 三重验证绿（login 200、question-groups ttfb 6.0s→0.14s、homepage 200）。遗留 worktree 大清理同日完成（9 worktree+合并分支全删，3 份未落账 cr.md 已抢救归档；31 个含未合并提交的老分支留待逐判）。

## 上一轮

- 2026-07-08：**双刀并行收官**（首次并行流水线试跑成功，worktree 隔离，
  各自 PA-lite/plan→Sonnet DEV→fresh Opus CR→浏览器 QA→独立 PR）：
  - **刀A 解析分层**（PR #279）：详情页解析两层披露——答案行常显，其余
    收进默认折叠「展开解析」，组级四大块各自带标题折叠；新组件
    AnalysisDisclosure 自持状态，QuestionGroupDetailView 零 useState
    护栏原样保住。「一句话考点」中间层不做客户端假货，字段留给导题
    管线产真数据（挂账，与超纲词同轨）。
  - **刀B 整卷预览页**（PR #280）：`?view=paper-browse&paperId=...`，
    整卷按 asset content.blocks 流式渲题组卡（复用 PI adapter 喂只读
    PaperSurface，本体零字节改动）+ 部/节/题组目录锚点 + 加入草稿卷
    （复用状态机）；入口=详情页「看整卷」。两皮结构第一皮；第二皮
    （成卷 A4 预览切换）另刀。刻意不做：移出/整卷加入/试卷列表页。
  - QA 方法沉淀：本地 QA fixture 用户脚本化登录（cookie 注入，代理不碰
    密码）；本地库无解析数据时造 [QA夹具] 数据验分层。
  - 新跟进项（均为存量债，非两刀引入）：route-integration 16 项 main
    同挂旧断言、module-v1 的 App.tsx 冻结断言过宽（均不在 CI）、路由层
    无 popstate 处理（Back 键 URL 变视图不变，与 draft/mySpace 同病）。
- 2026-07-08 深夜：**生产部署完成**——prod e33483b → b5db37c（一次带上
  刀⑤渲染保真 #278 + 解析分层 #279 + 整卷预览页 #280 + polish #281 +
  卷面策略 #282 + 详情瘦身 #283 + 排版标准 v2 + 相似题维度标准 +
  2026 卷 docxPath fix）。分步流程（pull→eqb-build.sh→restart）；
  eqb+caddy active、health 200、eqbank.cc 200、
  verify-paper-assets-consistency 生产实跑 169/169 绿。
  下一会话：**UI 整改**（队列见下方 owner 定调条），施工清单另有
  `docs/import/data-health-sweep-2026-07-08.md`（33 卷毛边三桶；
  注意：七选五 A-G 实测 33/33 齐全，此前"2026-i 缺失"判断需在数据刀
  复核后销账）。
- 2026-07-08 深夜：**第二轮双刀并行收官**（#282 surface-question-policy +
  #283 detail-slim，均 fresh CR with-MF 全闭环 + DOM 级目检）：
  - #282：PaperSurface 题列表空题干策略对齐刀⑤导出面（完形题号选项
    同行/语法文后零空行）+ 应用文 Dear/Yours 脚手架进答题框（规则抽取，
    read-time，全卷通用）+ 语法 rail 假 prompt 选项退役。PaperSurface
    高危面首次受控修改（dev-hard + 白名单窄化）。
  - #283：详情页瘦身成**决策速览卡**——答案对比框/AI验证列表/置信度%
    生产脚手架退役（ADR-0015 执行，owner 确认永不再用，净 -103 行）+
    「看解析」直达解析面（CR MF 抓到误接整卷路由，已修+导航断言）。
  - **页谱定型**（owner 2026-07-08）：详情页=无卷语境决策速览卡 /
    整卷页=卷语境挑题 / 解析页=深读讲评 / 工作台=产出。
  - **删卷议题关闭**：owner 提议删模拟卷防毛边→库存实查仅 1 套 mock
    （巴蜀=960d0f8d）→裁定**一套不删**（毛边病根在老管线不在卷种，
    渲染层已全兜，删除理由应是内容差而非格式脏）→改为**全库体检
    sweep**（只读，进行中，产出 docs/import/data-health-sweep-*.md
    毛边清单→分批数据修复）。
  - 并行规则教训：两刀同碰 verify-paper-browse.mjs——公共 verify 脚本
    算共享面，派工时须单独点名（补进 AGENTS 并行三条的执行细则）。
  - owner 定调：**UI 全部磨顺前不开新功能**。UI 轨队列：flow-hover
    （流式化+悬浮显形+rail联动+触屏兜底+尾部解析杆[解析两语境：详情/
    整卷=决策场景默认收起，解析页=深读]）→popstate→导出面段首语→
    工作台实测一轮。之后：配相似→练习纸→超纲词（+词汇预习单）。
    体检报告/班级错题标记出局（owner：考点覆盖无好坏标准/一对一无班级）；
    答题卡待 owner 模板文档。
- 2026-07-08 晚：**paper-browse-polish 收官**（PR #281，small，owner 实测
  960d0f8d 报障→当晚修复：题号重复/旧格式挖空归一/写作 block 双渲/
  段首语双前缀）。同晚 **High 档构思定向**：产品三主打改为
  **时效/解析/相似题**（原创生产线降级——owner 实测出题差强人意）；
  《相似题维度标准 v1》定稿
  （`docs/product/similar-question-dimensions.md`，六题型维度表 +
  配相似宪法「只有配一个动词」+ 语法单空整段上下文铁律 + 分期点亮，
  Phase 1 靠现有 topic label 即可上线）。下一刀序（owner 已认）：
  flow-hover（整卷页流式化+悬浮显形）→ 配相似动线 → 练习纸 →
  用过标记/「我考过的卷」→ 时效流；数据轨=导题管线加考点标注工序。
  存量数据账：960d0f8d 段首语双前缀、七选五 A-G 缺失同批清洗。
- 2026-07-08：**刀⑤渲染保真收官**（PR #278，large，PA+CR+owner-QA 三审）。
  四套渲染面（屏幕 PaperSurface/写作页/PDF/DOCX）归排版标准 v2 单一权威：
  token 单源化（Issue #30 Gate 2 关门）、屏幕 16px→14px、PDF/DOCX 补挖空
  样式+写作框+页脚页码+rFonts、§3b 分页纪律入标准、PaperSurfacePrototype
  死码清除、4 个过期 PR 冻结 verify 退役。Chunk D（I10 句首挖空）经 PA
  实证真资产不复现，剔刀挂账。owner-QA 实卷目检抓到 3 个 verify 数不出的
  视觉 bug（text-indent 撞字/DOCX 缺缩进/空题干渲染），已修——**渲染刀
  收官必须过实卷目检**成为流程教训（cut-note 有 QA 生成脚本）。
  新账：①**七选五 A-G 候选句未入库**（paper-2026-i 数据缺口，导题工序洞，
  补数据+validator 强制字段）②写作框段首语（需动 api.mjs，小刀）
  ③heading 字号归一（CR SW-B）。生产部署待 owner 拍板。
  候选新刀（owner 方向已聊）：解析分层微调（小刀）→ 整卷预览页
  （新东方式流式挑题+题组量子操作，medium）→ 超纲词入导题管线；
  练习模式（流式+可起标题，区别于真题卷面）挂账。
- 2026-07-08：**导题 agent 化前两刀收官**。刀①《新课标一卷标准》v1
  （`docs/product/nck1-paper-standard.md`，owner 终审：结构/题号/
  分值/答案红线/听力原料先存/图文条款+保真分级）。刀②
  nck1-import-runbook（PR #277，medium）：`docs/import/agent-runbook.md`
  工序书 + 首导 **paper-2026-i**（PDF 格式②首通，听力/figures 原料
  齐，45 答案 DEV+CR 300DPI 双核），`verify-nck1-standard.mjs`
  17 项 gate；validator 最小放宽（.pdf 源，PA-lite 经 CR 认可）；
  酸测试两轮制（fresh Sonnet 盲跑，第 1 轮抓到 validator 契约空档）；
  CR MF1 为误报（RM 一手证据裁决，CR 自行更正，记录在 cr.md）。
  台账 `docs/import-ledger.md` 建立。**2026 卷仅在本地库，生产同步
  待 owner 拍板**。后续刀：③听力入库（PA）④图表契约+提取
  ⑤渲染保真（PA，PaperSurface 高危）；甲/乙/浙旧格式按需接入。
- 2026-07-08：**黄金路径 E2E 收官**（PR #276，medium，Sonnet DEV +
  fresh Opus CR APPROVE，SF1 已收）：`scripts/smoke-golden-path.mjs`
  在 enforced 登录态下 owner/member 双视角各走一遍
  登录→找题→详情→加草稿卷→组卷→导出 PDF（真 vivliostyle %PDF 字节），
  18 项检查；CI 新增独立 e2e job（~1.5min），每个 PR 自动跑。这是
  2.6 万行零单测前端的第一条行为级防线（此前 61 个 verify 全是源码
  grep）。member-detail-gate 五面隐藏也从 grep 断言升级为浏览器真断言。
  DEV 上报待议：详情页「加入草稿卷」按钮文案加入后不刷新（功能正确，
  内联反馈缺失，小刀候选）。下一把：导题管线 agent 化（owner 圈了再动）。
- 2026-07-07/08：**UI 一致性系列六刀全部收官**（PR #269-#274，均经
  Sonnet DEV + fresh Opus CR + CI；4 个 CR Must Fix 全部闭环）：
  ① 外壳统一（AppTopbar/返回统一/去 C4）② 解析面板归队墨绿（作废
  PR #52 warm-pencil）③ token 大扫除（焦点环/圆角/阴影/语义色/AA）
  ④ AI 内部数据 member 隐藏 ⑤ 找题体验（loading 骨架/标题列宽；烂点#4
  经实证已不存在）⑥ 打磨杂项（死 CSS 六组/口吻人话化/思考开关/焦点环
  家族/overlay 归中性/分类色豁免落档 DESIGN.md）。烂点清单 6 项全清。
  审计基线 26/40（`docs/cuts/ui-coherence/audit.md`）；生产部署与复评
  见 go-live 记录后续。此前收官：process-slim、data-orphan-cleanup。

## 开放账本（立刀候选，owner 圈了再动）

- UI 烂点清单：`docs/cuts/ui-facade/ui-blemish-list.md`（owner 曾圈
  「按顺序全做」，剩余项待核对）。
- ~~数据孤儿清理~~（2026-07-07 data-orphan-cleanup 刀收官，PR #268 +
  生产收尾完成：fe8e7a65/ee10da87 本地+生产 DB 均购清（SQL 在
  `data/sql/cleanup-2026-07-orphan-papers.sql`）、paper-960d0f8d 缺
  latest/ 已修复、`verify-paper-assets-consistency.mjs` 挂 CI 且在生产
  实跑 164 checks 全绿。生产同批部署到 `4ff8c3b`（带上 #263-268），
  eqb+Caddy active、eqbank.cc 200。生产 DB 购清前有
  `question-bank.sqlite.bak.orphan-cleanup.*` 备份。）
- 测试夹具漏在生产数据路径（data-orphan-cleanup 刀发现）：
  `paper-2024-jslk-english` 不是垃圾而是 ~25 个 verify 脚本就地消费的
  扁平结构 fixture，但它住在被生产 serve + R2 备份的
  `app/public/paper-assets/` 里（生产备份对它天天报 501）。独立刀：搬去
  `test-fixtures/` + 批量改脚本路径 + 生产侧清残留；一致性 verify 里的
  KNOWN_FIXTURES 白名单同刀移除。
- launch-deploy 挂账：DOCX/讲义版接 Draft Paper 工作台（server 能力
  现成，small cut）；难度维度重建（依赖 reading signals join，
  ADR-0015 已把假 medium 下线）。（topic label 已实测 273/273 全覆盖，
  从账本移除。）
- 导题管线 agent 化（owner 2026-07-07 提出，**排在 UI 大改之后**）：
  目标是「跟 Agent 说导这套题，它识别格式 → 按标准做解析 → 导入」。
  要件：给 Agent 的导题入口（现有 `scripts/import-pipeline/` 是底子）+
  导题标准/要求文档化（格式识别、解析配方、质量 gate）。附带评估：要不要
  一个 owner 看「导了什么/值得看什么」的面板——注意 ADR-0015 网站只消费
  的边界，若做属 owner-only 纠错运维档或后台产物报告，不进网站主面。
- 备份可恢复性演练：R2 有对象但未做过 restore 演练，上线级别应补一次。
- member 详情再收一档：**已收（PR #275，2026-07-08）**。答案对比统计 +
  verify-list 对 member 隐藏（isOwnerView gate，同刀④），
  `verify-classic-retire-2.mjs` 三条断言改 owner-gated 真检查（63/63）。
  其余生产 QA owner 已过，无别的问题。生产已同步（2026-07-08）。
- **《试卷排版标准》v2 定稿（owner 2026-07-08 终审）**：
  `docs/product/exam-paper-format-standards.md` 重写为带数值的唯一
  权威（金样卷 NEEA + 2026 卷双源实测 + 命题人社区共识互证；
  2026 PDF 实为 WPS 仿制件——骨架可信、字符级不可信；七选五挖空
  线长于完形 3:2 实测定谳）。广东 QA 单数值口径废止。**刀⑤渲染
  保真施工图就绪**（四渲染面收拢/PDF·DOCX 补挖空与写作框/DOCX
  补字体/屏幕 16px→14px 等比/I10/死码清理/Issue#30 Gate2 关门），
  owner 圈了即立刀。三项低置信待 owner 实物复核（题号句点/语法
  空线长/边距名义值），不阻塞。
- UI 复评（2026-07-08，六刀后）：26 → **31/40**（快照
  `.impeccable/critique/`）。剩余：[P1] 两个未迁移解析孪生面
  （`?view=reading-analysis` 暖色孤岛 + PI 默认 Preview 面含 backstage
  AI 标，URL 直达可见）——**归 reading-analysis 孤儿支退役刀一并收**；
  [P2] 效率轴（键盘捷径/批量加卷）owner 圈了再动；[P3] 返回措辞一主
  两例外。
- PaperSurface watch ledger：`docs/paper-surface-watch-ledger.md`。

## 更新纪律

medium / large cut 收官（RM 闸过后）顺手更新本页：改「主线焦点」一两
行、勾掉或新增账本项。保持一页以内，不写成日报。
