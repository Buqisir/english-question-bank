# 交接 Brief:修好 CI 反馈环(止住"假合")

> 来源:Coding Brain 参谋部诊断(2026-06-04)。性质:**题库实现活,在题库 session 里做。**
> **优先级:先做我,再做 `_brief-tdd-difficulty-calibration.md`**——先修好反馈环,
> 再在可靠的 CI 上做 TDD(Matt:没反馈别瞎飞)。
> 开法:题库开新 session(建议在主工作树,本 brief 当前未入库),读 `AGENTS.md` + 本 brief。

## 问题(诊断结论,证据=CI 日志 + main run 史)
1. **main 长期红**:最近 ≥5 次 CI(#181–#185)全 `failure`。CI 这个合并 gate **已失效**——永远红,于是没人能用它判断"这次合并安不安全"。这就是"假合"。
2. **根因 A**:多个 verify 脚本读 **off-repo 的真实 paper 数据**(`app/public/paper-assets/paper-960d0f8d/...`,gitignored,#185 做过 off-repo 备份)。CI 是干净 checkout,没有这些数据。`verify-i16a` line 57 **直接 `readJson` 不做 `existsSync` 守卫** → ENOENT 崩。
3. **根因 B(更阴险)**:`scripts/verify-ci.mjs`(line 69-70)是**第一个失败就 `process.exit` 中断**。`verify-i16a` 排第 50 个,它一崩,**后面 3 个(`i16b` / `i16c` / `search-thinking-toggle`)从来没在 CI 跑过**——真实状态未知,被掩盖。

## 目标
CI 跑**完整一轮不中断**,且**绿**(或只剩"真问题",单独修)。让 CI 重新成为可信的合并 gate。

## 步骤

### 1. 先摸清被掩盖的真相(别急着改)
- 单独本地跑 `i16b` / `i16c` / `verify-search-thinking-toggle`,看它们**本来**是绿是红(可能也依赖 off-repo 数据、也可能藏着真 bug)。
- `grep -rl "paper-assets" scripts/verify-*.mjs` 找出**所有**依赖 off-repo 数据的 verify,列个清单(不止 i16a)。

### 2. 止血①——`verify-ci.mjs` 改"收集模式"(别一崩就停)
- 把 `run()` 里"`status!==0` 就 `process.exit`"改成:**记录失败、继续跑完所有**,最后汇总 `PASS n / FAIL m` 列表,`exit(failed>0?1:0)`。
- 收益:一个脚本崩不再掩盖后面;一眼看全所有失败。

### 3. 止血②——依赖 off-repo 数据的脚本:数据缺失就 SKIP,别崩
- 对清单里每个脚本:读数据前 `existsSync` 守卫;缺失 → `console.warn('SKIP <name>: off-repo fixture absent')` + **不计入 failed**(本地有数据时照常测,CI 里 skip)。
- ⚠️ skip 只是"不红",**不是真测**——见步骤 5。

### 4. 验证
- 本地 `pnpm run verify:all`(或 `node scripts/verify-ci.mjs`)跑完、绿。
- push 一个小分支看 GitHub `Verify` 变绿。

### 5. 根治(可排后续,别和止血混在一个 cut)
- 给 CI 配一份**入库的最小 fixture**(一个精简 `paper-asset.json` 样本),让这些 verify 在 CI **真能测到**,而不只是 skip。skip 是临时,fixture 才让信号回来。

## 边界 / 范围
- 这是 **housekeeping cut**(类似你的 H 系列),纯 CI/脚本,不碰产品功能、不碰契约文件。
- 按 `AGENTS.md` 起 cut;PM 帽子先 grill"收集模式怎么汇总、哪些脚本 skip"再动手。

## 完成后
- CI 反馈环恢复 → 回去把 **PR #186**(AGENTS.md 治理,已 push、CI 红是本预存问题)重新看一眼:它会在健康 CI 下变绿,**成为反馈环修好后第一个干净合的 PR**,再 squash 合。
- 然后才接 `_brief-tdd-difficulty-calibration.md`。

## 回参谋部
修完可回 Coding Brain 说一声,我把"CI 已修复 + 真 fixture 排期"记进审查 backlog。
