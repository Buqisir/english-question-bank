# 03 — 生产 `import_agent` 身份与最小权限 token

Status: planned; requires current production authorization
Blocked by: `02-import-skill-and-state.md`
Next on PASS: `04-real-paper-loop.md`
Terminal: no

Spec: `docs/cuts/import-agent-closed-loop/spec.md`

## What to build

在 Owner 提供新的当前生产授权与必要 secret context 后，配置一个真实
`import_agent` 服务账号和独立 Bearer token。网页账号用于待办可见性、真实表面和
对话；token 用于结构化上传、状态、回复、认可拉取和上线前只读检查。

## Acceptance criteria

- [ ] Agent 账号只能进入导题待办和对应审核数据，不能读取普通老师私有数据。
- [ ] Agent/token 能上传 revision、读问题和回复，但不能创建/关闭问题、认可、
      获取 shipping guard 或部署。
- [ ] Owner Cookie 不能代替 Agent token；token 不复用网页密码或 Owner 会话。
- [ ] 凭证不写入 Git、日志、收据或可复用 memory；轮换路径经过验证。

## Authorization boundary

本 ticket 的文档存在不等于授权执行。创建账号、写生产 DB、配置 secret 或重启
生产服务前，必须取得 Owner 当次明确授权。
