# 全站 UI 一致性审计（2026-07-07）

目的（owner 拍板）：**整个网站 UI 协调一致**。方向卡 = 根目录 `DESIGN.md`
（墨绿 #2C6E56 签名 + 真中性纸底 + Inter 工具道/衬线卷面道），绿色方向
不变，不另立新方向。

方法：impeccable critique 双评估——A（Opus 设计总监逐页评审，10 页含生产
登录页，13 张截图留档）+ B（确定性探测器 14 条源码命中 + 5 页 headless
注入 + 计算色/字体审计），主评审对关键断言做源码级复核后综合。完整报告
快照：`.impeccable/critique/2026-07-07T18-36-42Z__app-src-ui.md`。

## 总判：26/40（Acceptable；一致性轴是主要失分点）

工具壳四页（首页/草稿卷/My Space/admin）计算色只有墨绿签名 + teal-50，
源头 `shared-ui/tokens.css` 真干净（历史蓝紫全部重映射成中性）。真正的
不一致来自三层：**外壳地层未压平**（四套顶栏、三种「返回」、`Paper
Surface (C4)` 脚手架标签印在生产卷面顶栏、圆角/焦点环/阴影漂移）、
**解析面板色彩孤岛**（PR #52 时代 PA 批准的 warm-pencil 独立配色 + 其
内部自违规与无文档漂移）、**产品边界泄露**（话题置信度 % 与 owner 校对
「待对比」墙出现在消费视图）。

## 分刀清单（owner 圈了再动）

| 刀 | 内容 | 级别 | 定级 |
|---|---|---|---|
| ① 外壳统一 | 四套顶栏 → 统一 AppShell（字标 + 返回 + 全局导航固定位）；「返回」统一命名；卷面顶栏 `Paper Surface (C4)`（Harness.tsx:1259/1304）换真标题；owner 视角 7 按钮收组（根治 900px 换行，烂点#1） | P1 | medium（TSX 结构 + 交互；CR-lite + 浏览器 QA） |
| ② 解析面板归队 | harness（`pi-ps-*`，app 侧非契约区）收敛到章程：右栏底真中性、杂绿 #2a7c4f/#1f6f47 收墨绿梯、slate 蓝 #6f7b8f ×20 改 ink-muted（顺带修其 4.2:1 AA 违规）、trap badge 按自家注释归位、emerald 越界（blockquote border-left）收回、字体入 Inter、`transition: width`（css:858）改非布局动画。**卷面内 evidence 契约色不动**。plan 显式作废 PR #52 warm-pencil 决定 | P1 | medium（grey-zone display 层） |
| ③ token 纪律大扫除 | 焦点环三套 → 章程 `0 0 0 3px rgba(44,110,86,.20)`；圆角漂移（登录 12/8、admin 12、一次性 5/7/10/16）→ 8/6/4；阴影收敛 Resting/Floating（清 `0 18px 46px …0.22` 超重浮层）；语义色硬编码 `#16a264`/`#c49b2a`（App.css:927/940/2268/2280）→ success/warning token；`#9a9a93` 作可见文字两处 → ink-muted | P2 | small-medium（纯 CSS；注意同步钉色 CI 断言） |
| ④ 产品边界收尾 | 题组详情：话题置信度 `60%/85%` 与 15 枚「待对比」琥珀墙对 member 隐藏、owner 保留（ADR-0015 消费边界的 UI 收尾）。**口径需 PO 确认** | P2 | small-medium |
| ⑤ 找题体验小包 | 搜索 loading 骨架（烂点#3）+「加入草稿卷」常驻淡显 + 键盘可达（烂点#4）+ feed 标题列宽（烂点#2，DOM 实测溢出 236px） | P2 | small-medium |
| ⑥ 打磨杂项 | App.css 四组死 CSS（parse-mapping/difficulty-queue/paper-block/paper-canvas，含探测器全部 6 条 App.css side-tab）；空态口吻统一；思考模式开关（烂点#6）；980px 组间距（烂点#5）；管理台空屏最小处理（一句说明框） | P3 | small |

烂点清单 `docs/cuts/ui-facade/ui-blemish-list.md` 6 项全部并入（#1→①，
#2/#3/#4→⑤，#5/#6→⑥）。

未立刀、留给 owner 的产品问题：卷面页要不要显式「返回找题」；管理台与
My Space 合并成身份入口；键盘捷径与 M2 新同事引导（Nielsen #7=2、#10=2
的根因）；卷面外壳无视觉回归护栏（`(C4)` 漏到生产的流程性原因）。

## 证据指针

- 截图 13 张：会话 scratchpad `critique-a/`（01-home … 10b-login-prod-fold）
- 探测器 JSON：scratchpad `critique-b/detect-output.json`
- reading-analysis 孤儿支（PaperIntelligencePreview）的 side-stripes 不进
  上表——随该支退役刀走（架构债）。
