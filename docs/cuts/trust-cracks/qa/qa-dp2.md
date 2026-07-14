# trust-cracks — DP-2 主代理浏览器复核（2026-07-13）

环境：worktree wt-trust-cracks @ d685427，API 8797 + vite 5183（错峰端口），
qa-local-owner（worktree 自带 sqlite 副本），Browser 面板。

## 结论：全绿（2 项按 plan 移交 DP-3 前台）

| Case | 结果 | 证据 |
| --- | --- | --- |
| 本地 fallback 零回归 | ✅ | "找…完形"query → "没有精确匹配，以下是主题相近的题组" + "可能相关：完形" weak 提示原样 |
| 纯乱码真空态 | ✅ | 西里尔乱码 → "没找到匹配。可以换个说法，或返回浏览全部 34 套卷" + 默认 feed（C1 修复后 steward 空结果落同一路径） |
| steward 诚实空态（C1） | ✅ stub | verify-h5h 三个新行为用例绿（rankings:[]→matches:[]；parsed:null→预筛兜底；部分入榜不追加）；worktree 无 DeepSeek key，真查询人证移交 DP-3（生产有 key） |
| 详情深链直落（C3d） | ✅ | `?view=detail&groupId=group-2024-i-reading-b&f.*` 整页 boot 直落 Reading B 详情全文 |
| 详情 Back 退列表（C3a popstate） | ✅ | 浏览器 Back → 列表 + 筛选 chips 恢复 |
| 详情是真链接（C3c） | ✅ 结构 | a11y 树实测 `link "详情" href="?view=detail&groupId=…"`，与配相似/阅读解析同族；真中键移交 DP-3 |
| 筛选进 URL（C4） | ✅ | 勾 阅读理解+2024 → `location.search === "?f.groupType=reading&f.year=2024"` 实测；cmd+r 整页刷新筛选保持 |
| 详情→返回列表筛选恢复 | ✅ | f.* 随详情 URL 往返，重挂载恢复 chips |
| 卷名结巴（C5） | ✅ | feed/搜索双态："新课标Ⅰ卷""全国甲卷""1月浙江卷""3月重庆市巴蜀中学…"全部干净，无复读无裸"3" |
| 搜索年份列去复读（C7） | ✅ | 同年 run 只首行显示年份；跨年结果（2026/2025/2024/2023 段）每段边界正确重新显示 |
| rail 截断/复读（C6） | ✅ | 草稿卷 rail：完形填空/Reading A-D 五行字母全可见，count "15 题/3 题/4 题"，题型词不再复读；title 全文兜底 |
| toast 措辞（C8） | ✅ 源码 | diff 唯一 hunk `题组已删除→题组已移出`（灰区文件全文件仅此一处改动，亲验 git diff）；真点撤销流移交 DP-3 |

## 复核纪律

- verify 流水线步假红复盘：verify 子代理未 unset 代理，verify-figure-render
  撞 env-dead-proxy-502（判例在案）。主代理亲跑
  `env -u HTTP(S)_PROXY… pnpm -C app run verify:all` = **PASS 77 / SKIP 1 /
  FAIL 0，exit 0**（SKIP 为离仓夹具，与本刀无关）。
- 六条窄脚本在流水线 verify 步已带原始退出码全 0。

## QA 判例（面板输入怪癖，供后续刀参考）

Browser 面板 CDP 合成点击对部分 React 控件不触发 onClick（本次实撞：搜索
submit 按钮、草稿卷 chip、hover 显隐的行内链接、纸面浮动按钮；而筛选 chip、
行展开等普通按钮正常）。`form.requestSubmit()` / 深链导航可绕过；产品逻辑
本身无恙（JS 提交后全链路正常）。与 07-13「面板 rAF 节流」判例同族：
**面板适合确定性 DOM/URL 断言，手感与点击全覆盖走 DP-3 前台真鼠标。**

## DP-3 移交清单（owner 前台，与 motion-press-exit 待部署项同场）

1. 生产/带 key 环境搜一个题库里没有的主题 → 应见诚实空态（不再硬凑 8 条
   "与…无关"）。
2. 详情按钮真中键 → 新标签直落详情。
3. 草稿卷移除题组 → toast "题组已移出 · 撤销"，撤销可回。
