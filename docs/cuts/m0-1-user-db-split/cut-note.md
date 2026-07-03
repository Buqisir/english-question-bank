# M0-1 两库分离手术 — Cut Note（large，2026-07-03 结案）

上线路线图 M0 第 1 刀（决策 7 落地）。四张用户表
`draft_papers` / `draft_paper_items` / `my_space_artifacts` /
`my_space_folders` 迁入独立 `user-data.sqlite`，连接层双库。
配套 ADR-0011（合并即 Accepted）。

## 流程与结论

- 侦察（Sonnet Explore）→ PM plan → **PA（Opus）APPROVE WITH 5 MUST FIX**
  （store 连接扇出契约、selectQuestionGroupCards 签名、路由坐标订正、
  verify 假绿、孤儿过滤点）→ PM 压缩回 plan → **DEV（Sonnet high）**
  → **CR（Opus）APPROVE，0 Must Fix**（含破坏性反证：假绿断言真的会
  FAIL）→ 浏览器 QA 全过 → RM。
- 关键设计：用户库启动自愈建库（部署永不推它）；用户库 schema 单一
  来源=代码（四表撤出 schema.sql，反向断言防复活）；跨库 FK 降级为
  写侧守卫 + 读侧孤儿容忍（统一过滤点在 export 输入构建层）；一次性
  迁移脚本（备份→搬行→行数断言→DROP，幂等双路径）。

## 验证证据

- verify-ci 61 脚本全绿（DEV）+ 四个相关 verify CR 独立重跑全绿
  （46/72/32/79）。
- smoke-c8-draft-paper-composer 21 checks 全绿（含孤儿 4 断言；
  需 `env -u HTTP_PROXY -u HTTPS_PROXY`——Clash 代理会劫持
  vivliostyle 回环导致 502，环境问题非本刀）。
- 迁移脚本在生产库副本上演练：1 draft + 2 items 迁移成功、DROP、
  幂等 refuse 两路径正确、备份留存。
- 浏览器 QA（真迁移数据 + 临时双库）：工作台跨库拼装渲染、找题页
  in_current_draft 按钮态（两态均正确）、加组写路径、个人空间
  建文件夹/存 PDF（真 vivliostyle 出片）/归属正确、孤儿容忍
  （失效条目展示+统计排除+可删+预览不崩）、console 无错误。

## 挂账与移交

- **owner 合并后本机跑一次**：`node scripts/migrate-user-data-split.mjs`
  （不跑的话启动会警告；共享库里的草稿数据在迁移前继续可用）。
- smoke-c8-my-space 在 main 上既有失败（非本刀）：删非空文件夹的
  后端守卫有效，但前端吞了具体错误显示通用文案——已确诊并挂
  独立工单（含修法）。
- SW-4 用户库无版本表：M0-2（users 表进用户库）开刀时必须复评。
- CR SW-3：print-html 对空草稿/全孤儿草稿从 200 空串改为 400
  「请先添加题组」，新行为，合理。

## 教训

- Clash 代理环境变量会打挂 vivliostyle（Playwright 内部 Chromium
  没有正确 bypass 回环）——跑任何带 PDF 出片的脚本先摘代理。
- PA 再次抓到侦察坐标幻觉（server/router/ 不存在的路由文件）——
  「报告进 plan 前抽验 file:line」纪律继续有效，这次 PM 抽验了
  侦察报告但没抽验自己改动清单里的推测路径。
