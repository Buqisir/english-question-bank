# 导题后台（Import Ops Console）

部署在同域 `/ops/` 的 Owner 后台工作台。“题源台账”接收人工发现的来源和私有
DOCX / PDF，材料齐全后冻结 immutable submission 并交给本机 Agent；“导题审核”
接收 Agent 上传的不可变 Candidate revision，Owner 直接在现有
`PaperBrowsePage` / `PaperSurface` Screen、Student Print、Teacher Print 与 PDF 上
审核。题源、问题和回复保存在独立 Import Ops DB / 私有文件根；Candidate 在认可
前不进入正式 `paper-assets` 或消费端列表。

- Owner 可创建/验证问题并认可精确 revision；真实 `import_agent` 服务账号只
  能读取自己的待办、查看相同表面、回复和提交新 revision。
- `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN` 与网页密码、Owner Cookie、部署凭证
  相互独立；Agent 账号和 token 都不能取得或释放 shipping guard。
- 只有 Owner 能管理题源 Draft；member 服务端 403。Agent 只能 list / claim /
  download / heartbeat / needs-owner / handoff，原文件不由普通或静态下载路由提供。
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

## 生产 Agent 身份

生产 `.env` 必须配置两个不同的 secret：

```text
QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN=<上传、状态、回复、上线前只读检查>
QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN=<仅取得/释放 shipping guard>
```

两者相同会让服务启动失败。网页 `import_agent` 固定为 `member`，密码从安全
secret context 经 stdin 传入，避免出现在参数和输出中：

```bash
node scripts/create-user.mjs --username import_agent \
  --account-kind import_agent --password-stdin
```

轮换任一 token 时只替换对应 `.env` 值并重启 `eqb.service`；验证新 token 的最小
权限矩阵后立即确认旧 token 返回 401。不得把任一凭证写进 Git、命令参数、日志、
审核收据或导题目录。
