# M1 go-live 实况记录（已核实 2026-07-07）

`runbook.md` 是"计划怎么做"；本文件记录"实际做成了什么样"。
2026-07-07 小川经腾讯云轻量应用服务器「执行命令（TAT）」对生产机做
**只读**核实（未改动任何生产配置），补齐本记录。核实前的红线
（"补齐之前不要在服务器上跑 `pull-run-push.mjs` 或改生产配置"）自本次
起解除——但下面「仍需注意」两条在动生产前仍要过一遍。

## 服务器基础事实（TAT 只读核实）

- 实例：`eqb-hk-1`（腾讯云轻量应用服务器），香港三区，公网
  `43.129.215.118`，内网 `10.5.0.7`，2 核 / 2GB（swap 5GB）/ 40GB SSD，
  到期 2026-08-04。
- OS：Ubuntu 24.04.4 LTS，内核 `6.8.0-124-generic`。
- Node：`v24.18.0`（`/usr/bin/node`）。`sqlite3` CLI 在
  `/usr/bin/sqlite3`。
- `eqb.service`：`active` + `enabled`（开机自启）。Caddy：`active`，
  v2.11.4。
- 仓库：`/opt/eqb/english-question-bank`，属 `eqb` 用户（root 直接跑
  git 会触发 dubious-ownership，需 `runuser -u eqb`）。

## 逐项核实

- **[x] go-live 部署 commit / 分支**：`ec23627`（Merge PR #261
  `Buqisir/ui/teal-alpha-cleanup`），分支 `main`，commit 时间
  2026-07-05T21:46（-07:00）。**生产落后于本地 `main`**：本地 HEAD 已到
  `cd142f3`（#267），即 7-06 的导题 UI 退役三刀（#263-265）、7-07 的
  process-slim（#266）与 guard-hook deny 升级（#267）都尚未部署到生产。
  对 M1「owner 独用」无功能影响（owner 走后台导题），但下次 `deploy.sh`
  会把这些一起带上，属预期。
- **[x] FG-1（`--experimental-sqlite`）**：**不需要**。实际
  `ExecStart` = `/usr/bin/node --env-file-if-exists=<repo>/.env
  server/api.mjs`，无该 flag；服务在 Node v24.18.0 上 `active`，
  `/api/health` 返回 200 → `node:sqlite` 无需 flag 即可用。
- **[x] FG-2（argon2 编译依赖）**：间接确认可用。`users` 表有 owner
  账号、`sessions` 表有 3 条真实会话、`/api/auth/me` 返回 401（而非
  500）→ argon2 原生模块编译成功且登录链路正常。（未单独查
  build-essential/python3，登录能跑即证明够用。）
- **[x] FG-3（DNS + Caddy 证书）**：公网 `https://eqbank.cc/` 返回
  HTTP/2 200、`server: Caddy` → DNS 指向 + Caddy 自动签发 HTTPS 均正常。
  （本地 `dig` 得到 198.18.0.43 是本机 DNS 代理的假地址，以公网 curl
  为准。）
- **[x] FG-4（远端 `user-data.sqlite` 服务器自建）**：确认。该库里是
  生产运行时产生的数据——1 个 owner 账号 + 3 条真实 session——说明是
  服务器 `ensureUserDatabaseShape()` 自建自用，非本地文件推入。
- **[x] R2 备份 cron + 可恢复性**：**cron 已装并在跑**。root crontab：
  `30 3 * * * cd /opt/eqb/english-question-bank &&
  ./scripts/backup-to-r2.sh >> server/logs/backup-to-r2.log`（03:30 北京
  时间）。rclone remote `r2:` + `/home/eqb/.config/rclone/rclone.conf`
  （属 eqb，600，285B）都在。R2 桶 `eqb-backup` 实测 **1016 个对象 /
  50.2 MiB**，`backup-to-r2.log` 最近修改 2026-07-07 03:31 →
  **备份每天成功推送**。⚠️ 唯一报错：每天备份里
  `paper-2024-jslk-english/paper-asset.json` 复制失败（status 501），
  正是下面「仍需注意 #1」的那个数据孤儿；两个 sqlite 库和其余 1000+
  文件均成功。**可恢复性尚未做过恢复演练**（有对象，未验证 restore）。
- **[x] `.env` / `rclone.conf` 位置**：`.env` 在仓库根
  `/opt/eqb/english-question-bank/.env`（含 `DEEPSEEK_API_KEY` 等，
  值不记）。`rclone.conf` 在 `/home/eqb/.config/rclone/rclone.conf`
  （remote 名 `r2`）。`/root/.config/rclone/` 为空。
- **[x] 首批账号 / 模式**：**1 个 owner 账号**（`id=user-8be7f10c…`，
  `role=owner`），`users` 表非空 → **enforced 模式已开**（开放模式已
  关）。member 账号 **0 个**（尚未进 M2）。
- **[x] 与 runbook 的偏差**：无重大偏差。`ExecStart` 与 `eqb.service`
  模板一致，未加 `--experimental-sqlite`（Node 24 不需要）。

## 仍需注意（动生产前过一遍）

1. **数据孤儿 `paper-2024-jslk-english`**：磁盘上有
   `app/public/paper-assets/paper-2024-jslk-english/`（扁平结构、不在
   任何 DB 表），是一次没跑完的测试导入残留。它在生产**天天让备份报
   501**，也是数据一致性缺口的一部分。清理它（生产 + 本地）能同时消掉
   备份报错和 DB↔assets 不一致。属独立 small cut，owner 拍板后做。
   另有 `paper-fe8e7a65` / `paper-ee10da87` 两个 DB 标 published 但
   assets 缺失的孤儿，需一并核实。
2. **备份可恢复性未演练**：R2 有对象不等于能恢复。上线级别应做一次
   restore 演练（拉一份备份到临时库跑 `PRAGMA integrity_check` +
   起服务验证），再把这条勾掉。

## 追记 2026-07-09：导出线运行时系统依赖（事故补档）

owner 实测「导出 PDF」在生产 500（前端只显示"没成功，可以再试一次"，
服务端日志无痕迹）。根因：DOCX/PDF 导出线依赖两个**系统级**外部命令，
生产机从未安装过——这条路自 go-live 起就不通，E2E 冒烟走的是
vivliostyle print-pdf 线所以未暴露。

- `zip`（`server/exports/docxRenderer.mjs` 打包 .docx 用）→ `spawnSync zip ENOENT`
- `soffice`（LibreOffice，DOCX→PDF 转换）→ `LibreOffice soffice not found`
- 中文渲染还需 CJK 字体，否则导出成功但中文成方块

已装（2026-07-09，apt）：`zip unzip libreoffice-writer fonts-noto-cjk`
（--no-install-recommends）。QA 账号实测 `/api/exports/pdf` 200、
61KB、%PDF-1.7、中文正常、单题组 ~2.2s（soffice 冷转换）。

**重建服务器 checklist 必带**：`apt-get install -y --no-install-recommends
zip unzip libreoffice-writer fonts-noto-cjk`。候选改进（挂账）：启动时
预检 zip/soffice 并在 /api/health 暴露导出线就绪状态，避免静默断路。

## 追记 2026-07-09（二）：精排 PDF 线（vivliostyle）的 Chromium 系统库

owner 复报导出仍失败——上一条追记修的是 DOCX→LibreOffice 线（组卷篮
「导出 PDF」），owner 点的是**草稿卷工作台「精排 PDF」**（vivliostyle→
无头 Chromium），另一条线另一个断点：playwright 的 chromium-1194 二进制
在 /home/eqb/.cache/ms-playwright，但 9 个系统共享库缺失，浏览器 exit 127。

`ldd chrome | grep "not found"` 精确清单已装（apt，--no-install-recommends）：
libxcomposite1 libxdamage1 libxfixes3 libasound2t64 libatk1.0-0t64
libatk-bridge2.0-0t64 libatspi2.0-0t64 libgbm1 libpango-1.0-0

QA 实测 owner 原路径（建草稿→加题→POST /api/draft-papers/:id/print-pdf）
200、80KB %PDF、拉回目检版式正常。**流程教训：验修复必须走用户报障的
原按钮路径——两条 PDF 线各有断点，修一条测一条会漏。**

重建服务器 checklist（合并两条追记）：
`apt-get install -y --no-install-recommends zip unzip libreoffice-writer
fonts-noto-cjk libxcomposite1 libxdamage1 libxfixes3 libasound2t64
libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 libgbm1 libpango-1.0-0`

挂账不变：health 暴露两条导出线的就绪状态（zip/soffice/chromium 预检）。
新挂账：print-pdf 面的空题干渲染成「1. 56」裸题号行（屏幕面已治，打印
面未同步，小刀）。

## 追记 2026-07-09（三）：导出字体保真（owner 报「PDF 字体不对」）

症状：print-pdf 导出的 PDF 英文是 DejaVu Serif（非 Times 形制）、中文
回落不定（宋体名全部 miss）。根因：排版标准字体栈里的名字
（Times New Roman / SimSun / Songti SC / STSong / SimHei）在 Ubuntu 上
一个都不存在，fc-match 全部落到 DejaVu（无汉字字形，中文字形按 glyph
级随机回落）。

已修（2026-07-09）：
- `apt-get install -y fonts-liberation`——fontconfig 标准
  30-metric-aliases 自动把 Times New Roman 映射到 Liberation Serif
  （公认等宽度替身）。
- 新增 `/etc/fonts/conf.d/65-eqb-paper-fonts.conf`：宋体族名
  （SimSun/宋体/Songti SC/STSong）→ Noto Serif CJK SC（思源宋体，
  fonts-noto-cjk 自带）；黑体族（SimHei/黑体/Heiti SC/STHeiti）→
  Noto Sans CJK SC。`fc-cache -f`。
- 验证：同一草稿卷 before/after 导出对比，嵌入字体
  DejaVu* → LiberationSerif*，目检版面与真题气质一致。vivliostyle
  按次启动读 fontconfig，无需重启服务；LibreOffice（DOCX→PDF 线）
  同样受益于别名。

**重建服务器 checklist 必带**：`apt-get install -y fonts-liberation` +
恢复 `/etc/fonts/conf.d/65-eqb-paper-fonts.conf`（内容见本仓
`deploy/` 若已收编，或按上述别名重写）。
