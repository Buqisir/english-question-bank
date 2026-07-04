# Cut Note — launch-deploy（M1 上机部署 · 代码侧）

Cut: launch-deploy — 把本地单用户运行时搬上香港轻量云单机所需的**代码侧脚手架**（不含真实上机）
Start date: 2026-07-04
Merge date: 2026-07-04
PA rounds: 1（APPROVE WITH MUST FIX，3 MF 全压进 plan）
Big CR rounds: 1（APPROVE WITH MUST FIX，1 MF-A + 3 Should-Watch）
Must Fix count: 4（PA MF-1/2/3 + Big CR MF-A），全部已闭合
Token / cost notes: 3 subagent — Slice 3 `dev`(Sonnet) ~87k / Slice 4 `dev-hard`(Sonnet) ~128k / Big CR(Opus) ~79k；另每 agent ~16k harness 开销。CR 修复 + 收尾由主 session 内联做（省一趟 DEV 往返）。

## Shipped

- **Slice 1+2（PR #250，前棒）**：`httpClient.ts` `apiPath`/`apiPathNoIpv6` 一律同源相对路径、删 `API_ORIGIN`（原逻辑非 localhost 会拼 `http://127.0.0.1:8787`，上域名全挂 + mixed-content，**生产构建之前是坏的**）；`deploy/Caddyfile`（443→静态 app/dist + 反代 /api,/paper-assets,/user-space→127.0.0.1:8787，SPA try_files 兜底，reverse_proxy 序在兜底前 SW-3）+ `deploy/eqb.service`（systemd，User=eqb，只绑本机）+ `scripts/deploy.sh`（pull/install/build/restart/health-smoke）+ `.nvmrc`(24) + `runbook.md`（首次上机手册）。
- **Slice 3（本棒，`a86b379`）**：`scripts/backup-to-r2.sh` — 两库 `.backup` 在线快照 + `PRAGMA integrity_check` 闸（不 ok 即中止）→ rclone **`copy`（非 `sync`，SW-1）** 推 R2，UTC 时间戳前缀 + 计数 prune（`purge`，时间戳正则过滤，无裸 `rm -rf`）；`--dry-run` 无 rclone 也跑通。`.gitignore` 补 `rclone.conf`；runbook cron（03:30 北京 = 19:30 UTC 前日 + `timedatectl` 核时区）。
- **Slice 4（本棒，`c6a6a58` + `5364b02`）**：`scripts/pull-run-push.mjs` — pull/push/check-manifest 三子命令。换库配方（锁死，MF-1）= **stop eqb → 备份远端旧库 → 传同盘 `.incoming` temp → 原子 `mv` → start eqb**，禁原位写、`journal_mode=delete` 无 WAL 旁文件逻辑。显式白名单（仅 `question-bank.sqlite` + `paper-assets`，禁 `data/` 通配，MF-2）+ manifest `/user-data/i` basename 断言（传输前 abort）。pull 走远端在线 `.backup` → **同盘原子换入 + 快照 integrity_check**（Big CR 硬化），永不碰 user-data。`local:<dir>` 伪远端 seam 让换库行为可测。
- **verify**：`scripts/verify-launch-deploy.mjs` VA1–VA6 + VA5 push/pull 双往返，**50 passed / 0 failed**，在 verify-ci + README。

## Cut Or Moved

- **真实上机（服务器开荒 + DNS 签证 + 首推题库）**：本刀不做——需 merged main + 采购凭据 + owner 在场触发。作为独立 go-live 阶段。
- **本地↔远端同步机制**：不建（roadmap M1-1：脚本 + 纪律兜底，不做魔法同步）。
- **per-user 配额 / 自助注册 / 内容授权分级**：路线图既定排除项 / 封存到 G 门。

## Wrong Assumptions Found

- **DB 模式**：plan 初稿凭想象当 WAL，PA 核实 = `journal_mode=delete`。关键结论自己核，别凭训练集猜（见 [[scout-hints-become-hallucinations]]）。
- **`.backup` ≠ 字节复制**：pull 落地的是 `.backup` 快照，逻辑等价但页布局/freelist 可不同 → 拿原始 sha 比对会假失败。测试须比**逻辑内容**（`SELECT`）。这条是我自己重跑 pull 测试时 verify 逮到的（初版断言太严）。
- **"采购仍缺"是过时的**：owner 2026-07-04 亲口"已经买好了"，纠正了旧 handoff。

## Rules That Prevented Rework

- **真库 QA 不可让渡**：Slice 3/4 都亲自重跑 verify + 冷读 `pull-run-push.mjs`，不盲信 subagent 报告——数据关键面尤其如此。
- **fresh Opus Big CR 冷读**：逮到 push 有 5 条断言、pull **0 条**的证明缺口（MF-A）——不补的话一次静默 pull 回归会完全隐形。
- **Subagent 模型纪律**：judge 活钉 Opus、机械活钉 Sonnet，DEV prompt 明令禁 spawn 子代理（防转包并发编辑 token 翻倍）。

## Verify And QA

- **Static verify**：`node scripts/verify-launch-deploy.mjs` = 50/0（VA1–6 + VA5 push/pull 行为断言：manifest abort 非零退出、user-data 字节+mtime 不变、swap inode 变化证原子 rename、STOP 记旧库 sha 证换前停机、pull 逻辑内容落地 + 快照清理）。在 verify-ci。
- **Browser QA**：Slice 1/2 前棒已做（本地 Caddy 真机拓扑 + 非 localhost LAN 主机名 → 零 8787、反代通、深链接刷新 200）。Slice 3/4 = 纯 ops 脚本，无浏览器面。
- **PO QA**：n/a（无产品/视觉面）。

## Watch / Follow-Up

- **Follow-up Gate FG-1..4（阻塞真上机，非本刀验收门）**：① 目标 Node 24 实测 `node:sqlite` 是否需 `--experimental-sqlite`；② argon2 装 `build-essential`+`python3`；③ `eqbank.cc`+www 的 A 记录须先于 Caddy 签证；④ 史上第一次 `push` 前确认远端 `user-data.sqlite` 是服务器 `ensureUserDatabaseShape()` 自建的（绝非本地推的）。
- **Big CR Should-Watch（均已在 `5364b02` 处理）**：pull 跨文件系统 mv → 改同盘原子；pull 缺快照完整性校验 → 加 integrity_check；prune 字典序 → 时间戳正则过滤。
- **未处理（可接受）**：push 换库中途失败会让远端服务停在 stopped（可用性非数据丢失，旧库已备份且原位；owner 手跑能看到报错重启，runbook 可加注）。

## Handoff

- **下一步 = M1 go-live（独立一棒，owner 在场）**。采购已完成。凭据取法（owner 2026-07-04 定）：DeepSeek key = owner 直接贴；R2 三凭据 + 服务器 root/IP + DNS 记录 = Claude 用 claude-in-chrome 从 owner 已登录面板自己扒。**密钥永不进 git/记忆/脚本**，go-live 当场落服务器 gitignored `.env`/`rclone.conf`。go-live 走 `runbook.md` 全程 + FG-1..4 现场核。

## Next Cut

- **M1 go-live**（真上机，走 runbook）；或插空清挂账：UI 烂点五条（`docs/cuts/ui-facade/ui-blemish-list.md`，owner 圈「按顺序全做」）/ 删题组入口小刀 / 小账（EntryModal、死 CSS、paper-workflows 真库空）。
