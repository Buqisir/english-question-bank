# EQB Ops 只读 MCP

ChatGPT Web 通过现有 GitHub 连接看代码，通过 `https://mcp.eqbank.cc/mcp` 看生产状态和脱敏日志。本服务不提供 Shell、文件浏览、数据库、部署或网站路由。

## 生产位置

| 项 | 路径 |
| --- | --- |
| 代码 | `/opt/eqb-ops/app` |
| 环境 | `/etc/eqb-ops-mcp.env`（0640 root:eqb-ops） |
| 日志导出 | `/var/lib/eqb-ops/eqb.log` |
| MCP unit | `eqb-ops-mcp.service`（用户 `eqb-ops`，监听 `127.0.0.1:8790`） |
| 日志导出 | `eqb-ops-mcp-log-export.timer` |
| 独立 Tunnel | `cloudflared-eqb-ops.service`（用户 `cloudflared`，token `/etc/eqb-ops-mcp/tunnel.token`） |
| Tunnel 权限 | `/etc/eqb-ops-mcp` `root:cloudflared 0750`；`tunnel.token` `root:cloudflared 0640` |
| cloudflared | 二进制必须存在，版本 `>= 2025.4.0` |

不要把 MCP 接到现有 Caddy `eqbank.cc` 站点。不要给 `eqb-ops` sudo。

## Cloudflare API 权限

`ops-mcp/host/configure-cloudflare.mjs` 在**任何写操作之前**校验 `EQB_OPS_MCP_OAUTH_REDIRECT_URI`（必须是 ChatGPT 界面给出的准确 https callback）。缺这个值会零修改退出。

| 操作 | 所需权限 |
| --- | --- |
| 查询 `eqbank.cc` Zone | **Zone Read** |
| 列出/更新 Access 应用与策略 | Access: Apps and Policies Read / Write |
| 复用已有 One-time PIN IdP | Access: Apps and Policies Read（列出 identity providers） |
| **创建** OTP Identity Provider | Access: Organizations, Identity Providers, and Groups Write |

优先低权限路径：Owner 先在 Dashboard 建好 One-time PIN，脚本只复用，不创建 IdP。若同名/同域 Access App 已有非 Owner 邮箱的 Allow / Bypass / Service Auth 等策略，脚本 fail closed，不会追加 Owner 规则后保留其他策略。

## ChatGPT 连接

1. ChatGPT 打开 Developer Mode / 自定义 MCP。
2. 名称：`EQB Ops`。地址：`https://mcp.eqbank.cc/mcp`。
3. 认证选 OAuth。**回调地址以 ChatGPT 界面给出的值为准**，填进 Cloudflare Access 应用的 Managed OAuth allowed redirect URIs。不要使用未确认的回调。
4. 用 Owner 邮箱 `bqy2661342736@gmail.com` 收一次性验证码。
5. 首次登录后应能列出四个工具：`server_overview`、`health_check`、`recent_errors`、`search_logs`。
6. 连续读取应走 refresh token，不保证两周绝不重新登录；要实测一次续期。

联合测试提示词：

> 使用 EQB Ops 查看服务器版本、健康状态和最近两小时错误，再使用 GitHub 读取对应 commit 的代码进行分析。区分已确认事实和推测，不进行任何写操作。

## 回滚

只撤 MCP 自己的东西：

```bash
sudo /opt/eqb-ops/app/host/rollback-eqb-ops-mcp.sh
```

然后在 Cloudflare 删除：

- DNS `mcp.eqbank.cc`
- Access 应用 `EQB Ops`
- Tunnel `eqb-ops-mcp`

**不要**停止共享 `cloudflared`、Caddy 或 `eqb.service`。
