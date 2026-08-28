# DeepTutor 接入 — Wayfinder Map

Status: closed

## Destination

一份 accepted `docs/cuts/deeptutor-integration/spec.md`：定下 **EQB 自养小导师**
的形态（循环与可挂房间、柜子=题库对象、第一期备课侧栏范围）、产品边界
（教师先行、学生面何时以何种形式开放），以及港大 DeepTutor 仅作源码对照、
不进生产。spec 被 owner 接受即到达目的地；场景的具体实现是 spec 之后的
执行工作，不在本图内。

## Notes

- 对照实现：[HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor)，Apache 2.0。
  Mac 试装 1.5.12 仅作教材/对照机。生产不跑该进程、不代理其 HTTP/WS。
- Owner 已定方向：eqbank.cc **自养小导师**（协议模仿港大循环，语境全是
  EQB 对象）。屋子（记忆/柜子/掌握）在架构里可挂；第一期只开门厅。
  教师先行、学生面后置。第一期切片仍是试卷/题组上的备课侧栏。
- 变式题工坊（票 06 部分收口，2026-08-13）：找=配相似；找不到再由 EQB
  按语法填空 schema 造个人练习题（不进官方库）；不接 DeepTutor Quiz。
- 已知硬约束：生产机 `eqb-hk-1` 2 核/2GB 装不下港大引擎（官方建库
  ≥4GB 空闲内存）——此条不再驱动「另买 DeepTutor 机」。学生版隐藏答案/
  讲评由 EQB 工具层按 caller role 执行；不得把学生隐私写入可复用
  memory。学生面走能力链接（无学生账号）；对话免确认、进库仍须老师确认；
  学生额度不得与教师备课共用全局日限额。
- 每张票执行时参考 `$grilling` 与 `$domain-modeling`；涉及产品/视觉决定先读
  `docs/steering/README.md` 相关条目；动生产需 owner 明确授权。

## Decisions so far

<!-- 每张关闭的票一行：标题链接 + 一句话答案 -->

- [DeepTutor 引擎实况调研](tickets/01-deeptutor-engine-survey.md) — 若曾接港大
  引擎：生产缝走 HTTP/WS；Markdown+LlamaIndex 可喂；MCP 须 admin 注册。
  规格与 API 稳定性结论仍作对照机参考。**生产路径已被票 02 否决。**
- [Mac 试装与引擎首次上手](tickets/02-mac-pilot-install.md) — 不当生产引擎，
  当参考实现。自养 EQB 小导师：v1 门厅=当前题+读题组+配相似；柜子=对象
  API；记忆/掌握可挂、v1 不做；动手前对照 chat 循环 / prompt_blocks /
  掌握状态机。
- [柜子：导师能看见哪些对象](tickets/03-bank-feed-shape.md) — 教师
  `读题组` 含答案+Analysis（缺则「解析未发布」）；`配相似` 模型可调、
  卡片勾选后才进上下文；个人练习题不在 v1 柜；学生面工具层按 role 剥答案。
- [小导师调用缝与部署](tickets/04-call-seam-and-deployment.md) — 会话关页
  即丢；v1 整段返回；失败明示不降级闲聊；实现先本机、转正跑 EQB server；
  Mac 1.5.12 留对照机。
- [场景阶段路线图](tickets/06-scenario-roadmap.md) — 第一期只门厅；教师
  第二期=讲评草稿；变式形态已定不进第一期；检索台沿用 steward；学情后置。
  学生面留四场景等票 07；IM Partner / 掌握路径出图。
- [学生面访问模型与产品边界重画](tickets/07-student-access-and-boundary.md)
  — 能力链接（无学生账号）；对话免确认、进库须确认；学生额度与教师备课
  隔离。
- [备课对话面板原型](tickets/05-prep-chat-panel-prototype.md) — 讲评栏页签
  （默认小导师）；打开时题已在场；点引用回卷面点亮对象。
- [起草并接受 spec](tickets/08-draft-and-accept-spec.md) — owner 2026-08-16
  接受 `docs/cuts/deeptutor-integration/spec.md`。图 closed。

## Not yet specified

- 无。第一期实现与教师第二期（讲评草稿）按 accepted spec 另开票。

## Out of scope

- 各场景的具体实现与上线：spec 接受后由后续 cut/ticket 执行，本图只定形态
  与范围。
- 恢复网站导入 UI、替换 EQB 自有的 Canonical Paper 渲染/组卷/导出链路：
  产品边界明令保留。
- 把港大 DeepTutor 自身的 Web UI 作为长期用户产品面。
- 把港大 DeepTutor 当生产引擎（HTTP/WS 代理、Markdown KB、Quiz、其
  Memory / 掌握路径进程）。
- DeepTutor Quiz / mimic 出题不作为 EQB 变式或造题生产路径。变式「找」走
  配相似；「造」在 EQB 内按语法填空 schema 自写（见票 06）。
- IM 答疑 Partner、个性化练习路径（Mastery Path）：架构可挂房间，本图
  产品不做。
