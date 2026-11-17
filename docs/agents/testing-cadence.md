# Testing cadence

Test weight follows actual blast radius, irreversibility, and automation
authority. `SKIP` is never `PASS`.

## 推前 L1

任务默认包含直推 main 和上线，不等 Owner 再说 Ship。先同步 `origin/main`，
解析当前 main SHA，检查它最新一次自然运行的 8 个 job，以及仍影响当前 main 的
未解决失败；按 SHA 判断，不按运行结束顺序。红灯期间只推修复或撤销。

- 前端 / UI：`node scripts/verify-ci.mjs --pack ui`（构建、类型检查，以及 motion、radius、emoji 等守卫）
- 工作台组件：再加 `node scripts/verify-similar-workbench-swap.mjs`（裸 fetch 守卫）
- 其他：`node scripts/verify-ci.mjs --changed --base-ref origin/main`（必须显式写基线）。先加 `--plan-json` 看选出哪一档；选出 `all` 时不在本地跑 Full，只跑直接受影响的脚本，Full 交给 main CI
- 统一：`git diff --check origin/main...HEAD`，并实际操作一次受影响的行为
- 高风险（鉴权、答案隔离、持久化、题号和答案对应、准入、共享 Paper 契约）：另加一次独立审查（Astra），审查结论绑定候选 SHA，但不开 PR
- **CI 和部署工具链**（`.github/workflows/`、`scripts/verify-ci.mjs`、`scripts/ci-pr-plan.mjs`、部署脚本和控制器）：继续走 PR，PR 完整 CI 绿、Astra 审过再合。这类改动改的是裁判本身，推上 main 以后它自己那次绿灯证明不了它没被改松

Ship/验证规则本身同样走工具链 PR 路径。缺失的局部验收只补一次，
main 自然运行覆盖的 Full/E2E 不在本地重复；不叠加 focused/Paper/Full。
可见改动先检查真实渲染，部署后在线上做 Owner QA。

## Local and reversible

Before pushing, run the L1 checks above even when main CI also covers them;
reuse still-valid L1 evidence, and add other acceptance only for real gaps. A UI micro-change also gets real-click
verification on the exact page and state, plus Owner QA when visible. It does
not trigger unrelated backend, paper, print/PDF, or full-repository suites
without a demonstrated dependency.

## Known-shape paper data addition

When accepted adapter, schema, publisher, and renderer behavior are unchanged,
require strict input validation, immutable source/candidate identity,
candidate-bound Teacher Confirmation, deterministic data checks, atomic
publication/reload behavior, and a light canary proportionate to the paper.
Do not require a full suite, independent code review, authority bump, or deep
per-paper Screen/Student/Teacher Print/PDF proof merely because another paper
was added. Discovery of a new content shape or shared-behavior change exits this
lane.

## High-risk shared behavior

Changes to shared schema/data contracts, auth/permissions/isolation,
persistence/migration, atomic publication, shared PaperSurface or
Screen/Print/PDF behavior, production configuration, or irreversible cross-cut
architecture require affected public-seam tests, Full/E2E on the final
candidate, and one independent Astra Standards/Spec review before push. Reuse the exact
candidate's natural CI rather than duplicating its suite locally. Renderer
changes use real affected Screen/Print/PDF output; static regex or hashes alone
are not visual proof.

## Release

Report commands, outcomes, observed wall time, and limitations literally.
After a fix, rebase or base advance, re-run only local checks invalidated by
changes to their code, dependencies, fixtures or runtime/environment. Preserve
unaffected results and failed attempts; an environment fix affecting only a
few checks does not justify repeating the whole suite. If impact cannot be
bounded, broaden checks with a reason. Reuse unchanged builds and artifact
evidence only while their inputs and running implementation remain unchanged;
keep final outputs bound to the exact revision.

默认直推后盯该 SHA 的自然 main `push` 完整 CI；部署只认最新 main 最新尝试
的 8 个 job 全绿。main 的推送共用一条队列：正在跑的不取消，只留最新一次排队；被跳过的推送显示 cancelled，不算失败，由下一次运行覆盖。无需强制 PR→main 两轮。
工具链或可选 PR 路径在触发验证前同步 main，完整 PR CI 绿后 squash 合并；
随后 main 前进不因追平重跑 PR，部署仍等最新 main。旧 SHA/尝试不授权新版本。

## 不稳定测试登记表

| Job | 失败签名 | 已知原因与记录 |
| --- | --- | --- |
| `e2e-seams-2` | `persistent overlay button clusters render in A3 mode` | A3 切换后卷面再次重排，断言在 iframe 重载期间运行的竞态。近期 3 次（runs 43612487119、43792168923、43824750536）。修复 `aa413f1e0` 在 `claude/dreamy-thompson-296ayb`，待合入；合入后连续两周未再出现则移除登记。 |

失败不在本次改动影响范围内，且签名已经登记时，允许整个 workflow 重跑一次，
并在 Linear 记录 SHA、run/attempt、签名和结果；不只重跑失败 job。
第二次仍失败按真红处理：暂停普通推送，首个失败 SHA 的推送者在发现后
30 分钟内推出修复或撤销；不在时由先发现的 Agent 接手。撤销前评估依赖和
数据兼容性，保留失败记录。
