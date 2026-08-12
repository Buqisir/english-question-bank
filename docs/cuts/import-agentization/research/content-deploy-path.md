# 内容上线链路审计

日期：2026-08-12  
票：`docs/cuts/import-agentization/wayfinder/tickets/02-content-deploy-path-audit.md`  
范围：只读本仓库主源；未连生产、未跑 deploy / pull-run-push、未读凭据内容。

## 结论总览

「导完题 → 人工确认 → 上线到 eqbank.cc 给消费端」今天对应的是 **内容传输脚本**
`scripts/pull-run-push.mjs push`（整库 `question-bank.sqlite` + 加性同步
`app/public/paper-assets/`），**不是** `deploy.sh` / `deploy-remote.sh`
（那条线只更新代码与前端构建产物）。R2（`backup-to-r2.sh`）是服务器侧异地备份，
不是消费端上线通道。

---

## 1. 「内容上线」今天具体推什么

### 1.1 生产上「内容」的物理构成

消费端读取的内容落在仓库树内默认相对路径（可被环境变量覆盖）：

| 构件 | 默认路径 | 运行时角色 | 出处 |
| --- | --- | --- | --- |
| 共享题库 SQLite | `data/question-bank.sqlite` | 题组/篇章/来源等共享馆 | `server/api.mjs`（`QUESTION_BANK_DB`）；`docs/cuts/launch-deploy/plan.md` |
| 试卷资产树 | `app/public/paper-assets/` | Canonical paper JSON / figures 等，经 `/paper-assets/*` 提供 | `server/api.mjs`（`QUESTION_BANK_PAPER_ASSET_ROOT`）；`deploy/Caddyfile` 经 verify-launch-deploy 断言反代 |
| 用户库 SQLite | `data/user-data.sqlite` | 账号/会话/草稿等 **服务器自建** | `server/api.mjs`（`USER_DATA_DB`）；`go-live-record.md` FG-4 |
| 前端构建产物 | `app/dist` | Caddy 静态托管 SPA | `scripts/deploy.sh`；`docs/cuts/launch-deploy/runbook.md` Redeploys |
| R2 备份对象 | `r2:eqb-backup/<stamp>/` | 异地快照，**不直接服务消费端** | `scripts/backup-to-r2.sh`；`go-live-record.md` |

`latest/**` 解析 JSON 可进 git；`versions/` 源料 gitignored，运行期不必需。
出处：`docs/cuts/launch-deploy/runbook.md` §6；`docs/cuts/launch-deploy/plan.md`
paper-assets 段；`.gitignore`（`app/public/paper-assets/*/versions/`）。

`question-bank.sqlite` **不在 git**（`*.sqlite` ignore）。出处：
`docs/cuts/launch-deploy/pa.md`（CONFIRMED 行）；本仓 `git ls-files data/*.sqlite`
为空（本审计核对）。

### 1.2 各脚本管哪一段

| 脚本 | 管什么 | 不管什么 |
| --- | --- | --- |
| `scripts/pull-run-push.mjs` | **内容**：仅 `data/question-bank.sqlite` + `app/public/paper-assets/`；`pull` 下拉、`push` 上推 | `user-data.sqlite`；R2；`app/dist` / git 代码；构建 |
| `scripts/deploy.sh` | **代码重部署（机上）**：`git pull --ff-only` → pnpm/npm 装依赖 → Playwright Chromium → smoke → `pnpm build` → `systemctl restart eqb` → `/api/health` | 不传 SQLite；不 rsync paper-assets；不碰 R2 |
| `scripts/deploy-remote.sh` | **代码重部署（本机一键）**：校验本地 `main` == `github/main` → SSH `runuser -u eqb` 分步执行与 deploy.sh 同序 → 公网 `eqbank.cc` 非致命检查 | 同上；host/key 来自 gitignored `.env.deploy` |
| `scripts/backup-to-r2.sh` | **异地备份**：两库在线 `.backup` + paper-assets + user-space → rclone `copy` 到 R2；独立 prune | 不是上线；不写生产消费路径 |

出处：各脚本头注与主体；`docs/cuts/launch-deploy/runbook.md` Redeploys /
Backup + import；`docs/cuts/launch-deploy/cut-note.md` Slice 2/3/4。

`scripts/README.md` **几乎不描述部署操作手册**：它是 verify 索引；与本链路相关的是
`verify-launch-deploy.mjs` 一行，断言 deploy.sh / backup-to-r2.sh /
pull-run-push.mjs 的合约行为。出处：`scripts/README.md`（`verify-launch-deploy.mjs` 行）。

### 1.3 典型顺序（导题会话 → 生产可见）

按 runbook / 脚本头注锁定的「拉-跑-推」配方（**非**代码 deploy）：

1. **本机** `EQB_REMOTE=… node scripts/pull-run-push.mjs pull`  
   远端在线 `.backup` 快照 `question-bank.sqlite` → 本机同盘原子换入；加性拉取
   `paper-assets/`。出处：`scripts/pull-run-push.mjs` `pull()`；`runbook.md` Import。
2. **本机**跑导题/发布管线（写入本地 DB + `app/public/paper-assets/<paperId>/…`）。  
   出处：`scripts/pull-run-push.mjs` 头注；`scripts/import-pipeline/README.md`（管线本身，非本票深挖）。
3. **本机** `node scripts/pull-run-push.mjs push`（**内容上线核心**）  
   顺序锁死：manifest → 本地 integrity_check → **stop eqb** → 远端旧库
   `cp` 为 `.bak.<stamp>` → 传到 `.incoming.<stamp>` → 原子 `mv` → **rsync -a
   加性同步整棵 paper-assets** → **start eqb**。出处：`scripts/pull-run-push.mjs`
   头注「Locked recipe」与 `push()`。
4. （可选、独立）若本次还改了网站/服务端代码：先把 `main` 推到 `github`，再
   `scripts/deploy-remote.sh`（或机上 `deploy.sh`）。出处：`deploy-remote.sh`
   「0/5 local main must be pushed」；`runbook.md` Redeploys。
5. R2：生产机 cron 每日跑 `backup-to-r2.sh`，与上线按钮无同步耦合。出处：
   `go-live-record.md`（crontab）；`runbook.md` Daily backup。

**对「一卷导完后要点上线」的直接答案：** 要点名推到生产的是 **整份
`question-bank.sqlite` + 本机 `paper-assets/` 树（加性）**；不是 R2；不是
`app/dist`（除非另走代码部署）。若新卷 `latest/**` 已 commit 并随 `git pull`
上机，deploy 也会带上 tracked assets，但 **DB 仍必须走 pull-run-push**——git
不携带 sqlite。

---

## 2. 粒度：整库/整站 vs 单卷增量

| 面 | 现状粒度 | 出处 |
| --- | --- | --- |
| `question-bank.sqlite` | **整文件替换**，无单卷/单表增量推送 API | `plan.md`「question-bank 走整文件」；`pull-run-push.mjs` 仅传该路径 |
| `paper-assets/` | **整目录加性 rsync**（`rsync -a`），脚本无「只传某个 paperId」参数 | `pull-run-push.mjs` `transferToRemote(..., { isDir: true })`；注释「syncing paper-assets (additive)」 |
| 代码/`app/dist` | **整站重构建 + 重启**（`git pull` 后的当前 tree） | `deploy.sh` / `deploy-remote.sh` |
| `user-data.sqlite` | **永不**被内容上线脚本触碰 | `pull-run-push.mjs` MF-2；`runbook.md`；`pa.md` |

**「单卷上线」在现状下意味着：** 本机已把该卷 import/publish 进**同一份**本地
共享库与 assets 树后，执行一次 **整库 push**（外加 assets 整树加性同步）。没有
「只把 `paper-XXXX` 推上生产」的一等公民命令；其他已在本地库里的变更会一并上去。

加性 assets：**不会**用 sync 删除远端多余目录；远端孤儿目录不会因 push 自动消失。
出处：rsync `-a` 无 `--delete`（`pull-run-push.mjs`）；对比 backup 明确禁
`rclone sync`（`backup-to-r2.sh` SW-1）。

---

## 3. 前置条件与校验

### 3.1 脚本自带安全检查

**`pull-run-push.mjs`**

- 传输清单固定为两路径；`basename` 匹配 `/user-data/i` 则 **abort**（MF-2）。
- `push`：本地 DB 必须存在且 `PRAGMA integrity_check == ok`，否则拒绝推。
- `push`：禁原位写活动库路径；同盘 temp + `mv`（MF-1）；换前停服、换后起服。
- `push`：换前远端离线 `cp` 出 `.bak.<stamp>`。
- `pull`：远端在线 `sqlite3 .backup`（禁对活动库裸 cp）；落地前 integrity_check；
  本机旧库 `.bak.<stamp>`；同盘原子换入。
- 永不传输 `user-data.sqlite` / `*.sqlite-*` 旁文件。
- 需要 `EQB_REMOTE`（真机 `user@host` 或测试 `local:<abs-dir>`）。

出处：`scripts/pull-run-push.mjs` 全文；`docs/cuts/launch-deploy/pa.md` MF-1/MF-2；
`scripts/verify-launch-deploy.mjs`（经 README 描述的 VA5 行为断言）。

**`deploy-remote.sh`**

- 本地 `main` 必须等于 `github/main`，否则 ABORT（防未推送代码上机）。
- Host/key 来自 `.env.deploy`（`EQB_DEPLOY_HOST` 必填；`EQB_DEPLOY_KEY` 默认
  `~/.ssh/eqb_deploy`）；真实 IP 不入库。
- 公网 curl 失败仅 WARN，以机上 health 为准。

出处：`scripts/deploy-remote.sh`。

**`deploy.sh`**

- 必须 `eqb` 用户执行（Chromium/cache 与服务账号一致），否则 exit 1。
- 重启后 30s 内 `/api/health` 冒烟。

出处：`scripts/deploy.sh`。

**`backup-to-r2.sh`**

- 每库 `.backup` 后 integrity_check 失败则整次 FATAL。
- 只用 `rclone copy`，代码路径禁 `sync`；prune 只删匹配时间戳前缀、保留 N 份。

出处：`scripts/backup-to-r2.sh`。

### 3.2 go-live-record / runbook 规定的人工前置

动生产前仍应过的记录项（本审计不重连生产核实现状是否变化）：

- 读 `docs/cuts/launch-deploy/go-live-record.md` 再动生产。出处：`AGENTS.md`
  Production and repository facts。
- **明确当前 owner 授权**后才可做生产变更 / 跑生产向 `pull-run-push`。出处：
  `AGENTS.md`（同段：「Never run `scripts/pull-run-push.mjs` against production
  otherwise」）。
- FG-4：史上第一次 push 前确认远端 `user-data.sqlite` 为服务器
  `ensureUserDatabaseShape()` 自建，非本机 scp。出处：`runbook.md`；
  `go-live-record.md`（已核实 FG-4 当时成立）。
- 数据孤儿历史注意项（jslk 磁盘孤儿、曾有 DB published 缺 assets 等）——属一致性
  风险，非脚本硬门。出处：`go-live-record.md`「仍需注意」。
- R2 可恢复性：记录称 2026-07-13/14 已演练拉回 + integrity + 对帐。出处：
  `go-live-record.md` 追记与 R2 恢复演练段。
- 代码部署与内容推送是不同操作；go-live 追记里 `deploy-remote.sh` 用于代码，
  体裁同步等曾在机上直接改库——说明生产内容变更路径不止一种，但 **导题上线的
  标准工具仍是 pull-run-push**。出处：`go-live-record.md` 2026-07-13 追记；
  `runbook.md` Import。

---

## 4. 回滚能力现状

| 机制 | 能退到哪 | 限制 | 出处 |
| --- | --- | --- | --- |
| push 时远端 `.bak.<stamp>` | 推错前的那一版 **question-bank.sqlite** | **无**一键 restore 子命令；需人工停服、把 bak mv/cp 回最终路径、起服；**不**自动回滚 paper-assets | `pull-run-push.mjs` `push()` step 4 |
| pull 时本机 `.bak.<stamp>` | 本机旧库 | 同上，保护的是本机 | `pull-run-push.mjs` `pull()` |
| R2 日备（14 前缀保留） | 两库 + paper-assets + user-space 的日期快照 | 恢复是运维流程（rclone 拉回 /tmp → integrity → 对帐）；**已演练过可读恢复，不是按钮**；retention prune 会丢掉更旧档 | `backup-to-r2.sh`；`go-live-record.md` |
| paper-assets 加性 rsync | 无对称「删掉刚推上的卷」 | 推错资产需人工删远端目录或从 R2/本机旧树覆盖 | `pull-run-push.mjs` |
| 代码 deploy | `git` 历史 + 再跑 deploy | 与内容库解耦 | `deploy.sh` / `deploy-remote.sh` |
| 中途失败 | 旧库已 bak 且可能仍在原位；服务可能停在 stopped | cut-note：可用性损失优先于静默坏库；需人工看报错并 start | `docs/cuts/launch-deploy/cut-note.md`「未处理」 |

**结论：** 内容推错后，**SQLite 有时间戳 bak + R2 日备两条退路**；**assets 无自动回滚**；
**没有**产品化「一键回滚」脚本或 API。

---

## 5. 按钮化差距与确认弹层语义

### 5.1 接到现有脚本还缺什么

| 缺口 | 现状事实 | 出处 |
| --- | --- | --- |
| 凭据存放 | 内容线依赖进程环境 `EQB_REMOTE`（及可选 `EQB_REMOTE_REPO` / `EQB_SERVICE_*`）；代码线依赖 gitignored `.env.deploy`（本机存在该文件，键名 `EQB_DEPLOY_HOST` 等——**未读值**）。SSH 私钥默认路径与 rclone.conf（仅备份）分离。后台需约定从哪加载、禁止写入 git。 | `pull-run-push.mjs`；`deploy-remote.sh`；`.gitignore` `.env.*`；本审计仅确认 `.env.deploy` / `.env` 文件存在 |
| 执行环境 | 脚本假定 **owner 本机** 有 `ssh`、`rsync`、`sqlite3`、网络达生产、以及停起 `eqb` 的远端 sudo。后台若是本地 Web，需能 spawn 本机 Node/子进程（或明确外包给本机 CLI），不能在无 SSH 的浏览器沙箱里直接推。 | `pull-run-push.mjs` remote dispatch；`runbook.md`「local-only transport」 |
| 日志回显 | 仅 stdout/stderr 文本（`[pull-run-push] …`）；无结构化事件流、无持久 run id。 | `pull-run-push.mjs` |
| 失败呈现 | 非零 exit + `FAILED:` 文案；push 中途失败可能留下 **eqb stopped**；无 UI 错误码契约。 | `pull-run-push.mjs` `fail()`；`cut-note.md` |
| 粒度 UI | 按钮若暗示「只上这一卷」，与整库 push 语义不一致——需文案对齐或先做增量能力（现状无）。 | 本报告 §2 |
| 与代码部署混淆 | map 说「底下调现有 deploy 脚本」；事实分叉：**内容 = pull-run-push**，**代码 = deploy-remote**。按钮必须点名调哪条，避免误跑整站 rebuild。 | `wayfinder/map.md`；本报告 §1 |
| 产品面 | 仓库尚无管理后台/admin 面可挂此按钮。 | `wayfinder/map.md` Notes |

### 5.2 「owner 明确授权」→ 确认弹层语义（映射建议，基于现规）

权威规则（出处：`AGENTS.md`）：

> Production changes, deploys, database/configuration mutation, and R2 actions
> require explicit current owner authorization. Check
> `docs/cuts/launch-deploy/go-live-record.md` before an authorized production
> action. Never run `scripts/pull-run-push.mjs` against production otherwise.

Wayfinder 已定产品意图（出处：`docs/cuts/import-agentization/wayfinder/map.md`）：

> 上线是后台真按钮：owner 点击 + 确认弹层即为生产授权，底下调现有 deploy 脚本；
> 本机后台没有别人。

映射为弹层应承载的语义（研究结论，非实现）：

1. **明示动作对象**：将执行 `pull-run-push.mjs push`（或将来封装名），目标为生产
   共享库整文件替换 + paper-assets 加性同步；**不是**仅当前卷行级更新；**不是**
   R2；默认**不**等同 `deploy-remote.sh`。
2. **明示后果**：生产 `eqb` 会短暂停服；远端旧库留 `.bak.<stamp>`；失败可能需人工
   起服。
3. **明示授权动作**：确认 = 当前 owner 对本次生产内容变更的 **明确授权**（满足
   AGENTS.md）；取消 = 零副作用。本机无多租户时，「登录 owner + 二次确认」即可
   充当授权证据，但弹层文案应写清「生产 / eqbank.cc / 整库」。
4. **前置检查提示（软）**：提醒已读/已知 go-live-record 注意项；可选展示将推送的
   本地 DB integrity 结果与目标 `EQB_REMOTE` 主机标识（脱敏），但不替代确认本身。

---

## 未能核实（本审计边界内）

- 生产机当前 `question-bank` / paper-assets 与本地是否已漂移、最近一次真实
  `pull-run-push push` 时间（禁连生产）。
- `.env.deploy` / `.env` / rclone 的密钥内容与 `EQB_REMOTE` 是否已在 owner shell
  配置（只确认文件存在与引用方式；未读值、未检查环境变量）。
- 从 `.bak.<stamp>` 恢复的逐步 runbook 是否另有未入库笔记；仓内无专用 restore
  脚本。
- 新卷若同时 commit `latest/**` 与 push DB，生产上 git pull 与 rsync 的时序竞态
  是否曾出过问题（无事故记录深挖）。
- `scripts/README.md` 以外是否另有更新的「内容上线」owner 口令清单（本审计以
  launch-deploy 文档 + 脚本本体为准）。
