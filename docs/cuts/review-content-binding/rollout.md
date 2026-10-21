# BUB-90 R5 发布观察与代码回退

本节覆盖 spec 中冲突的历史“先增加生产 schema 查询”要求。这里只规定执行路径，
不授权本轮生产读取、迁移、SSH 或部署；本轮实现和演练均在本地。
新候选仍须完成 exact main 自然 Actions Full/E2E、独立审查和 Linux 资源验收。

## 1. 激活边界

明确包含 schema 迁移的部署 Goal 使用现有
`scripts/local-deploy.sh deploy --owner-said-deploy-latest --reviewed-migration-digest <digest>`。
执行仓库为干净且等于最新 origin/main 的 `~/Projects/eqb-deploy`；不能传任意旧 SHA。
digest 是当前生产 base 到最终 main 的受保护路径集合（排序、`\n` 连接、末尾换行）
的 SHA-256，不是 SQL 内容摘要；exact main SHA/CI 另行绑定代码内容。main 或生产
base 变化后重新计算，不能照抄旧候选的 digest。

沿已有 reviewed-persistence 控制器：停流量/服务 → 离线三库快照 → 候选 ensure
两次/健康/integrity/FK 检查 → 重开流量。新 helper 在任何 DDL 前验证所有相关表、
约束和依赖；未知结构、legacy 名冲突等具名失败，由原 pre-traffic 恢复分支处理。
不扩大 forced SSH 动词，不在停流量/快照前运行 live ensure。

迁移仅将已知 v1 subject 原表 rename 为 `review_subject_legacy_v1`，再建 v2；
空表也保留 archive。旧 compatibility/backfill/业务行不改写。持久迁移记录经现有
鉴权单卷状态的 `subjectBackfill.schema` 可读，不依赖 ensure 的 stdout。
新旧代码来回启动不再 rename、不产生第二份 archive。观察时不查询旧行正文。

## 2. 观察对象及可用入口

固定 canary 为本地真实封存演练已 equal 的：

- 卷：宁波“十校”2026届高三3月联考，`paper-mock-zj-ningbo-2026-mar`
- 精确 revision：`rev-72139a1b-56e4-4e70-a97d-df595300c217`
- 原基准 digest：`sha256:24d9c91ce48eaf7664ac90721dbe281cf6ce0c88d4b55c7b43a3e004c85bc595`
- 历史演练 target：`sha256:aca927a02538b058c8f81e3cb29ba1c01684a5f152d9b418b378c9b6159b61f6`
- 本地证据：`~/Projects/eqb-scratch-archive/bub90-repro/round3-zombie-fixed-rehearsal-results.json`
  的第一条；该演练重建了 API preview envelope，不能证明生产原始 SQLite
  payload/CAS。当前 target 必须从此次上线后的 API 读取，不能借历史 target 的 equal。

实际调度入口是 API 启动的 `startReviewCompatibilityWorker`：默认开启、全主机
单 leader、普通比较优先，随后单卷自动 backfill；无需生产执行本机 DB CLI。
`scripts/review-compatibility-canary.mjs` 没有受限 SSH 动词，不能在此计划中假装
可直接远程运行。可执行读取是：

| 入口 | 可核对的事实 |
| --- | --- |
| 鉴权 GET `/api/import-agent-reviews` | 最新 revision、业务状态、compatibility 的 target/result/reasonCode/pending/checkedAt/subjectDigest/eligible/guard/fallback |
| 鉴权 GET `/api/import-agent-reviews/papers/paper-mock-zj-ningbo-2026-mar` | 精确 latest revision、当前比较结果、subjectBackfill 的进度/该卷 outcome/diagnostic、迁移来源/时间/legacy 行数 |
| Owner 会话 GET `/api/import-reviews` | 同一批量列表状态；不要求新增 Owner 写操作或批准 canary |
| `import-ops/lib/probe.mjs` 的单卷 status | 透传 `review.compatibility` 和 `review.subjectBackfill`，不是额外数据库证据 |

只选择上述一种列表鉴权方式。单卷详情的 manifest 会使响应较列表大，因此单次、
串行读取，不抓 preview、封存文件、PDF 或所有卷详情，不运行 bulk probe。

下列命令只发 **一次 GET**，通过既有 Agent token 环境注入鉴权，不打印 token。
在有当前读取授权的操作上下文中执行；`EQB_OBSERVE=list` 或 `canary`，两次调用间
至少隔 30 秒；不加自动重试。输出仅身份/小状态，不输出题文。
canary 读取前将本次 exact release 部署 receipt 的 `startedAt` 原值放入
`EQB_DEPLOY_STARTED_AT`。该维护窗口起点只区分新凭据与复用凭据，不决定 equal 是否有效。

```bash
EQB_OBSERVE=canary node --input-type=module <<'JS'
const kind = process.env.EQB_OBSERVE
if (!['list', 'canary'].includes(kind)) throw new Error('EQB_OBSERVE must be list or canary')
const token = process.env.QUESTION_BANK_IMPORT_OPS_AGENT_TOKEN
if (!token) throw new Error('Use the existing authorized Agent credential route')
const base = 'https://eqbank.cc/api/import-agent-reviews'
const paperId = 'paper-mock-zj-ningbo-2026-mar'
const revisionId = 'rev-72139a1b-56e4-4e70-a97d-df595300c217'
const deploymentStartedAt = process.env.EQB_DEPLOY_STARTED_AT
if (kind === 'canary' && !Number.isFinite(Date.parse(deploymentStartedAt))) {
  throw new Error('EQB_DEPLOY_STARTED_AT must be the exact deployment receipt startedAt')
}
const started = Date.now()
const response = await fetch(kind === 'list' ? base : `${base}/papers/${paperId}`, {
  headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
})
if (!response.ok) throw new Error(`Observation HTTP ${response.status}; stop, do not retry in a loop`)
const value = await response.json()
if (kind === 'canary') {
  if (value.latestRevisionId !== revisionId) throw new Error('Canary superseded: choose and locally rehearse a new exact revision')
  const c = value.compatibility || {}
  // The authenticated API validates the persisted attempt against its current
  // trusted target and subject; an old target equal cannot grant these flags.
  const validEqual = c.result === 'equal' && c.reasonCode === 'CONTENT_EQUAL' && c.pending === false
    && c.eligible === true && c.guard === 'content_binding' && c.fallback === false
    && /^sha256:[a-f0-9]{64}$/.test(c.targetBuildId || '')
    && c.subjectDigest === 'sha256:24d9c91ce48eaf7664ac90721dbe281cf6ce0c88d4b55c7b43a3e004c85bc595'
    && Number.isInteger(c.attemptNo) && c.attemptNo >= 1 && Number.isFinite(Date.parse(c.checkedAt))
  const comparisonEvidence = !validEqual ? 'NOT_VERIFIED_EQUAL'
    : Date.parse(c.checkedAt) >= Date.parse(deploymentStartedAt)
      ? 'DEPLOYMENT_WINDOW_EQUAL' : 'REUSED_VERIFIED_EQUAL'
  console.log(JSON.stringify({ observedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
    paperId, revisionId, deploymentStartedAt, comparisonEvidence,
    compatibility: value.compatibility, subjectBackfill: value.subjectBackfill }))
} else {
  const papers = value.papers.filter(p => p.reviewKind === 'candidate'
    && ['awaiting_review', 'approved'].includes(p.state))
  const reasons = {}, results = {}
  for (const p of papers) {
    const c = p.compatibility || {}
    reasons[c.reasonCode || 'ABSENT'] = (reasons[c.reasonCode || 'ABSENT'] || 0) + 1
    results[c.result || 'ABSENT'] = (results[c.result || 'ABSENT'] || 0) + 1
  }
  console.log(JSON.stringify({ observedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
    count: papers.length, reasons, results,
    papers: papers.map(p => ({ paperId: p.paperId, revisionId: p.latestRevisionId,
      state: p.state, compatibility: p.compatibility })) }))
}
JS
```

不在此运行命令；真实 HTTP 本地回归已覆盖单卷鉴权读取和持久 schema 信息。
生产凭据或当前读取授权缺失时，该观察不能执行，必须明确记录阻塞，不能把无数据
标为通过。列表是完整 latest 队列而非 59 个详情请求；分布在客户端统计。

## 3. 频率、证据与失败期限

流量重开时刻为 T0，**仅作为上线后观察期限起点，不是 checkedAt 的验收下界**。
先记 exact release SHA/部署 receipt 的 startedAt/T0，再串行取一次列表和
一次 canary。canary 在队列原位等待，不通过写操作插队，不批准或发布。若已 supersede，
停止使用该 canary；选一个实际最新 revision 并先完成本地演练，不能默默更换 ID。

读取上限：T0 首轮两次请求间隔至少 30 秒；其后列表最多每 5 分钟一次，canary
最多每 10 分钟一次，任何两次观察请求相隔至少 30 秒、全程并发数 1。单次 10 秒
超时；出现超时/5xx 或响应耗时超过 2 秒立即停止继续读取，等待运维健康证据后再
决定，不并发重试。出现应用健康失败立即进入恢复决策，不为补观察反复打 health。
本项目曾有批量查询拖垮 `/api/health`，不能用“只读”推断无负载。

每次只保留上述摘要与时间，核对：

1. `subjectBackfill.enabled=true`，`schema.schemaVersion` 为 v2；若原为 v1，
   `legacyPresent=true`、来源 v1、有效迁移时间及 legacyRowCount 可见。
2. 当前 target 不再 pending，记录实际 targetBuildId；旧 different 的返回身份可能
   是旧 target，不能把它认作当前 target。经 API 完整绑定校验的 canary equal 提供此次可信 target。
3. 基准已建立：该卷 backfill outcome=inserted（或已有 subjectDigest），比较
   subjectDigest 等于上述原基准。`BACKFILL_PENDING` 仅表示基准已提交，尚未 equal。
4. 有效 comparison 已持久提交：精确 revision、当前可信 target、原 subjectDigest 的
   `equal/CONTENT_EQUAL`，有效 checkedAt、attemptNo>=1，且满足第 5 条资格标记。
   checkedAt 在部署 receipt startedAt 之后记为 `DEPLOYMENT_WINDOW_EQUAL`，包括
   停流量期间候选 API 已启动、worker 已提交而尚未到 T0 的情况；这里只证明维护
   窗口内产生，release 身份仍由 receipt 与当前 target 绑定，不靠时间推断。
   若 target 完全相同且 checkedAt 更早，记为 `REUSED_VERIFIED_EQUAL`（复用已验证凭据），
   同样允许验收。终态 equal 不会被扫描器重算，不要求只读观察制造新时间戳。
   别的 target 的旧 equal、无效绑定或进程计算 stdout 均不算。
5. 资格恢复：eligible=true、guard=content_binding、fallback=false。业务 state/
   revision/原批准保持原业务事实；equal 不证明 issues 已解决或已发布。
6. 全列表 reasonCode/result 分布、NOT_CHECKED/BACKFILL_PENDING/pending 总量逐次
   下降，equal 数增长；backfill lastCheckedAt/inserted/pending/exhausted 是否前进。
   预期 58 equal/1 MISSING_BASELINE 仅是本地对照，重庆八中缺 preview 不算恢复成功；
   生产实际不同则保留诊断，不强改到这个计数。

期限由队列和现有预算计算，而非假设一分钟跑完整库：

- 单卷首轮最多约 300 秒比较 + 30 秒回填 + 300 秒重比较 + 三段 5 秒让出，
  即 645 秒；59 套串行保守首轮上限约 10.6 小时，另留身份初始化与空闲轮询余量。
  本机样本约 34–54 分钟只是期望；初期保留 2 小时密切观察，**首轮硬截止 12 小时**。
- 每个 target 的普通比较最多三次，30 秒/5 分钟退避。保守把基准建立前/后各算
  三次：59×2×3×300 秒约 29.5 小时（实际同 target 共享重试额度，通常更少）。
  回填最多六次，59×6×30 秒约 2.95 小时；单卷回填退避合计 321 分钟
  （5 小时 21 分钟），普通比较两阶段退避再留 11 分钟。调度器在一卷退避时
  可以处理其他卷，这些等待不按 59 倍串行叠加。再留任务让出及轮询余量，
  **资源恢复绝对截止 48 小时**；不以重试预算为理由无限等待，先触发下列短期限。

立即失败：schema/迁移状态异常、自动运行全局关闭、canary different/基准不可信/
确定性缺证据、comparison 与基准/当前 target 不符、fallback 冒充资格恢复、健康失败。
canary 尚未轮到不等于失败；它轮到后出现终态 unknown 则失败。
`TARGET_IDENTITY_PENDING/UNAVAILABLE/INVALID` 连续 5 分钟未恢复，或首 15 分钟没有
任何 checkedAt/inserted/equal 变化且仍有待处理对象，判“未开始处理”失败；其后仍有
待处理对象且任意 15 分钟完全无进展也失败，先检查 leader/activity/低磁盘等既有
暂停原因，不清锁、不热重试。已全部达到可解释终态的队列不要求额外重算来制造进展。
新增 exhausted 或三次资源比较重试耗尽，立即记录失败，不等 48 小时。
12 小时仍有从未检查的 pending、或 48 小时仍有瞬态 pending，执行代码回退决策。

单卷 equal 仅证明该卷；要交付恢复结果，还需列表所有计划对象都有可解释的最终
状态。证据完整性不能由 schema 安全替代，这是取消上线前生产抽样的剩余可用性风险。

离线验收示例：receipt startedAt=`2026-10-21T01:00:00Z`，候选 worker 于
`01:04:00Z` 提交当前 target equal，T0=`01:05:00Z`；`01:06:00Z` 的只读观察
返回 `DEPLOYMENT_WINDOW_EQUAL`，无需重算。若同一可信 target 的有效 equal 为前一日，
返回 `REUSED_VERIFIED_EQUAL`，不冒称由新 release 产生。对应离线 smoke 直接执行
本节原命令，覆盖这两类凭据及无效/旧身份资格拒绝，不发送网络请求。

## 4. 失败后的受支持操作

本地 Git 可证：`97c63a3b61296532cda6a54ecf06974fa10363f5`（#544）是以新 main
提交 revert `e664eecd782f9cf2e21086ac4dc2ec71f0804f9f`（#542），恢复旧 renderer
守卫并保留新增表。`~/Projects/eqb-deploy` 本次只读检查停在该 revert 提交且干净。
本地没有找到 deployments 收据，故不声称核对了那次远端的实际切换/恢复过程。
现行 daily deploy 与 local wrapper 均只接受最新 main，没有“部署任意旧 SHA”动词。

因此上线后业务 canary 失败的受支持代码回退为：

1. 在新 task 分支中对本次最终 squash main 提交做具名 revert PR（若包含额外
   已发布资产兼容读取修复，保留必需 reader；不能盲退 c42f8b64）。
   目标行为参考 97c63a3b 的旧 renderer 守卫，保留 legacy/v2/compatibility/attempt/
   migration 表和上线后所有业务数据；不做 down migration。
2. 完成当前 head/base 的自然 Full/E2E、独立审查与旧 renderer/已发布资产读取/
   未决 promotion reconciliation 验证，protected merge 到新的最新 main。
   97c63a3b 本地 smoke 只证明当时 fixture 的 store 操作，不证明未来资产兼容。
3. 重新计算生产当前 SHA→revert main 的受保护路径 digest。若确认仅撤回代码且
   启动不再改 schema，用同一受支持命令
   `scripts/local-deploy.sh deploy --owner-said-deploy-latest --reviewed-code-only-digest <新digest>`。
   若恢复实现仍需 schema/data 变更，须走明确 reviewed-migration 范围，不能假称 code-only。
4. 串行确认健康和一次列表/单卷。旧 renderer 守卫可能继续拒绝跨构建待审卷，
   这是回退的可用性限制；不能改 renderer/approval 来伪造恢复。未决 shipping guard/
   journal/target 先只读对账；响应 UNKNOWN 不重放、不清证据。

**流量重开后绝不恢复部署前 DB 快照**，自动 worker 和用户可能已写新数据；
pre-traffic 自动快照恢复只适用于控制器还没有重开流量的既有失败分支。
应急关自动 worker 是已有环境开关，但 daily SSH 没有改环境/重启任意服务的
独立动词，不能把直接 SSH/systemctl 写成已支持的快捷回退。若需要即时关停而
代码 PR/CI 的恢复时间不可接受，当前路径缺少该即时能力，需另行给出有界方案；
本方案不宣称零中断或即时部署历史 SHA。
