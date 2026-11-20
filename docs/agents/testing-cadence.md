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
- 按改动挑最窄的真实检查，推前单独跑，不用「main CI 会跑」代替：从 `--plan-json` 选出的脚本里挑和改动直接相关的浏览器或行为检查。例：改句子解析、讲评交互的 CSS 或颜色变量 → `node scripts/verify-sentence-analysis-browser.mjs`（11-17 `8842f6e69` 漏跑它，main 红约 50 分钟）。改共享 token 时按用到它的页面挑，不只按文件名
- 独立审查和直推 / PR 的适用范围见 [AGENTS.md](../../AGENTS.md#ship-to-main)。

缺失的局部验收只补一次，
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
per-paper Screen/Print/PDF proof merely because another paper
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
工具链 PR 在触发验证前同步 main，完整 PR CI 绿后 squash 合并；
随后 main 前进不因追平重跑 PR，部署仍等最新 main。旧 SHA/尝试不授权新版本。

## 检查的去留

新增或修改一个检查时，在脚本开头或提交说明里写明它独立防住的错误，最好指向那次事故的 SHA 或 issue。改到某个检查时，发现另一个检查已覆盖同一错误，就合并或删掉重复的那个，并在提交说明里写原因。随改动顺手做，不单独开清理任务。

## 不稳定测试登记表

| Job | 失败签名 | 已知原因与记录 |
| --- | --- | --- |
| `e2e-seams-2` | `persistent overlay button clusters render in A3 mode` | A3 切换后卷面再次重排，断言在 iframe 重载期间运行的竞态。近期 3 次（runs 43612487119、43792168923、43824750536）。修复 `aa413f1e0` 在 `claude/dreamy-thompson-296ayb`，待合入；合入后连续两周未再出现则移除登记。 |

失败不在本次改动影响范围内，且签名已经登记时，允许整个 workflow 重跑一次，
并在 Linear 记录 SHA、run/attempt、签名和结果；不只重跑失败 job。
第二次仍失败按真红处理：暂停普通推送，首个失败 SHA 的推送者在发现后
30 分钟内推出修复或撤销；不在时由先发现的 Agent 接手。撤销前评估依赖和
数据兼容性，保留失败记录。
