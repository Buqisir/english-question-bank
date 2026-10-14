# 导题后台（Import Ops Console）

部署在同域 `/ops/` 的 Owner 简洁审核列表。导题在 Amp 发起，Owner 明确同意送审后
Agent 上传不可变 Candidate revision。点击卷名直接打开精确版本的 Screen，
审核无误后点「发布到题库」，由服务器记录认可并执行既有单卷发布。
「退回修改」记录版本绑定的反馈；修改后重新送审，不自动认可或发布新版。
题源、问题和回复保存在独立 Import Ops DB / 私有文件根；正式发布前 Candidate
不进入消费端。历史题源台账保留于 `/ops/?view=sources`，不是日常导题入口。

- Owner 可创建/验证问题并认可精确 revision；真实 `import_agent` 服务账号只
  能读取自己的待办、查看相同表面、回复和提交新 revision。
- `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN` 与网页密码、Owner Cookie、部署凭证
  相互独立；Agent 账号和 token 都不能取得或释放 shipping guard。
- 只有 Owner 能管理题源 Draft；member 服务端 403。Agent 只能 list / claim /
  download / heartbeat / needs-owner / handoff，原文件不由普通或静态下载路由提供。
- 无 LLM 或网站导题动作，不跑 `pull-run-push.mjs`。「发布到题库」明确授权
  当前版本向用户公开；单独认可或 Amp 允许送审不等于发布。失败或结果不明先
  只读核实，不自动重试。网站代码部署仍需单独授权。
- 只有带候选图的卷显示「核对候选图」，按需展开原图/候选图对照和确认清单。
  图片确认不替换当前卷面；Agent 取回精确回执后，选用候选图并重新送审。
- Agent 进场文档：`docs/import/agent-contract.md`。

```bash
# 终端 1：只用可丢弃本地数据。Owner origin 必须配置在 API 进程上。
QUESTION_BANK_IMPORT_REVIEW_OWNER_ORIGIN=http://127.0.0.1:8790 bash scripts/dev.sh
# 终端 2：启动审核入口
EQB_APP_ORIGIN=http://127.0.0.1:5173 node import-ops/server.mjs
# 本机同源入口：http://127.0.0.1:8790/ops/
```

本机 server 将 `/ops/` 静态文件以外的请求代理到 `EQB_APP_ORIGIN`。
代理保留浏览器 Origin，但 Host 使用上游地址，因此仅在代理进程设置 Owner
origin 无效。省略上述 API 配置时写操作会被 `same_origin_required` 拒绝。
`EQB_APP_ORIGIN` 默认 `http://127.0.0.1:5173`，`IMPORT_OPS_PORT` 默认 `8790`；
自定义端口时同步修改 API 的 Owner origin，仍保留精确同源校验。
代理会转发发布等写请求，不要将本地演示指向生产。生产由 Caddy 在同域提供
`/ops/` 静态文件，不需要本地代理的 origin 配置。

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
