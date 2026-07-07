# 英语题库工作台

面向英语教师的语篇中心题库与组卷工作台，已上线 https://eqbank.cc
（邀请制登录，owner 策展、member 消费）。

核心模型：`Source -> Passage -> Question Group -> Question -> Paper Set -> Export`。

生产 / 消费分界（ADR-0015 / ADR-0016）：**内容生产在后台 Agent**
（`scripts/import-pipeline/` 离线导题、出题 skill、backfill 脚本），
**网站只做消费**（找题 → 看题 → 组卷 → 导出学生版 / 教师版）。
网站端没有导题入口，这是产品决策，不是缺失。

## 目录

```text
app/      # 前端 (React + Vite) 与本地开发入口
server/   # Node API（SQLite，双库：共享题库 + 用户数据）
shared/   # PaperSurface 等前后端共享模块
schemas/  # 数据契约 schema
scripts/  # verify 脚本、导入管线、部署/备份/搬库运维脚本
deploy/   # Caddyfile、systemd unit（生产拓扑）
data/     # 本地数据库与运行数据
docs/     # ADR、steering 规则、cut 记录、产品文档
design/   # open-design 视觉原型（不进产品代码路径）
```

## 本地开发

```bash
cd app
pnpm install
pnpm dev   # 初始化本地 SQLite 后同时起 API (8787) 和 Vite 前端
```

验证：`pnpm -C app run verify:all`（委托 `scripts/verify-ci.mjs`，
与 GitHub Actions 同源）。选最窄的脚本看 `scripts/README.md`。

## 部署与运维

- 首次上机手册：`docs/cuts/launch-deploy/runbook.md`
- 服务器实况记录：`docs/cuts/launch-deploy/go-live-record.md`
- 日常发布：`scripts/deploy.sh`；R2 备份：`scripts/backup-to-r2.sh`；
  本地 ↔ 服务器搬题库：`scripts/pull-run-push.mjs`

## 文档地图

- Agent / 流程规则唯一入口：`AGENTS.md`
- 当前状态单页：`docs/STATUS.md`
- 领域语言：`CONTEXT.md`；架构决策：`docs/adr/`
- 产品原则与试卷格式硬规则：`PRODUCT.md`、`docs/product/`

## 项目原则

- 语篇中心：阅读、完形、七选五都围绕完整材料建模。
- 教学可用：服务找题、组题、讲评和训练，不做 AI 数据面板。
- 人工把关：AI 可以建议，不替代教师判断；学生版永不露答案。
