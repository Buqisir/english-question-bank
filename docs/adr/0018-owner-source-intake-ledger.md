# ADR-0018: Owner 题源台账是后台 Agent 的私有上游队列

- Status: Accepted（2026-08-30，owner 黄学伟确认比例稿后拍板）
- 上游：ADR-0013（owner/member gate）、ADR-0015（生产在后台 Agent）、
  ADR-0016（消费网站零导题 UI）、ADR-0017（按风险配置导入信任）

## 背景

新模拟卷最可靠的发现方式仍是人：Owner 在公众号、小红书和教师群中判断题源，
再把本地 DOCX / PDF 交给后台 Agent。自动爬取会受登录、限流、版权和平台变化
影响；纯聊天交接又缺少稳定台账、答案缺口、来源证明、不可变文件身份与可恢复
队列。

现有 `/ops/` 已是独立于消费网站的 Owner-only 导题后台，Review DB 和私有文件根
也已经接受备份。现有 Import Review revision 是 Agent 产出后的不可变 QA 包，
不能伪装成“尚未开始导题”的题源登记。

## 决策

在 `/ops/` 增加 **题源台账**，作为现有导题审核的上游，而不是在消费网站恢复
导题页面：

1. Owner 人工记录试卷名、来源平台、来源名称与可选公开链接，并上传私有
   DOCX / PDF。member 服务端 403。
2. 试题可先于权威答案保存，状态为 `awaiting_answers`；没有权威答案时不得提交
   Agent，也不得自动解题补答案。
3. 上传使用 manifest-first 原始字节 PUT；服务端核对长度、SHA-256、媒体类型与
   PDF / DOCX magic 后才原子落盘。替换上传成功前保留上一份 active 文件；失败
   不降级已验证 bundle。原文件不进入 public assets。
4. Draft 可改；每次“提交给 Agent”冻结一份不可变 submission snapshot。修正
   必须形成新 submission revision，不覆盖旧 snapshot。
5. SQLite 队列是事实源。Amp webhook 只负责 best-effort 唤醒稳定 Mac runner；
   webhook 丢失、重复或 runner 离线都不改变 queued submission。Agent 必须通过
   原子 claim + 有限 lease 获得工作，重复唤醒不能重复导题。
6. Agent 只可 list / claim / download / heartbeat / needs-owner / handoff。它不能
   编辑 Owner draft、认可 Review 或上线。正式 CLI 在 init 后写入绑定 submission
   digest 与本地源文件的私有收据；handoff 必须复核该收据，并拒绝已被 Import
   Review 使用的 `paperId`。绑定后，后续状态由既有 Import Review / publish
   状态机负责，题源台账不复制那套语义。
7. Owner 认可、local publish、production ship 的既有停点保持不变；提交题源绝不
   等于发布或上线授权。

## 与 ADR-0015 / ADR-0016 的关系

ADR-0016 禁止的是**消费网站现场导题 UI**。题源台账位于独立 `/ops/`，只做私有
来源登记、文件保管和后台 Agent 排队；它不解析试卷、不运行 LLM、不生成答案、
不发布 Canonical Paper。因此这是后台生产入口的可观察队列，不是被退役网站
导题页的复活。

## 后果

- 人工发现保留速度与判断力；系统承担记忆、完整性、去重边界和可恢复交接。
- `data/import-ops.sqlite` 与 `data/import-ops/files/` 继续作为备份边界，但题源表、
  submission、claim 和文件目录与 Import Review revision 分离。
- webhook URL、HMAC secret、Agent token 和 runner 选择只存在于私有配置；不写入
  DB snapshot、Git、日志或网页响应。
- v1 不做公众号/小红书爬虫、自动调度、自动补答案、浏览器解析、统计大屏、自动
  publish、自动 deploy 或 production mutation。
