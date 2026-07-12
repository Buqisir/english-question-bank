# motion-pass CR (fresh, cold-read)

Reviewer: CR subagent（未参与实现）。基线 f80b2e4（plan commit）→ HEAD c091f21。
Range: `git diff f80b2e4..HEAD`。分支 motion-pass，worktree clean。

## Verdict: APPROVE

无 Must Fix。3 条 Should Watch（均不阻塞 merge，交收口 QA / owner 拍板）。

## Changed Scope（核对 diff，非报告）

CSS 9 文件 + DESIGN.md + 3 脚本改动 + 1 新脚本。零 TSX diff、零 papersurface
diff、零 server diff——三条 Forbidden 用 `git diff --name-only` 逐类核过，全空。

## 硬契约核对（全部成立）

- **五档 token + 三曲线定义**：App.css `:root` 新增 micro80/fast120/base160/
  slow220/entrance260 + ease-hover/ease-out/ease-in-out，与 plan#1 逐字一致。
- **豁免项保留 + 注释**：`pi-seven-card-jump 0.9s`、两处
  `concierge-skeleton-shimmer 1.6s` 均保字面值并加 `/* signature, token-exempt */`；
  reduced-motion `0.01ms` 块未进 diff（未触），脚本按值豁免。
- **映射保真**：抽查全部时长桶——0.1s/0.12s/120ms/140ms→fast，0.15s/160ms/
  0.18s→base，0.2s/0.25s→slow，0.35s/280ms/260ms→entrance，80ms→micro。无错桶。
  （注：140ms→fast=120ms、0.35s→entrance=260ms 为 plan 授权的就近降档，audit#4
  明确要 fadeInUp 从 350ms 收进 300ms 预算，非漂移。）
- **曲线归类自洽**：hover/color/background→ease-hover；transform/opacity 入场位移
  →ease-out；paperBrowsePage.css:36 `grid-template-columns`→ease-in-out（唯一
  in-out 使用点）✓。**box-shadow 边界**：全站一致归 ease-hover（primary-button /
  group-card / my-space card 191 / paper-canvas-block 2879），自洽。
- **审计#2 ease-in 方向 bug**：harness:1550 `opacity 0.15s ease-in`→`base ease-out` ✓。
- **审计#3 transition:all ×9**：181/198/211/388/1294/1660/2962/3095/3135 全部换显式
  属性列表；grep 全站 `transition: all` 残留=0。逐 selector 读 hover/态规则核对
  显式列表覆盖实际变属性（见 Should Watch #1 唯一例外）。
- **审计#5 undo toast 补入场**：draft-undo-toast 加 `draft-undo-toast-in base ease-out`，
  keyframes 两帧均带 `translateX(-50%)`（不横跳），与 plan#6 逐字一致。
- **DESIGN.md#8**：231 行改为五档 token 制条款，与 plan#8 文本一致。

## verify 守门核对

- `node scripts/verify-motion-tokens.mjs` 独立重跑：**46 passed / 0 failed / 15 css
  scanned，exit 0**（未采信报告数）。
- 三条断言有牙：ease-in（词界，放行 ease-in-out）、transition:all、
  transition/animation 简写+`*-duration` 内裸时长（豁免 token-exempt 行 + 0.01ms）。
  regex 逻辑读过，能对新增回归 `exit 1`。
- 登记闭环：README marked yes；verify-ci.mjs registry 含
  `scripts/verify-motion-tokens.mjs`，且 verify-ci 用 `spawnSync` 逐条真跑（非只列不跑）。

## 两处既有断言 re-pin 核对（是重钉，非放水）

- **verify-concierge-desk.mjs:744**：断言由 `background 120ms ease, box-shadow
  120ms ease` 改为 `background var(--motion-fast) var(--ease-hover), box-shadow
  var(--motion-fast) var(--ease-hover)`。同一 background+box-shadow 对、仍钉「无
  transform」语义不变，仅 token 化的必然重钉。独立重跑 exit 0。
- **verify-draft-workbench-visual-unify.mjs:113**：`#ffffff` 白名单行号 451→452，
  因 undo-toast 新增 `animation:` 行上移 color 一行；@keyframes 块落在规则后无
  `#ffffff`。纯行号跟随，未放宽白名单集合。独立重跑 exit 0。

## Findings

### Must Fix
（空）

### Should Watch（不阻塞本次 merge）

1. **version-toggle 掉了 box-shadow 属性（App.css:396 `.version-toggle button`）。**
   显式列表只写 `background, color`，但 `.version-toggle .active` 会加
   `box-shadow: 0 1px 3px var(--accent-glow)`。原 `transition: all 0.15s` 会缓动该
   阴影，现在切 active 时 box-shadow 瞬现（其余 9 处显式列表均完整覆盖变属性，
   仅此一处漏）。与 plan#5「只列实际变化的」轻微不符。影响=1px 阴影亚感知快闪，
   纯视觉、可逆，不阻塞；若 owner 收口 feel-check 觉得眼，DEV 补 `box-shadow
   var(--motion-base) var(--ease-hover)` 即可。
2. **verify-motion-tokens 裸时长检查对「多行 transition 续行」有孔。** 检查按行
   且只进入含 `transition:`/`animation:` 的行；多行简写的续行（如换行后单独一行
   `color 80ms ease;`）不进 DURATION 检查。当前全站 grep 无此形态（本刀已把
   harness:1070 那处多行 token 化，续行现为 `var(...)`），故**无现网漏网**；但门
   在本仓恰会写多行 transition 的位置略porous——未来若在续行写裸时长会假绿。
   非本刀现值缺陷，记账待后续补 join-multiline 或直接禁多行简写。
3. **harness:874 把两处 `ease-out`现值 重归 ease-hover。** `background/border-color
   160ms ease-out`→`base ease-hover`，偏离 plan#3「所有 ease-out 现值→ease-out」
   分句，改按「background/color 类→ease-hover」属性分句判。内部自洽且对背景淡入
   更合理（160ms 内 ease 与 ease-out 差异亚感知），非缺陷；仅记录该判断点，收口
   feel-check 可留意。

## Self-Review Blind Spots

- 未在浏览器实点：undo toast 入场、讲评栏 grid rail 开合手感、9 处 hover 缓动的
  真实观感均靠读 CSS 推断；主代理收口 QA 的 feel-check 才是终判（尤其 Should
  Watch #1 的 box-shadow 快闪是否可感）。
- 未逐一核对每个 selector 的 `:active`/`:focus-visible` 是否另改了未列入 transition
  的属性（只核了 :hover 与显式态类）；若某 :active 改 transform 而列表无 transform，
  会有同类快闪。抽查的几处未见，但非穷举。
- `transition-delay`/`animation-delay` 的裸时长（如 group-card nth-child
  `animation-delay: 0.05s`）既未 token 化也不被门拦——但 plan#2/#9 明确只圈简写
  + `*-duration`，delay 属 plan 授权的范围外排除，非漂移。

## Failure / Attack Angle

- 最可能的假绿：未来 DEV 用多行 transition 简写并在续行留裸时长，门放行（Should
  Watch #2）。当前无实例，属门的强度缺口不是现值缺陷。
- 误用角度：后来者见 `token-exempt` 是逐行逃生舱，可能滥贴注释绕过裸时长断言。
  这是 plan 授权的显式豁免机制（要写注释），可接受，但 owner 应知晓这是软门。
- 无 data/persistence/export/print 面（纯 CSS + 文档 + 脚本），无契约/运行时回归
  风险；paper 发布、打印路径零触碰，无需升 Big CR。

## Residual Risk

低。纯呈现层、可逆、门已进 CI 真跑。剩余风险集中在观感（收口 QA 覆盖）与门对
多行续行的强度缺口（记账，非现网漏）。

## Recommendation

**APPROVE。** 无 Must Fix。3 条 Should Watch 交主代理收口 QA / owner 拍板，均不
阻塞 merge。
