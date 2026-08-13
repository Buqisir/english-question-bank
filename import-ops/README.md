# 导题后台（Import Ops Console）

Owner-only 本机只读面。读 `scripts/import-pipeline/papers/<id>/` 与
`app/public/paper-assets/<id>/latest/`，显示契约六态和待 QA 的 Screen /
Print 入口。

- 不进消费端 `app/` 运行时。
- 无对答案 UI，无生产按钮，不跑 `pull-run-push.mjs`，不碰生产。
- 可上线后只展示口令（例如 `上线 paper-<id>`）；`ship_failed` 时展示
  `重试上线 paper-<id>`。Agent 上线清单在
  `scripts/import-pipeline/ship-checklist.mjs`。
- Agent 进场文档：`docs/import/agent-contract.md`。

```bash
node import-ops/server.mjs
# http://127.0.0.1:8790
```

`EQB_ROOT` 默认仓库根。`EQB_APP_ORIGIN` 默认 `http://127.0.0.1:5173`（Screen 链接）。
`IMPORT_OPS_PORT` 默认 `8790`。

聚焦校验：`node import-ops/verify.mjs`。
