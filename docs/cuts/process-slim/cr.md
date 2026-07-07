# CR — process-slim（交接体检修正，docs-only 刀）

Reviewer: fresh Opus CR, cold-read of `git diff main...HEAD`. Review only, no patches.

## Baseline reviewed / verdict

- Baseline: `main` @ 9eea13d
- HEAD: 7edb245（plan 37f7543 + 实现 7edb245）
- Scope: 13 文件，+266 / -271，零运行时代码（无 .mjs/.ts/.tsx/.js/.sql）
- **Verdict: APPROVE**（0 Must Fix，3 Should Watch）

## Verification evidence（自跑，非抄报告）

- `pnpm -C app run verify:all` → exit 0，**PASS 62 / SKIP 0 / FAIL 0**（含 launch-deploy 50 passed）。
- RM 闸 `node scripts/verify-cut-artifacts.mjs docs/cuts/process-slim medium` → PASS 2 / FAIL 0，命中 plan.md，PA/CR 为 NOTE（本刀 PA-lite inline，符合）。
- diff 文件清单亲验：无运行时代码、无 ADR、无 external-agents.md、无 watch-ledger、无历史 cut 记录被改写。go-live-record.md 是在 launch-deploy 目录下**新增**补档件，未改动既有 launch-deploy plan/cut-note，属 plan item 14 授权范围，非历史触碰。

## 闸门清单逐条核对（process-tuning「一个不动」）

- RM 闸（verify-cut-artifacts）：仍在 — 脚本本尊未动；AGENTS.md:171 + protocol §2.5「RM artifact gate」+ steering/README:77 三处描述一致；本刀反而把脚本补登进 scripts/README「Process / workflow gates」表。
- PreToolUse hook：仍在 — AGENTS.md:338 硬 guard 条文未触碰。
- PR 尺寸闸（Single-PR size gate）：仍在 — protocol §2.5:161，未触碰。
- 硬闸 A/B：仍在 — RM gate（AGENTS.md:65）+ PreToolUse（:338）两道硬 guard 均未触碰。
- PA/DEV/CR fresh context 独立性：仍在 — AGENTS.md Current Operating Reality + review-levels:82 + steering/README:62 未弱化；本刀把 PA 触发从「按 tier 默认」改为「按不可逆性触发」是**对齐既有 protocol §2/§7**，非弱化（见下）。
- owner process brake：仍在 — steering/README:79、protocol §3 未触碰。
- 浏览器 QA 不可让渡：仍在 — 25 处提及，medium/large flow（protocol §2、steering/README:52-61）仍含 browser QA + PO QA；AGENTS.md 删掉的只是重复的 flow 字符串，唯一出处仍在 protocol。
- Super Teacher Boundary：仍在 — 3 处，未触碰。
- product-scope-discipline：仍在 — AGENTS.md + steering/README + steering/product-scope-discipline.md 均在。
- 指令预算 / Context-Output Economy：仍在 — 4 处，未触碰。
- subagent 钉模型（Opus/Sonnet）：仍在 — tier 表未触碰（Opus 9 / Sonnet 7 处）。

结论：**闸门零损失**。AGENTS.md「Cut tier flows」由全文改为指向 protocol §2 的指针后，被指向的 §2 确实含 small/medium/large 完整 flow 文本，指针不悬空；没有任何闸门的唯一出处被删。

## 事实核对（新写入现实陈述 vs repo 证据）

- 已上线 eqbank.cc：owner 2026-07-05 在站 QA + `线上核验`commit（09a0445）为**间接**证据；go-live-record.md 顶部诚实标注「真上机 repo 零留档」。AGENTS/README/STATUS 以「已上线」平述事实——owner 是 PO 且已确认，且补档件明确 hedge，未算过头。见 Should Watch 3。
- M0-2..5 + launch-deploy 已合并：git log 亲验，PR #240/#241/#250/#251 全在 main；docs/cuts/ 下 m0-2..5 + launch-deploy 目录齐全。✓
- ADR-0012..0016 存在且内容对齐：0012 invite-login、0013 owner/member、0014 isolation、0015 consume-only、0016 zero-import-UI——文件头亲验，「生产在后台 Agent、网站只消费」「导题 UI 全部退役」与 ADR 原文一致。✓
- 网站导题 UI 已退役（PR #263-265）：#265 = legacy-import-retire（git log 确认）；ADR-0016 载明三退役刀，PR 号方向正确。✓
- CI workflow 已安装：`.github/workflows/verify.yml` 存在，on pull_request + push main，Node 24 + pnpm，跑 verify:all。scripts/README 从「未安装」改为「已安装」属实。✓
- 目录清单（server/shared/schemas/deploy）：四目录均存在；deploy/ 含 Caddyfile + eqb.service，坐实 README「Caddyfile、systemd unit」。✓
- 残留清零：模板内 `pm-spec.md`、Kratos 强制步、`22:30`、`workflow is not installed` 在活性条文中均已清零（剩余命中仅在 process-slim/plan.md 自述、cut 历史、脚本正当描述）。✓
- 4 脚本补登：verify-cut-artifacts / verify-c8-forbidden-scope / verify-i0c / verify-i0d 均真实存在且已入 scripts/README。✓

## Should Watch（不阻塞）

1. **review-levels L 表与 medium「无默认 PA」的软矛盾残留**：本刀在 review-levels 顶部新增 L↔tier 映射 note，散文（:23）已改为「按不可逆性触发 PA」。但表格 L2/L3/L4 行「Required Gates」列仍硬列 `PA + DEV + CR...`，而 L2-L3≈medium 的 medium flow 明说无默认 PA。note 用「protocol's tier rules win」兜底调和，逻辑自洽（L 表=该 change type 的最大 gate 集，tier/不可逆性决定 PA 是否真触发），但表列字面仍写「PA」，未来读者可能只看表就误以为 medium 必 PA。plan item 7 只承诺「补一句映射说明」，未承诺改表——故在契约内，记录不阻塞。若日后再动 review-levels，建议把 L2/L3 的 PA 标注为「PA（若触发）」。

2. **README 重写丢了本地 DB 手动初始化配方**：旧版 `sh scripts/init-db.sh` + `sqlite3 data/question-bank.sqlite ...` + `data/sql/schema.sql`/`seed-v0.sql` 指针，新版只留 `pnpm dev`（自动初始化）。这些文件仍存在且有效，但手动 init/seed/查库入口现在只活在 git 历史与 ADR-0011（历史件）。主开发路径 `pnpm dev` 已覆盖，属 solo-owner 本地便利，plan 授权「保持短」，故非 Must Fix；若将来需直接查/播种共享库会略不便。

3. **「已上线」以平述呈现，repo 直接证据仅间接**：STATUS/README/AGENTS 均以肯定语气写「已上线」，而全 repo 唯一佐证是 owner QA + `线上核验`修复 commit + 部署脚手架。go-live-record.md 已把这层不确定性诚实落盘并加了「补齐前勿在服务器跑 pull-run-push / 改生产配置」的护栏，处理得当。仅提示：入口文档的确定性口径 > 底层证据强度，靠 owner 身份撑住。

## Residual risk + failure / attack angle

这是 docs-only 刀，无运行时回归面；真实风险是**误导未来 agent**，两条：

- **过度自信的现实陈述**：go-live-record.md 是唯一诚实标注「上机零留档」的地方，但它字段全空、待 owner 补。若 owner 长期不补，而后来 agent 只读 AGENTS/README/STATUS 的「已上线 ✅」平述，可能在**服务器实况未知**的情况下贸然跑 `pull-run-push.mjs` 或改生产配置——护栏只写在 go-live-record 里，AGENTS Product Posture 只给了指针（`server facts in go-live-record.md`）而未复述「补齐前勿动生产」这句硬约束。攻击角度：一个没点开 go-live-record 的 agent 会漏掉那条护栏。属未来风险，本刀不阻塞（护栏已存在，只是位置偏），可在真正动生产的刀里再提级。

- **PA 触发口径的双源**：本刀把「medium 默认 PA」统一成「按不可逆性触发」，散文四处（AGENTS/protocol/steering-README/review-levels:23）已一个说法；唯一残口是 review-levels 表列（Should Watch 1）。风险是某 agent 引用 L 表证明「medium 必须 PA」，与 tier 规则打架——note 已声明 protocol 优先，风险被压到低位，但未彻底消除。

razor：docs 刀、闸门零损失、verify+RM 双绿、事实可溯、无 scope leak——停在 APPROVE，Should Watch 均为契约内的可接受残留，不升级、不扩面。
