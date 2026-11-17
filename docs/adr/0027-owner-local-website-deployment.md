# ADR-0027: Owner 本机执行网站部署，Deployment Orb 转为备用

- Status: Accepted (Owner 2026-10-18)
- Scope: 网站部署执行位置与本机入口；不修改服务器控制器或部署权限

## 背景

Owner 于 2026-10-18 要求把网站部署交回自己的 Mac。现有
`scripts/amp-orb-deploy.mjs` 并不依赖 Orb 运行环境，本机已登录的 `gh`
可提供 GitHub Actions 证据；沿用现有部署控制器即可，无须复制生产环境。

## 决定

Owner 说 `部署最新版` 即授权该次网站代码部署 Goal，包括诊断、健康检查与
约定的恢复。执行方使用 `~/Projects/eqb-deploy` 专用干净 `main` clone，
先 fetch 并 fast-forward 到 `origin/main`，再运行：

```sh
scripts/local-deploy.sh deploy --owner-said-deploy-latest
```

包装脚本在读取配置、钥匙串或发起网络请求之前，要求当前分支为 `main`、
工作区干净（包括未跟踪文件），且 `HEAD = origin/main`。不满足时 fail closed，
报告实际状态并给出带仓库路径的 `switch main`、`fetch origin`、
`merge --ff-only origin/main` 或 `status --short` 命令；不自动切分支、
丢弃改动或修复分叉。原 CLI 随后仍 fetch、fast-forward 并核对 GitHub 当前 main。

非机密配置在 `~/.config/eqbank/deploy/env`（`QUESTION_BANK_DEPLOY_SSH_HOST`）
和 `known_hosts`（钉住的 ED25519 主机公钥）。可用 `EQB_DEPLOY_CONFIG`
覆盖配置目录。仓库不记录主机地址。

私钥只存于 macOS 钥匙串的 `eqbank-deploy-ssh-private-key` 项，账户为
`eqbank`；包装脚本用 `security find-generic-password` 读取，仅通过子进程
环境传给原部署入口，不打印私钥。原入口仍按既有协议在权限受限的临时目录
中物化 SSH 凭据。包装脚本为本次调用创建专属临时根目录，把子进程 `TMPDIR`
指向它，shim 放在其子目录；外层 trap 在子进程结束或 SIGINT/SIGTERM 中断后
递归删除这一个根目录，即使 Node 未执行 `finally` 也清理残留凭据。
不扫描或删除其他临时目录，中断后不自动重试。不得把私钥复制进仓库、worktree、日志、
Agent 提示词、CI 或开发 Orb。Owner 选择不要求每次钥匙串读取弹窗确认。

## 对 ADR-0023 隔离理由的回应

ADR-0023 用独立 Orb 避免让开发与 CI 执行方接触部署密钥。Owner 选择不弹
每次读取确认时，接受的是本机同一用户下其他进程也可读取该钥匙串项的风险；
钥匙串不是同用户进程间的隔离。CI 与开发 Orb 仍不得获得密钥。

服务器两条授权公钥都具有同样的
`restrict,command="/usr/local/libexec/eqb-deploy-transport-v1"` 限制；
普通 shell 命令被拒绝。控制器从 GitHub 拉取 main 后要求
`fetchedSha === targetSha`。持有钥匙不能上传任意代码或取得任意 shell，
只能部署服务器自己从 GitHub 拉取的当前 main 最新提交。

但服务器不执行本地 CLI 的 Owner 授权或 GitHub Actions 证据检查。持有者可以
绕过这些本地检查，直接触发当前 main 包含的迁移及服务停启；保护路径 digest
可由持有者自行计算。控制器只比较调用者传入的 digest 与实际变更集合，
不验证独立审批；digest 约束变更集合，不证明已审查。此处列明钥匙泄露的
实际能力边界，不把 Owner 对同用户钥匙串读取的接受扩大为对其他风险的确认。
服务器独立验证 CI 证据与迁移审批可作为后续加固，本次不修改控制器。

## 网络处理

FlClash TUN 代理会在到服务器 22 端口的 SSH 握手前断开连接。包装脚本默认
为 SSH 加上 `ProxyCommand=/usr/bin/nc -b en0 %h %p`，绑定物理网卡直连。
`EQB_DEPLOY_DIRECT_INTERFACE` 可指定其他网卡；值为 `none` 时不用 SSH shim。
主机公钥钉住、forced command 与 SSH 其他限制保持不变。

GitHub API 经代理偶发 EOF。包装脚本只对没有写请求参数的 REST `gh api`
重试，包括明确指定 `-X GET` / `--method GET` 的请求；最多 4 次，间隔 2 秒。
失败尝试的 stdout 和 stderr 不进入成功结果；耗尽时只输出最后一次 stderr，
保留其退出码。含非 GET method、`-f`、`-F`、`--field`、`--raw-field` 或
`--input` 的调用，以及 GraphQL 与其他 `gh` 命令，直接执行一次；
不尝试从任意 GraphQL 文本推断其是否只读。现有部署入口的 main ref、workflow
runs、run attempt、check suite 和 jobs（含分页与重新核验）均使用 REST GET。
SSH 与部署请求绝不自动重试。
临时 shim 与 gh 输出文件都位于本次调用的专属临时根目录内并在结束时清理，
真实 `gh` 路径在生成 shim 前固定。

## 备用与退役

Deployment Orb 保留旧钥匙作备用，不把本机私钥复制给它。服务器现有第 1 条
授权公钥注释为 `eqb-amp-deployment-v1`，第 2 条为
`eqb-deploy-local-20261018`。只有 Owner 明确说退役时，才核对并删除服务器
第 1 条旧授权与 Orb 的私钥 secret，保留本机公钥；本 ADR 不授权现在删除。

## 主机 SSH 加固（2026-10-18）

Owner 同日授权关闭密码登录。只读排查确认：自 2026-07-04 起所有成功的 SSH
登录都是 `ubuntu` 的公钥登录，没有密码或 root 登录；日志中累计约 9600 次
失败的用户名/密码猜测。新增 `/etc/ssh/sshd_config.d/00-eqb-hardening.conf`
（`PasswordAuthentication no`、`KbdInteractiveAuthentication no`、
`PermitRootLogin no`），先于云镜像的 `50-cloud-init.conf` 生效；`sshd -t`
通过后 reload。之后密码登录对 `ubuntu` 与 `root` 均返回
`Permission denied (publickey)`，部署钥匙的 `preflight` 照常。腾讯云控制台的
TAT 免密终端与 VNC 不经过 sshd，作为带外恢复入口；需要回退时在控制台删除该
文件并 reload。不要为任何流程重新开启密码或 root SSH 登录。

## 保持不变

- 本地 CLI 要求 exact-main 的 natural GitHub Actions `Verify` 有成功的 `verify`
  与 `e2e` jobs；缺失、pending、失败、错误 SHA 或歧义证据均 fail closed。
- pinned restricted SSH、forced command、root-owned 控制器、隔离构建、
  原子切换、健康检查、回滚与流量/数据恢复边界不变。
- 代码部署 Goal 不包含迁移、Review/paper promotion、DB/R2 或 host 配置修改；
  审过的持久化维护仍要求既有分类、授权与 digest。
- 响应丢失时先通过支持的只读 preflight 与保留回执核对同一操作；UNKNOWN
  不得重放，不清除 admission/evidence，不在恢复流量后恢复旧数据。
- ADR-0023 仅「独立 Orb 为唯一执行方」这一点被替代；当前 CI 权威沿用
  ADR-0026，历史退役命令不恢复。

## GitHub 自动上线与手机回退（Owner 2026-11-16，BUB-223）

本段替代上文的执行位置限制：GitHub Actions `Deploy` 是主路径，Mac 原命令
保持备用；Mac 私钥仍只在 Keychain，CI 使用独立部署钥匙。CI 复用既有候选、
八 job 证据、保护路径与 digest 校验。只部署当前 main；旧 Verify 完成事件不能
授权部署尚未全绿的新 main。计划与实际执行绑定同一目标、生产 SHA 和路径摘要；
等待批准期间任一变化均停止，重新 dispatch，不能把审批挪给新候选。

普通差异走 `production`；保护路径非空则自动流程只开/更新「需要部署判断：
<sha>」issue。Owner 查看完整差异后，在 Deploy → Run workflow 选择 `code-only`
或 `migration`，并批准 `production-reviewed`。迁移仍需明确授权；摘要不代表审批。
仓库管理员须事先设置 `production-reviewed` 的 required reviewer 为 Owner，
限制两个 environment 的 deployment branch 为 main。`production` 不设人工审批。
这是 workflow 审批边界，服务器仍不独立验证 CI 或审批，泄露钥匙的能力见上文。

GitHub 仓库 variables：`EQB_DEPLOY_SSH_HOST` 使用 Mac 配置中的同一
`QUESTION_BANK_DEPLOY_SSH_HOST`（含 transport 用户），`EQB_DEPLOY_KNOWN_HOSTS`
使用已核对的同一 known_hosts 内容。分别在两个 environment 保存 secret
`EQB_DEPLOY_SSH_KEY`：同一把新建的专用 Ed25519 私钥，不能复制 Mac 钥匙。
workflow 的 GITHUB_TOKEN 需要 contents/actions/checks read 与 issues write。
钥匙受 forced command 限制，只能走部署/preflight（含下述上一版例外），没有 shell。

手机打开 Actions →「回退到上一版」→ Run workflow，输入 `ROLLBACK`。
preflight 给出可信 previousSha，仍通过 `deploy <previousSha>` 回退；只允许当前
成功、非 no-op activation receipt 的紧邻上一版，迁移 activation、缺失/歧义历史
或缺失 release/marker 均不允许。回退跳过 main 拉取和构建，原子切换、重启、
健康检查；失败切回原版本，回执保留 `rolledBackFrom`。其他旧 SHA 照旧拒绝。
带 code-only digest 的调用仍走普通 exact-main 准入，保证回退后经审批恢复 main
不会被误当成再次回退。
两 workflow 共用部署 concurrency，SSH 请求不重试。该兼容命令不携带 expected
current 参数；同时运行 Mac 操作时仍需避免竞争，回执不符先对账，不重放。

成功后自动创建带 `deploy-paused` 标签的暂停 issue。恢复按钮就是手机上的
Close issue：关闭所有 open 暂停 issue，然后运行 Deploy 的 `auto` 或等待下一次
main Verify 全绿。关闭 issue 本身不会立即部署。暂停只约束 Actions，不挡 Mac
备用命令或 root。回退后若创建 issue 失败，先手动新建带该标签的暂停 issue再处理，
不要重跑回退。job summary 记录版本、结果与 controller 健康版本。

首次启用前，由主会话把合并后 main SHA 与两个升级 payload 的 SHA-256 填入
下面占位符（在可信 clone 用 `git show "$T:deploy/<文件>" | shasum -a 256`
取得摘要），按既有 [升级通道](../cuts/controlled-ssh-maintenance/plan.md) 核对
无未决维护。腾讯云 root 控制台第一项：按摘要 staging，再提交一次升级；
已有 payload 不覆盖，UNKNOWN 按原 runbook 对账，不能重复提交。

```bash
set -euo pipefail
umask 077
T='<merged-main-40hex>'; H_SH='<shell-sha256>'; H_JS='<module-sha256>'
S=/opt/eqb/english-question-bank; B=/opt/eqb/deployments/host-upgrade-payload-$T
[[ $(id -u):$(id -g) == 0:0 && $T =~ ^[0-9a-f]{40}$ && $H_SH =~ ^[0-9a-f]{64}$ && $H_JS =~ ^[0-9a-f]{64}$ ]]
/usr/sbin/runuser -u eqb -- /usr/bin/env -i HOME=/home/eqb PATH=/usr/local/bin:/usr/bin:/bin GIT_TERMINAL_PROMPT=0 /usr/bin/git -C "$S" fetch --quiet --no-tags origin main
[[ $(/usr/bin/git -c safe.directory="$S" -C "$S" rev-parse FETCH_HEAD) == "$T" ]]
mkdir "$B"; mkdir "$B/deploy"
for F in upgrade-eqb-host-configuration-once upgrade-eqb-host-configuration-once.mjs; do
  /usr/bin/git --no-replace-objects -c safe.directory="$S" -C "$S" show "$T:deploy/$F" > "$B/deploy/$F"
done
printf '%s  %s\n' "$H_SH" "$B/deploy/upgrade-eqb-host-configuration-once" "$H_JS" "$B/deploy/upgrade-eqb-host-configuration-once.mjs" | /usr/bin/sha256sum --check --strict
/usr/bin/systemd-run --quiet --wait --collect --unit="eqb-host-upgrade-$T" --property=Type=exec --property=UMask=0077 --property=RuntimeMaxSec=1200s --property=KillMode=control-group --property=StandardInput=null --property=StandardOutput=journal --property=StandardError=journal -- /bin/bash "$B/deploy/upgrade-eqb-host-configuration-once" "$T"
```

第二项：把 `U` 填为现有 transport 用户，`PUB` 填为新 CI 公钥的类型与正文
（不含原注释），以下一行仅追加缺失的精确授权行：

```bash
U='<transport-user>'; PUB='ssh-ed25519 <new-ci-public-key-body>'; A="$(getent passwd "$U" | cut -d: -f6)/.ssh/authorized_keys"; L="restrict,command=\"/usr/local/libexec/eqb-deploy-transport-v1\" $PUB eqb-deploy-github-actions-v1"; [ "$(id -u)" = 0 ] && [ -f "$A" ] && [ ! -L "$A" ] && { grep -qxF "$L" "$A" || printf '\n%s\n' "$L" >> "$A"; }
```

通过新 CI key 的 preflight 后再启用 Actions。保留 Mac/Orb 两条旧授权。
历史 bootstrap/retire 脚本断言只有 1–2 把钥匙；以后调用前先处理第三把 CI
钥匙并重新审查，不能直接运行它们；日常 deploy 不依赖这些历史脚本。
