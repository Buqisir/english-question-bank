# 交接 Brief:给 difficultyCalibration 引入 test-first(题库第一块 TDD)

> 来源:Coding Brain 参谋部的代码健康审查(2026-06-04)。
> 性质:**实现活,在题库 session 里做**(不是在 Coding Brain 里)。
> 开法:在本项目开一条新 session,让它先读 `AGENTS.md` + 本 brief,然后按下面走。
> 这是 inbox 草图,不是正式 cut——题库 PM 帽子接手后再按流程立 cut。

## 任务
给 `app/src/services/difficultyCalibration.ts`(289 行、纯逻辑、当前 0 测试)补上
**test-first 自动化测试**,作为整个题库的**第一块 TDD 实践 + 测试地基**。

## 为什么是它(审查依据,证据 A=硬数据)
- 题库 100 个源文件、~32k 行,**自动化测试 = 0,连测试框架都没装**(参谋部实测)。
- 难度校准是**纯逻辑 + 业务承重**:难度判断错 → 直接影响老师组卷决策;而它无 React / 无 IO,**最好测**。
- 一个动作补两个洞:流程里缺的 **TDD 环** + 代码里缺的 **测试护栏**,且补在最高价值处。
- 做通后,有一个**能复制到下一个模块**的模板(下一步:`evidenceLinking.ts` 几何、`questionBank.ts` 数据契约)。

## 范围 / 边界(Matt:守住 scope,别趁机扩)
- ✅ 装测试框架(建议 **Vitest**,和 Vite 同源)、给 difficultyCalibration 写测试、必要时**小重构**(全绿后再做)。
- ❌ 别动数据契约 / schema / Adapter / PaperSurface(`PreToolUse` hook 会拦你,那是契约级)。
- ❌ 别扩到别的模块——**就这一块**跑通。其余排 backlog,一块一块来。
- 按 `AGENTS.md`:这大概是 **small~medium cut**,别上重 ceremony,但 medium 要有 `plan.md`。

## 第一步:PM 帽子先 grill,别急着写测试(Matt:先对齐再动手)
先和老师(domain expert)把 difficultyCalibration 的**行为契约**问清楚:
- 输入(`CalibrationInput`)、输出(`CalibrationPreview`)到底是什么?
- 那些规则(`strict_low_score_gate` / `strong_distractor` / `abstract_mapping` …)**各自什么条件触发、触发后什么结果**?多规则同时命中谁优先?
- 边界:`rawScore` 极值(1/3/5)、字段缺失(null/undefined)怎么降级?
把这些**用老师能点头确认的话**列出来 → 老师拍板 → 才进红绿。
(grill 控制在 smart zone,别一次问 50 个;一次一组,带推荐答案。)

## 红绿循环(Matt 垂直切片:一次一个行为)
1. 写**一个会失败**的测试(红)。
2. **不改测试**,写实现让它变绿(绿)。
3. **亲眼看红转绿那一跳**——那是信任信号,别只看终态全绿。
4. 重复;全绿后再重构(清掉 context 让它肯改自己刚写的代码)。

## 完成标准(验证)
- Vitest 装好,`npm test`(或等价)能跑。
- difficultyCalibration 的核心规则 + 边界都有测试覆盖,红→绿都走过。
- 不碰契约文件;现有功能不变。
- (可选)在 `scripts/README.md` 或 cut 记录里留一句"测试怎么跑",给后面的模块当模板。

## 回到参谋部
这块做完,可以回 Coding Brain 说一声——参谋部会把"下一块测哪个模块"排进审查 backlog,继续一周一块。
