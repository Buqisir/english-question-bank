# motion-pass 主代理浏览器 QA 记录（2026-07-12）

环境：worktree dev server（localhost:5173），qa-local-owner 实登录，
Browser pane 实点 + computed-style 断言。

- Token 解析：`:root` 八个 token 全部解析正确；全站样式规则扫描
  260 处 `var(--motion/--ease)` 引用，**零未定义引用**（var 拼错会静默
  失效，此项截图看不出，已机断）。
- 讲评栏开合：挑题态⇄讲评态往返正常，计算样式确认
  `grid-template-columns 0.22s cubic-bezier(0.77,0,0.175,1)`（token 生效）。
  帧率无头环境测不了（rAF 被节流），且动画机制本刀未动——卡顿
  feel-check 留 owner 对照单第 1 条。
- 撤销 toast 补缺：备课桌悬浮操作条删除题组后 toast 出现，计算样式
  `draft-undo-toast-in 0.16s cubic-bezier(0.23,1,0.32,1)`，带 translateX
  居中修正无横跳。（QA 用 worktree 本地库，删除未还原，随 worktree 丢弃。）
- 悬浮显形：备课桌贴纸操作条 hover 唤出正常。
- 控制台：全程零 error。
- CR SW#1 已修（b36bbdf）：version-toggle 显式 transition 补 box-shadow。
- 未覆盖：owner 实机 reduced-motion 开关观感（对照单第 5 条）、
  讲评栏开合手感（第 1 条）。
