# content-trust：三路复评内容信任账收官

出处：2026-07-17 全站三路复评（31/40，快照
`.impeccable/critique/2026-07-17T11-54-05Z__full-project.md`），owner 圈
「内容信任小刀」。cut size: small-medium；touches paper-assets（数据契约
面）: yes → lean plan 落盘，主代理直做（dash-normalize-bank 先例），
CR-lite。

## PA-lite 降档理由

三桩全部诊断实锤完毕（数据层定位，非猜测）；修法机械可逆；versions/
不动依 dash 刀先例（466a494：latest/ 44 文件、versions/ 0）。

## Scope（三修一挂）

1. **图卡重裁**：`app/public/paper-assets/paper-2026-i/latest/figures/
   reading-a-table-1.png` 顶部烤着「Upcoming Football Events」加粗标题，
   与 passage paragraphs[1] 文本段同句连续出现两次（评审 A 路 P2，四渲染
   面同源复现）。修：重裁 PNG 去顶部标题条（表格边框上沿以上裁掉），文本
   段保留为唯一正主（可检索、屏读可达）。全库唯一一处（asset JSON 逐字段
   walk 实核）。
2. **asset 假标题**：同卷 `latest/paper-asset.json` `paper.title` 字面
   `"paper"`（导题写入假货；整卷页面包屑因此裸串）。修：改 DB sources
   真值「2026年新课标Ⅰ卷」。全库 33 卷扫过唯一中招。
3. **my-space 删除键位**：卡片「删除」红键孤行在「下载PDF/打开原草稿」
   下方（评审 A 路：视觉割裂）。修：并入操作行（同排右置，danger 样式
   保留），纯显示层。
4. **挂账（不修，理由）**：讲评态写作节 404（writing-analysis-v1.json
   探测式 fetch）。代码兜底已优雅（unavailable 占位），仅 console 噪音；
   根治需 asset 增 analyses 索引字段=契约演进，归导题管线 agent 化刀
   吸收，本刀不碰 schema。

## Forbidden

- `versions/**`（import 快照不可变，dash 先例）
- schema / 迁移 / server/** / domain
- 其他卷 asset、其他 UI 面
- 生产机（部署走常规 deploy-remote，另行拍板）

## 裁决点清单（PM 断点锚）

1. [ ] DP-1 主代理自验：裁后 PNG 亲眼看（Read 图）+ title 改后
   verify-paper-assets-consistency + verify:all + tsc 真退出码
2. [ ] CR-lite（主代理冷读 diff）
3. [ ] DP-2 浏览器断言：详情页标题唯一渲染（DOM 文本计数）+ 整卷页
   面包屑=「2026年新课标Ⅰ卷」+ my-space 删除键入操作行
4. [ ] merge → main CI 绿
5. [ ] DP-3 owner 目检（Chrome 实看详情页/整卷页/个人空间）→ 部署

## Verification

```
node scripts/verify-paper-assets-consistency.mjs
pnpm -C app run verify:all
pnpm -C app exec tsc --noEmit
# DP-2 断言脚本（scratchpad，随刀入档 qa/）
```
