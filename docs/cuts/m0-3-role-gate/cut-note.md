# M0-3 权限两档（owner/member）— Cut Note（结案记录）

- Cut: medium-large（产品边界刀：member 产品形态首次定义 + 41 条路由挂闸）
- 分支/PR: cut/m0-3-role-gate
- 上游: roadmap 决策 #6；ADR-0013；M0-2 地基（session.role / users.role）

## 交付

- 服务端 owner 闸：`defineRoute(..., { ownerOnly: true })` 声明 +
  runRoutes `beforeHandle` 通用钩子（机制），403 策略住 api.mjs 调用点
  （router 零 auth 词汇，H1 骨架闸 28 断言原样保留）。41 条挂闸：
  legacyImport 12 / paper-import 3 / paper-import-ai 6 / topic-labels 1 /
  verb-profile 1（D4：sidecar=共享馆）/ questionGroups 16 / paper-sets 2。
- authMode `'open' | 'enforced'` 无条件进 context 四象限；闸用
  `=== 'enforced'` 正判（开放模式 = owner 视角，ADR-0013 决策 2）。
- 前端：AuthGate 单点翻译 `isOwnerView`；member 锁 homeMode='ai'
  （无视 localStorage 残留）、4 策展按钮 + 模式切换不渲染、
  `?view=paper-import(-ai)` URL 直达废止；owner/开放模式零变化。
- `scripts/verify-owner-gate.mjs` 7 断言（member 全 41 条 403 /
  owner 全 41 条过闸 / 允许面样本 / 开放模式样本 / 403 响应体固定），
  进 verify-ci + README。
- 顺手修真 bug：`scripts/dev.sh` 探活原用 401-gated 的
  /api/paper-sets——强制登录模式下 dev.sh 永远起不来（M0-2 埋雷本刀
  踩响），改为白名单 /api/health。

## 流程与验证

- 双侦察（Sonnet×2 ≈19.5万 tok，坐标 PM sed 抽验）→ plan+ADR-0013 →
  PA（Opus ≈7.2万，APPROVE WITH 3 MF 全采纳：synonym-difficulty 漏列/
  幽灵计数 7→6/authMode 四象限+正判）→ DEV（Sonnet high ≈36.8万含
  续跑，1 次正当上报 BLOCKER：H1 闸与 plan 冲突，PM 裁决 beforeHandle
  钩子化解，不削弱任一契约）→ CR（Opus ≈6.2万，APPROVE 零 MF，
  纠正 DEV 自评：owner 面实为全量断言）→ PM 浏览器 QA 全过 → RM。
- verify-owner-gate 7/7；verify-auth-gate 17/17 回归；verify-h1 28/28；
  verify:all 63/63；tsc+build 绿。
- 浏览器 QA（真库，QA 账号用后即清、回开放模式）：member API 矩阵
  11 探针全 403 + 允许面全过；埋 classic 残留+URL 直达均落回 AI 主页；
  owner 经典模式/策展按钮零变化；开放模式前后零变化；console 零错误。

## 挂账与移交

- **owner 追认（非阻塞）**：D2 开放模式=owner 视角；D3 member 入口
  隐藏非禁用（ADR-0013 决策 2/3）。
- 新路由默认不挂闸（省略 options=member 可用）——写共享馆的新路由
  必须记得加 `ownerOnly`（ADR-0013 后果节；CR SW-1）。
- dev.sh 孤儿进程坑独立小刀工单已发（chip task_a9becd2a：端口被占
  时应报错而非静默续用旧进程）。
- CR SW-2/SW-3：开放模式回归仅 5 条样本；isOwnerView 默认 fail-open
  （服务端 403 兜底）——均非阻塞观察项。

## 教训

- **孤儿 API 进程让浏览器 QA 整轮作废**：dev.sh 的 curl 探活探到的是
  旧进程（新 api 绑定失败静默死），QA 前必须核对 8787 监听进程的启动
  时间。本轮误触旧服务器的 topic backfill（幸 unlabeled=0 零损失）。
- **verify 脚本的环境隔离要列全资源清单**：DB 两个都覆盖了，
  paperAssetsDir 漏了——owner 通过面真跑 verb-profile backfill，往真
  资产目录写了 3 个 sidecar（已删、已修 QUESTION_BANK_PAPER_ASSET_ROOT
  覆盖）。凡 verify 起真服务，env 覆盖清单=服务读写的全部路径。
- **两个已提交契约打架时找第三条路**：H1「router 无 auth」vs plan
  「runRoutes 集中挂闸」——机制（通用钩子）/策略（api.mjs 回调）拆分
  让两个契约都原样成立，比削弱任何一方干净。DEV 不越权改别刀验收物、
  停下上报，是对的流程。
