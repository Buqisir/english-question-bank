# 网页导题审核闭环

状态：Owner 已确认，进入实现。

## 目标

把导题流程从“Agent 在聊天里说做完了”改成一个可恢复、可审计的生产闭环：

1. Agent 从不可变源文件生成一个 Candidate 修订版。
2. Agent 把修订版上传到 `eqbank.cc/ops/`，但不能认可或上线它。
3. Owner 在网页后台审查该修订版；详情页直接加载现有 `PaperBrowsePage` / `PaperSurface` Screen，不复制一套预览器。
4. Owner 可以按修订版、表面和语义对象记录问题。Agent 读取这些问题，生成新修订版，并声明它试图修复的问题。
5. 只有 Owner 能关闭问题和认可“当前最新的、无未决问题的、精确摘要绑定的”修订版。
6. 网页认可生成 `Teacher Confirmation` 依据，但不授权生产发布。Owner 仍需在之后单独对 Agent 下达“上线 <paperId>”。

## 产品边界

- 网页后台是审核事实源；聊天只承担通知、解释和显式上线命令。
- Candidate 存在独立的 Review DB 和文件目录，不进入 `question-bank.sqlite`、正式 `paper-assets/<paperId>/latest`、找题列表或搜索。
- 网页后端不运行 LLM，也不自动唤醒 Agent。任一 Agent 可用 `paperId` 恢复状态和反馈。
- 浏览器复用现有 Cookie 登录。Owner 进入审核工作台；Agent 使用真实的
  `import_agent` 服务账号进入自己的待办箱。该账号在认证表中仍是 `member`
  role，但由独立 `account_kind` 收窄权限，不能读取普通老师数据或调用普通
  member API。
- `import_agent` 能在网页读取反馈、查看同一份 Screen/Print/PDF 并回复；它也
  能通过结构化 API 上传不可变修订版。自动化可使用独立 Bearer 凭证，权限与
  `import_agent` 相同。两者都不能创建/关闭问题、认可或部署。
- 生产部署、R2 操作和 `pull-run-push` 继续要求当前 Owner 的明确授权，不因网页认可而获得授权。

## 修订版身份

每个修订版至少绑定：

- `paperId`
- 原始来源摘要 `sourceDigest`
- Candidate 摘要 `candidateDigest`
- 可见结构摘要 `visibleStructureDigest`
- 上传文件清单摘要 `bundleDigest`
- Agent 生产代码标识 `producerBuildId`
- 实际审核 Screen/Print 代码标识 `rendererBuildId`

文件逐个上传且逐个校验路径、字节数与 SHA-256；服务端在 finalize 时重新推导 Candidate、Consumption 和 Screen asset，并拒绝摘要不一致、缺文件、额外路径穿越或不完整上传。修订版 finalize 后不可修改。并发上传按单调 `revisionNumber` 决定最新版本：较早上传即使较晚 finalize，也只能归档为 `superseded`，不能反超较新的已 finalize revision。

同一 `paperId` 的新修订版会使旧认可不再代表“当前可上线修订版”。旧收据保留作审计证据，但只有最新修订版的精确认可可被 Agent 拉取并转成 Teacher Confirmation。

## 问题与认可状态机

```text
uploading -> awaiting_review -> changes_requested
                    |                 |
                    |                 +-> Agent 上传新 revision -> awaiting_review
                    |
                    +-> Owner 认可 -> approved

任意新 revision -> 旧 revision 显示为 superseded
```

问题记录绑定：

- 创建时的 `revisionId`
- `surface`: `screen` / `student_print` / `teacher_print` / `pdf` / `source`
- 至少一个语义定位（`groupId`、`questionId`、`blockId`）或页码
- 可选标准化矩形 `{ x, y, width, height }`；坐标只是辅助，不能单独成为身份
- Owner 反馈正文

Agent 可在新修订版中声明 `resolvesIssueIds`，问题变为“待 Owner 验证”。只有 Owner 可关闭、驳回或重新打开。存在 `open` 或 `fixed_pending_review` 问题时不能认可。

每个问题带一条按时间排序的对话。Owner 和 `import_agent` 都可追加消息；消息
保存作者种类、账号名和时间。对话不改变问题状态，修复状态仍必须由新 revision
的 `resolvesIssueIds` 和 Owner 的验证动作驱动，避免一句聊天文字被误当成修复
或认可。

认可请求必须携带浏览器当前看到的 `bundleDigest`；服务端在同一 SQLite 写事务内再次确认它是最新、已 finalize、渲染器未变化且无未决问题的修订版，才签发 `web-import-review-approval-v1` 收据。认可后新增问题会撤销该认可并回到 `changes_requested`。

实际内容 push 在第一次生产修改前，必须在 Review DB 写事务内取得绑定当前 approval、revision 和全部摘要的 shipping guard。guard 存续期间，服务端拒绝创建/finalize 新 revision、创建或改动问题状态、重新认可；对话回复仍可写。正常 push 结束后释放。进程异常消失时 guard 不超时自动失效，而是失败关闭，待确认旧进程及生产状态后按当前 Owner 口令人工解除。

## 审核界面

- 左侧：卷、最新状态、修订历史、语义结构和源文件。
- 中间：真实 Screen iframe，URL 为现有 `?view=paper-browse&paperId=...&reviewRevision=...`；`PaperBrowsePage` 只切换数据源，`PaperSurface` 与各题型 adapter 不改。
- 右侧：表面切换、问题对话/验证和认可动作。`import_agent` 登录时同一页面
  变为待办箱：可读问题并回复，但不渲染 Owner 的问题状态和认可控件。
- Student/Teacher Print HTML 与 PDF 由同一 `buildPrintHtml` Canonical seam 生成，不另造审核渲染器。
- 页面不提供上线按钮，只显示认可收据和“之后需另行对 Agent 说上线”的边界。

## 数据与运维

- 默认 DB：`data/import-ops.sqlite`
- 默认文件：`data/import-ops/files/`
- 环境变量：
  - `QUESTION_BANK_IMPORT_OPS_DB`
  - `QUESTION_BANK_IMPORT_OPS_ROOT`
  - `QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN`
  - `QUESTION_BANK_BUILD_ID`（可选显式不可变 build id；缺省时对实际 `app/dist`、Screen/Print 源码及共享 renderer 依赖取 SHA-256，并在审核动作时重算）
- `pull-run-push` 永不传输 Review DB/文件。
- R2 日备份独立备份 Review DB 和文件，仍使用 additive `rclone copy`。

## 验收

1. 未登录 401、member 403；Agent token 能上传/读反馈但不能认可；owner Cookie 不能代替 Agent token。
2. 路径穿越、摘要错误、字节数错误、缺文件、finalize 后改文件全部失败关闭。
3. 新修订版、问题待验证和未决问题阻断认可；认可严格绑定当前摘要；新修订版使旧认可失效；并发 finalize/新增问题/认可不能破坏最新版本和未决问题不变量。
4. Candidate 不出现在普通卷列表和正式 `paper-assets`。
5. Screen DOM 通过 `reviewRevision` 加载该 Candidate，同时仍挂载现有 `PaperSurface`。
6. Student/Teacher Print/PDF 使用同一 Canonical Consumption；学生版不含答案，教师版包含权威答案。
7. Agent 拉取认可时重新核对本地 source/Candidate/visible structure 摘要，精确匹配才写 `teacher-confirmation-v1.json` 与本地 QA 收据。
8. 网页没有生产部署动作；上线清单用 Agent 凭证只读确认本地 QA 收据仍是 Review 服务的当前最新认可，并继续要求 Owner 当前口头命令。实际 push 入口在停生产服务前再次运行同一检查并原子取得 shipping guard；新 revision、Review 服务不可用或 guard 获取失败时不发生任何生产修改。guard 持有期间，尝试使认可失效的并发 Review 写入必须失败。
