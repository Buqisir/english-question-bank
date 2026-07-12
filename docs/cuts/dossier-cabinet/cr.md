# CR — dossier-cabinet（fresh cold read）

结论：**APPROVE**（0 Must Fix）

审查人：CR 子代理（fresh context，未参与实现）。日期：2026-07-12。
基线 `eb72f7a`，审 `eb72f7a..HEAD`（commits `e3c3e13` impl + `399adae` qa）。
worktree `/Users/huangxuewei/Projects/eqb-wt-dossier-cabinet`，branch
`eqb-wt-dossier-cabinet`。工作区干净（无未提交改动）。

## Changed Scope

严格落在 plan 文件面，零越界：

- `app/src/features/my-space/MySpacePage.tsx`（+167/-68）
- `app/src/features/my-space/MySpacePage.css`
- `scripts/verify-my-space-shelf.mjs`（断言随形态更新）
- `scripts/README.md`（对应行同步）
- `docs/cuts/dossier-cabinet/qa/qa-record.md`

Forbidden 全部未触：`server/**`、API 契约（`services/mySpace`、
`domain/questionBank` 均未改，`fetchMySpace` 形状不变）、
`DraftPaperWorkbench`、`shared/papersurface/**`、其余 verify 脚本——
经 `git diff --stat` 逐条核实，非听报告。分组为纯客户端
（`groupArtifactsByMonth`），后端零改。

## Findings

### Must Fix

无。

### Should Watch（不阻塞本刀合并）

- **SW1 · 多个 `.my-space-grid` 重复 aria-label**：每个月分组内的 grid
  都带同一个 `aria-label`（`全部保存文件`/文件夹名），与 section 自身的
  `aria-label={group.label}` 并存，屏读会听到 N 次重复的"全部保存文件"。
  轻度 a11y 噪音，非错误。后续 polish 可把 grid 的 aria-label 去掉或改成
  月份维度。不阻塞。
- **SW2 · 微缩卡内层是定值缩放，不随卡宽自适应**：`.my-space-card-thumb-mini`
  固定 420×520 + `scale(0.62)`，而 grid 是 `minmax(200px,1fr)` 弹性列。
  宽列时示意版式不会撑满暖纸缩略图（`overflow:hidden` 裁掉）。QA 已实点
  验收视觉可接受，且该层 `aria-hidden` 纯装饰。列宽若将来变大需复看。
- **SW3 · 部分间距/字号改用硬编码 px**：grid `gap:18px`（原
  `var(--eqb-space-4)`）、对话框 `p` `font-size:13.5px`（原
  `var(--eqb-font-size-sm)`）、月/分区头 8/10/22px。plan 只禁"硬编码色值
  hex"，px 间距不在禁令内，故**非违规**；但偏离了 `--eqb` 间距/字号刻度。
  非阻塞，记一笔。
- **SW4 · 「其他」无日期落尾组现实不可达**：`generated_at` NOT NULL 约束下
  该分支无真数据可测（QA 已如实记录），属防御性代码，逻辑正确
  （`monthGroupKey` 空/NaN → `other`，排序恒落尾），保留即可。

## Self-Review Blind Spots

- 未在真浏览器复跑交互（工具管线本机死代理 + 面板失灵，见 qa-record）。
  Esc/hover/删除三路径依赖 QA 记录的合成事件佐证与 computed-style 实测，
  未由 CR 亲点。焦点管理（`document` 级 keydown + 焦点回落 trigger）代码
  读来正确，但 CR 只做了静态判读。
- 微缩卡在极端标题（超长/含特殊排版字符）下的视觉裁切未验；`title` 走
  `text-overflow:ellipsis`（卡下标题行）+ thumb 内 h4 无截断，长标题在
  thumb 内可能折行溢出被 clip——装饰层，风险低但未实测。

## Verification Evidence（CR 独立复跑，非抄报告）

- `node scripts/verify-my-space-shelf.mjs` → **18 passed / 0 failed**。
  逐条读断言确认可失败：hex 扫描 `#[0-9a-fA-F]{3,8}` + 空 allowlist，
  若加任一硬编码 hex 色会 FAIL（真守）；grid track 断言已从 280px 更新到
  `minmax(200px,1fr)`；删除措辞断言 `/删除草稿卷 PDF/ && /取消/ && /删除 PDF/`
  实打三串；新增月分组断言 `my-space-month-group && my-space-month-head`。
- `node scripts/verify-error-copy-mainline.mjs` → **18 passed / 0 failed**
  （`describeError` 契约未被本刀破坏）。
- 脚本挂载核实：`verify-my-space-shelf.mjs` 在 `scripts/verify-ci.mjs:87`，
  守卫确实进 CI 门，非仅手跑绿。
- `--paper-*` token 真实存在（`app/src/index.css:30-36`：`--paper-bg`
  `--paper-border` `--paper-ink` `--paper-ink-strong` 均有定义），微缩卡
  不会因 token 拼写落空回退。
- 主代理已复跑 `verify:all` = PASS 73 / SKIP 1 / FAIL 0（figure-render
  假红系本机死代理，与本刀无关，已核）。

## Failure / Attack Angle

- **假绿风险**：删除措辞断言只钉标题+取消+确认键三串，未钉正文全文
  （"此操作不可恢复。原草稿不受影响。"）。若正文被改动，verify 不会红。
  但正文 plan 措辞已由 QA 视觉逐字验收，静态 verify 定位是形态守卫而非
  逐字合同——可接受，非 Must Fix。
- **陈旧回退**：`sourceLabel`/`formatDate` 旧函数已随重构删净，全仓
  `grep` 无 MySpace 侧残引（另有的 `sourceLabel` 在
  `SimilarQuestionsRailView`/`questionBank.ts` 是搜索结果域的同名字段，
  非本刀遗留）。`openSourceDraft` 对 `sourceDraftExists=false` 的守卫
  （提示"原草稿卷已删除，PDF 仍可下载"）在重构后仍在，未随 meta 里
  sourceLabel 的移除而丢——无静默降级。
- **越界误用**：暖纸色温仅进入 `.my-space-card-thumb*` 规则族，
  `.my-space-card` 本体已退掉 background/border（纯 flex 容器），页壳
  chrome 全 `--eqb-*` 中性——色温法例外边界守住，工具页壳无暖米泄漏。

## Residual Risk

低。纯前端展示重构，无 API/schema/持久化/导出面触碰；分组逻辑客户端
纯函数，排序与落尾组正确；token 边界与 verify 守卫如实随形态更新并在
CI 门内。剩余风险集中在装饰层视觉细节（SW2）与静态 verify 不覆盖的
逐字正文（QA 已补），均不阻塞。

## Recommendation

**APPROVE** — 无 Must Fix，契约与 Forbidden 全守，verify 断言如实更新
且在 CI 门内可失败，独立复跑全绿。SW1–SW4 记录监控，不并入本刀。
主代理收口合并即可。
