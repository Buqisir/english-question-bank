# motion-press-exit — DP-2 主代理浏览器 QA（2026-07-13）

环境：wt-motion-press-exit 本地服务（server 8787 + vite 5173），
qa-local-owner，QA 草稿卷 draft-paper-493d950b（5 题组 30 题）。
手法：Browser 面板 getComputedStyle / 样式表遍历 / MutationObserver 采样
（确定性验证 CSS 契约）+ 真点截图。

## 环境限制诚实声明

两个浏览器面（Browser 面板 tab-2 与 Chrome 标签）本会话均
`document.visibilityState === 'hidden'`（无头/后台），rAF 被节流。
故 rAF 门控的弹层/toast **入场动画的逐帧播放无法眼看确认**——首次采样
一度停在 opacity:0（正是 SW-1 描述的单 rAF 塌陷条件）。改用**确定性
CSS 契约验证**替代眼看：强制翻 data-visible / 读样式表规则 / 早先前台
截图佐证。owner DP-3 应在**真前台浏览器**复核入场动画手感（尤其 SW-1）。

## 逐项结论

| 项 | 验证方式 | 结论 |
|---|---|---|
| 按压反馈（7 selector） | computed :active 规则遍历 | ✅ concierge-action / intent-submit / basket-chip / filter-toggle / export-menu-trigger / my-space 卡钮 / confirm 钮 全部 `scale(0.97)`；base transition 均含 `transform 0.12s var(--ease-out)`（含两处原半残已补） |
| 模态入场 | 强制 data-visible + 样式表 | ✅ 起始 `opacity:0 + scale(0.97)`（非 scale(0)），可见态 `opacity:1 + scale(1)`，`transition 0.16s ease-out`；`transform-origin` computed 居中（模态豁免对）；早先前台截图见删除弹窗完整渲染+背景压暗 |
| 导出菜单 | computed animationName + origin | ✅ `draft-export-menu-panel-in 0.12s`，`transform-origin: right top`（贴触发边） |
| undo toast | 样式表规则 | ✅ 起始 `opacity:0 + translateY`，`transition`（非 keyframe）入退场；退出经 usePresence 延迟卸载 |
| rail-item hover + 两 toggle | computed transition | ✅ rail-item / version-toggle / form-toggle（共享 `.draft-version-toggle button` 类）均 `background 0.12s var(--ease-hover)`——form-toggle 走共享 class 非独立漏改 |
| reduced-motion scroll | 源码 + 4 call site | ✅ `scrollBehavior()` helper 正确；4 处 smooth 全接入（另 2 处 `behavior:'auto'` 为有意瞬时校正，不需要） |
| **A3 拼版零回归** | 切 A3 + iframe 结构查 | ✅ 本刀动了 workbench CSS，切 A3 后 iframe 内 16 面 / 3 缝 / 4 对折线，meta「共 8 版 · 对折 2 张 · A3」，满幅渲染正常（截图存证） |

## 挂账（CR SW，DP-3 关注）

- **SW-1（首要）**：弹层/toast 入场靠单 rAF 翻 data-visible，不绘制时会塌
  在 opacity:0 起始帧——本会话无头环境实撞。真前台下 rAF 每帧触发无碍，
  但 owner DP-3 应眼看首开是否「渐入」而非「跳」；真塌陷改双 rAF。
- SW-2/3/4 见 cr.md（h4→h3 指向隐藏节点无害 / 第4处 scroll 无兜底断言 /
  pi-toast reduced-motion 退化依赖全局 nuke）。

**结论：DP-2 过（确定性契约全绿 + A3 零回归），SW-1 移交 DP-3 前台复核。**
