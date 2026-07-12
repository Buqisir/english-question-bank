# draft-desk-a 浏览器 QA 记录

日期：2026-07-12。执行：小川（主代理，qa-local-owner 实点，本地 dev
worktree 服务 :5184）。上一会话死机中断后 DEV 子代理续做（checkpoint
`cb0014a`），verify 全绿（tsc 0 err；paper-draft 146/0；c8-contracts
50/0；verify:all PASS 73 / SKIP 1 惯例 / FAIL 0，代理死端口假红已
unset 规避——见 dossier-cabinet qa-record 环境说明）。

## 清单逐项

| 项 | 结果 | 证据 |
|---|---|---|
| 暖纸桌满幅 + 纸居中 + 工具 chrome 中性 | ✅ | 截图：桌暖纸底无卡片边框，toolbar/顶栏中性；verify-draft-workbench-visual-unify hex 白名单在守 |
| 右 rail 目录语言 + sticky | ✅ | 汉字大题序号+题组标题+N 题（「一 完形填空 · 15 题」…）；paper-browse rail 视觉族 |
| rail 点击滚动 + scrollspy 高亮 | ✅ | 点「四 Reading C」→ scrollY 5412 落在「四、阅读理解」题头，active 同步迁移；滚动时首组 active 正确 |
| 页数徽标常驻纸顶 | ✅ | 「共 8 页 · 双面 4 张 · A4」真值（分页脚本产出，M=⌈N/2⌉） |
| 贴纸操作条 | ✅ | hover 题组浮出右缘：中间组四键 上移/下移/前置分页/移除；首组合理省略前置分页 |
| 上移/下移落库 | ✅ | 上移 Reading C → rail 序变三，PATCH /api/draft-papers/... 200 |
| 分页建议安静标注 + 点击生效 | ✅ | 「建议在此前分页 · …」灰字5条；点七选五条目 → item PATCH 200、hint 消费、徽标 8页/4张→9页/5张 |
| 删除即删 + toast 撤销 | ✅ | 移除 Reading B → rail 4，toast「题组已删除 · 撤销」（8s 自灭），点撤销 → rail 回 5 |
| 窄屏（<900px） | ✅ | 800px：rail 隐藏、纸单列、无横向溢出 |
| 缩放带（DEV 自曝风险 ~795-900px） | ✅ | scale 0.917 下贴纸锚点与题组顶差 17px（内边距级），缩放补偿数学成立 |
| 保存弹窗措辞（复核不改） | ✅ | 卷宗柜 QA 中实用过该弹窗（另一 worktree 同代码），措辞合规 |

## 限制与说明

- **拖拽排序未做真拖**：QA 面板 HTML5 drag 不可靠（本日输入管线多次
  失灵，见 dossier-cabinet 记录插曲）；拖拽与上移/下移共用
  moveItemTo→PATCH 通道，该通道已验。建议 owner 观感 QA 时顺手拖一把。
- hover/点击部分用合成事件触发（面板 hover 事件送不进页面，`:hover`
  计数 0）——组件监听的是 iframe doc 级 mouseover 委托，合成事件走的
  正是该真实代码路径。
- QA 数据残留：0709 草稿卷经 QA 后 Reading A 已移除（toast 过期未撤）、
  七选五带前置分页、Reading C 升序——本地 worktree QA 库，无碍。
