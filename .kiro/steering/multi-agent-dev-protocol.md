---
inclusion: auto
---

# Multi-Agent DEV Protocol

本项目同时使用 Codex、Antigravity 和 Kiro。新 session
不能假设自己继承了上一轮上下文，必须先同步事实，再开始写代码。

## 1. Session baseline

- 默认从 GitHub 最新 `main` 开始，除非用户明确要求继续某个 PR
  分支。
- 继续 PR 时，先 fetch PR/head 分支，并确认本地 HEAD 与远端 head
  commit 一致。
- 非简单任务开始前，报告当前 branch、commit、baseline。
- GitHub `main` 和 PR head 是跨平台协作的共享事实；agent completion
  report 不是事实，必须用 commit / diff / verify 复核。
- 不要假设本地和云端有同一份未跟踪文件。

## 2. Local vs cloud file access

- Codex 和 Antigravity 是本地环境；Kiro 是云端环境。
- 云端 agent 不能依赖 `/Users/...` 这类用户机器绝对路径。
- 云端 DEV 所需源文件必须是 repo-local 文件，或由用户明确上传/附加。
- Prompt 如果引用本地绝对路径，先寻找 repo-local 替代路径；没有就
  阻塞并说明缺少源文件。
- C6a 及后续导题资产工作优先使用 repo-local source，例如：
  `docs/sources/paper-2024-jslk-english/2024-jslk-english-source.docx`。

## 3. Dependencies

- 需要 build、test、browser QA 时，先检查依赖是否已安装。
- 依赖缺失时，可以使用 repo 现有包管理器安装依赖。
- 遵守 repo 现有 lockfile 约定；不要提交 package-lock、pnpm-lock
  或其他 lockfile churn，除非任务明确涉及依赖变更。
- 网络或 registry 被 sandbox 限制时，报告具体 blocker，再运行可用的
  static / type / verify 检查。
- 依赖没装好、dev server 没启动、browser 没跑，不要声称 build 或
  browser QA 通过。

## 4. Verification

- static verify 不等于 browser QA。
- PaperSurface、UI、layout、interaction 变化，只要 dev server 能跑，
  就要做 browser QA；PO-facing QA 可以使用 Codex in-app browser。
- docs / data / schema-only 变化通常不需要 browser QA，但仍要跑对应
  verify。
- 有 cut-specific verify script 时必须运行。
- 总是运行 `git diff --check`。
- 旧 verify 因历史 scope guard 报错时，明确标为 scope-guard artifact，
  不要隐藏，也不要假装全部 green。

## 5. Scope discipline

- 严格遵守 prompt 的 allowed / forbidden scope。
- 不要把 data/model/docs cut 扩成 runtime UI、route、server、AI API
  或 package 变更。
- 不要因为“顺手”实现未要求的 UI。
- 不要修改 PaperSurface core 文件，除非当前 cut 明确允许。
- 不要修改其他题型的 prompt / parser / runtime，除非任务明确要求。

## 6. Completion report

DEV completion report 必须包含：

- PR URL
- branch
- commit hash
- exact changed files
- verify results
- build / browser QA result，或说明为什么不适用
- forbidden scopes confirmed untouched
- known expected failures / scope-guard artifacts
- push 后 local branch head 与 remote PR head 是否一致

Completion report 是 CR handoff，不是 terminal log。不要粘贴长日志。

## 7. CR / QA handoff

- CR 必须按原 prompt 和 steering 规则审，不只看代码风格。
- user-visible UI 如果明显有视觉/交互问题，应在用户 PO QA 前由 Codex
  或 CR/QA 先挡住。
- 需要用户 QA 时，尽量提供直接 URL。
- in-app browser 可用于 PO-facing visual QA；若状态陈旧或无法证明问题，
  切到本地 Chrome / headless Playwright。
