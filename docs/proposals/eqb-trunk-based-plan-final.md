# EQB Trunk-Based 定稿（V4 收敛版）

2026-11-16 · 主会话与 Astra 共同敲定 · 基线 main 904dacd4e

**目标：** 推得快，修得快，长期不靠 Owner 盯着。
**一句话：** 默认直接推 main，main 跑完整 CI，全绿后自动部署。PR 只在自愿讨论时用。

## 一、日常规则（激活后）

1. **切小块：** 一个能说清、能验证的改动对应一个提交，几小时内做完。
2. **推前自检（L1）：** 先同步 `origin/main`，按改动选现有命令，不新建清单：
   - 前端 / UI：`node scripts/verify-ci.mjs --pack ui`（构建、类型检查，以及 motion、radius、emoji 等守卫）
   - 工作台组件：再加 `node scripts/verify-similar-workbench-swap.mjs`（裸 fetch 守卫）
   - 其他：`node scripts/verify-ci.mjs --changed --base-ref origin/main`（必须显式写基线）
   - 统一：`git diff --check origin/main...HEAD`，并实际操作一次受影响的行为
   - 高风险（鉴权、答案隔离、持久化、题号和答案对应、准入、共享 Paper 契约、CI 和部署工具链）：另加一次独立审查（Astra），审查结论绑定候选 SHA，但不开 PR
3. **直推：** `git push origin HEAD:refs/heads/main`。被拒绝就重新同步、重新自检后再推。永不强推。
4. **main 完整 CI：** 每次推送单独排队，按 SHA 分并发组，互不替换。
5. **自动上线：** 在 Owner"部署最新版"的长期授权下，最新 main 的 8 个 job 全绿后，Agent 自动部署并做线上验证；main 又前进了就重新解析，不用旧绿灯放行新版本。
6. **更新 Linear：** 写 commit 链接、做了什么、验证情况。

## 二、红灯与不稳定测试

- **谁推红谁负责，从发现失败起算 30 分钟。** 修不好，就撤销自己那次提交。撤销前先看后续提交有没有依赖它、有没有数据兼容影响；有依赖就先评估再动，不机械撤销。撤销也是一次普通直推。
- **红灯期间暂停普通推送**，只允许修复或撤销。
- **不稳定测试：** 失败的测试不在本次改动影响范围内，而且是已登记的不稳定签名时，允许整个 workflow 重跑一次，并记录下来。不能只重跑失败的 job，因为部署脚本只认最新一次运行里 8 个 job 全部成功。第二次还失败，就按真问题处理。
- 已登记的不稳定测试：`e2e-seams-2`「persistent overlay button clusters render in A3 mode」（iframe 重载期间的竞态，近期出现 3 次）。

## 三、修得快：从修好到上线

| 环节 | 现在 | 直推后 | 提速后 |
| --- | --- | --- | --- |
| PR CI（含"分支要最新"引起的重跑） | 25 分钟 ×1–3 次 | 没有了 | 没有了 |
| main CI | 约 25 分钟 | 约 25 分钟 | 15–20 分钟 |
| 部署 | 几分钟 | 几分钟，main 变绿后自动部署 | 同左 |
| 合计 | 1–2 小时 | 约 30 分钟 | 约 20 分钟 |

提速先做两件最便宜的事：
1. 把两个 render 分片分匀。今天 render-1 跑了 25.5 分钟，render-2 只有 8.8 分钟，总时长由最慢的那个决定。
2. 修掉上面那个 A3 不稳定测试。

其余提速等有数据再做。每周用 `gh run list` 统计一次"推送到上线"的耗时。

## 四、这轮不做

- **功能开关（PostHog）：** 现在没有外部用户。等第一次需要对真实老师隐藏一个没做完的功能时再接。
- **固定提速指标、仪表盘、merge queue、新常驻服务、新签名体系。**
- **回滚时跳过 CI**（撤销到已验证过的同一版本就直接部署）：要改部署脚本的放行规则，属于高风险。等有真实用户再评估。

## 五、切换（两步）

**第 1 步：最后一个强制 PR。** 它属于工具链高风险改动，需要 Astra 审查，并跑完整 Full 和 E2E。只改 4 个文件：
- `AGENTS.md`：Ship、推前验证、CI authority 三段（required checks、PR body、strict、watcher 相关表述）
- `.agents/ship.md`：默认路线改成直推加 main 收尾；PR 风险块和 watcher 移到可选 PR 路径
- `.github/workflows/verify.yml`：main 的并发组改按 SHA 分组
- `docs/agents/testing-cadence.md`：写明推前 L1，删掉强制 PR→main 两轮门禁

另外同步更新 `~/.factory/AGENTS.md` 里"开完 PR 更新 Linear"一条，改成"推 main 后更新 Linear"。

部署读取器、`ci-pr-plan.mjs`、watcher 不改，现有测试也不用改。

**第 2 步：激活。** 这一步需要 Owner 授权，因为要改 GitHub 设置：
- 只删除 main 的 required_status_checks
- 保留 enforce_admins、线性历史、禁止强推、禁止删除分支
- 用现有个人凭据推送，不用 Actions 的 GITHUB_TOKEN（否则不会触发 CI）

然后用一个真实小修复走一遍：直推 → main CI 绿 → 自动部署 → 线上验证。

**完成标准：** 能正常直推；连续推送时每个 SHA 都有自己的完整运行；红灯或证据不全的版本部署不了；下一个 Agent 能从 Linear 接手。

**撤回办法：** 恢复 required_status_checks，即回到现在的 PR 路线。

—— Droid 整理（2026-11-16）
