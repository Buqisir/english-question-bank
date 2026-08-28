# 导题后台（Import Ops Console）

部署在同域 `/ops/` 的导题审核工作台。Agent 上传不可变 Candidate revision，
Owner 直接在现有 `PaperBrowsePage` / `PaperSurface` Screen、Student Print、
Teacher Print 与 PDF 上审核。问题和回复保存在独立 Review DB；Candidate 在认可
前不进入正式 `paper-assets` 或消费端列表。

- Owner 可创建/验证问题并认可精确 revision；真实 `import_agent` 服务账号只
  能读取自己的待办、查看相同表面、回复和提交新 revision。
- 无 LLM 动作、无生产按钮，不跑 `pull-run-push.mjs`。网页认可不是上线授权；
  Agent 上线清单仍在 `scripts/import-pipeline/ship-checklist.mjs`。
- Agent 进场文档：`docs/import/agent-contract.md`。

```bash
EQB_APP_ORIGIN=http://127.0.0.1:5173 node import-ops/server.mjs
# 本机同源入口：http://127.0.0.1:8790/ops/
```

本机 server 将 `/ops/` 静态文件以外的请求代理到 `EQB_APP_ORIGIN`，确保 iframe
与审核页面同源。`EQB_APP_ORIGIN` 默认 `http://127.0.0.1:5173`；
`IMPORT_OPS_PORT` 默认 `8790`。生产由 Caddy 直接提供 `/ops/` 静态文件。

聚焦校验：`node import-ops/verify.mjs`。
