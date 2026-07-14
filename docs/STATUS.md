# 当前状态（medium / large cut 收官时更新）

Last updated: 2026-07-14（home-blank 收官——主页纯空白大搜索框上线，
**生产 da4c49a**，owner DP-3 全过闭环；verify 死代理假红根修 81d9fd0）

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

- 2026-07-14：**home-blank 收官（主页纯空白大搜索框）**（merge da4c49a，
  fresh CR APPROVE 0MF/3SW 当场收，DP-2 五幕 37 断言全绿 + verify:all 77
  绿 + main CI 双证）：静止态=居中词标+大框+真值 whisper（原型 D）、提交
  拍切换（原型 T 档 A）、feed+chips 原样退进 `?view=browse`（`f.*` 深链落
  浏览态）、主页 list 态顶栏 brand 隐去。**账单**：流水线 292k（DEV+verify；
  verify 步 502 死代理假红中止→主代理亲跑，判例三证）+ CR 独立会话；主代理
  出场 5。**生产已部署 da4c49a**，**owner DP-3 全过**（2026-07-14 生产前台
  Chrome 实点五项，「全过」，思考开关藏空白态一并默认通过，本刀闭环）。
  QA 脚本入档可重跑（`qa/dp2-five-acts.mjs`）。同日附带：verify 死代理
  502 假红根修（81d9fd0，lib/proxyFreeEnv 六处接线，死代理实测 81/81 绿+
  CI 双证）。
- 2026-07-14：**trust-cracks 收官（三路评审刀2 信任裂缝）**（merge 98d708d，
  fresh CR APPROVE 0MF/5SW，verify:all PASS77 主代理亲验 + main CI 绿）：
  AI 搜索诚实空态（重排 prompt 允许返回空 + rankings 信任分支不再兜底追加
  + 0.25 地板；解析失败仍保预筛兜底）、详情 `?view=detail&groupId` 与筛选
  `f.*` 进 URL（刷新/Back/中键不丢态，详情改真链接）、卷名去结巴（含 26.3
  月份形裸"3"）、rail 计数 "N 题"、搜索年份列同年只显首行、"已删除"→
  "已移出"。**账单**：流水线 315k（DEV+verify；verify 步 502 死代理假红
  中止→主代理亲跑复核，a3 判例二证：断点不走 resume）+ CR 77k；主代理
  出场 5（含 DP-2 亲驱）。**生产 9517085**（同发带上刀1）：首发 8696eda
  后 owner DP-3 实点打回诚实空态（LLM 无视省略指令仍凑 3 条自招无关）→
  补刀 relevant 显式布尔+无条件丢弃（460ed4c）+ 金路径 e2e 断言跟刀
  （9517085，button→link），qa-owner 生产回放双证：无关查询 0 条诚实
  文案/相关查询（猫）恰 1 条零误杀（`qa/qa-dp3.md`）。**事故自省入
  case-law**：CI watch 管道吞码把红 run 报绿并部署（e2e 旧断言红，
  产品未伤）——退出码消费不接管道+conclusion 双证；LLM"自觉省略"不可
  依赖（两条普适级已回流母版）。挂账 SW-1~5 见 cr.md；**owner DP-3 全过**（2026-07-14
  "中键和 toast 撤销没问题"，四裁决点全勾，本刀闭环）。QA 判例入档：**面板 CDP 合成点击对部分 React 控件（表单
  submit/hover 显隐链接/浮动按钮）不触发 onClick**——确定性 DOM/URL 断言
  面板做，点击全覆盖走 DP-3 前台真鼠标。
- 2026-07-13：**全站 UI 三路评审 + motion-press-exit 收官（刀1）**
  （merge 0dcaec7，CR APPROVE 0MF/4SW，DP-2 契约全绿+A3零回归，main CI 绿）：
  评审用 impeccable 三路独立合成（A 设计总监实点 28/40，较 07-10 的 20 升；
  B detect.mjs 394 命中大半文档缺口；C Emil 工艺账）——快照
  `.impeccable/critique/2026-07-13T15-58-11Z__full-project.md`。刀1 清 Emil
  工艺账：全站按压反馈（7 selector `:active` scale + transform 补齐）、弹层
  入退场（2 模态/2 菜单/2 toast，transition 制、退出快于入场、可打断）、
  reduced-motion scroll helper（4 call site）、rail/toggle 过渡、B 路 CSS
  小账。**账单**：流水线 132k（DEV+verify+CR）+ 评审三子代理 ~464k；主代理
  出场多（含亲驱 DP-2）。**生产已部署 8696eda**（2026-07-14 随刀2 同发），
  DP-3 生产前台待 owner。QA 判例入档：**Browser
  面板/后台 Chrome 标签 visibilityState=hidden 会节流 rAF，rAF 门控的入场
  动画逐帧手感眼看不了**——DP-2 改确定性 CSS 契约验证替代（强制翻
  data-visible/样式表遍历），SW-1（单 rAF 塌帧）移交 owner DP-3 前台复核。
  **待办**：
  - ~~刀2 信任裂缝~~ ✅ 2026-07-14 收官（见上 trust-cracks 条）。
  - **主页方向（原型探索中，未拍板）**：owner 长期觉主页"不够 feel"。
    评审证实"没有锚"（美学 4/4 但每行两意图竞争 + hover 藏操作）。原型在
    `docs/cuts/home-desk/`：prototype.html（书桌版，减法开关+3 脑洞可叠加）、
    **prototype-no-lobby.html（推翻版：取消主页=开门即当前草稿卷工作台，
    找题降级为侧滑抽屉，空桌态才显极简大搜索框）**。owner 三次纠结(空/杂/
    没锚)后主代理判"主页是错问题"→推翻版待 owner 实点定夺。**未定方向前
    不要动生产主页代码。**新前提(owner 2026-07-14)：内容形态将扩张——
    **时文小报纸在路线图上**(可能非"卷"实体)、模拟题等；owner 提议"几大
    板块"式主页，主代理判**板块治空方向反了**(空≠问题,没锚才是;模拟题
    实为筛选维度非板块;空板块伤刚修好的信任轴)，但形态维度是真问题——
    数据进来那天从馆藏结构自然长，不预留首页格子。**方向收敛中(owner
    2026-07-14 晚)**：owner 晨间第一动作=搜题 → 倾向"大搜索框+品牌符号
    (标志/固定形象)填空"；"公仔"需过反卡通宪法→走社标/藏书票档位(企鹅
    社标先例)。原型集已扩至 5：+C 搜索主角+脚下现场、+D 纯空白、
    +**D+ 大搜索框×品牌符号 4 档切换(印章墨绿/朱砂/书猫线描/纯字标)**，
    全部已开 owner Chrome 实点。**owner 拍板(2026-07-14 深夜)：主页方向
    = 原型 D 纯空白大搜索框；品牌符号(满分猫标)搁置**——素材已档
    (brand-mark-brief.md：特征速记+owner 自生成插画 4 张+双层制方案)，
    复活时从 brief 接。~~下一步：home-blank 刀~~ ✅ 2026-07-14
    grilling 三问收敛（浏览入口=whisper 可点/首跑零添加/提交拍）+ 收官
    （见上 home-blank 条）。
- 2026-07-13：**a3-imposition 收官**（merge dbfb472，CR APPROVE 0MF/4SW，
  verify:all + main CI 绿含新 e2e Phase B 真点步）：A3 态预览按面拼版
  （方案C 满幅、面标签/对折线/翻面⟲换张✂缝、缝上建议徽标）——owner 对
  议题2裁点2「不做按张视图」的改判落地，原型四裁点在 cut 目录。a4 路径
  构造性零变化。**账单**：流水线(DEV+verify) 321k + CR 92k；主代理出场 5。
  挂账 SW-1 无牙断言/SW-4 测试进程泄漏硬化（chromiumPool 信号收尾）见
  cr.md；**生产已部署 67fc324**（2026-07-13，health ok、eqbank.cc 200），
  owner DP-3 过（本地部署前验，`docs/cuts/a3-imposition/qa/qa-dp3.md`，
  同场覆盖 engine-rewire/print-form 三刀销账）。cut-pipeline 判例：resume 缓存会原样
  回放失败回执（verify 步不重跑），断点恢复走主代理亲跑更顺。
  **刀E（真 2-up 拼版 PDF）取消**（owner 拍板 2026-07-13，判例入
  case-law）：驱动「一面两页+短边翻转」已覆盖执行，预览管规划即闭环。
- 2026-07-13：**engine-rewire 收官**（merge edcf777，fresh Opus CR APPROVE
  0MF/2SW，verify:all 绿 + main CI 绿）：阅读次序换真篇位（同字母70/相邻35/
  词数细排+29 档间不翻转，同卷键=(年,区,卷名) CR 亲验零碰撞）、完形体裁数据
  自愈、七选五体裁弱加分+8、前端恒真过滤器退役。DP-2 QA 过（qa-dp2.md）。
  **账单**：DEV 170k + CR 55k；主代理出场 4。**生产已部署 48a3a80**
  （2026-07-13，health ok），owner DP-3 过（qa-dp3.md 同场）。
- 2026-07-13：**print-form 收官（draft-desk 队列刀C）**（merge ac05962，
  fresh Opus CR APPROVE 0MF/3SW，verify:all 绿 + main CI 绿）：打印形态
  A4/A3 字段（懒 ALTER+记住上次）、词数启发式魔法数字整套退役→真分页衍生
  建议、同面判据（A3 版3/4 同面不算断实证）、计数徽标随形态、PO-1 建议显示
  收账（安静徽标一键生效）。类型收正回 domain 真源。DP-2 QA 过。
  **账单**：DEV 257k + CR 67k；主代理出场 5（含类型收正亲改）。**生产已
  部署 48a3a80**（同上），owner DP-3 过（qa-dp3.md 同场）。插曲入档：并行自验撞端口留下 3 个残留测试服务，污染后续
  verify:all 假红两轮（清残留即愈）——并行刀自验错峰或差异化端口，候选改进。
- 2026-07-13：**双刀部署生产 2c01e2b**（deploy-remote.sh + 部署节点两动作）：
  ①体裁真值同步生产库（停服 apply 273 条带备份，生产 verify-genre-truth
  12/12 绿）②刀B前置（playwright-core chromium 装毕；实测冷 2.54s/
  **暖 2.12s 超 ≤1s 预算**/缓存命中 0.41s，常驻 Chromium ~590MB RSS——
  两项入 watch，详见 go-live-record.md 追记）。health ok、eqbank.cc 200。
- 2026-07-13：**draft-desk-b 收官**（merge f597611，fresh Opus CR APPROVE 0MF/4SW，
  main CI 绿）：草稿卷三分页引擎收敛为一次 paged.js 渲染，预览/PDF/打印三出口
  同源 parity（Chromium 常驻池+DOM 契约+签名缓存 LRU8）；owner DP-3 过。
  **账单**：子代理 ~721k tok（DEV 597k+CR 124k；步0-2 见前会话），主代理出场 5 闸+QA 亲驱。
  挂账 SW-J/K/H+CR-new×2 见 cut-note.md；~~上线前置未做~~ ✅ 2026-07-13
  部署时已做（见上）。
- 2026-07-13：**r1-genre-truth 收官**（merge 6facb6f，CR-lite 0MF，verify:all
  77/0/0 + main CI 绿）：273 篇 discourse_type 题型名假货→五类真值落库（记叙
  101/说明116/议论9/应用31/新闻16），publisher 源头防回归（重导不再冲真值），
  owner 26 条盲审 gate 过（判例 4 条入 plan）。**账单**：子代理 ~301k tok
  （侦察 90k+DEV 211k）+DeepSeek 225 调用几元。~~生产库同步随下次部署~~
  ✅ 2026-07-13 已同步（见上）；engine-rewire 已开工。
- 2026-07-12：**motion-pass 收官**（merge ecbf0c1，CR APPROVE 0 MF，
  verify:all 74/0 + main CI 绿）：五档时长+三曲线 token 收编全站 65 条
  动效（含 DESIGN.md 条款改 token 制）、ease-in/9×transition:all 修正、
  undo-toast 入场补缺、verify-motion-tokens 守门进 CI。cut-pipeline
  Workflow 首跑实测过（args 需真 JSON 对象，脚本已加字符串解析兜底）。
  **账单**：子代理 254k tok（DEV+verify 192k、CR 62k），主代理出场 4。
  **owner QA 过（2026-07-12，Chrome 实看）**；**生产已部署 62c8998**
  （deploy-remote.sh 一键，eqb+caddy active、health ok、eqbank.cc 200）。
  挂账：「折叠」时刻待 owner 指认另立 small 刀、CR SW×2（多行续行门孔/
  harness:874 曲线重判）见 cr.md。
- 2026-07-12：**刀A 备课桌骨架 + 卷宗柜双刀收官**（worktree 并行施工，
  merge 后 main verify 74/74 绿 + CI 绿；双 fresh CR APPROVE 0 MF）：
  ① 刀A（原型三裁点全落地）——暖纸桌满幅+纸居中 820px、右 rail 整卷页
  目录语言（点击滚动+scrollspy 双向、拖拽通道保留）、贴纸操作条
  上移/下移/前置分页/移除（PATCH 落库实测）、分页建议安静标注点击
  生效（徽标 8页→9页联动）、页数徽标「共 N 页 · 双面 M 张 · A4」真值、
  删除即删+toast 撤销复原、窄屏 rail 退化；DraftPaperOutline 退役。
  ② 卷宗柜——月度档案分组（组头真计数、筛选如实、空组头随删消失）、
  微缩 A4 暖纸卡（hover 抬起 computed-style 铁证）、删除弹窗措辞升级
  三路径全验、「个人空间/共 N 份/草稿卷」命名法落地。CR SW 挂账见两刀
  cr.md（刀A×4：陈旧 previewScale 锚点/组标记位置耦合/沉降监听有界
  泄漏/拖拽未真拖；卷宗柜×4）。**账单**：DEV 续做 162k + CR 49k+66k
  tok；本会话为死机接手（刀A 半成品由 DEV 审读续建）。**owner 观感 QA
  过（2026-07-12，Chrome 实看两页面）**；**生产已部署 6509829**
  （deploy-remote.sh 一键，eqb+caddy active、health ok、eqbank.cc 200；
  顺带捎上刀B 建议引擎改真分页衍生的 program 拍板行）。插曲入档：本机
  重启后 shell 残留死代理变量致 Vivliostyle 502 假红（unset 即愈，已存
  记忆 env-dead-proxy-502）。
- 2026-07-12：**Workflow 路由极致化收官**：路由决策卡（开刀 10 秒走完，
  dispatch-protocols 首屏）+ 命名工作流 `cut-pipeline`
  （.claude/workflows/，DEV→verify→CR 参数化一行派工，四硬纪律/收口
  schema/token 账单内置，`cr:'lite'` 接命中率降档）。语法已验（运行时
  包装），**首跑 = 下一把符合判据的例行刀**（记出场次数×会话规模，攒
  实测判例）。母版已回流 v1.4。
- 2026-07-12：**project-os skill 蒸馏收官**（用户级资产
  `~/.claude/skills/project-os/`，自带 git v1.1）：本项目协作 OS 母版化
  ——填槽宪法+templates 12 件+agent 四件套+hook/script 空槽版+普适血书
  12 条随行+休眠件 7 节；fresh CR 4 MF 已修（悬空引用×3+60分档自洽）。
  回流纪律双向挂钩（本项目 case-law 序言 ↔ 母版）。开新项目说「按
  project-os 开」即用。
- 2026-07-12：**H10-agents-constitution 收官**（b674b1b+收口 commit，CR
  APPROVE 0 MF/SW×2 直收，housekeeping 73/73 绿）：AGENTS 宪法化 469→330
  行，叙事入判例库 case-law.md（血书元规则成文），派工/UI 规程按需加载；
  五新法：记忆禁快照/commit 一行/裁决点清单（PM 断点锚）/owner QA 命中率
  降档/外脑仅本机；模板新增 case-ruling+qa-checklist。出处：07-11 协作复盘。
- 2026-07-11：**warm-paper-promotion 收官 + Workflow 流水线试点首跑通过**
  （merge faeafea，CR APPROVE 0 MF + SW×2 直收，main CI 绿）：--paper-*
  token 家族（整卷/讲评零视觉转正，QA computed-style 14 选择器
  diffCount=0 铁证）+ 工作台暖纸桌/纸影（审计 P0-D1 灰怪闭环）+
  DESIGN.md 色温法/命名法条文（删除法已在档）。**试点账单**：
  DEV→verify→CR 三步脚本串行一次通过，子代理计 241k tok/13.4min，
  主代理仅头尾 2 次出场（对照 lecture-rail 常规管线：子代理 4 轮 387k
  + 主代理步间出场 ≥6 次全会话重放）——省的全在主循环重放，工钱不省；
  详见 cut 目录。owner 观感过（2026-07-11）；**生产已部署 50a71af**（health ok、eqbank.cc 200）。
- 2026-07-11：**lecture-rail-scroll-fix 收官**（merge 9d67880，CR 两轮
  APPROVE（base 0MF + delta D-MF1 已修销账），main CI 绿）：讲评态
  七选五/完形点空显解析（PaperSurface 'paper-blank' 模式，rail/选项池
  不压）；QA 实抓七选五 adapter questions 有意为空致映射全空（asset
  补喂修）；rail 不滚定性=遮挡态 rAF 冻结致 smooth 动画走不完+冷加载
  内容推移，setTimeout 沉降巡检双收（retire-then-replace 防重入）；讲评态
  悬浮加卷钮隐藏。**owner QA 过（2026-07-11，点空/rail 高亮/连点三项）**。
  挂账 cr.md SW×4；机会：'paper-blank' 渲染器天然认 `__NN__`，语法填空
  点空旧账或一行可销（归 data-health 批评估）。**生产已部署 0d8abf4**
  （deploy-remote.sh 一键，health ok、eqbank.cc 200）。
- 2026-07-10：**draft-numbering-style 收官（三轮 DEV）+ dashed-line-unify
  收官**（merge dfa42c1 / 968d810，均 main CI 绿）：① B 形态编号
  （owner QA 二轮改判）——汉字大题头「一、二…」+ 小题 1-N 全卷连续
  无括号 + 文内空号重映射同序 + 一致性硬断言（负例已测）；顺带修
  存量事务 bug（COMMIT 后假 ROLLBACK，store 六函数+路由+migrate，
  坏组可 API 自愈）；5 个空号不健康组入数据健康账；CR 提醒：本刀
  实际份量超 PA-lite 前提，下不为例。② 虚线语义统一（owner 报障
  当场诊断+原型拍板入档）：v1 节尾线+屏幕分页线退役、节末补静息
  底线，不变量「静息线集合==选中线集合」。e2e 夹具插曲：golden-path
  完形夹具无空标记被新断言正确拒绝，修夹具非放断言（数据真实性
  教训再证）。QA round 2（owner 抓到 35cd609 写作例外只做了半截——罩
  仍整卡显影；原型三案拍板方案A，dd6dc4c，CI 绿 + **owner QA 过**）：
  写作卡选中罩上缘下移到提示起始线（量高 --pb-writing-cut-top），
  写作例外撤销、前组底线回归、写作组自身入底线账——不变量全站成立，
  写作不再例外。挂账：老解析页 harness 卷面 fig-token 残口（watch
  ledger，随孤儿支退役刀收）。**六刀已于 2026-07-10 部署生产**
  （e6644e2，分步流程：pull→install→build→restart，health ok、
  eqbank.cc 200；draft-depassage-letter owner QA 本地已过——QA 中撞上
  草稿卷含空号坏组 group-960d0f8d-grammar-fill 被新硬断言正确拒渲，
  QA 草稿卷已摘除该组，坏组本体仍在数据健康账）。
- 2026-07-10：**UI P1 双刀收官 + 签名微动效**：ui-p1-shell（merge
  e7f1dff，CR 0 MF，SW-1 两处行级焦点收口闭）+ ui-p1-panels（merge
  228e653，CR 0 MF，SW-1/2 收口闭：枚举中文兜底/选择器加固）——审计
  P1×11 落地（焦点环/窄屏/admin/黑话/侧条/字体lane/找题态/弹窗/选中态/
  遮挡/低对比）。basket-chip-tick 签名微动效（5ac4ea8+6c05815，owner
  实报基线 bug 即修：clip-path 替 overflow 保基线）。两刀 CI 绿；
  **owner QA 过（2026-07-10，五面对照单全过）**。
  下一刀 lecture-rail 已解锁（rail 不滚 + 点空显解析需求）。
- 2026-07-10：**draft-depassage-letter 收官**（merge 720f82a，CR APPROVE
  0 MF + PA-lite 降档获认可，main CI 绿）：草稿卷导出五面去 A-D 篇章
  字母，换全卷连续大题头「n、题型（每题 N 分）」；小题号连续系现状
  零改动。挂账（cr.md SW）：DOCX 大题头缺提交级断言。**owner QA 待做**。
  同日并行：ui-p1-shell / ui-p1-panels 两刀施工中（审计 P1×11）；
  lecture-rail-scroll-fix 已 triage 升级（rail 不滚=真回归 + owner 新
  需求：七选五/完形点空显解析，串行排队）；审计 #6③/#9 owner 拍板
  闭环入 DESIGN.md（892b606）。
- 2026-07-10：**similar-entrypoints（E3）收官**（merge 5de239e，CR APPROVE
  0 MF，主代理复核 verify:all 72 绿+tsc+浏览器 QA 四类真点击/写作隐藏/
  返回不回弹，main CI 绿）：详情页+concierge「配相似」深链入口
  （`similar=1` URL 契约），找类似文本回填 hack 退役。相似题 v1 四刀
  全收。
- 2026-07-10：**figure-render 收官（审计 P0 销账）**（merge 6fecb76，
  formal PA 4 MF 回填 + fresh CR APPROVE 1 MF 主代理直收（module-v1
  守卫白名单独立命名集+DEV 假绿更正），main CI 绿）：`[表: fig-…]`
  token 八处渲染面全灭，四路径共用 shared/figures/resolveFigureMarker
  单源；DOCX 嵌 PNG 实证成功（PO-1 未触发）；QA 抓到并修掉 Vivliostyle
  file:// 裂图 + 详情页 marker 泄漏两真 bug（回归断言已补）。挂账：
  docxRenderer 模块级单例（cr.md SW）、详情页头注释失真。owner QA 过
  （Chrome 三标签页实看）。**生产已部署 02308a4**（owner 拍板，
  2026-07-10）：pull→install→build→restart 分步；eqb+caddy active、
  health 200、eqbank.cc 200、生产实跑 169+29+81 三本全绿（含
  figure-render 在生产机真建 PDF 的断言）。
- 2026-07-10：**similar-rail（E2）收官 + 生产部署 5caf263**（merge cb35cd3，
  CR APPROVE 0 MF，主代理复核 184+72 绿，**owner QA 过**含三笔实测 polish：
  讲评栏底部 72px chip 净空、CTA 钮居左文案随右）。主打功能一条龙上线：
  讲评态点题→配相似→勾选→乐观入草稿卷。**生产已部署**（owner 拍板）：
  pull→eqb-build→restart 分步；eqb+caddy active、health 200、eqbank.cc
  200、生产实跑 169/169 + 相似引擎 29/29 绿。SW 挂账：新 reason kind
  默认渲染、FE 配方文案表可漂移。下一步：E3 次入口+concierge 换引擎；
  fig-token P0（审计唯一 P0，卷面直出内部 token）**待 owner 拍板**；
  ~~解析字段 roadmap~~ 已于 2026-07-10 grilling 闭环（见开放账本）。
  全站 UI 审计报告：.impeccable/critique/2026-07-10T05-30-00Z__full-project.md
  （20/40，P0×1 P1×15 P2×18）。本地 dev QA 账号 qa-local-owner（密码本地
  已重置，见会话记录；生产 .env.qa 未动）。
- 2026-07-10 早：**E1 similar-engine + E4 draft-student-field 收官**
  （标题行曾在历史编辑中丢失，07-10 瘦身时补回）
  （merge 3871421/efcc40e，双 CR APPROVE 0 MF，主代理复核 29+20+73 绿）：
  相似题引擎 API 落地（零 AI 确定性配方打分，复用 i16a）；草稿卷
  student_label 种子字段（懒 ALTER 迁移，卷面硬边界双层封锁+CR SW 直收
  扩 backstop，owner QA 过 2026-07-10）。CI 插曲：新 verify 缺 off-repo fixture 守卫致一次真红，
  已补 exit-2 SKIP 惯例（5ee053b）。E2 plan 已就位（e2e38ad，吸收 CR 三条
  硬交接），owner 拍板开刀施工中。
  program：docs/cuts/similar-questions/（七问 grilling 全落锤，原型入档）。
- **更早条目（2026-07-07 ~ 07-09，含 scissor-select-feel/one-sheet/flow-panel
  三刀/flow-hover/home-editorial/UI 整改两日/刀⑤/导题两刀/E2E/双刀并行
  两轮/UI 一致性六刀等收官记录）已归档**：
  `docs/status-archive/2026-07-early.md`。

## 开放账本（立刀候选，owner 圈了再动）

- **High 三议题全部闭环（2026-07-10 两场 grilling）**：议题 1+3 五裁点、
  议题 2 六裁点均入 `docs/cuts/draft-desk/program.md` 关联决策。
  议题 2 要点：断篇判决随打印形态变（owner 改判：A3 同面并排可见
  不算断）→ 卷头 A4/A3 切换（轻量版，默认 A4 记住上次）→ 刀B 扩容
  （形态字段+同面判据）+ 新立刀E「排序建议」排 C 后（任意序、一键
  应用可撤销、永不自动重排）；原型 `prototype-print-form-v2.html`
  入 draft-desk 目录。排期：lecture-rail ✅ → 暖纸转正 ✅ →
  刀A+卷宗柜 ✅（2026-07-12）→ motion-pass ✅（2026-07-12）→ B ✅ → C ✅
  （print-form，2026-07-13）→ E（排序建议，下一把）。
  **motion-pass 开工约定（owner 2026-07-12）**：下一会话即开；工具已
  备齐——Emil 全套 5 skill 已装（improve-animations 开场出审计路线图、
  review-animations 当验收尺、apple-design 处方库；上游 clone 在
  ~/.claude/vendor/emilkowalski-skills，开工前跑 sync 脚本拉新）+
  impeccable v3.9.1（自带升级自检）。
- **暖纸转正小刀（新立，grilling 产物，排 lecture-rail 后）**：①整卷/
  讲评暖色值收编 `--paper-*` token（纯等值替换零视觉变化）②工作台
  预览换暖纸桌+纸面 Resting 阴影（收专项审计 P0-D1，owner 议题3 灰怪
  即此闭环）③色温法/命名法/删除法三条入 DESIGN.md。
- **解析字段路线图（2026-07-10 拍板闭环，program 档案
  `docs/cuts/analysis-fields/program.md`）**：~~R1 体裁补真值~~ ✅
  2026-07-13 收官（见主线焦点）→ ~~engine-rewire~~ ✅ 2026-07-13 收官（见
  主线焦点）→ **R2 干扰项可开工**。新立刀候选：taxonomy 从 api.mjs 模块化
  抽出（防循环依赖，解锁阅读跨主题群收紧+话题阶梯接线，engine-rewire
  deferred 交接）。原文：四轨 R1 体裁补真值（先行，
  discourse_type 实测=题型名假货，引擎两处配方空转；词表记叙/说明/
  议论/应用/新闻）→ R2 干扰项（机审 1395 条→owner 判例→返修→才索引；
  抽检基线 21 条在档）→ R3 写作双 facet（应用文功能型+续写情节型）→
  R4 难度压轴不立项。附带拍板：阅读次序 proxy 换真篇位+词数细排、
  话题三台阶阶梯（原子→课标条目[alias 表现成]→主题群，一级不看）、
  生态环境归自然生态、宇宙探索=选材缺口。共创分工=小川机审/owner
  判例裁决。后台跑批不占 UI 刀队列，可与现队列并行。
- 数据健康追记（2026-07-10 owner QA 截图顺带发现）：某完形组指导语
  「从每题所给的A、B、C、D四个选项」被数据内换行截断成「…A / D…」
  且吞字——入 data-health 清单，随脏数据批修。
- ~~motion-pass~~（2026-07-12 收官，见主线焦点；「折叠」时刻 owner 拍板
  不做，2026-07-14，不立刀）。
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
