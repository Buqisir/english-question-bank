# process-tuning — 流程调优五项条文化 + 遗迹清理（docs 刀）

Cut size: small-medium（docs-only，无运行时代码）；touches schema/data
contract: no。docs-only 刀免浏览器 QA（既有规则）。

背景：owner 2026-07-03 全批五项流程调优（见 auto-memory
process-tuning-cut）；同日读 Anthropic Fable 官方指引后二次加压——
过度规定性指令**直接劣化输出质量**，不只是浪费；盘点范围加一类
「主 agent 向的过度 HOW」。遗迹盘点单（调优③）已于 2026-07-03 在
chat 逐条过 owner，裁决「没异议」，本文件即该单子的存档。

## 已批盘点单（执行清单）

### 判死刑（答不上「删掉会复发什么事故」）

1. decisions.md freshness 字段与三段更新规则（protocol §2.5、AGENTS.md
   两处、_templates/decisions.md）——拍板早已直接进 plan.md。
2. external agent 编排（protocol §2.5 末段写 worktree 规则、§3 external
   DEV / Antigravity 段）——外部 agent 已退场；docs/agents/
   external-agents.md 归档文件保留。
3. kratos 强制条款 + TODO（AGENTS.md「Persistent Working Memory」整节）
   ——调优④：降为只读历史档案一句话。
4. Codex 残留字样（protocol「Codex must update」、AGENTS.md UI 节
   「Codex sanity check」、Browser Verification「Codex in-app browser」、
   dev-completion「Codex may use git/gh」）——改写为当前现实：真点 QA =
   本地 Chrome / headless Playwright；「static verify ≠ browser QA」保留。

### 重写（内核保留，剥过度 HOW / 过时编制）

5. 阿澈/小川双人编排（protocol §4 全部 + 各流程图人名）→ hats 一段，
   流程图去人名。
6. PA 触发条件（调优②）：medium 默认正式 PA 改为「touches 不可逆面或
   改数据契约语义才 PA」；纯加性可 PA-lite 降级，降级理由写 plan 头部，
   CR 必须复核。（M0-5、ai-mode-filter-chips 已实操两次。）
7. plan 模板（调优①）：硬契约（不得偏离）/ 参考实现（可偏离须说明）
   两档结构进 _templates/plan.md。
8. Mockup 纪律：删 Gemini Canvas / 三选项默认集 HOW；硬闸 A（2 轮不
   收敛回问题定义）保留。
9. verify 惯例（调优⑤）：新契约优先行为断言；行为断言覆盖后允许同刀
   退役对应源码正则断言；不搞存量清洗。写进 AGENTS.md RM gate 节。

### 一个不动（闸门，有失败史或护不可逆面）

RM 闸 + verify-ci 同刀登记 + main CI 绿确认（11 连红事故）；PreToolUse
contract-file hook；PR 尺寸闸；PA/DEV/CR fresh context 独立性；硬闸
A、B；owner process brake；浏览器 QA 不可让渡（三度应验）；Super
Teacher Boundary；product-scope-discipline；指令预算条；subagent 钉
模型纪律。

## 验收

- AGENTS.md / steering notes 重写后：WHAT/WHY 与全部闸门零损失（上表
  「一个不动」逐条仍在）；HOW 遗迹清零（阿澈/Codex/Gemini Canvas/
  kratos 强制/decisions freshness/external DEV 字样在活性条文中不再
  出现——归档文件除外）。
- `node scripts/verify-cut-artifacts.mjs docs/cuts/process-tuning medium`
  过（plan.md 即 DEV 契约）。
- `pnpm -C app run verify:all` 绿（docs 刀应零影响，跑一遍兜底——
  housekeeping guard 会扫文档引用）。
