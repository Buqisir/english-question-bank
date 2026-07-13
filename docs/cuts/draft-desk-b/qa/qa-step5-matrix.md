# draft-desk-b — 步5 浏览器 QA matrix(主代理,真 Chrome via claude-in-chrome)

- 日期:2026-07-13;环境:localhost dev(vite 5173 + api 8787),qa-local-owner,
  测试卷 = 7 页真卷「0709 英语草稿卷」(5 题组,QA 中改名「…QA终版」属测试行为,留档)
- 依据:pa.md 8 场景 matrix;其中两条按后续拍板校正——改标题验**触发**(DP-title
  Option B)、break-hint 验**缺席**(PO-1 延后);另加第 9 条「浏览器打印出口」
  (步4 并入,DEV 已用 HTML 截获法验过,本轮不重复触发原生打印对话框)。

## 结果(9/9 过,1 项当场修复后复验过)

| # | 场景 | 结果 | 证据 |
|---|---|---|---|
| 1 | 屏幕 vs PDF 分页 parity | ✅ | 预览共 7 页;真点下载 PDF(194374B,%PDF-1.4)/Type /Page=7;文件名自动带新标题 |
| 2 | 长文块跨页边界 | ✅ | 页 1→2 边界实拍:断点落在完整题块之间,无题干腰斩/选项孤行;页脚「…QA终版 · 1」在位 |
| 3 | 多页锚点(SW-3) | ✅ | 5 组按钮簇分布 411/1780/3808/5044/6324px 全 sheet;第 3 页组的簇锚组头旁;首组无分页钮(fullIndex===0 闸) |
| 4 | 叠按钮编辑往返 | ✅ | 前置分页 toggle 真点 7→6→7 双向落库重排;「已保存」状态机正确 |
| 5 | rail 跳转 + scrollspy | ✅ | 点「三」滚至组头(settle-loop 生效);滚动后高亮双向跟随(toggle 后自动切「二」) |
| 6 | DP-title / studentLabel | ✅ | 改标题→重排触发,iframe H1 + @bottom-center CSS + 页脚实拍 + PDF 文件名四处同步;studentLabel 编辑落库但 3.2s 零徽章 + iframe 哨兵存活(零重载) |
| 7 | break-hint 缺席(PO-1) | ✅ | 全卷面无 .break-hint 注入 |
| 8 | 冷启 | ✅ | 服务重启后首渲 ~5-8s,「正在生成分页预览...」空态兜住,console 零错 |
| 9 | 三出口收口 | ✅ | 导出菜单三项在位;PDF 实测(见#1);打印出口由步4 DEV HTML 截获法验证(cr-step4-lite) |

## QA-1(真发现,当场修复,复验过)

**现象**:「重新排版中…」徽章 `position:absolute; top:12px` 锚在 ~8000px 高的
.draft-a4-sheet 顶端——在第 3 页编辑时,observer 实测徽章出现于视口上方
3156px(top:-3156),存活 758ms,老师全程看不到任何反馈,只见内容突跳。
PO-2 的 loading 态在多页编辑场景形同虚设。

**修复**:`position: fixed; top: 108px`(视口定位,工具栏下方悬浮),注释改写
行数持平(visual-unify 行号白名单 294/476 不动,复跑绿;render-model 绿)。

**复验**:同场景重触发,observer 记录 `top:108, inViewport:true` 存活 ~940ms,
截图实拍徽章悬于第 3 页视野内。

## 插曲(流程教训,已修记忆)

R1 子代理复用了本会话的 Chrome 标签页开自己的抽检页,导致真实鼠标输入一度
路由到非活动标签(点击"失灵"假象,排查 4 轮)。教训:**给子代理的浏览器授权
必须附带「tabs_create_mcp 开自己的新标签页,不得 navigate 已有标签」**;已补
进 memory(browser-qa-claude-in-chrome)。另:陈旧坐标两次失手(sticky 工具栏
收缩/展开态 y 漂移、按钮 label 随状态翻转)——真点前一律现取坐标。
