# craft-polish：三路复评工艺账收尾

出处：2026-07-17 全站三路复评 C 路工艺账（快照
`.impeccable/critique/2026-07-17T11-54-05Z__full-project.md`），owner 圈
「继续完成评审报告的账」。cut size: small；四不沾；主代理直做 + CR-lite。
plan 补录原因：施工中两个 verify 锚被 diff 移动，锚授权更新属契约文件
编辑，按规矩入 committed plan scope。

## Scope

1. SevenChoicesAnalysisPanel scrollIntoView 硬编码 smooth → scrollBehavior()
   （helper 收编漏网点，确证回归一行修）
2. 菜单退出瞬灭 → usePresence 出入场（导出菜单/「⋯」菜单/concierge 筛选
   面板；退 motion-micro 快于入；keyframe→transition 两处 keyframe 退役）
3. 详情页「一张纸」展开硬跳 → 量高手风琴（scrollHeight 过渡目标，播完
   放开 none；收起回落 340 契约）
4. 排序建议卡 side-stripe（border-left 3px danger）→ 全边框+对称圆角
   （**改动 shipped 视觉，DP-3 owner 有否决权**）
5. ⑤margin-top 过渡判定不改（真布局位移，translateY 会坏行为；连同
   dark-glow 等既判误报入 `.impeccable/critique/ignore.md`）
6. **锚授权更新**：verify-home-default-feed L371 正则跟随
   `filterPanelPresence.mounted`（默认收起语义不变，presence 只包
   filterPanelExpanded）；verify-draft-workbench-visual-unify #ffffff
   行号 whitelist 重钉（本刀 CSS 编辑移行，第六代 re-pin）
7. 附带发现：PaperBlockCanvas.tsx 零消费者死代码（含其 insertion menu），
   不抛光不删除，提一嘴挂账

## Forbidden

- server/** / schema / domain / paper-assets
- 上述两个 verify 锚以外的 verify 逻辑改动

## 验证

tsc 0 ✅；DP-2 11 断言绿 ✅（`qa/dp2-craft-polish.mjs` 入档可重跑，含
登录竞态加固判例：networkidle 会在登录 POST 在飞时提前放行）；
verify:all（锚更新后）+ main CI。
