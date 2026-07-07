# M1 go-live 实况记录（待 owner 补齐）

`runbook.md` 是"计划怎么做"；本文件记录"实际做成了什么样"。
2026-07-07 接管体检发现真上机在 repo 零留档——间接证据（2026-07-05
owner 在 eqbank.cc QA、"线上核验"commit）证明已上线，但以下事实只有
owner / 当时的 session 知道。**补齐之前，不要在服务器上跑
`scripts/pull-run-push.mjs` 或改动生产配置。**

逐项待填（owner 口述即可，小川落盘）：

- [ ] go-live 日期与部署的 commit / 分支：
- [ ] FG-1：Node 24 上 `node:sqlite` 是否需要 `--experimental-sqlite`：
- [ ] FG-2：argon2 编译依赖（build-essential + python3）是否装了：
- [ ] FG-3：eqbank.cc + www 的 DNS A 记录与 Caddy 签证状态：
- [ ] FG-4：远端 `user-data.sqlite` 是否确认为服务器自建（非本地推入）：
- [ ] R2 备份 cron 是否已装（03:30 北京）；最近一次备份是否验证过可恢复：
- [ ] 服务器上 `.env` / `rclone.conf` 的实际位置与内容口径（不记密钥值）：
- [ ] 首批账号：owner 账号已建？开放模式已关？member 账号几个：
- [ ] 与 runbook 的偏差（当场改了什么、跳过了什么）：

补齐后把本文件顶部的"待 owner 补齐"改为"已核实 <日期>"。
