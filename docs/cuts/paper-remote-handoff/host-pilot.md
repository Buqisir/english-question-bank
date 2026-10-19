# 新盘接管与单卷恢复试点：待批准的执行边界

Status: plan only; no production commands executed by this implementation.
Parent: [paper-remote-handoff](spec.md).

## 目标与不做的事

目标主机为 Owner 指定的 `eqb-hk-1`（`lhins-ifm2s9fx`），新盘为
`lhdisk-8zdw51eo`（香港三区，50 GB）。云盘 ID 不是 Linux 设备名或文件系统
UUID；执行时必须重新核实三者映射，不能因为 `/dev/vdb` 看起来像新盘就格式化。
Owner 提供的到期日为 2026-11-11；确认续费安排，不能把单块盘当作备份。

本计划不授权任何挂载、格式化、生产迁移、R2 写入/清理、Mac 删除或发布。
先完成代码 Ship 所需验收，再批准下面具名目标和路径；代码部署与主机存储切换
是不同动作。网站代码部署遵循
[AGENTS.md「Owner Mac deployment」](../../../AGENTS.md#owner-mac-deployment)
与 [ADR-0027](../../adr/0027-owner-local-website-deployment.md)，不能借存储维护绕过该入口。

## 执行前冻结一份路径清单

由执行者只读核实以下事实，并把确切值附在执行申请中。缺项不得猜测默认值：

- 主机与云盘绑定、设备序列/容量、分区表、文件系统签名、当前挂载和使用进程；
  任何现存签名或数据都停止初始化，交由 Owner 决定。
- 当前运行服务与备份任务的有效环境：`QUESTION_BANK_IMPORT_OPS_ROOT`、
  `QUESTION_BANK_BLOB_ROOT`、`QUESTION_BANK_FILE_STORE`，以及相应 DB 路径。
  只记录非敏感路径，不输出 token 或完整环境。
- 每个待迁移根的真实路径、文件清单、逻辑/物理占用、设备、权限、现有硬链接；
  source-intake 与 Review 共用根时只迁移一次，不拆断其中的证据关系。
- 拟挂载点、迁移后的私有子目录、旧目录保留位置、服务账号、服务/mount unit
  和备份任务依赖；磁盘 UUID 要在批准的初始化完成后实测，不能预填。
- 在途 intake、upload、finalize、publication、备份及 UNKNOWN 状态。先停在安全点；
  UNKNOWN 只读对账，不重放、不清锁。不要为迁移终止另一个任务。

数据库、代码、发布 receipts 和 release 目录留在原文件系统。私有 Review 文件根
与本地 blob 根必须位于同一新文件系统，使用审核后的挂载安排保持原路径。
不迁移个人文件、公共资产历史树或 release，不默认采用符号链接替代挂载。

## 先复制，验证后切换，旧文件不删

在准确目标获准后，初始化/挂载只作用于已证明空白的新盘。配置
`QUESTION_BANK_PAPER_STORAGE_UUID` 与 `QUESTION_BANK_PAPER_STORAGE_MOUNT`，
同时给服务和备份加 mount 依赖；卸载状态的底层目录由 root 持有且不可由服务写入。
应用 UUID 检查不能单独消除检查之后卸载的竞态。

暂停相关写者，保留证据和一致的 SQLite `.backup` 快照。复制私有文件时保留权限、
硬链接和不可变字节；全量比对路径/长度/SHA，检查 inode 共享，并保留完整旧树。
确认新根的所有读写都落在新设备，再切换路径和启动服务。挂载缺失的拒写演练在
隔离环境做，不通过拔掉正在服务的生产盘来测试。

开放写入前失败：在同一维护窗口内恢复原路径/服务配置，旧树仍为原始真值。
开放写入后失败：先停止写入、核对新盘接受的操作，禁止直接切回旧树或旧数据库；
无法证明不丢新数据时停止并申请限定恢复方案。

## 独立备份不能靠“日志正常”证明

先定位既有 R2 copy/access 失败，区分来源路径、权限、远端目标或凭据问题；
扩大 Secrets/权限另行申请。现有 `backup-to-r2.sh` 的真实执行含保留期 pruning，
不能把运行整脚本当作“只新增一次备份”。首轮必须审核每条远端操作，禁止未批准
的旧备份删除；`--dry-run` 也会在本地生成 SQLite 快照，不是零写入盘点。

证明材料需要确切备份位置/时间、DB 快照身份、目标 revision/bundle 和其引用文件
清单。`.backup` 保证单个 DB 的一致性，不自动保证多个 DB 与外部文件的同一时点。
首轮在相关写者安全暂停期间取一致恢复点，并从独立备份恢复到隔离位置，逐文件
核对目标清单与所有恢复依赖。不仅检查 bucket listing 或 `integrity_check`。
私有 blob、Review SQLite、历史 receipt 和产品文件都要覆盖。

## 单卷通过后才逐卷接管

先挑一卷 finalized、无 UNKNOWN 且四产品闭合的真实 Candidate。重新核状态，
不能把旧对话中的 PASS 或 OCR R1 当作当前 Candidate；M174 的未完成省纸版仍阻塞。
执行者在授权范围内完成：

1. 冻结 paper/revision/bundle 与完整文件清单；比对服务器实际响应 bytes/SHA。
2. 在真正鉴权入口查看精确 Screen、四 PDF/Print、听力 Range；拒绝匿名/错版本访问。
   历史预览缺失须显式准备，不在普通 GET 中触发 OCR/渲染。
   逐卷核实明确的 Amp 讨论线程关联，实际点击产品页按钮核对复制版本和跳转目标；
   未关联时保留复制入口，不猜负责人，不自动发送消息或触发修订。
3. 从备份恢复出隔离服务，再用现有 `hydrate --revision` 恢复空白修订工作区；
   校验 projection、历史 OCR receipt 与可修订输入，不借用原 Mac 路径。
4. 对明确的试点问题形成私有修订，复核未改产品；公开旧版在此期间保持不变。
   Owner 在 Amp 确认精确版本后仍不自动发布，须另有上线指令和现有发布授权；
   页面不再要求点击确认，聊天也不得被伪造成 Owner 会话回执。
5. 运行 `cleanup-plan --revision` 得到逐文件盘点，核对活动任务/所有权和保留文件。
   它始终不授权删除。独立恢复证明、精确可删路径与删除方式另呈 Owner 批准。

Mac 删除须只涉及已核实的任务副本；不清 Downloads、未知工作树、失败证据或个人源件。
删除后还需再次读线上产品并留下很小的远端版本记录。当前未实现实际删除命令，
不能用 `rm -rf <paperId>` 代替缺失的安全步骤，也不预报未经实测的释放空间。

## 线上问题的处理

反馈绑定当时看的 publication/revision，Agent 先对照当前版本再修；旧版 hydrate
不能覆盖较新的修改。修复上传为私有 Candidate，复查后经 Owner 确认，再按明确
上线指令替换该卷。严重问题先说明影响，由 Owner 决定暂停哪个产品或哪一卷。
失败/中断沿既有单卷发布 journal 对账，不回滚整库，不动其他卷或用户数据。
恢复旧内容也必须有当前基线、精确目标和授权；本改动没有添加自动撤回或回滚。
