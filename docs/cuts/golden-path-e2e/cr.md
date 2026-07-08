# CR — golden-path-e2e (冷读复核)

分支 `claude/golden-path-e2e` / PR #276。复核 `git diff main...claude/golden-path-e2e`
(2 commit:plan.md + 实现)。工作树已确认 clean(启动快照里的 M 文件为陈旧信息,
`git status --short` 为空)。

## 结论:APPROVE with Should-Fix

核心交付扎实:enforced 登录真验证、owner 全链、member 隔离 + gate、%PDF 严格断言、
Forbidden 全数遵守、verify job 一字未动、DEV 三条自述均属实。唯一实质问题是预批降级
出口只实现了一半(见 SF1),但它只在「未来 vivliostyle 回归」时才开口,不阻塞当前合并。

**升级条件**:若 RM 侧 CI 的 PDF 步骤实际走了 503 降级(而非 200 %PDF),则 SF1 升为
Must Fix——因为按现状 CI 会零 PDF 产物证明地绿灯,违反 plan「降级须同 job 追加
verify-print-pdf-export-flow 作模块级证明」的预批条件。请 RM 确认 e2e job 的 PDF 行输出
是 200 还是 DEGRADE。

---

## Should Fix

### SF1 — 降级分支缺 plan 强制的配套证明,且注释作了假声明
`scripts/smoke-golden-path.mjs:257-270`(503 分支)+ `.github/workflows/verify.yml`(e2e job)

plan.md:84-92 对 503 降级的预批是**捆绑条件**:「断言 200-或-503」**且**「同 job 追加跑
`node scripts/verify-print-pdf-export-flow.mjs` 作为 PDF 产物的模块级证明」**且**「本地跑
脚本时仍必须 200 + %PDF」。实现只落了第一条:

1. e2e job 最后一步只有 `node scripts/smoke-golden-path.mjs`,**没有**追加
   `verify-print-pdf-export-flow.mjs`。于是一旦 vivliostyle 在 CI 坏掉,E2E 走 503 分支
   照样绿,而这条刀存在的全部理由就是「防跑起来是坏的」——PDF 腿在这种情形下变成零证明。
2. 代码 260-261 行注释写「This branch must NOT be reachable locally (asserted separately
   below)」,但脚本里**没有任何**区分 CI/本地的断言或 env 判据。503 分支在所有环境
   (含本地)无条件放行,直接违反 plan「本地仍必须 200 + %PDF」,且注释是假声明。

建议二选一:(a) 按 plan 把 `verify-print-pdf-export-flow.mjs` 追加进 e2e job,让任何环境
都有模块级 PDF 证明;或 (b) 把 503 分支用显式 env(如 `E2E_ALLOW_PDF_DEGRADE`)门控,CI
仅在确实降级时置位,默认/本地保持严格。无论哪种都请修掉那条假注释。

> 注:parent 关切的「别的 5xx 不能钻这个口子」这条**已正确守住**——降级分支要求
> `status===503` **且** `json.error.startsWith('精排 PDF 不可用')`,500/502 或异体 503 body
> 均落 else→fail。服务端该 503 也窄(draftPaperRoutes.mjs:239 仅 vivliostyle/ENOENT/
> not found 触发,内容级 PDF bug 落 400)。问题只在降级窄口内缺配套证明,不在口子太宽。

---

## Should Watch(不阻塞)

### SW1 — 四个 member-gate 选择器没有 owner 侧正向锚点,存在「空匹配 = 假通过」风险
`scripts/smoke-golden-path.mjs:329-343`

member 侧对 `编辑` / `.answer-compare-summary` / `.verify-list` / 顶栏管理 断言 count===0
(严格,好)。但只有 `[aria-label="删除题组"]` 在 owner 流(206 行)有正向存在断言证明选择器
真实;另外四个若被 rename,member gate 会**空匹配即 0 即假通过**,而这正是 member-detail-gate
刀要守的元素。廉价加固:owner 详情流里顺手断言 `.answer-compare-summary`/`.verify-list`
present。C4 未强制,故列观察。

### SW2 — SIGTERM 可能不透传到 vite 孙进程
`scripts/smoke-golden-path.mjs:391-398, 418-421`

`npm run dev:vite` 下 vite 是 npm 的孙进程,cleanup 只 `child.kill('SIGTERM')` 打到 npm,
孙进程可能成孤儿。CI 容器随 job 销毁无害;本地反复跑可能残留占用 5189。沿用 smoke-c8
既有模式,可接受。

### SW3 — waitForFunction 内 fetch 在未认证瞬间理论上会 throw
`scripts/smoke-golden-path.mjs:151-155`

`data.questionGroups.map(...)` 若在 401 期(body 无 questionGroups)执行会 throw 掉这轮
waitForFunction。实际被前一行 `getByPlaceholder(...).waitFor`(concierge desk 仅认证后
渲染)挡在认证完成之后,窗口不可达。健壮,仅记录。

---

## 已核清单(parent 五点)

1. **断言真断了契约**:member gate `.count()===0` 严格(非宽松);PDF `head==='%PDF'`
   真查字节;enforced 断言不会零用户态假通过(用户在 API 启动前建,若缺则 login-card 不
   出现→180 行 fail,不会静默过);503 降级窄口正确(见 SF1 注)。
2. **DEV 三条自述均属实**:member 隔离含 404 平凡情形(305-320,404 视作有效隔离)✓;
   finally 清子进程 + rmSync 临时目录(418-423)✓(SIGTERM 透传见 SW2);verify job 纯
   append(verify.yml diff 全在原 job 之后新增,原 job 零改动)✓。
3. **flaky 时序扎实**:登录后走 `waitForConciergeDeskReady`(placeholder + 轮询
   `/api/question-groups` 直到 fixture 组 canAddToDraftPaper)= 条件等待,非裸 sleep;
   自动展开竞态显式规避(158-167 注释:不点「展开题组」以免 toggle 回收)。全脚本无固定
   延时,仅 waitForHttp 250ms 轮询间隔,合理。
4. **Forbidden 遵守**:`git diff main...HEAD --stat` 仅 verify.yml / plan.md /
   smoke-golden-path.mjs 三文件;app/src、server、scripts/verify-*.mjs、scripts/smoke-*.mjs、
   verify.yml 原 verify job 全部零触碰。工作树 clean。
5. **偏离标注**:selectedDetail 不回填→改断言 mutation response(209-213)合理且如实;
   端口 9899/5189 避冲突(header)合理;CI 降级(258-266)标注了但**实现不完整**——见 SF1。

## Self-Review Blind Spots(供后续 Big CR)

- 未实跑脚本 / 未看 CI 实际 PDF 行结果(遵范围纪律,归 RM)。SF1 的 Must/Should 定级
  取决于 CI 是否真走了降级——请 Big CR 结合 RM 的 CI 日志确认。
- member-gate 四选择器的真实性依赖 member-detail-gate 刀当时的验证,本刀未重验(SW1)。

## RM Disposition(主代理,2026-07-08)

- CI 首轮实证:18/18 PASS,PDF 走真 vivliostyle **200 + %PDF(75057 字节)**,
  未触发降级——SF1 的升级条件(CI 实走 503)未命中,维持 Should Fix 定级。
- 但首轮 e2e job 因**进程退出吊死**超时被 cancel(SW2 命中:SIGTERM 不透传
  vite 孙进程,Linux 上孙进程 stdio 拖住事件循环;macOS 本地恰可退出)。
- 处置(commit 6cada3d,原 DEV 回炉):① detached:true + 进程组 kill
  (process.kill(-pid)) + finally 后显式 process.exit 兜底;② SF1 收法 =
  CI 已证 vivliostyle 可用,**删除 503 降级分支与假注释**,全环境硬要求
  200 + %PDF(比补全捆绑条件更干净,PM 拍板)。本地 3 次实跑退出码 0、
  ~8 秒自然返回、零残留进程。
- SW1(member-gate 选择器缺 owner 侧正向锚点)记入观察,不阻塞本刀;
  后续若 rename 触发假绿,由 UI 刀顺手补正向断言。
- 合并前置:PR #276 二轮 CI 两 job 全绿。
