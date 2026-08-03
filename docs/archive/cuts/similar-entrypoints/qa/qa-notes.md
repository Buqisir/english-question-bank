# similar-entrypoints (E3) — QA 记录

## DEV 自验（2026-07-10，worktree dev server + Chrome 真点击）

Plan 验收 1-6 全过：四类深链自动开相似栏（结果+chips）、写作组无按钮
+ 强造 `similar=1` 静默降级零请求、concierge 配相似换引擎（搜索框不再
被回填）、URL 还原/返回解析清参数、Cmd+点击新标签直达、每次深链恰好
一次 POST /api/similar-questions。详见 DEV 完工报告（会话记录）。

## 主代理复核 QA（2026-07-10，headless Playwright，覆盖 CR Should Watch ①②）

脚本：session scratchpad `qa-e3-recheck.mjs`（一次性，不入库）。
账号 qa-local-owner（worktree sqlite 本地重置）。

- 四类题型（阅读/完形/七选五/语法）**详情页「配相似」真点击**各一遍：
  按钮在场 → 讲评态相似栏打开 → URL 带 `similar=1` → reason chips
  渲染（40-60 枚）→「返回解析」栏关闭 + URL 清参 → **reload 不回弹**
  （一次性 ref guard 证实）。25/25。
- 写作组（应用文写作）详情页「配相似」count=0（隐藏门禁证实）。
- 插曲：首轮脚本正则 `/应用文/` 误匹配 Reading A（摘要含"实用信息类
  应用文"），误报一条 FAIL；定点复测后销。教训：按行首题型名匹配，
  别按卡片全文。
- 悬浮显形惯例再证：concierge 行操作钮须先 hover 再点。

## 静态复核（主代理亲跑，真实 exit code）

- verify-similar-questions 29/0、verify-paper-browse 184/0、
  verify-concierge-desk 249/0
- `pnpm -C app run verify:all`：PASS 72 / SKIP 1（既有 off-repo
  fixture）/ FAIL 0
- `app/ npx tsc -b --force` exit 0

CR Should Watch ①②由本轮 QA 关闭；③（无 questionId href 静默降级）
④（三处同名白名单常量值不同）留观，见 cr.md。
