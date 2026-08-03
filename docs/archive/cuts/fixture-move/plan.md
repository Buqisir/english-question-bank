# fixture-move Plan — jslk 扁平夹具搬出生产 serve 路径

## Cut Size

medium（机械为主 + 一处语义换锚）；touches schema / data contract /
product boundary / teaching interpretation: **no**。PA 不设（侦察已把
影响面点到文件行级）；fresh CR 冷读（i16a 换锚是判断活，值一次冷读）。
收尾含**一步生产操作**（删残留目录）= 强制裁决点，回主代理亲手。

## Objective

`app/public/paper-assets/paper-2024-jslk-english/`（全仓唯一扁平结构、
被生产 serve + R2 备份天天报 501 的测试夹具）搬到
`test-fixtures/paper-assets/paper-2024-jslk-english/`，消费方脚本改路径，
一致性 verify 的 KNOWN_FIXTURES 白名单同刀移除。出处：STATUS 账本独立
刀条目；owner 2026-07-14「发车」。

## 关键事实（侦察已证；三个同名路径勿混）

- **搬家标的**：`app/public/paper-assets/paper-2024-jslk-english/`
  （3 文件 160K，git 跟踪，扁平 `analyses/` 结构）。
- **勿动的同名兄弟**：`test-fixtures/paper-import/paper-2024-jslk-english/`
  （C7 导题夹具，另一份数据集）与 `docs/sources/paper-2024-jslk-english/`
  （规范源 docx）——各自消费方（c7-*/i1/i2/i3）**零改动**。
- 消费方全清单（行号见侦察，DEV 逐一核）：
  - 12 个内联字面量路径脚本：verify-c6a-2 / c6a3 / c6a4 / c6a5 / c6a6a /
    c6a6b / c6a7 / c6a8 / c6a9 / c6b1 / c6b2 / verify-paper-asset-v1
  - 3 个 PAPER_ID 常量拼路径脚本（改前缀即可）：verify-i0c / i0d / i0e
  - `verify-paper-assets-consistency.mjs`：KNOWN_FIXTURES（:136）+
    disk→DB 循环的 continue 分支（:147）
  - `verify-i16a-teaching-dimension-search.mjs`：不写路径、扫目录建索引，
    jslk 断言（:303-323 等）搬家后会假红——需**换锚**（见硬契约）
- 生产侧：备份脚本整目录递归拷、无 jslk 硬编码——**零改动**；501 在
  源目录删除后自然消失（go-live-record.md:52-55）。

## 硬契约（不得偏离；偏离 = CR 打回）

- `git mv` 保历史：标的整目录 →
  `test-fixtures/paper-assets/paper-2024-jslk-english/`（与既有
  `paper-import/` 命名空间并列；文件内容零改动）。
- 15 个消费脚本只改路径字符串/前缀，断言语义零改动。
- consistency：**先搬后删白名单**（同一 commit 内完成即可）——删
  `KNOWN_FIXTURES`（:136）与 `continue` 分支（:147），恢复「任何磁盘
  孤儿目录都 FAIL」严格语义。
- **i16a 负样本保留 jslk 本体（2026-07-14 修订）**：换真卷已实证不可行
  ——DEV 盘点全部 31 个真卷解析全覆盖，jslk 是全仓唯一「声明组但缺
  解析」负样本（当初 MF-2 选它做锚正因于此）。修订后的梯子：
  1. **首选**：i16a 的扫描 corpus 在临时目录拼装（真 assets + 从新家
     `test-fixtures/paper-assets/` 取的 jslk），或索引构建入口参数化
     扫描根——4 条断言语义与条数原样保留；
  2. **次选**（仅当①必须动 app/server 契约面才可达时）：构造最小合成
     负样本（声明组但缺 analysis 的 minimal paper-asset.json，放
     `test-fixtures/paper-assets/_synthetic-i16a/`）拼进 corpus——
     「缺解析不进索引」的语义本质不依赖样本是否真卷；
  3. **禁止**：放宽/删除这 4 条断言，或逆转搬家顺序。
- **基线纪律**：动手前先在 worktree 实跑全部 17 个受影响脚本记录基线
  （i16a 需先从主树复制 `app/public/paper-assets/paper-960d0f8d/versions/`
   到 worktree 同位置——gitignored 内容，只为自验，不入 git）；施工后
  同一清单全绿 + verify:all 的 PASS 数不得低于施工前基线、SKIP 集合不得
  新增成员。
- 本地 `?view=reading-analysis` 的 jslk 深链搬家后失效——已知可接受
  （孤儿支本就在退役账上），不做兼容层。

## Forbidden

- `test-fixtures/paper-import/**`、`docs/sources/**`、c7-*/i1/i2/i3 脚本
  零改动；`scripts/backup-*.sh` 零改动；R2 历史备份对象不删。
- app/src、server/**、domain/schema 零改动（本刀纯 scripts+fixtures）。
- **并行边界（与 draft-docx 刀同期施工，钉死）**：不动
  `scripts/verify-ci.mjs`（无注册变更）；`scripts/README.md` 只许改
  :139 那一行的路径字符串；不碰 `server/draft-paper/**`、
  `app/src/features/draft-paper/**`、`app/src/services/draftPapers.ts`、
  新脚本 `verify-draft-paper-docx.mjs`。
- 生产侧操作不在 DEV 范围——收尾由主代理亲手（裁决点）。

## Verification

- narrow（17 个受影响脚本逐一）：c6a-2 / c6a3 / c6a4 / c6a5 / c6a6a /
  c6a6b / c6a7 / c6a8 / c6a9 / c6b1 / c6b2 / paper-asset-v1 / i0c / i0d /
  i0e / i16a / paper-assets-consistency——**注意 13 个不在 verify:all
  册内，CI 不会替你验，必须逐一实跑**。
- full：`pnpm -C app run verify:all`（PASS 不降、SKIP 不增）。
- 若 verify:all 撞端口假红（与并行刀同时自验的已知风险）：排查残留
  进程、错峰重跑一次再判。

## DEV Readiness

workspace：worktree `/Users/huangxuewei/Projects/wt-fixture-move`（已建，
依赖已装）；断点锚 wip commit；完成报告按 dev-completion-protocol。

## 裁决点清单

- [x] DP-1 立刀授权（owner「发车」2026-07-14；本 plan 即记录）
- [x] DP-2 CR verdict 处置（APPROVE 0MF/3SW；11 红 smoke 主代理主线对照定性为既有烂账）+ 复核全绿（2026-07-14）
- [x] DP-3 生产清残留 ✅ 2026-07-14 部署 022c634 时 git pull 自动迁移，主代理 SSH 实证 serve 路径零 jslk、新家 2 条目（见 STATUS）
