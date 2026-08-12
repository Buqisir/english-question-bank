# 内容上线链路审计

Status: done
Claim: wayfinder-charting-session-2026-08-12 (research 子代理已完成)
Blocked by: None
Type: research
Map: `docs/cuts/import-agentization/wayfinder/map.md`

## Question

只读本仓库主源（`scripts/deploy.sh`、`scripts/deploy-remote.sh`、
`scripts/pull-run-push.mjs`、`scripts/backup-to-r2.sh`、`scripts/README.md`、
`docs/cuts/launch-deploy/go-live-record.md` 及其相邻记录），回答「后台
一键上线按钮」所依赖的现状事实，写成
`docs/cuts/import-agentization/research/content-deploy-path.md`：

1. **「内容上线」今天具体指什么**：一卷导完后，哪些东西要到生产
   （SQLite 数据、`app/public/paper-assets/**`、R2、静态构建产物？），
   现有脚本各管哪段、按什么顺序跑。
2. **粒度**：现有链路是整库/整站推送还是可以单卷增量？单卷上线在现状下
   意味着什么。
3. **前置条件与校验**：脚本自带哪些安全检查（如 `pull-run-push.mjs` 的
   保护逻辑）、go-live-record 里规定了哪些人工前置步骤。
4. **回滚**：内容推错了怎么退——现有脚本/备份（R2）支持到什么程度。
5. **按钮化差距**：把「owner 在本地后台点按钮 + 确认弹层」接到现有脚本
   上，缺什么（凭据存放、执行环境、日志回显、失败呈现）；AGENTS.md 的
   「动生产需 owner 明确授权」如何映射为按钮的确认语义。

每条结论标注文件路径出处。只读审计：不连生产、不跑任何 deploy 脚本、
不改本仓其他文件。

## Resolution

报告：[`../../research/content-deploy-path.md`](../../research/content-deploy-path.md)

- **① 推什么**：内容上线 = `pull-run-push.mjs push` 推整份
  `data/question-bank.sqlite` + 加性 rsync `app/public/paper-assets/`；R2
  只是 cron 备份；`deploy.sh` / `deploy-remote.sh` 只管代码构建与重启，不传库。
- **② 粒度**：整库文件替换 + 整棵 assets 加性同步；无单卷增量命令——「单卷上线」=
  该卷已进本地整库后再整库 push。
- **③ 校验**：脚本侧有 user-data manifest abort、integrity_check、停服→bak→
  temp+原子 mv→起服；人工侧需 AGENTS.md 明确授权 + 读 go-live-record（含 FG-4
  等）。
- **④ 回滚**：远端 `.bak.<stamp>` + R2 日备（已演练）可退 SQLite；assets 无自动
  回滚；无产品化一键 restore。
- **⑤ 按钮差距**：缺后台 spawn/凭据约定（`EQB_REMOTE` vs `.env.deploy`）、日志与
  失败 UI（含停服残留）；确认弹层应明示「生产整库 push = owner 授权」，且勿与
  代码 deploy 混淆。

未能核实：生产与本地内容是否漂移及最近真实 push 时间；凭据内容与
`EQB_REMOTE` 是否已配置；`.bak` 恢复逐步手册是否另有未入库笔记；
git-tracked `latest/**` 与 rsync 时序竞态是否出过事故。
