# PaperSurface 产品日志 Day 4

> 归档说明（2026-07-16）：本文件原为 2026-05-19 的未跟踪本地稿，滞留在
> git stash 中从未入库（全仓唯一副本）。收悬空时原样归档于此，内容未改。

日期：2026-05-19
范围：PaperSurface / Paper Intelligence 讲评工作台集中打磨周期
状态：截至 PR #50 已合并；PR #52 C4 Insight 正在 QA / CR 中，尚未合并。

## 1. 今天的产品判断

今天最重要的判断不是“又写了多少代码”，而是确认了这个项目的速度模型：

- AI 可以很快把功能写出来。
- 但老师真正愿意用的讲评工作台，需要反复看真实页面、问 peer、做浏览器 QA、修视觉与交互细节。
- “AI 搓工具”的速度和“做可替代真实工作流的产品”的速度不是同一种速度。

我们开始把焦虑从“我是不是慢”转成可复盘的问题：

- 哪些地方是代码慢？
- 哪些地方是产品判断必须磨？
- 哪些地方是流程造成的返工？
- 哪些地方其实做对了，应该保留？

## 2. 当前产品定位进一步清晰

这个产品不是：

- AI 炫技玩具。
- 蓝色后台管理系统。
- 大厂题库流水线。

更接近：

- 老师自己的试卷讲评工作台。
- 试卷排版可信，解析专业，证据可视，难度可校准。
- 在老师需要时，一键出现 AI 洞察；默认不打扰纸面阅读。

核心差异仍然是三件事：

1. 格式化：像真实卷子，而不是网页卡片。
2. 难度校准 + 专业解析：帮老师判断为什么难、哪里讲。
3. 搜索 / 相似 / 语义：未来要解决“我想找同类题”的传统题库痛点。

## 3. Day 4 前后的主要交付

### 四天节奏简表

这份记录把当前周期暂记为 Day 4。它不是严格按自然日切分，而是按产品推进阶段切分：

| 阶段 | 主要问题 | 产出 | 关键判断 |
| --- | --- | --- | --- |
| Day 1 | PaperSurface 能不能成为独立纸面模块 | B3 PaperSurface module v1 | 先做 dumb renderer，不让它知道 PI |
| Day 2 | PI 数据怎么接到 PaperSurface | C1 harness + adapter | `surface=paper` 作为安全 opt-in，不动默认 PI |
| Day 3 | 纸面像不像真实卷子 | C2 / #43 layout & typography | 字号、纸垫灰、居中感是产品信任问题 |
| Day 4 | 讲评流能不能成立 | C3 / C3.6 / C4 | 证据线、颜色语义、洞察入口决定老师能不能讲 |

这个节奏说明：真正消耗时间的不是“写一个组件”，而是反复把组件放回老师的工作流里看。

### 已进入主线

- B3 PaperSurface module v1：独立、受控、纯渲染的 PaperSurface。
- C1 PaperSurface harness：`surface=paper` 可以挂载真实 PaperSurface + 右侧解析。
- C2 / #43 layout polish：A4 纸面、16px 字号、32px 纸垫灰、4-column workspace shell。
- C3 evidence parity：左侧证据高亮 + 跨栏 dotted line。
- C3.6 evidence color semantics：support 绿，trap 琥珀；红色保留给未来“学生答错”。
- #49 watch ledger / verify debt cleanup：把 C3 watch items 记入 `docs/paper-surface-watch-ledger.md`。
- #51 DEV completion protocol：Kiro DEV 默认 commit / push / open PR / @Buqisir，让 GitHub 邮件成为完成铃声。

### 正在进行

- C4 Insight Parity：把 passage-level insight chip + popover 补到 `surface=paper`。
- 当前发现一个 C4 浏览器 QA blocker：chip strip 在 scroller 里，打开 B/C/D 后 anchor 被滚出视口，popover 跑到屏幕外。建议修成 sticky chip strip 或等价方案。

## 4. 重要 bug 与修复记录

### React hook 顺序 bug

现象：`PaperSurface.tsx` 在 reading-mode early return 后才调用 `useMemo`。
风险：React hook count 在 reading / lecture 模式间不一致。
修复：把 hook 移到 early return 之前，并加入静态 hook-order guard。
经验：即使是“占位模式”，也不能破坏 React 不变量。

### Vite 403

现象：本地打开页面时报 `app/index.html outside of Vite serving allow list`。
原因：`server.fs.allow` 显式配置后，Vite 不再自动允许 app root。
修复：只允许 `app/` 和 `shared/`，不放开 repo root。
经验：开发便利和文件访问边界要同时守住。

### 点击选项不触发解析

现象：点击题干可以切右侧解析，点击选项不行。
修复：把 focus handler 放到整题 `<li>`，题干按钮点击冒泡，选项也冒泡；避免双 toggle。
经验：纸面讲评里“点击这题任意区域”比“只有题干按钮可点”更符合老师手感。

### 灰区与布局的反直觉

现象：按计算收窄灰区后，视觉上反而觉得灰区更大。
原因：`1fr 380px` 模型里，缩窄右栏会把释放的宽度给左侧 1fr，导致纸和右栏之间的 leftover 变大。
修复：改成 paper + rail 作为一个整体居中，外侧 gutter 吸收多余空间。
经验：布局不是只看局部 CSS 值，要看 grid 的剩余空间分配。

### 纸垫灰 / 外侧灰层级不清

现象：灰色留白视觉上不稳定，纸面居中感不强。
修复：32px 对称纸垫灰 + 轻微渐变过渡，外侧 desk gray 保持更轻。
经验：这种视觉细节不能只听数字，必须看图、截图对比、接受 peer feedback。

### support / trap 全部绿色

现象：正确依据和干扰来源都用绿色，语义混淆。
修复：support = mint green；trap = amber。trap 不是“错”，而是“容易误导的来源”，所以不用红。
经验：颜色不是装饰，是概念建模。红色要留给更强语义，比如学生答案错误。

### C3.6 CSS specificity bug

现象：trap 选中行应该有琥珀背景，但浏览器 computed style 还是透明。
原因：`button.pi-ps-analysis-distractor { background: transparent; }` specificity 高于 `.pi-ps-analysis-distractor--selected`。
修复：改成 `button.pi-ps-analysis-distractor--selected`，并加 verify 防止回退。
经验：静态检查“有规则”不够，还要检查规则是否真的赢 cascade。

### C4 popover offscreen bug

现象：点击 B/C/D insight chip 后，popover 可能完全跑到视口外。
原因：chip strip 在左侧 scroller 内容流里；点击 chip 后又滚动到对应 section，chip anchor 自己被滚出视口。
当前状态：C4 PR 尚未合并，已要求修复。
经验：anchored popover 的 anchor 必须在打开期间保持可见，否则“组件存在”不等于“用户看得到”。

## 5. 踩坑点

### 1. 旧 verify guard 会在后续 cut 里变成噪音

B3 / C1 时期的脚本会禁止 PI 目录改动。到 C3 / C4 后，这些改动是合法的。
改进：每一阶段要有该阶段自己的 verify；旧脚本的失败要明确标记为 pre-existing / stale guard，而不是混成产品失败。

### 2. 远端命名混乱影响 diff base

本仓库 `origin` 是本地旧镜像，真实 GitHub 远端是 `github`。
坑：verify 脚本如果优先用 `origin/main`，会把已合并的 #49/#51 误算进当前 PR。
改进：统一优先 `github/main`，再 fallback 到 `origin/main` / `main`。

### 3. Completion report 格式不稳定会影响回传效率

多次出现 Kiro 报告没有完全包在一个 fenced `text` block 里。
改进：#51 已写入 DEV completion protocol，要求报告固定格式、PR 固定触发邮件。

### 4. 视觉问题不能完全交给云端 DEV

云端可以写代码和静态 verify，但灰区、居中、popover 位置、颜色语义必须本地浏览器 QA。
改进：L3 UI cut 必须有本地浏览器 smoke；关键视觉由人眼验收。

### 5. 局部修复容易诱发架构误判

例如“右栏窄一点”看似能拉近纸面和解析栏，实际让左侧 1fr 更宽，反而加大缝隙。
改进：涉及布局时先画盒模型 / grid 模型，再改 CSS。

## 6. 我们做错 / 判断偏差的地方

### 1. 一开始低估了“视觉可信度”的工作量

我们以为灰区、字号、右栏距离是小 polish。实际它们直接影响“这是不是一张老师愿意看的卷子”。
偏差：把视觉当成尾活，而不是产品信任的一部分。
改法：以后试卷类 UI 的视觉决策要更早做截图对比和 peer QA。

### 2. 对布局改动太相信局部数值

例如右栏 380px 改 360px，直觉上像是“靠近一点”，但 grid 剩余空间分配让灰缝更大。
偏差：只看 CSS 值，没有先画整体轨道。
改法：任何 grid / flex / scroll 容器改动前，先写一句空间模型。

### 3. 静态 verify 曾经给了过强安全感

脚本能证明“代码里有某条规则”，但不能证明浏览器里它真的赢了 cascade，也不能证明 popover 在视口内。
偏差：把静态通过误读成体验通过。
改法：L3 UI 必须补 computed style / DOMRect / 人眼 smoke。

### 4. 对云端 DEV 的完成报告需要二次验收

DEV 很快，但报告里的“完成”有时是代码层完成，不等于产品层完成。
偏差：容易被“已 push / verify pass”带着走。
改法：PM / 本地 Codex 要负责最后对账：PR head、base、浏览器、用户路径。

### 5. 有时被“AI 应该很快”的叙事催着走

真实问题不是模型写代码慢，而是我们需要判断什么值得打磨、什么应该推迟。
偏差：把产品探索和代码生成混成一个速度指标。
改法：把速度拆成三种：生成速度、验证速度、合并速度。

## 7. 做得好的地方

### 1. PaperSurface 边界守住了

PaperSurface 仍然是 dumb renderer：

- 不导入 PI 类型。
- 不拥有 insight / basket / right panel 状态。
- 不发 `data-pi-*`。
- 通过 neutral `data-paper-*` 协议被 host 使用。

这让未来 Assembly Basket、Reading Analysis、print/export 仍然有复用空间。

### 2. 小切片节奏有效

从 B3 到 C3.6，每一刀都可解释：

- 先有 paper renderer。
- 再接 PI adapter。
- 再磨布局。
- 再补证据线。
- 再补颜色语义。
- 再补 insight。

这比一次性重写默认 PI 风险小很多。

### 3. 人眼 QA 挽救了多个真实问题

如果只看 DEV 报告，会漏掉：

- 灰区视觉不对。
- 字号太小。
- 右栏距离感。
- 选项点击不触发。
- trap 背景 specificity。
- C4 popover offscreen。

说明 QA 不是拖慢，而是在防止“看起来完成”的假完成。

### 4. Peer feedback 很有价值

peer 对灰区、宽度、字号的反馈帮助我们避免自嗨。
产品早期应该继续用轻量 peer review，但问题要收敛成 3 个以内，避免反馈过载。

### 5. 完成铃声规则是流程升级

PR + @Buqisir + GitHub 邮件提醒解决了“等十几分钟只能盯屏幕”的问题。
这会降低等待焦虑，也让你可以在 DEV 跑的时候做更有营养的事情。

## 8. 需要改善的地方

### 1. 每个 UI cut 前先画布局模型

尤其是 grid / scroll / popover / sticky 这类问题。
建议以后在 DEV 前补一句：

> 先说明盒模型和滚动容器，确认 anchor 在交互后仍可见。

### 2. Browser QA 要检查 computed style，不只看截图

C3.6 的 trap 背景就是截图容易漏、computed style 一眼抓。
建议 UI smoke 至少检查：

- 关键颜色 computed style。
- z-index。
- anchor rect 是否在 viewport。
- panel rect 是否可见。
- scrollTop 变化是否符合预期。

### 3. 验证脚本要随阶段演化

不要让旧 guard 一直红。
如果旧脚本不适合当前阶段，要么改写 guard，要么在新阶段脚本里明确权威边界。

### 4. 多 agent 流程要少一点“报告漂移”

同一个任务里 completion report、PR body、verify 输出、实际浏览器结果可能不一致。
本地 Codex / PM 的职责是做最后对账：

- PR head 是否最新。
- 本地 main 是否同步。
- verify 是否在正确 base 上跑。
- browser QA 是否真的验证用户路径。

### 5. “快”要被重新定义

更好的定义不是“十分钟写完代码”，而是：

- 多久能得到一个可验证的产品增量。
- 多久能发现真问题并修掉。
- 多久能不破坏主线地合并。

按这个标准，今天的节奏不慢。

## 9. 当前风险清单

### 当前阻塞

- C4 insight popover offscreen：打开后 anchor 被滚出视口，需要修。

### Watch

- Right-panel button content model：`button` 内含 `h4` / `blockquote` 等 flow content，浏览器可用但 a11y 审计可能报。
- activeEvidenceId reseed：未来如果 analysis data 动态刷新，可能覆盖老师选择的 distractor。
- insight panel content duplication：C4 为了不动默认 PI，复制了 insight content，未来可能漂移。
- chip strip reflow：passage 多或标签长时可能换行、推纸面。
- z-index：未来 basket / toolbar / popover 增多后要集中管理。

## 10. 明天 / 下一阶段建议

短线：

1. 修 C4 sticky / anchor 可见问题。
2. 完成 C4 browser QA。
3. CR 后合并 C4。

然后：

1. 进入 basket parity 或默认 PI route 替换前的 parity 清单。
2. 做一次小型 architecture deepening，检查 PaperIntelligencePaperSurfaceHarness 是否开始过重。
3. 准备默认 route flip 的门槛清单：insight、basket、evidence line、right panel、back、loading/error、print divergence。

## 11. 做完后可以回看的复盘问题

等 PaperSurface 这一轮结束，可以用这些问题做一次正式 retrospective：

1. 哪些问题如果一开始画图，就能少走一轮？
2. 哪些 verify 是真正防回归，哪些只是旧阶段遗留噪音？
3. 哪些视觉打磨提高了产品信任，哪些只是个人偏好？
4. 哪些功能应该更早问 peer / 老师，哪些应该先内部判断？
5. DEV、PA、CR、QA、RM 的边界哪里最清楚，哪里最容易重叠？
6. 如果重新来一次，哪个 cut 会拆得更小，哪个 cut 可以合并？
7. 默认 PI 作为保底路线，给我们降低了多少风险？
8. 这轮之后，老师最能感知到的产品价值到底是哪三个？

## 12. 今日复盘结论

我们不是慢在写代码。
我们慢在把“能跑”磨成“像老师真的会用”。

这不是坏事。这个项目如果只做 demo，会很快；如果要做成老师愿意替代传统题库一部分工作流的产品，第一个月就应该把时间花在这些看似细碎、实际决定信任感的地方。

今天最大的收获：

- 视觉和交互细节值得磨。
- 但每次磨都要留下日志、watch、verify，不能只留在聊天里。
- AI 给了速度，产品判断决定方向。
