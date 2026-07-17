# impeccable critique ignore（既判账，评审不再报）

- **layout-transition: `transition: margin-top` on `.concierge-stage-inner`
  (App.css)** — 主页提交拍上移是有意的真布局位移：列表面要流进让出的
  空间，translateY 不推兄弟元素、换了会坏行为（原 CR SW-3 已思考过
  max-width/margin 取舍）。一次性低频，保留。（2026-07-17 复评⑤判定）
- **layout-transition: `transition: grid-template-columns` on
  `.paper-browse-shell`（rail 展开）** — 面板宽度已钉死避免内容回流，
  低频有界，C 路判「维持现状可接受」。（2026-07-17 复评）
- **dark-glow（全页）** — 浅色主题误判，07-13/07-17 两轮均为误报。
- **text-overflow on `.visually-hidden` 元素** — a11y 惯用法（故意剪裁
  只给屏幕阅读器），非真溢出。
- **em-dash-overuse / flat-type-hierarchy / tiny-text in
  `draftPaperPreviewHtml.ts` 与纸面/微缩卡** — 考卷印刷语境：字号梯与
  破折号是高考卷排版标准（exam-paper-format-standards.md），不适用
  网页文案规则。
