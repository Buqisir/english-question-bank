export const meta = {
  name: 'cut-pipeline',
  description: '例行刀标准流水线:DEV → verify 复核 → fresh CR,四硬纪律内置,收口 schema 全字段返回',
  whenToUse: '零裁决点例行刀(plan 已 commit、worktree 已预建、不碰契约面);裁决点切段后的确定段同样适用。调用:Workflow({name:"cut-pipeline", args:{cut, worktree, verifyCmds, cr}})',
  phases: [
    { title: 'DEV', detail: 'Sonnet/medium 按 committed plan 施工', model: 'sonnet' },
    { title: 'Verify', detail: 'Sonnet/low 亲跑复核,原始退出码', model: 'sonnet' },
    { title: 'CR', detail: 'Opus/high fresh 冷读 diff', model: 'opus' },
  ],
}

// args 契约:
//   cut        必填 — cut 目录名(docs/cuts/<cut>/plan.md 必须已 commit)
//   worktree   必填 — 主代理预建的 worktree 绝对路径
//              (git worktree add <path> && cd <path> && bash scripts/setup-worktree.sh)
//   verifyCmds 建议 — 在 worktree 内逐条执行的验证命令(plan Verification 节照抄)
//   cr         可选 — 'fresh'(默认,Opus 冷读)| 'lite'(命中率降档类:跳过
//              CR 步,返回 needsCrLite=true,主代理自己冷读收口)
//   notes      可选 — 给 DEV 的一句补充(不能替代 plan;plan 不足先补 plan)
// 兜底:部分 harness 把 args 序列化成 JSON 字符串传入(motion-pass 首跑实撞)
const _args = typeof args === 'string' ? JSON.parse(args) : (args || {})
const { cut, worktree, verifyCmds = [], cr = 'fresh', notes = '' } = _args
if (!cut || !worktree) {
  throw new Error('args.cut 与 args.worktree 必填;worktree 由主代理预建后传入')
}
const t0 = budget.spent()
const planPath = `docs/cuts/${cut}/plan.md`
const bill = (extra) => ({ tokensSpent: budget.spent() - t0, mainAgentAppearances: 2, ...extra })

// ── Phase 1: DEV ──
phase('DEV')
const dev = await agent(
  `你是 DEV,在 worktree ${worktree} 内施工(这是你唯一的工作目录,动手前先 pwd 自证;严禁对主仓库路径跑任何写命令,禁用 git stash)。\n\n` +
    `执行契约:读 ${worktree}/${planPath},按硬契约施工,严守 Forbidden,不加未要求的功能,不重开已拍板的决策。${notes ? `补充:${notes}\n` : ''}` +
    `实现完成、进入自验前,打一个 checkpoint commit(wip(${cut}): impl complete, pre-QA);自验跑 plan 里最窄的验证命令;完成后做最终收口 commit(一行 message)。\n` +
    `若 plan 有歧义、任务并非自包含、或无法在 Forbidden 内完成:立即停手,blocked=true 并说明原因,不要猜。`,
  {
    label: `dev:${cut}`,
    phase: 'DEV',
    model: 'sonnet',
    effort: 'medium',
    schema: {
      type: 'object',
      required: ['blocked', 'changedFiles', 'commits'],
      properties: {
        blocked: { type: 'boolean' },
        blockedReason: { type: 'string' },
        changedFiles: { type: 'array', items: { type: 'string' } },
        commits: { type: 'array', items: { type: 'string' }, description: '含断点锚与收口 commit 的 hash+一行说明' },
        selfVerify: { type: 'string', description: '自验命令与结果一句话' },
        blindSpots: { type: 'array', items: { type: 'string' } },
      },
    },
  },
)
if (!dev) return bill({ verdict: 'ABORT', stage: 'DEV', reason: 'DEV agent died' })
if (dev.blocked) return bill({ verdict: 'ABORT', stage: 'DEV', reason: dev.blockedReason, devReport: dev })

// ── Phase 2: Verify 复核(DEV 自报绿一律不收)──
phase('Verify')
const cmds = verifyCmds.length ? verifyCmds : ['git status --short']
const verify = await agent(
  `你是 verify 复核代理,是主代理亲跑验证的等价替身。在 ${worktree} 内逐条执行以下命令,如实记录每条的**原始退出码**(不许经任何吞退出码的管道,不许解释性放水):\n` +
    cmds.map((c, i) => `${i + 1}. ${c}`).join('\n') +
    `\n最后跑 git status --short 检查工作树残留(未提交文件=残留)。你只报事实,不做修复。`,
  {
    label: `verify:${cut}`,
    phase: 'Verify',
    model: 'sonnet',
    effort: 'low',
    schema: {
      type: 'object',
      required: ['allGreen', 'exitCodes', 'treeClean'],
      properties: {
        allGreen: { type: 'boolean' },
        exitCodes: { type: 'array', items: { type: 'object', required: ['cmd', 'code'], properties: { cmd: { type: 'string' }, code: { type: 'integer' }, tail: { type: 'string', description: '失败时输出末尾几行' } } } },
        treeClean: { type: 'boolean' },
        residuals: { type: 'array', items: { type: 'string' } },
      },
    },
  },
)
if (!verify) return bill({ verdict: 'ABORT', stage: 'Verify', reason: 'verify agent died', devReport: dev })
if (!verify.allGreen || !verify.treeClean) {
  return bill({ verdict: 'ABORT', stage: 'Verify', reason: 'verify 红或工作树有残留', verifyReport: verify, devReport: dev })
}

// ── Phase 3: fresh CR(降档类可跳,主代理自己 CR-lite)──
if (cr === 'lite') {
  return bill({ verdict: 'PENDING_CR_LITE', needsCrLite: true, devReport: dev, verifyReport: verify, worktree, cut })
}
phase('CR')
const crRes = await agent(
  `你是 fresh CR,冷读一份你没参与实现的 diff。工作目录 ${worktree}(只读加写 cr.md,不许改实现)。\n` +
    `流程:读 ${planPath} 拿到契约 → git log/diff 拿到本刀全部改动 → 逐条核对:硬契约是否成立、Forbidden 是否被碰、验证是否真的证明了风险(不接受"测试过了"而不看测试覆盖什么)、scope 是否漂移。DEV 报告是输入不是真相。\n` +
    `把报告写到 ${worktree}/docs/cuts/${cut}/cr.md(Verdict / Must Fix / Should Watch / 证据),并随 worktree 分支 commit(一行 message)。`,
  {
    label: `cr:${cut}`,
    phase: 'CR',
    model: 'opus',
    effort: 'high',
    schema: {
      type: 'object',
      required: ['verdict', 'mustFix', 'shouldWatch'],
      properties: {
        verdict: { type: 'string', enum: ['APPROVE', 'APPROVE_WITH_MUST_FIX', 'BLOCK'] },
        mustFix: { type: 'array', items: { type: 'object', required: ['summary'], properties: { file: { type: 'string' }, summary: { type: 'string' } } } },
        shouldWatch: { type: 'array', items: { type: 'string' } },
        crPath: { type: 'string' },
      },
    },
  },
)
if (!crRes) return bill({ verdict: 'ABORT', stage: 'CR', reason: 'CR agent died', devReport: dev, verifyReport: verify })

// ── 收口 schema:主代理凭此直接走裁决点(MF 处置 → merge → STATUS),不必读 journal ──
return bill({
  verdict: crRes.verdict,
  mustFix: crRes.mustFix,
  shouldWatch: crRes.shouldWatch,
  crPath: crRes.crPath || `docs/cuts/${cut}/cr.md`,
  devReport: dev,
  verifyReport: verify,
  worktree,
  cut,
})
