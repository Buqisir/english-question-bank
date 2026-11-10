# EQB Agent MCP

面向开发/测试的只读 stdio MCP，直接访问现有 `/api/agent/v1`。需要 Node >=24。

```bash
cd /absolute/path/to/english-question-bank/agent-mcp
npm install --no-package-lock
```

在 https://eqbank.cc/?view=admin 的「Agent 口令」中创建可撤销口令，通过本机安全配置向启动客户端的进程提供 `EQB_AGENT_TOKEN`。不要把口令写入仓库、命令行参数或日志。

环境变量：

- `EQB_AGENT_TOKEN`：必填，由 MCP 进程从环境继承。
- `EQB_AGENT_BASE_URL`：默认 `https://eqbank.cc`；只填站点源地址。支持本机 HTTP（如 `http://127.0.0.1:8787`）用于调试。

Claude Code 和 Droid 均可在 MCP 配置的 `mcpServers` 下添加：

```json
{
  "mcpServers": {
    "eqb-agent": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/english-question-bank/agent-mcp/src/index.mjs"]
    }
  }
}
```

将路径换成实际绝对路径。Claude Code 可使用项目 `.mcp.json` 或用户配置；Droid 可使用 `~/.factory/mcp.json`。先让启动 Claude Code / Droid 的进程获得上述环境变量，再重新启动客户端；配置示例刻意不含口令。直接调用 `node`，避免 npm 的提示污染 stdio 协议。

| 工具 | GET 端点 | 参数 |
| --- | --- | --- |
| `list_papers` | `/api/agent/v1/papers` | 可选 `year`（整数）、`type`（`real`/`mock`） |
| `get_paper` | `/api/agent/v1/papers/:paperId` | `paperId` |
| `list_groups` | `/api/agent/v1/groups` | 可选 `year`、`type`、`section`（精确名称）、`limit`（1–200，默认 50）、`offset`（非负，默认 0） |
| `get_group` | `/api/agent/v1/groups/:groupId` | `groupId` |

工具以 JSON 文本原样返回 API 成功响应，包含已发布内容及答案。401 表示口令无效或已撤销，404 表示对象不存在，429 表示服务端限流；请求超时为 30 秒。错误作为 MCP `isError` 返回，不输出请求头或上游错误正文；不跟随重定向。

本包不包含写操作、待审卷、审卷意见、个人数据、OCR/校对过程、听力切点或日志工具。`ops-mcp/` 仍独立负责运维。
