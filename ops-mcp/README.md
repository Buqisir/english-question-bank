# EQB Ops MCP

Read-only Streamable HTTP MCP for production observation. Tools:

- `server_overview`
- `health_check`
- `recent_errors`
- `search_logs`

Bind: `127.0.0.1` only. Auth: Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`), exact Owner email. Operator docs: `docs/ops/eqb-ops-mcp.md`.

```bash
node ../scripts/verify-ops-mcp.mjs
```
