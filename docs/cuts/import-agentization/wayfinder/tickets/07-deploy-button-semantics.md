# 上线按钮的确切语义与安全边界

Status: done
Claim: none
Blocked by: [02](02-content-deploy-path-audit.md)
Type: grilling
Map: `docs/cuts/import-agentization/wayfinder/map.md`

## Question

方向已定：后台真按钮，owner 点击 + 确认弹层即为生产授权。基于票 02 的
链路审计，与 owner 拷问敲定剩余语义：

1. **推什么、什么粒度**：按钮推单卷增量还是整库同步；听力/图表等附属
   资产怎么跟着走。
2. **前置绿灯**：按钮可点的硬前置（verify 全绿、两个人工确认点已过、
   ledger 已记）——哪些由后台强制、哪些只提示。
3. **确认弹层的授权语义**：弹层展示什么才算「明确授权」（目标环境、
   将变更的内容清单、不可逆提示）。
4. **失败与回滚**：推到一半断了怎么呈现、怎么重试；推错了怎么退
  （对齐票 02 查明的回滚能力）。

执行时用 `$grilling` + `$domain-modeling`；先读
`docs/cuts/launch-deploy/go-live-record.md`。

## Resolution

Owner 2026-08-12 接受。

1. **推什么**：整库 `pull-run-push.mjs push`（SQLite 整文件替换 + `paper-assets/` 加性同步）。不做单卷增量。听力/图表随 assets 走。确认文案必须写明整库替换与「本机其他未上线改动会一并上去」。
2. **硬前置**：该卷 `ready_to_ship`（本地 publish + 门禁绿 + 上线前 QA）。ledger 只提示不挡。
3. **谁执行**：导题后台 **无生产按钮**。QA 后 owner 必须另说「上线」；agent 才跑 `push`。禁止自动 push。跑前摊开：目标机、整库、bak/assets 回滚差异。
4. **失败/回滚**：`signals/blocked.json` 原因码 `ship_failed`；服务可能 stopped，先拉起再谈重试。重试仍要口头「重试上线」。SQLite 用远端 `.bak.<stamp>` 人工退；assets 无自动回滚。无产品化撤销按钮。
