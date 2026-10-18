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

GitHub API 经代理偶发 EOF。包装脚本只对没有写请求参数的 `gh api` 重试，
最多 4 次，间隔 2 秒；失败尝试的 stdout 不进入成功结果。含
`-X`、`--method`、`-f`、`-F`、`--field`、`--raw-field` 或 `--input`
的调用，以及其他 `gh` 命令，直接执行一次。SSH 与部署请求绝不自动重试。
临时 shim 与 gh 输出文件都位于本次调用的专属临时根目录内并在结束时清理，
真实 `gh` 路径在生成 shim 前固定。

## 备用与退役

Deployment Orb 保留旧钥匙作备用，不把本机私钥复制给它。服务器现有第 1 条
授权公钥注释为 `eqb-amp-deployment-v1`，第 2 条为
`eqb-deploy-local-20261018`。只有 Owner 明确说退役时，才核对并删除服务器
第 1 条旧授权与 Orb 的私钥 secret，保留本机公钥；本 ADR 不授权现在删除。

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
