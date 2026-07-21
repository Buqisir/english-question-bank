# workflow-route-retire · plan

**cut size: medium；touches schema / data contract / product boundary /
teaching interpretation: no。**

**PA：不触发。** 本刀只改可逆的协作宪法、派工路由与模型档位，
不碰产品运行时、数据契约或生产面。方向已由 owner 在 2026-07-21
逐项拍板，以 fresh CR 检查最终规则是否只剩一套。

## Owner 裁决

- `AGENTS.md` 是当前角色、模型和执行顺序的唯一权威。
- Medium 保留 fresh 独立 CR，不降为主代理 CR-lite；Large 同理，
  Big CR 仍只由风险或 owner 显式触发。
- `agent-entrypoint.md` 按需创建：仅多阶段、长时间、并行、跨会话
  交接或需要独立阅读导航时使用；其余 Medium / Large 以
  `plan.md` 作为路由入口。
- 退役“标准刀 / 零裁决点 → Workflow 脚本”路由；标准刀由 PM
  按阶段直接派工。批量机械任务仍可用普通确定性脚本。
- PM 与 RM 合一，但 artifact gate、验证、merge、main CI 和
  STATUS 门禁不降级。
- 当前 Codex 档位：PM + RM = Sol / max；PA = Sol / high
  （不可逆才 xhigh）；DEV = Terra / medium（gnarly 才 high）；
  CR = Sol / high（Big CR 才 xhigh）。

## 唯一执行骨架

```text
Small:
PM 直接处理，或 fresh Terra DEV
→ PM 冷读 CR-lite
→ PM + RM 收口

Medium:
PM 写 plan.md
→ fresh Terra DEV
→ PM 亲跑 narrow + tsc + full verify
→ fresh Sol CR
→ 需要时 QA / owner PO QA
→ PM + RM 验收、合并、看 main CI、更新 STATUS

Large / 不可逆:
fresh Sol PA
→ PM 压缩成 plan.md
→ fresh Terra DEV
→ PM 亲跑 narrow + tsc + full verify
→ fresh Sol CR（按触发升 Big CR）
→ 需要时 QA / owner PO QA
→ PM + RM 验收、合并、看 main CI、更新 STATUS
```

## 必做

1. 修订 `AGENTS.md`：
   - 定本上述角色、模型、直接派工顺序与 PM + RM 合一。
   - 删除 Workflow 路由和 `cut-pipeline` 代位复核例外。
   - 明确 CR-lite 只用于 Small；Medium / Large 使用 fresh CR。
   - 改为 `agent-entrypoint.md` 按需，`plan.md` 默认路由。
   - 当前角色名称改为阿澈；历史记录不批量改名。
2. 修订 `docs/agents/dispatch-protocols.md`：
   - 用“PM 逐阶段直接派工”取代 Workflow 决策卡。
   - 保留并行刀、批量任务、worktree 与断点锚纪律。
   - 明确 PM 亲跑验证，不设 verify agent 代位。
3. 删除 `.claude/workflows/cut-pipeline.js`。
4. 修订 `docs/steering/README.md` 和
   `docs/steering/cut-workflow-protocol.md`：
   - 保留风险分级、升级触发、QA、产物、交接和规模门禁。
   - 不再复制角色、模型和具体执行顺序，改为指向
     `AGENTS.md` Dispatch map。
5. 同步现行角色合同、persona 和 cut 模板：
   - 移除 Medium / Large 的 CR-lite 降档规则。
   - Medium / Large 的 fresh CR 写入 `cr.md`，作为 RM 必需
     artifact；PA 仍是按触发条件需要。
   - 保持 PA、DEV、CR 为不同 fresh context。
   - `.claude/agents/*.md` 保留 Claude 合法 frontmatter
     `model: opus|sonnet`，仅在正文说明它们是 Claude compatibility
     profile，不是当前 Codex 档位。
6. 同步 `scripts/verify-cut-artifacts.mjs` 与 `scripts/README.md`：
   Medium / Large 的 RM gate 缺少非空 `cr.md` 必须失败；
   用临时 fixture 证明“缺 CR 失败 / 有 CR 通过”。
7. 在 `docs/agents/case-law.md` 追加 2026-07-21 owner 裁决：
   Workflow 标准刀路由退役、Medium / Large 恢复 fresh CR、
   entrypoint 按需、PM + RM 合一与 Sol / Terra 档位定本。
   历史判例和历史 cut 原文保留。
8. 收官写短 `cut-note.md`；merge 后由 PM + RM 更新
   `docs/STATUS.md`。

## Forbidden

- 不碰 `app/`、`server/`、`schemas/`、数据文件、产品 UI 或生产配置。
- 不修改 `.github/workflows/**`。
- 不改 small / medium / large 的风险定义、PA 不可逆触发、
  QA 可见性触发或合并后 main CI 门禁；RM artifact gate
  只允许因 fresh CR 改为更严，不得降级。
- 不改历史 cut、STATUS 历史条目或旧 handoff 中的 Workflow 叙述。
- 不碰在飞 `applied-writing-lecture` worktree。

## Verify

1. 扫描所有现行规则：零正向 `cut-pipeline` / 标准刀 Workflow 路由残留；
   case-law、STATUS 和历史 cuts 可保留历史记录。
2. 扫描当前角色规则：PM + RM / Sol / Terra 档位一致，
   Medium / Large 不再以 CR-lite 为现行路由。
3. 人工对照：`AGENTS.md` 只定义一套执行顺序；steering 只定义
   风险与条件门禁；`agent-entrypoint.md` 为按需规则。
4. Ruby YAML 解析 `.claude/agents/*.md` frontmatter，每个 `model`
   仍为合法单值 `opus` 或 `sonnet`。
5. 临时 fixture：Medium 缺 `cr.md` 时 artifact gate 退出非零；
   补齐非空 `cr.md` 后退出 0。
6. fresh CR 落盘后：
   `node scripts/verify-cut-artifacts.mjs docs/cuts/workflow-route-retire medium`
7. `git diff --check github/main...HEAD`
8. `pnpm -C app run verify:all`

Browser QA：不需要（process / docs-only，无用户可见产品改动）。

## 裁决点清单

- [x] DP-1 owner 拍板：退役标准刀 Workflow 路由。
- [x] DP-2 owner 拍板：PM + RM = Sol / max；PA / CR = Sol；
  DEV = Terra。
- [x] DP-3 owner 拍板：Medium / Large 保留 fresh CR；
  `agent-entrypoint.md` 按需。
- [ ] DP-4 fresh Terra DEV 完成，PM 亲跑验证。
- [ ] DP-5 fresh Sol CR APPROVE，Must Fix 清零。
- [ ] DP-6 PM + RM artifact gate → merge → main CI → STATUS 收官。
