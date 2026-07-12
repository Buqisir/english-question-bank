# dossier-cabinet 浏览器 QA 记录

日期：2026-07-12。执行：小川（主代理，qa-local-owner 实点，本地 dev
worktree 服务 :5183）。上一会话死机后接手，实现 commit `e3c3e13`。

## 环境说明

- 本机死机重启后 Clash 代理未起，但 shell 仍 export
  `HTTP_PROXY=127.0.0.1:7890`（死端口），致 verify-figure-render
  （Vivliostyle localhost 请求）502 假红——**与本刀无关**，unset 代理
  变量后 main 与本 worktree 均绿。verify:all 最终 **PASS 73 / SKIP 1
  （i16a off-repo fixture 惯例）/ FAIL 0**。
- QA 数据：真实流程存了 1 份（工作台导出→保存个人空间，POST 201），
  另本地库 seed 3 份跨月副本（6月×2、5月×1，独立 PDF 文件副本）。
  `generated_at` 有 NOT NULL 约束——「其他」无日期落尾组在现 schema
  下不可达，属防御性分支，无法用真数据实测。

## 清单逐项

| 项 | 结果 | 证据 |
|---|---|---|
| 页题「个人空间」+「共 N 份」 | ✅ | 全部=共 4 份；筛选后=共 2 份；删除后=共 3 份，均如实 |
| 月分组头与计数 | ✅ | 「2026 年 7 月 · 1 份 / 6 月 · 2 份 / 5 月 · 1 份」降序；UTC→本地时区正确（06-15T03:00Z → 6月14日） |
| 文件夹筛选后分组如实 | ✅ | 期中复习 chip → 7月1份+6月1份，5月组消失，组内计数变化 |
| 微缩 A4 卡示意版式 | ✅ | 暖纸底+衬线居中真标题+姓名/班级/成绩占位行+中性占位线；不虚构大题头；学生 chip 无则不显 |
| 微缩卡 hover 抬起 | ✅ | computed style 实测：`transform: matrix(1,0,0,1,0,-2)`（translateY(-2px)）+ `0 8px 24px @12%` Floating 档阴影；hoverCap media query 生效 |
| 下载 PDF | ✅ | GET `/user-space/files/artifact-….pdf` → 200 |
| 打开原草稿 | ✅ | 深链 `?view=draft-paper&draftPaperId=…` 正确 draft id |
| 删除弹窗措辞 | ✅ | 标题「删除草稿卷 PDF」；正文「删除「{title}」？PDF 文件会一并删除，此操作不可恢复。原草稿不受影响。」；取消在前、「删除 PDF」在后 |
| Esc / 取消 / 确认 三路径 | ✅ | Esc 关（合成 keydown 验证，见下）；取消关且不删；确认→DELETE 200 + 卡消失 + 空组头（5月）消失 + DB 行清 + PDF 文件删 + 「文件已删除。」提示 |
| 空状态 | ✅ | 造数前实见：「还没有保存的草稿卷 PDF。…去组一份卷子」CTA |
| 窄屏网格收列 | ✅ | 375px：grid 1 列，无横向溢出；操作行完整 |

## 插曲（均非本刀问题）

- Claude 浏览器面板滚动/按键/坐标点击多次失灵（滚动后截图整幅空白、
  Esc 按键未送达、ref 点击坐标漂移）——DOM/elementFromPoint/computed
  style 佐证页面本身正常；hover、Esc、点击改用合成事件/JS 触发完成
  验证。属 QA 工具管线问题，不影响结论。
