# draft-desk-b — cut-note（large 刀收官记录）

- Cut:草稿卷「屏幕预览 ↔ 导出 PDF」分页 parity。方向 = 路甲:服务器唯一排版
  真源,paged.js **单次渲染**同源出「分页活页面 + PDF」,每题常驻叠按钮。
- PR #285,基线 github/main @ 292c058,收口头 0f1ca05(+cr/cut-note docs commit)。
- 结果:三套分页引擎(客户端贪心 / Vivliostyle 草稿线 / 浏览器自排打印)收敛为
  **一次 paged.js 渲染**;预览 / PDF / 打印三出口同源,parity 从「肉眼对齐」变成
  构造保证 + QA 数字实证(7页=7页,/Type /Page 逐一核对)。

## 五步过闸轨迹(细节见各 cr-step*-lite.md)

步0 spike DP-1(四硬验收) → 步1 渲染器+Chromium 池(25+2) → 步2 DOM 契约+
缓存解耦(14+32) → 步3 前端接线+叠按钮+DP-title 修复 → 步4 PDF 换线+打印并入
+SW-5 退役 → 步5 门复核+QA matrix 9/9。每步主代理亲手复跑 + CR-lite 过闸,
CI 双绿后才进下一步。

## Owner 拍板记录

DP-1 引擎选定(paged.js)· PO-1 建议显示延后 · PO-2 编辑手感简单版 ·
DP-title Option B(title 入签名,2026-07-12)· 步4 复审两裁(SW-5 退役不迁移、
浏览器打印并入,2026-07-12)。

## 终审(fresh Opus CR,cr.md)

**APPROVE,0 Must Fix,4 Should Watch**。PA 7 MF 逐条结构性落地核实;
forbidden-scope 门改造为真退役非放松(CR 亲手复跑);三处 verify 断言换向均
诚实 turnover;跨步盲区(duplicate groupId)有 store 层去重闸;退役符号零
残留引用。

## 过程亮点(判例价值)

- **CI-only 捕获 ×2**:error-copy 计数门(步3)、e2e 缺 server 侧 chromium
  (步4,playwright 与 playwright-core 各锁各的浏览器 revision)——「全套只信
  CI」纪律两次兑现。
- **断点锚实战兑现**:步3 DEV 被误触终止,checkpoint commit 接住,续派零重做。
- **QA-1**(步5 matrix 抓获):重排徽章锚纸顶,多页编辑时在视口外(实测
  top:-3156)——改视口定位,复验 inViewport:true。
- xhigh 复审改掉 Opus 原 plan 两处:SW-5「迁移」→「退役」(双缓存=双失效时机
  =静默失真面)、打印第三引擎并入步4。

## 挂账汇总

- 已收:SW-A(figure 图,步2 修)· SW-D(export-flow fixture,步4 前置修)·
  SW-E(forbidden-scope 门,步5 改造)· SW-B(chromium verify 入 e2e,步5)·
  SW-F/G(LRU/versionType key,步3)· SW-I(error 徽章,步4)· QA-1(徽章
  视口定位,步5)。
- 遗留(不 block,见 cr.md / cr-step4-lite.md):SW-J 错误码映射不精确(止于
  不精确,ownership 404 先行无泄漏)· SW-K printHtml 死流量 effect(归 printHtml
  面收缩刀)· SW-H 单飞锁(成本真实再做)· CR-new:/pagination 路由缺直接
  跨用户 HTTP 断言(低,同门兄弟路由已盖)· CR-new:export-flow verify 无 CI
  归宿(金路径由 smoke 盖)。
- perf verify 留 local-only(共享 runner 易抖,README 有档)。

## 上线前置(部署节点执行,owner 拍板)

生产机(HK,eqb-hk-1)`cd server && npx playwright-core install --with-deps
chromium`(与 CI e2e 同款,rev 由 server 的 playwright-core 锁定)→ 常驻
Chromium 内存占用 vs 机器规格实测 → 暖延迟实测(预算 ≤1s,本地 ~700-800ms,
SW-C 收口)→ 全部落 go-live-record.md。

## 待办(本刀关门条件)

- [ ] owner DP-3 产品 QA(parity 肉眼 + 交互手感 + PO-2 编辑手感验收)
- [ ] merge(owner QA 过后;post-merge 盯 main CI)
- [ ] STATUS.md 更新(≤5 行 + token 账单)

## Token 账单(子代理,约)

DEV:步3 前任(中断,部分)+ 续派 173k + 步4 330k + 步5 94k;整刀 CR 124k;
步1/2 属前一会话(见其记录)。主代理出场:每步过闸 ×5 + QA matrix 亲驱。
