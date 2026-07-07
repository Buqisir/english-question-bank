# process-slim — 交接体检修正：过时事实 + 文档矛盾 + 残留清理（docs 刀）

Cut size: medium（docs-only，零运行时代码）；touches schema / data
contract / product boundary / teaching interpretation: no。
PA-lite inline（docs-only、无不可逆面；本刀本身就是 2026-07-07 接管
体检的产物，体检报告已当过半个 PA）：正式 PA 跳过，理由记录于此。
CR 不降级——fresh Opus CR 冷读 diff。

背景：2026-07-07 小川接管体检（主 agent 全链走读 + Sonnet 扫描代理
交叉核对）发现三类问题：入口文档对现实过时（上线/登录/consume-only
均未反映）、流程条文互相矛盾（medium-PA 三处两说、cut-note 落盘两说）、
模板与索引残留（Kratos 强制步、pm-spec.md、CI 未安装陈述、4 脚本漏登）。
owner 同日授权：按接管者顺手的方式逐一捋平，然后开始正常工作。

## 执行清单

### A. 现实修正（文档对齐已发生的事实）

1. `AGENTS.md` 首段 + Product Posture：删「current runtime is still
   local single-user (no login / no cloud sync yet)」类表述，改为当前
   现实——已上线 eqbank.cc（邀请制登录 M0-2、owner/member 两档 M0-3、
   用户隔离 M0-4、AI 日限额 M0-5、部署脚手架 launch-deploy 均已合并）；
   吸收 ADR-0015/0016 一句话：**生产在后台 Agent、网站只做消费**，
   网站端导题 UI 已全部退役。
2. `CONTEXT.md` 首段：去「local-first」自我定义，改为与上线方向一致的
   一句话（domain 语言本体不动）。
3. 根 `README.md`（2026-05-14 停更）：重写为当前现实——产品一句话、
   已上线、consume-only 原则、目录清单补 server/shared/schemas/deploy、
   本地开发与部署入口指针。保持短。
4. `scripts/README.md`:17-19「CI workflow 未安装」→ 已安装
   （`.github/workflows/verify.yml`，运行正常）。

### B. 矛盾修复（同一规则只留一个说法）

5. `AGENTS.md` Collaboration Workflow「Cut tier flows」：medium 流程
   删默认 PA 步，与本文件 Dispatch map、protocol §7、steering/README、
   review-levels 对齐（PA 按不可逆性触发，不按 tier）。顺带把该节与
   Dispatch map 重复的流程列表压成指针（规则全文只活在
   `docs/steering/cut-workflow-protocol.md`）。
6. `docs/steering/cut-note-protocol.md`：§3「Cut Note 默认只进对话、
   落盘由用户驱动」→ 对齐 RM 闸现实（large cut 必须提交
   `docs/cuts/<CUT>/cut-note.md` 才能收官）；删三处「22:30 daily log」
   残留（载体已不存在）。
7. `docs/agents/review-levels.md`：补一句 L0-L4 与 small/medium/large
   的映射说明，消除两套并行分级的歧义。
8. `AGENTS.md` Session reading contract 措辞「Project Steering hard
   rules」→ 与实际标题「Project Steering」对齐。

### C. 残留清理

9. `docs/cuts/_templates/agent-entrypoint.md`：删 Kratos 强制前置检查
   两条（kratos-memory 2026-07-03 已降级只读档案）；`pm-spec.md`
   字样 → `plan.md`。
10. `docs/cuts/_templates/big-cr-prompt-template.md`：Must Read 的
    `pm-spec.md` → `plan.md`。
11. `scripts/README.md` 补登 4 个漏登脚本：`verify-cut-artifacts.mjs`
    （RM 闸入口本尊）、`verify-c8-forbidden-scope.mjs`、
    `verify-i0c-seven-choices-analysis-v1.mjs`、
    `verify-i0d-seven-choices-surface.mjs`。
12. `docs/项目目录约定.md`：删 Codex 字样一句（:45）、目录分工清单
    补齐当前实际目录；其余（iCloud 边界、Models 路径、Qwen 边界）仍
    有效，保留。

### D. 接管者工作面（新增，最小集）

13. 新建 `docs/STATUS.md`：当前状态单页（上线事实、主线焦点、开放
    ledger 指针、下一步候选）。维护纪律一行进 AGENTS.md：medium/large
    cut 收官时顺手更新。
14. 新建 `docs/cuts/launch-deploy/go-live-record.md`：go-live 补档
    待填清单（部署 commit、FG-1..4 现场核结果、cron/备份状态、服务器
    Node 版本）——事实只有 owner 有，字段留空待填，不阻塞本刀。

## Forbidden

- 一切运行时代码（app/、server/、shared/、schemas/、scripts/*.mjs）。
- process-tuning「一个不动」清单里的全部闸门条文（RM 闸、PreToolUse
  hook、PR 尺寸闸、fresh context 独立性、硬闸 A/B、owner process
  brake、浏览器 QA、Super Teacher Boundary、product-scope-discipline、
  指令预算、subagent 钉模型）——只允许指针化重排，语义零损失。
- 历史 cut 记录、ADR、docs/agents/external-agents.md（归档件）——
  不动（watch-ledger 两处阿澈字样在已 RESOLVED 历史段落内，明确不清，
  自然换手原则）。

## 验收

- 扫描断言：活性条文中 `pm-spec.md`（模板内）/ Kratos 强制步 /
  「22:30」/「workflow is not installed」字样清零；AGENTS.md 全文
  medium 流程不再含默认 PA 步。
- 闸门零损失：process-tuning「一个不动」清单逐条仍可在条文中找到。
- `pnpm -C app run verify:all` 绿（housekeeping guard 扫文档引用）。
- fresh Opus CR 冷读 APPROVE（Must Fix 清零后）。
- RM 闸：`node scripts/verify-cut-artifacts.mjs docs/cuts/process-slim medium`。
