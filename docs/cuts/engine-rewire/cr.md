# engine-rewire — CR (fresh, Opus/high, cold read)

**Recommendation: APPROVE** — 0 Must Fix, 2 Should Watch (both non-blocking).
基线 `3234735..HEAD`（impl commit `3da2f52`），worktree `../wt-engine-rewire`，
branch `engine-rewire`。

## Changed Scope（从 diff 亲验，非报告转述）

7 文件：`app/src/domain/questionBank.ts`（+1/-1，仅 kind 改名一行）、
`SimilarQuestionsRailView.tsx`（摘 `isConstantDiscourseReason` 过滤器 + 注释）、
`server/search/similarQuestions.mjs`（`fetchReadingSlots`/`slotLetter` 新增、
reading secondary 换真篇位、sevenChoices bonus 加 +8 体裁）、两个 verify 脚本、
两个 docs。**Forbidden 全部未触**：无 schema/迁移、无 `server/api.mjs`、无
`server/draft-paper/**`、无 `server/paper-import/**`；`questionBank.ts` 仅动
kind 改名一行（`git diff` 确认整文件只有这一行 +/-）。scope 零漂移。

## 三个必查点结论

### 1. 「同卷」分组键 (year, region, paper_name) — 独立亲查通过

对真库 `data/question-bank.sqlite` 跑 SQL 独立验证 DEV 的推断：
- reading groups 共 **126**，NULL passage_id **0**，全部 126 存活 JOIN
  （`passages`→`sources`），无因 NULL 掉链丢 slot。
- `(year, region, paper_name)` 分区 → **33** 个 paper key，组大小分布
  `{3:6, 4:27}`，**无任何 paper >4 组**、无 paper 内 display_order 重复。
  → 窗口函数 `ROW_NUMBER()` 名次落在 1..4，字母不越 D。无过度合并碰撞。
- **边界洞排查**：region **无 NULL、无空串**（33/33 都是实值），DEV 担心的
  「region 空串导致跨卷合并」在真库不存在。同名卷跨年被 year 分开。
- **最强独立交叉验证**：对全 126 组把「窗口函数算出的 slot」和「group id 里
  `reading-[a-d]` 后缀字母」逐一对照 → **0 mismatch**。名次推导与真值命名
  完全自洽。分组键判定成立。

### 2. 档位不翻转 — 数学与实现一致

- same: `min(99, 70+round(29·p))` = **[70,99]**；adjacent: `[35,64]`；
  none: `[0,29]`。档间留隙（29<35 差 5，64<70 差 6），任一档顶压不过下一档
  底减一，**永不翻转**。多种子字母集合语义正确：`seedSlots.has(candidateSlot)`
  → same；否则对种子集取最小名次差 =1 → adjacent；label 用候选自身字母。
- verify Criterion 7 对**全量 50 结果**解码 secondary 落档，且断言「最差
  same-slot > 最好 adjacent-slot」——实跑 PASS 且非空非 vacuous（打印了 PASS
  行，说明 guard 两侧都非空）。

### 3. verify 换向诚实 — 是真检查非同义反复

- `verify-paper-browse #55`：由「断言过滤器存在」诚实反向为
  `!/isConstantDiscourseReason/` **且** `/{reasons.map\(/`——同时钉「函数已删」
  与「全量渲染」，不是放水。（静态源串断言，读 diff 已确认命中，未起服务跑。）
- `verify-similar-questions` 新 Criterion 7/8/9 **独立重算**非套壳：
  C7 自建 slot map；C8 断言候选池 matched 与 unmatched **并存**（证 discourse
  非恒真，非空校验）；C9 从原始 topic-label + discourse_type DB 行**独立重算**
  `min(99, 密度+8·命中)` 与 score 解码的 bonus 分量逐一对比。score 解码
  `floor(score%10000/100)` / `score%100` 无跨层串位（secondary 99·100=9900<10000）。
- 本人实跑 `node scripts/verify-similar-questions.mjs` → **35 passed / 0 failed**，
  且其中一条断言确认新脚本已注册进 `verify-ci.mjs`（保护真进 CI 门，非手跑绿）。

## Findings

### Must Fix
无。

### Should Watch（不阻塞本刀）

- **SW-A（潜在，当前数据不触发）**：sevenChoices bonus 的「+8 严格低于任何
  话题密度台阶」只在 seed topic-label 数 ≤12 时成立。实测全库 group 的
  topic-label **最大仅 3**（seven 组最大 3），最小密度台阶 = 33 ≫ 8，claim
  当前**成立**；但若未来某组标签涨到 ≥13，+8 可跨台阶翻转排序。属未来数据
  脆性，非本刀缺陷，注释「实测从未低到 8 以内」诚实。跨主题群收紧本就是
  deferred 刀，届时一并处理即可。
- **SW-B**：C7 的「worst same > best adjacent」与 C8 的 matched/unmatched 并存
  均带 `length>0` guard；本刀选定种子（reading-b slot2 / cloze q-2020-i-041）
  下实跑非空、断言真执行。但换种子若某档为空则该子断言静默跳过——非本刀
  问题，记录以备将来改种子时留意。

### Nice-to-have
- 完形 secondary（Must Do #2「零改动 + 顺手更正过时注释」）：cloze 区
  (:344-347) 已无「恒真」表述，无需改动，符合契约。

## Self-Review Blind Spots（喂后续 Big CR 先看）

- 未起服务、未跑 `verify:all`/`verify-paper-browse.mjs`（按派工避端口撞车）。
  #55 仅静态读 diff 确认，未实跑；`verify:all` 里其它未改断言未复跑。
- reading candidate 的 `dbMeta.readingSlot` 只在 `facetType==='reading'` 分支
  回填——已核对候选与种子同走该分支、全库 reading 组均有 slot；但若未来出现
  passage_id NULL 的 reading 组，会静默降 tier none（仅词数），无告警。
- PA-lite 降档复核：本刀为已落库真值的引擎重接，无 schema/无新列、
  `server/search/similarQuestions.mjs` 非挂载 UI 模块、前端仅删过滤器，可逆；
  一处 type union 改名已授权。**降档成立**。

## Failure / Attack Angle

- 若 `(year,region,paper_name)` 在未来某导入卷出现空 region + 同名同年跨卷，
  窗口函数会把两卷合并成一个 5..8 名次分区，slot 溢出 D → chip 出 `同为E篇`。
  当前真库 33 卷无此情况（已亲查），但 publisher 新卷写 region 时若留空会踩。
  引擎无 slot>4 的防御断言——记为 SW-B 类未来脆性，非本刀阻塞。
- 假绿风险已排除：C7/C8/C9 均独立重算而非读 score 反推自证，且注册进 CI；
  #55 反向断言双条件钉死删除+全渲。无「弱化断言换绿」痕迹。

## Verification Evidence

- `node scripts/verify-similar-questions.mjs` → 35 passed / 0 failed（本人实跑）。
- SQL 亲查真库：126 reading 组 / 33 paper key / 组大小 {3:6,4:27} / region 无
  NULL 无空串 / slot↔id 字母 0 mismatch / topic-label 最大 3（密度台阶 ≥33）。
- diff 文件级 + `questionBank.ts` 行级 Forbidden 复核：全部未触。
- `grep position-proxy` 全码库 = NONE；`position-slot` 引擎与 type union 两处一致。
