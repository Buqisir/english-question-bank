# EQB Agent MCP

面向开发/测试的只读 stdio MCP，直接访问现有 `/api/agent/v1`。需要 Node >=24。

```bash
cd /absolute/path/to/english-question-bank/agent-mcp
npm ci
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
| `list_papers` | `/api/agent/v1/papers` | 可选 `year`（整数）、`type`（`real`/`mock`）、`q`（卷名/paperId） |
| `get_paper` | `/api/agent/v1/papers/:paperId` | `paperId` |
| `list_groups` | `/api/agent/v1/groups` | 可选 `year`、`type`、`q`（卷名及题组全文）、`section`（精确名称）、`limit`（1–200，默认 50）、`offset`（非负，默认 0） |
| `list_sections` | `/api/agent/v1/sections` | 可选 `year`、`type`；返回 `{sections:[{section,count}]}` |
| `get_group` | `/api/agent/v1/groups/:groupId` | `groupId` |
| `get_media` | `/api/agent/v1/media/:paperId/:mediaId` | `paperId`、`mediaId`，返回 MCP `image` 内容 |
| HTTP 直连 | `/api/agent/v1/papers/:paperId/answer-source` | `paperId`，返回带页码与区域的 OCR 原文，缺失时返回 `{notice:"none"}` |
| HTTP 直连 | `/api/agent/v1/export` | 可选 `since`（ISO 8601），每行一份试卷详情及 `etag`、`updatedAt` |
| HTTP 直连 | `/api/agent/v1/meta` | 部署 SHA、激活时间、API 版本。本地运行时部署字段可以为 `null` |

`q` 忽略大小写，按空白分词，全部词都须以子串命中；空查询不限。题组搜索不受 80 字预览限制。

查询工具以 JSON 文本返回已发布和最新待审 Candidate 的内容及答案。篇章详情保留 `paragraphs`，并提供按来源顺序排列的 `blocks`。`naturalParagraph` 只针对正文，无法确定时为 `null` 并附原因。取图工具返回图片。待审预览缺失或不可读时，内容列表跳过该卷，详情返回 404。401 表示口令无效或已撤销，404 表示对象不存在或不可读，429 表示服务端限流。请求超时为 30 秒。错误作为 MCP `isError` 返回，不输出请求头或上游错误正文，不跟随重定向。

本包提供只读题库查询与取图。`ops-mcp/` 负责运维。
