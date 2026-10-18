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
中物化 SSH 凭据并在结束时清理。不得把私钥复制进仓库、worktree、日志、
Agent 提示词、CI 或开发 Orb。Owner 选择不要求每次钥匙串读取弹窗确认。

## 对 ADR-0023 隔离理由的回应

ADR-0023 用独立 Orb 避免让开发与 CI 执行方接触部署密钥。本次明确接受
Owner 本机同一用户下其他进程也可读取该钥匙串项的边界；钥匙串不是同用户
进程间的隔离。CI 与开发 Orb 仍不得获得密钥。

服务器两条授权公钥都具有同样的
`restrict,command="/usr/local/libexec/eqb-deploy-transport-v1"` 限制；
普通 shell 命令被拒绝。控制器从 GitHub 拉取 main 后要求
`fetchedSha === targetSha`，持久化变更还需要审过的 digest。因此在现有
控制器和已审 digest 边界内，部署钥匙泄露的最坏影响是提前或重复部署已合入
main 的代码，并不授予任意 shell、任意代码上传或任意持久化变更权限。
Owner 已接受此风险，换取本机操作的直接性。

## 网络处理

FlClash TUN 代理会在到服务器 22 端口的 SSH 握手前断开连接。包装脚本默认
为 SSH 加上 `ProxyCommand=/usr/bin/nc -b en0 %h %p`，绑定物理网卡直连。
`EQB_DEPLOY_DIRECT_INTERFACE` 可指定其他网卡；值为 `none` 时不用 SSH shim。
主机公钥钉住、forced command 与 SSH 其他限制保持不变。

GitHub API 经代理偶发 EOF。包装脚本只对没有写请求参数的 `gh api` 重试，
最多 4 次，间隔 2 秒；失败尝试的 stdout 不进入成功结果。含
`-X`、`--method`、`-f`、`-F`、`--field`、`--raw-field` 或 `--input`
的调用，以及其他 `gh` 命令，直接执行一次。SSH 与部署请求绝不自动重试。
临时 shim 在进程结束时清理，真实 `gh` 路径在生成 shim 前固定。

## 备用与退役

Deployment Orb 保留旧钥匙作备用，不把本机私钥复制给它。服务器现有第 1 条
授权公钥注释为 `eqb-amp-deployment-v1`，第 2 条为
`eqb-deploy-local-20261018`。只有 Owner 明确说退役时，才核对并删除服务器
第 1 条旧授权与 Orb 的私钥 secret，保留本机公钥；本 ADR 不授权现在删除。

## 保持不变

- exact-main 的 natural GitHub Actions `Verify` 必须有成功的 `verify`
  与 `e2e` jobs；缺失、pending、失败、错误 SHA 或歧义证据均 fail closed。
- pinned restricted SSH、forced command、root-owned 控制器、隔离构建、
  原子切换、健康检查、回滚与流量/数据恢复边界不变。
- 代码部署 Goal 不包含迁移、Review/paper promotion、DB/R2 或 host 配置修改；
  审过的持久化维护仍要求既有分类、授权与 digest。
- 响应丢失时先通过支持的只读 preflight 与保留回执核对同一操作；UNKNOWN
  不得重放，不清除 admission/evidence，不在恢复流量后恢复旧数据。
- ADR-0023 仅「独立 Orb 为唯一执行方」这一点被替代；当前 CI 权威沿用
  ADR-0026，历史退役命令不恢复。
