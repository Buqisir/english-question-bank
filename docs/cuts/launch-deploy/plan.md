# launch-deploy — M1 上机部署（DEV 执行契约）

## Cut Size

**large**。Touches schema/data contract/product boundary/teaching
interpretation: **yes**——生产环境前端如何寻址 API（同源相对路径）＋
「拉-跑-推」脚本要在本地与远端之间搬运 `question-bank.sqlite` 整库文件
（写错可损坏/覆盖几年积累的题库，不可逆面）。故正式 PA 前置（Opus/high），
committed plan.md，closeout 写 cut-note.md。

上游依据：`docs/cuts/launch-roadmap/roadmap.md`「M1 细化决策」六项（owner
grill 拍板 2026-07-04）＋决策 3/7；采购清单见同目录 `procurement.md`。

## Must Read（DEV / PA 必读，其余为 background）

- 本文件全文。
- `app/src/services/httpClient.ts`（Slice 1 唯一改动文件）。
- `app/vite.config.ts`（dev proxy 契约：`/api` `/paper-assets` `/user-space`）。
- `scripts/dev.sh` `scripts/init-db.sh` `scripts/backup-assets.sh`（现有脚本样板）。
- `server/api.mjs:54-64`（路径/端口/env 默认值）、`:4433`（`listen(port,'127.0.0.1')`）、
  `:151`（`/api/health` 免鉴权）、`:649` 开库/`:836` 等 `db.close()`（**每请求开关**）、
  `:65-66`（启动期内存索引 `teachingFacetIndex` 等）。
- `scripts/import-pipeline/README.md:31`（导入管线已明令「先停 API 释放写锁 …
  重启刷缓存」——Slice 4 换库配方的既有依据）。

## Objective

把当前「本地单用户」运行时原样搬上香港轻量云单机，域名 `eqbank.cc`，
Caddy 自动 HTTPS。产物是**代码侧脚手架**，让采购凭据齐了之后 go-live ≈
一条命令。本刀不含真实上机（那步需服务器已就绪 + 采购凭据，owner 在场
触发）。本地能验的一律本地验，验不了的（需真服务器/R2）以「配置正确 +
dry-run 通过」交付并在报告里标注。

## 现状拓扑（侦察实据，勿凭记忆推翻）

- **dev**：Vite（5173）serve 前端 + proxy 三条路径 → Node `127.0.0.1:8787`
  （`app/vite.config.ts` proxy 段）。Node 用原生 `node:http`，**只绑
  `127.0.0.1:8787`、只管 API、不 serve 前端**（`server/api.mjs:4433`；
  grep 无 `express.static`/`sendFile`/`dist`）。
- **两库**：`data/question-bank.sqlite`（共享馆，4.5MB）＋
  `data/user-data.sqlite`（用户数据，110KB）。默认路径 rootDir 相对
  （`server/api.mjs:56-57`），可被 `QUESTION_BANK_DB`/`USER_DATA_DB` 覆盖。
- **user-data 自动建表**：server 启动即调 `ensureUserDatabaseShape()`
  （单一真源，见 `scripts/migrate-user-data-split.mjs` 头注）——**服务器
  首启会自动建空的 user-data 表，无需手动迁移**。`auth.mjs` / `mySpace.mjs`
  / draft-paper 各表走 `CREATE TABLE IF NOT EXISTS`。
- **question-bank 走整文件**：不在服务器上从 schema 建，而是把 owner 本地
  策展好的库整文件推上去（roadmap 决策 7）。
- **SQLite 模式 = `journal_mode=delete`（非 WAL）＋句柄每请求开关**（PA 核实，
  纠正本 plan 初稿把它当 WAL 的错误假设）。→ 无持久 `-wal`/`-shm` 旁文件；
  换库不需 WAL 旁文件处理；旧 inode 不被长句柄钉住。真正的换库要点是
  ①启动期内存索引要刷新（须重启）②禁止对活动库路径**原位写入**（scp/rsync
  直接落到最终路径会让并发读到半写文件）。见 Slice 4 锁定配方。
- **paper-assets**：`app/public/paper-assets/<bundle>/latest/**` 的 JSON
  解析产物**在 git 里**（252 文件 tracked）；只有 `<bundle>/versions/`
  （原始 DOCX）gitignored。→ 服务器 `git clone` 即得运行期所需 assets；
  `versions/` 是源料/安全副本，运行期不需。
- **前端寻址**（Slice 1 命门，已核真码）：`httpClient.ts:17-32`
  `apiPath()`/`apiPathNoIpv6()` 在 hostname ∈ {127.0.0.1, localhost, ::1}
  时返回相对 `path`，**否则拼 `http://127.0.0.1:8787`**
  （`API_ORIGIN`，:14）。→ 部署到 `eqbank.cc` 后每个请求打向用户自己机器
  的 8787，且 HTTPS 页发 HTTP 撞 mixed-content。**生产构建现在是坏的**。
  全库仅此一处出现 `8787`（grep 确认）。
- **运行时依赖**：`server/api.mjs` `import { DatabaseSync } from 'node:sqlite'`
  （需 Node ≥ 22.5）＋ `node --env-file-if-exists`（Node ≥ 20）。本地
  Node v25.9。app 用 pnpm（`app/pnpm-lock.yaml`），server 用 npm
  （`server/package-lock.json`，含原生模块 `argon2`）。`.env` 现仅
  `DEEPSEEK_API_KEY`。vite 无 `base` 配置 → 默认 `/`（资源根相对，可被
  域名根托管）。

## 目标生产拓扑

浏览器 → **Caddy:443**（自动 HTTPS，`eqbank.cc`）：
- `/api/*` `/paper-assets/*` `/user-space/*` → `reverse_proxy 127.0.0.1:8787`
  （照搬 dev proxy 三条路径，保住 Node 侧任何访问/版本逻辑）。
- 其余 → 静态托管 `app/dist` ＋ SPA 兜底 `try_files {path} /index.html`。

Node API 仍 `127.0.0.1:8787`（不对公网开放，只 Caddy 反代）→ 前端全走
**同源相对路径**（Slice 1）。

## PM 拍板（DEV 不需再猜）

1. **前端寻址 = 同源相对路径**。`apiPath`/`apiPathNoIpv6` 一律返回相对
   `path`，删掉 `API_ORIGIN` 绝对分支。理由：所有真实拓扑（dev 经 Vite
   proxy——LAN IP 访问也走 proxy 相对可达；prod 经 Caddy）API 都同源；
   绝对 `127.0.0.1:8787` 分支本就对任何真远端是坏的，只是 dev 遗迹。
2. **部署用户 = 非 root 的 `eqb`**；仓库 clone 到
   `/opt/eqb/english-question-bank`（owned by eqb）。数据仍在树内
   （`data/`、`app/public/paper-assets`、`server/logs`），用代码默认相对
   路径，`.env` 只放密钥/可调项，不覆盖路径。
3. **进程 = systemd `eqb.service`**：`User=eqb`、`WorkingDirectory=<repo>`、
   `ExecStart=/usr/bin/node --env-file-if-exists=<repo>/.env server/api.mjs`、
   `Restart=always`。（若所选 Node LTS 的 `node:sqlite` 仍需
   `--experimental-sqlite` flag，则加到 ExecStart——DEV 在目标 Node 版本上
   实测确认。）
4. **反代 = Caddy**，`eqbank.cc` + `www.eqbank.cc` 同站；配置模板进仓库
   `deploy/Caddyfile`，真 HTTPS 签发依赖 DNS A 记录先就位（采购门）。
5. **Node 版本 = 24 LTS**（满足 node:sqlite≥22.5 与 --env-file≥20；贴近
   本地 25.9）。加 `.nvmrc` 记录。装 app 依赖用 `corepack`+pnpm，装 server
   依赖用 `npm ci`（有原生 argon2，须服务器上编译/装预编译）。
6. **备份 = 服务器上每日 cron 推 R2**（rclone，S3 兼容端点）；范围＝两库
   ＋ `app/public/paper-assets/`（含 versions/）＋ `data/user-space/files/`。
   SQLite 必须用 `.backup` 在线快照后再推，禁止对活动库裸 `cp`；快照产物须过
   `PRAGMA integrity_check` 才推。用 rclone **`copy`（只增）不用 `sync`（会删
   远端多余）**——异地副本是最后防线，本地误删不该传导成远端删除；保留策略走
   独立 prune（SW-1）。
7. **拉-跑-推 = 本地跑的脚本**，只服务「导入新真题」，拆 `pull`/`push` 两显式
   子命令。以下为 PA 锁定的 Must Do（MF-1/MF-2）：
   - **换库配方（锁死）**：`push` 换远端 `question-bank.sqlite` = **stop `eqb`
     → 传到远端 temp 路径 → 同盘 `mv` 原子换入 → start `eqb`**。stop/start 是
     为刷启动期内存索引（非为解句柄）；`journal_mode=delete`，**不写任何 WAL
     旁文件处理逻辑**。
   - **禁原位写**：绝不 scp/rsync 直接落到活动库最终路径。
   - **白名单按显式路径（锁死）**：只传**明确点名**的
     `question-bank.sqlite`（精确路径）+ paper-assets，**绝不**用 `data/` 目录
     通配或 `data/*.sqlite`。拉/推两侧同纪律。
   - **manifest 断言**：先建传输清单，断言清单内**无任何 basename 匹配
     `user-data`**（正则，非精确串——防 `user-data.sqlite-journal` 等旁文件/
     未来改名漏网），命中即 abort。
   - 推前备份远端旧库；`user-data.sqlite` 永不被拉/推/读写。

## 切片（每片独立可验/可交付）

### Slice 1 — 生产同源寻址修复（码；**唯一可本地端到端验**）
- 改 `app/src/services/httpClient.ts`：两函数一律返回相对 `path`；删
  `API_ORIGIN` 绝对分支（函数名可保留为薄透传，或折叠为一——DEV 定，CR 复核；
  H11-A PR1 头注所述「两形态合并 = 独立行为变更」正由本刀落实，两者现变为
  行为等价，合并安全，报告注明）。
- **验收**：① 打 prod build（`pnpm -C app build`）产物中不含
  `127.0.0.1:8787` / 任何绝对 API origin；② 行为断言：stub
  `globalThis.window.location.hostname='eqbank.cc'` 后 import，`apiPath('/api/x')`
  返回 `'/api/x'`；③ 浏览器 QA（见下）。
- **Forbidden**：不碰任何 `server/**`、不改除 httpClient 外的 service 文件、
  不动 vite proxy。

### Slice 2 — 部署脚手架（配置/脚本；本地 lint + 拓扑 smoke）
- 新增：`.nvmrc`；`deploy/eqb.service`（systemd 模板）；`deploy/Caddyfile`
  （反代+静态+SPA 兜底）；`scripts/deploy.sh`（git pull → 装依赖 → build →
  `systemctl restart eqb` → 打 `/api/health` smoke）；
  `docs/cuts/launch-deploy/runbook.md`（首次上机手册：建 eqb 用户、装 Node24/
  Caddy、clone、首次 push question-bank + paper-assets versions、建 .env、
  `create-user.mjs` 建 owner 账号、起服、配 DNS 后 Caddy 自动签证）。
- **验收**：`bash -n` / shellcheck 过；Caddyfile 结构含三条 reverse_proxy +
  static + `try_files`；systemd 单元含 User/WorkingDirectory/ExecStart/Restart；
  本地拓扑 smoke：build 后用 `caddy`（若装）或等价静态服 + Node 起在
  `127.0.0.1`，以**非 localhost 主机名**（改 hosts 或 `--host`）访问，确认
  相对寻址生效、三路径反代通、SPA 深链接刷新不 404。
- **Forbidden**：不改 `server/api.mjs` 绑定/端口逻辑；不把 Node 直接暴露公网。

### Slice 3 — 备份 cron → R2（脚本；dry-run 可验）
- 新增：`scripts/backup-to-r2.sh`（`.backup` 在线快照两库、快照过
  `integrity_check` → 连同 paper-assets + user-space 用 rclone **`copy`**（非
  `sync`，SW-1）推 R2；时间戳 key + 独立 prune 保留策略；推后 size/清单核对）；
  cron 装法写进 runbook（如每日北京 03:30）。
- **验收**：`bash -n` 过；`--dry-run`（或对本地 rclone remote）跑通并打印将推
  清单；`.backup` 快照产物可被 `sqlite3 <snap> "PRAGMA integrity_check"` 通过。
  真推 R2 依赖凭据（采购门），报告标注「dry-run 验」。
- **Forbidden**：备份是只读源库，不得改动 `data/**` 原文件。

### Slice 4 — 拉-跑-推导入脚本（数据关键；dev-hard；PA 锁定配方 MF-1/MF-2）
- 新增：`scripts/pull-run-push.mjs`（或 .sh），拆 `pull` / `push` 两显式子命令
  （owner 在本地导入管线前后各跑一次），非一键魔法。
  - `pull`：从远端**显式点名**取 `question-bank.sqlite`（远端在线 `.backup`
    快照后 scp/rsync 该单文件）+ `app/public/paper-assets/`；落本地前先备份本地
    旧库。绝不拉整个远端 `data/`。
  - `push`：把本地更新后的 `question-bank.sqlite` + 新增 paper-assets 推远端。
    **换库配方（锁死）= stop `eqb` → 传远端 temp → 同盘 `mv` 原子换入 →
    start `eqb`**；推前备份远端旧库。`journal_mode=delete`，无 WAL 旁文件逻辑。
  - **禁原位写**：不 scp/rsync 直接落到活动库最终路径。
  - **白名单 + manifest 断言（MF-2）**：只传显式点名文件；先建传输 manifest，
    断言其中无任何 basename 匹配 `user-data`（正则），命中 abort；拉/推同纪律。
- **验收（行为断言，MF-3）**：`node --check`/`bash -n` 过；本地「假远端」（另一
  目录扮演远端）跑通 pull→push 往返，assert ①假远端 `user-data.sqlite` 字节+
  mtime 全程不变 ②喂一个 `user-data` 名字的路径能令脚本非零退出（abort 真触发）
  ③push 走 temp+mv、换前有 stop 调用点。真远端跑依赖服务器（采购门），报告标注。
- **Forbidden**：任何路径不得读/写/删远端或本地 `user-data.sqlite`（含
  `*.sqlite-*` 旁文件）；不得对活动 `question-bank.sqlite` 原位写；不得 `data/`
  目录通配传输；不得 `rm -rf` 无 dry-run 护栏的目标。

## 全局 Forbidden

- 不改 `server/**` 的运行语义（本刀纯部署，Node 绑定/路由/DB 逻辑不动）。
- 不把 Node API 端口对公网开放（防火墙只留 22/80/443；8787 仅本机）。
- 不新增对 `data/**` 原始库的破坏性操作缺 dry-run/备份护栏。
- **不对活动 `question-bank.sqlite` 路径原位写**（MF-1）；**不用 `data/` 目录
  通配传输**（MF-2）——只显式点名文件。
- 密钥（DEEPSEEK/R2/SSH）永不进 git、永不进记忆、永不硬编码进脚本；走 `.env`
  / rclone.conf（均 gitignored）。
- 不深化 local-only 假设（AGENTS.md）：新脚本用 env/参数化路径，不硬编码
  owner 本机绝对路径（除 runbook 举例）。

## Verification（RM 门用）

- 新增 `scripts/verify-launch-deploy.mjs`，断言：
  - VA1 行为：window.hostname 非本地时 `apiPath`/`apiPathNoIpv6` 仍返回相对 path。
  - VA2 源：`app/src/services/**` 不再含 `http://127.0.0.1:8787` 绝对 origin。
  - VA3 `deploy/Caddyfile` 含三条 reverse_proxy 到 127.0.0.1:8787 + `file_server` + `try_files … /index.html`，且 reverse_proxy 块序在 SPA 兜底之前（SW-3）。
  - VA4 `deploy/eqb.service` 含 `User=eqb`、`Restart=`、`--env-file`、`127.0.0.1` 语义（ExecStart 指向 api.mjs）。
  - VA5（**行为断言，非字符串在场，MF-3**）：脚本 `bash -n`/`node --check` 通过；
    喂 `user-data` 名字的输入令 pull-run-push **非零退出**（abort 真触发）；
    「假远端」pull→push 往返后假远端 `user-data.sqlite` **字节+mtime 不变**；
    push 走 temp+`mv` 且换前有 stop 调用点。
  - VA6（Slice 3 行为）：`.backup` 快照产物过 `sqlite3 <snap> "PRAGMA integrity_check"`；backup 脚本用 rclone `copy` 而非 `sync`。
- 标 `yes` 入 `scripts/README.md` 并加进 `scripts/verify-ci.mjs`（AGENTS.md housekeeping 门）。
- 合并前全绿：`pnpm -C app run verify:all` 或 PR CI。

## Browser QA Matrix（Slice 1/2）

| Case | Expected |
| --- | --- |
| 以非 localhost 主机名访问 build 产物首页 | 页面加载，`/api/health` 等请求走**相对同源**，Network 无 `127.0.0.1:8787` 绝对请求、无 mixed-content 报错 |
| 触发一次真数据请求（如题库列表/搜索） | 200，数据渲染 |
| paper-asset 图片/资源加载 | `/paper-assets/**` 经反代 200 |
| SPA 深链接直接刷新 | `try_files` 兜底到 index.html，不 404 |

## DEV Readiness / 依赖

- Slice 1 可立即开始，**本刀先落它**（唯一端到端可验 + 解锁拓扑）。
- Slice 2 依赖 Slice 1 的相对寻址（拓扑 smoke 要它）。
- Slice 3 / 4 结构独立，可与 2 并行；真跑均等采购/服务器（非本刀验收门）。
- 采购门（DNS A 记录、R2 三凭据、服务器 root/SSH、DEEPSEEK key）：owner 侧，
  不阻塞本刀交付；go-live 时补。

## PA 裁决（R1–R5 已全部锁定，见 pa.md）

- R1（换库）→ 锁：`journal_mode=delete` 无 WAL；句柄每请求开关；配方 =
  stop→temp+同盘 mv→start；禁原位写（PM #7 / Slice 4 / MF-1）。
- R2（denylist）→ 锁：显式路径白名单 + manifest 断言无 `user-data` basename
  （MF-2）。
- R3（备份）→ 锁：rclone `copy` 不 `sync`；快照过 integrity_check（PM #6 /
  Slice 3 / SW-1）。
- R4（折叠两函数）→ 无运行依赖，安全折叠；`apiPathNoIpv6` 仅
  `paperImport`/`paperImportAi` 引用，`::1` 差异只在 `http://[::1]` dev 浏览时
  才有意义（SW-2，并落地 H11-A PR1 挂账「两形态合并=行为变更」，owner 追认）。
- R5（Caddy 序）→ reverse_proxy 三块须在 SPA 兜底前；本地拓扑 smoke 覆盖
  （SW-3，VA3 亦断言序）。

## Follow-up Gate（阻塞真上机，非本刀验收门）

- FG-1：目标 Node 24 LTS 上实测 `node:sqlite` 是否仍需 `--experimental-sqlite`；
  需则加进 `ExecStart`（runbook 记）。
- FG-2：runbook 须列 argon2 源码构建 apt 依赖（`build-essential`、`python3`）
  或确认 Node-24 linux-x64 有预编译（SW-4）。
- FG-3：`eqbank.cc` + `www` 的 DNS A 记录须先就位，Caddy 才能签证；www↔apex
  重定向/证书在真机核（采购门，owner 侧）。
- FG-4：史上第一次 `push` 前，须确认远端 `user-data.sqlite` 是服务器自身
  `ensureUserDatabaseShape()` 启动时建的（绝非从本地推上去的）。

## PA Follow-Up Decisions

PA 裁决 APPROVE WITH MUST FIX（`pa.md`）：3 Must Fix / 6 Should Watch /
4 Follow-up Gate / **0 阻塞 PO 决策**。三条 Must Fix 已压入下表并落到对应
Slice/PM 决策/Forbidden/Verification。Big CR 复核此映射后方可视 PA 环闭合。

| PA item | pa.md required disposition | plan.md handling | Status |
| --- | --- | --- | --- |
| MF-1 | Slice 4 锁换库配方 stop→temp+同盘mv→start；注明 journal_mode=delete 无 WAL 逻辑；Forbidden 原位写 | PM #7 + Slice 4 + 现状拓扑 SQLite 模式条 + 全局 Forbidden | ✅ compressed |
| MF-2 | Slice 4 拉/推显式路径白名单 + manifest 断言无 `user-data` basename + 命中 abort；Forbidden `data/` 通配 | PM #7 + Slice 4 + 全局 Forbidden | ✅ compressed |
| MF-3 | 重写 VA5 为行为断言（abort 非零退出 / 字节+mtime 不变 / integrity_check），加 Slice 3 VA | Verification VA5 + 新增 VA6 | ✅ compressed |
