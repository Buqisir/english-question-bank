# Mac 试装与引擎首次上手

Status: done
Claim: wayfinder-session-2026-08-13
Blocked by: None
Type: task
Map: `docs/cuts/deeptutor-integration/wayfinder/map.md`

## Question

在 owner 的 Mac 上把 DeepTutor 跑起来并完成第一次「懂题库」的对话体验，
回答一个决定性问题：**这个引擎 grounded 在我们题目上的辅导/备课质量，
值不值得继续接？**

工作内容（agent 驱动为主，owner 提供 API key 并做体验评价）：

- PyPI 路径安装（`pip install -U deeptutor` → `deeptutor init` →
  `deeptutor start`），LLM provider 配 DeepSeek。DeepSeek 没有 embedding，
  需另选一个 binding（候选见票 01 结论：SiliconFlow Qwen3-Embedding、
  DashScope、Jina 等），并顺手记录它在中英混合题库上的检索实感。
- 手工从 EQB 导出 2–3 套 Canonical Paper 的内容（含篇章、题目、Analysis
  讲评），建成一个知识库——本票允许一次性手工格式，不定长期喂数形态。
- Owner 用它做两件事各 15 分钟：①备课式提问（找题/问考点/要讲评思路）；
  ②模拟学生问一道题。按 owner-qa-handoff 模板准备好首状态。

## Resolution 记录

**不当生产引擎，当参考实现。** Owner 2026-08-13 确认：eqbank.cc 自养
「EQB 小导师」；港大 DeepTutor 留作源码教材和对照机，生产路径零依赖。

体验与原则（部分过线 → 改判）：

- 装上了：DeepTutor 1.5.12，uv CPython 3.12，DeepSeek LLM，SiliconFlow
  `Qwen3-Embedding-8B`，`eqb-pilot` 27 篇 Markdown，LlamaIndex，建库约 30s。
- 未挂库时默认走网络搜索，默认 KB ≠ 会话挂载；`+` 菜单的附件/题库不是
  `eqb-pilot`。挂库备课的 15+15 分钟未能按设计打到点上。
- Quiz/mimic **没有**相似度算法，是原题进提示词 +「仿写、别另起炉灶」。
  聊天人设是通用 STEM 教练；独特处在工具循环、预检索再 `rag`、`ask_user`、
  Skill、掌握门槛，不在提示词文笔。
- 变式不接 Quiz（见票 06）。产品独特处不够成为 EQB 的找题/造题引擎。

自养小导师（同日 grilling，Q8–Q13 按推荐）：

- 架构能挂记忆、柜子、掌握；第一期只开门厅：当前题组 + Analysis +
  `读题组` + `配相似`。
- 柜子 = 题库对象 API，不做切段向量知识中心。
- 记忆 = 教师口吻；v1 不写。学生不进可复用记忆。
- 掌握 = 考点；v1 沿用配相似 / 错题再练，不另造知识点树。
- 落点 = eqbank.cc 试卷/题组侧栏。模仿验收 = 协议像，不是 UI 像。
- 动手前只读对照三块：agentic 聊天循环、`prompt_blocks`、掌握路径状态机。
  Quiz 与前端不对照。不搬 Python 管线。

资源（佐证票 01，不再驱动「另买 DeepTutor 机」）：官方建库 ≥4GB；现有
`eqb-hk-1` 2C2G 仍装不下港大引擎。自养薄循环跑在 EQB server 上，规格改由
票 04 按我们的循环重问。

喂数暴露（交给票 03 的前提已变）：Markdown 导出缺 `paper-2026-i` 写作
Analysis sidecar；且已决定不把卷面 dump 进 LlamaIndex——柜子就是 Canonical
对象。票 03 须按「对象 API，不是 KB 导出」重写问题。
