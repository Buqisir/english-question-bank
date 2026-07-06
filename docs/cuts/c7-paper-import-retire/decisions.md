# c7-paper-import-retire — Locked Decisions

Owner 拍板已记入 ADR-0016（网站端零导题 UI）+ 记忆
`website-consumption-only-principle`。本刀是该 arc 的第 1 刀（3 刀中最小最
干净），**无需新 grill**——owner 已多次确认「网站端一切导题 UI 退役」。

## D1 — 退役范围 = C7「整卷导入」这一面

只退 `paper-import`（C7，`AdminWorkbench`「整卷导入」按钮 → `PaperImportWorkbench`
→ 3 个 `/api/paper-import/*` 路由）。面 A「AI 导题」+ legacy「导入资料」是
后续独立刀，本刀不碰。

## D2 — 引擎全留（「页面死、引擎活」）

删：网站页面组件 + 前端 service + `paperImportRoutes.mjs`（HTTP 包装）+ 入口
按钮 + App.tsx 路由态/handler/挂载。

留（KEEP，删了砸后台线 / 看题页，见 ADR-0016 要害）：
- `server/paper-import/{publisher,validator,storage}.mjs`
- `server/paper-import/multipart.mjs`——本刀**仍被面 A `routes.mjs` import**
  （已 grep 实证），故本刀保留；三刀完成后才连带删。
- `server/paper-import-ai/*` 分析器（本刀完全不碰）
- `verify-c7-paper-import-contracts.mjs` + `verify-c7-paper-import-publish.mjs`
  ——测引擎契约不是 UI，保留（本刀在文件顶注释说明防误删）。

## D3 — 后端数据/发布路径零改动

不碰 schema / `data/sql/**` / VIEW / publisher 发布逻辑 / 建表
（`ensurePaperImportDatabaseShape` 留）。`api.mjs` 只删 `createPaperImportRoutes`
的 import + 注册（2 行），静态服务 + 建表 import 保留。

可逆：纯删 UI + 薄路由，git revert 即回。
