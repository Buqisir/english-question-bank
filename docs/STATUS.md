# 当前状态（medium / large cut 收官时更新）

Last updated: 2026-07-07（process-slim）

## 现在是什么

- **已上线** https://eqbank.cc：邀请制登录（ADR-0012）、owner/member
  两档（ADR-0013）、用户数据隔离（ADR-0014）、AI 全局日限额（M0-5）。
  香港轻量云单机 + Caddy + systemd + R2 每日备份（launch-deploy）。
  服务器实况见 `docs/cuts/launch-deploy/go-live-record.md`。
- **产品分界**（ADR-0015/0016）：生产在后台 Agent，网站只消费
  （找题 → 看题 → 组卷 → 导出）。网站端导题 UI 已全部退役
  （PR #263-265）；后端分析器作为库函数保留给离线管线。
- 节奏（launch-roadmap）：M0 五刀 ✅ → M1 部署脚手架 ✅ → M1 go-live
  ✅（2026-07-07 已核实补档，见下）→ **当前处于 M1「owner 独用」阶段**
  → M2 = 邀 2-3 位同事。
- go-live 已核实（2026-07-07，小川经腾讯云 TAT 只读核实，
  `docs/cuts/launch-deploy/go-live-record.md`）：生产部署 commit
  `ec23627`（#261，落后本地 main）、Node v24.18.0 无需
  `--experimental-sqlite`、eqb+Caddy active、enforced 模式（1 owner /
  0 member）、R2 备份 cron 每天成功推送（1016 对象/50MB）。**动生产的
  红线已解除**（补档前禁跑 pull-run-push 的限制不再适用）。

## 主线焦点

- 2026-07-07：小川接管（owner 全权委托）。本刀 process-slim =
  交接体检修正（过时事实 / 文档矛盾 / 残留），之后回主线体验打磨。

## 开放账本（立刀候选，owner 圈了再动）

- UI 烂点清单：`docs/cuts/ui-facade/ui-blemish-list.md`（owner 曾圈
  「按顺序全做」，剩余项待核对）。
- 数据孤儿清理（新，2026-07-07 摸底 + 生产核实发现）：
  `paper-2024-jslk-english`（磁盘孤儿、不在 DB、每天污染生产 R2 备份
  报 501）、`paper-fe8e7a65` / `paper-ee10da87`（DB 标 published 但
  assets 缺失）。建议 small cut：清理 + 加 DB↔paper-assets 一致性
  verify 挂 CI。
- launch-deploy 挂账：DOCX/讲义版接 Draft Paper 工作台（server 能力
  现成，small cut）；难度维度重建（依赖 reading signals join，
  ADR-0015 已把假 medium 下线）。（topic label 已实测 273/273 全覆盖，
  从账本移除。）
- 备份可恢复性演练：R2 有对象但未做过 restore 演练，上线级别应补一次。
- PaperSurface watch ledger：`docs/paper-surface-watch-ledger.md`。

## 更新纪律

medium / large cut 收官（RM 闸过后）顺手更新本页：改「主线焦点」一两
行、勾掉或新增账本项。保持一页以内，不写成日报。
