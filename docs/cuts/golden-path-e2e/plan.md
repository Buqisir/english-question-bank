# golden-path-e2e Plan — 黄金路径浏览器 E2E(enforced 登录 + 双视角)

## File Set(流程三改进③:声明本刀触碰的文件集)

新增:`scripts/smoke-golden-path.mjs`、本目录文档。
修改:`.github/workflows/verify.yml`(新增 e2e job)。
不碰:`app/src/**`、`server/**`、`scripts/verify-*.mjs`、`data/**`。

## Cut Size

medium。

Touches schema, data contract, product boundary, or teaching interpretation: no。
(纯测试 + CI 基建,零产品代码改动。)

## Objective

给 2.6 万行零单测的前端补一条「机器每个 PR 替 owner 把主路走一遍」的
防线:一条真实浏览器 E2E,在 **enforced 登录态**下以 owner 和 member
两个身份各走一遍黄金路径(登录 → 找题 → 题组详情 → 加入草稿卷 →
组卷工作台 → 导出 PDF),挂进 CI。现有 61 个 verify 是源码 grep,
防「代码被删」不防「跑起来是坏的」;现有 smoke-*.mjs 全部跑在零用户
不强制登录态。本刀补的就是这两个洞。

## Locked Product Decisions

- 沿用仓库现成 smoke-*.mjs 模式(plain node script + playwright
  chromium,临时目录 SQLite,spawn api+vite,PASS/fail 输出)。
  **不引入 @playwright/test 或任何新依赖**(playwright 已在 app
  devDeps)。
- 测试账号在临时 USER_DATA_DB 里用 `server/auth/auth.mjs` 的
  createUser/hashPassword 现场造(或 spawnSync `scripts/create-user.mjs`
  带 env),用户名 e2e-owner / e2e-member,密码随机生成。**绝不读
  `.env.qa`、绝不触碰生产或本地真实 DB。**
- 题库数据沿用 smoke-c8 的做法:schema.sql + seed-v0.sql + 脚本内
  fixture(可直接复用 smoke-c8 的 seed 函数思路;jslk paper-asset
  fixture 已在 app/public/paper-assets/ 原位可用)。
- 导出步骤只走「下载 PDF」(POST /api/draft-papers/:id/print-pdf),
  不碰「浏览器打印」(window.open + print dialog,headless 下不可控)。
- 不给 app/src 加 data-testid:选择器用中文文案 + role + aria-label +
  现有 data-group-id,与现有 smoke 习惯一致。选择器真不稳时 DEV 在
  完成报告里列出来,由 PM 决定是否另立小刀加钩子。

## 硬契约(不得偏离;偏离 = CR 打回)

- C1 新脚本 `scripts/smoke-golden-path.mjs` 单命令可跑
  (`node scripts/smoke-golden-path.mjs`),headless,退出码 0/1,
  全程使用临时目录 DB,结束清理子进程。
- C2 **enforced 登录真的在起作用**:浏览器打开首页时先断言登录页出现
  (「账号由馆主邀请开通。」或 login-card),错误密码登录被拒
  (login-error 出现),正确密码登录成功进入找题面。
- C3 owner 视角走通完整链:登录 → 找题面(默认 feed 或搜索)→ 展开
  来源卷 → 点「详情」进详情页 → 「加入草稿卷」→ basket-chip 打开
  组卷工作台(?view=draft-paper)→ 大纲里能看到刚加的题组 → 导出
  PDF 返回 200 且 body 以 `%PDF` 开头。
- C4 member 视角:同一浏览器 context 之外新开 context 登录
  e2e-member,走通 找题 → 详情 → 加入草稿卷 → 工作台(用户数据隔离:
  member 的草稿卷里没有 owner 加的题组);且在详情页断言 owner-only
  面**全部不存在**:编辑按钮、删除按钮(aria-label「删除题组」)、
  `.answer-compare-summary`、`.verify-list`、顶栏「管理」按钮。
- C5 CI 集成:`.github/workflows/verify.yml` 新增独立 `e2e` job
  (装 chromium 后跑 C1 脚本),现有 verify job 一字不动;本 PR 自身
  的 CI 必须两个 job 全绿。
- C6 零产品代码改动:`app/src/**`、`server/**` 的 diff 为空。

## 参考实现(可偏离,偏离须在完成报告里说明)

- 起点直接抄 `scripts/smoke-c8-draft-paper-composer.mjs` 的骨架
  (temp dir、startProcess、waitForHttp、seed 函数、cleanup)。
- 登录选择器:`#login-username`、`#login-password`、`.login-submit`;
  登录成功后是 `window.location.reload()` 整页刷新,等 AuthGate 的
  `/api/auth/me` 完成再断言找题面(`.concierge-desk` 或搜索框
  placeholder /找一道|比如/)。
- 详情入口:题组卡片 `[data-group-id]` 里文案精确为「详情」的按钮;
  详情页容器 `.detail-view`,返回按钮文案「返回找题」。
- 工作台:`.basket-chip`(aria-label「打开草稿卷…」)→
  `.draft-workbench-shell`;导出菜单是
  `details.draft-export-menu > summary`(文案「导出」)。
- PDF 断言可以用 page.evaluate 内 fetch POST print-pdf 拿 bytes,
  也可以点按钮后 waitForResponse——取实现简单者。
- CI e2e job:setup-node 24 + corepack pnpm(抄现有 job)+
  `pnpm exec playwright install --with-deps chromium`(app 目录)+
  `node scripts/smoke-golden-path.mjs`。
- **已知风险 + 预批降级出口**:print-pdf 服务端走 @vivliostyle/cli
  (需要它自己能找到 Chromium)。本地已证可行
  (`scripts/verify-print-pdf-export-flow.mjs`),CI 未证。若 DEV 在
  CI 装完 chromium(--with-deps)后 vivliostyle 仍不可用且一小时内
  解不掉:预批降级 = e2e job 里 PDF 步骤改为断言 print-pdf 返回
  200-或-503(503 时必须是精确的「精排 PDF 不可用」信封),**同 job
  追加跑 `node scripts/verify-print-pdf-export-flow.mjs` 作为 PDF
  产物的模块级证明**,并在完成报告里显著标注走了降级。本地跑脚本时
  仍必须 200 + %PDF。

## Forbidden

- `app/src/**`、`server/**`(零产品代码改动,含加 data-testid)。
- 现有 `scripts/verify-*.mjs`、`scripts/smoke-*.mjs`(只新增,不改旧)。
- `.env.qa` 与任何真实账号凭据;本地 `data/*.sqlite`;生产。
- verify.yml 现有 verify job 的任何一行。

## Suggested Files

- `scripts/smoke-golden-path.mjs`(新)
- `.github/workflows/verify.yml`(新增 e2e job)

## Verification

- C1-C4: 本地 `node scripts/smoke-golden-path.mjs` 退出码 0,输出含
  各步 PASS 行(登录拒绝/owner 全链/PDF 字节/member 隔离/member
  gate 断言至少各一行)。
- C5: 本 PR 的 GitHub Actions 两个 job 全绿(链接进完成报告)。
- C6: `git diff main --stat -- app/src server` 为空。

## Browser QA Matrix

本刀产物本身就是浏览器测试;不另做手动 QA。owner 若想抽查:本地跑
C1 命令看输出即可。

## DEV Readiness

- 全部侦察已完成(登录/找题/详情/工作台选择器、auth enforced 机制、
  smoke 模式、CI 现状均已核实,见上文),无前置依赖,可立即开始。
- 唯一不确定点是 vivliostyle-in-CI,已给预批降级出口,不阻塞。
