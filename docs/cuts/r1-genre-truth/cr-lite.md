# r1-genre-truth — CR-lite(主代理冷读,R1-DP2)

- 日期:2026-07-13;对象:r1-genre-truth 分支 @ 5b3a511(基线 292c058,12 文件)
- 复核方式:冷读契约面 diff + 亲手跑通 apply 全链路(worktree)
- 结论:**过,0 Must Fix**;1 nit。

## 冷读判定

- **publisher 防回归**(契约面,本刀核心堵漏):ON CONFLICT 分支彻底移除
  discourse_type 赋值(重导永不再冲真值);INSERT 写 literal null 并留因果注释。
  与 plan Must Do 3 完全一致。verify Req4 双断言(conflict 不赋值 + 参数为
  null)看住此形态。
- **apply 脚本安全设计**:默认 dry-run、--write 先备份(失败即拒跑)、273 完整
  性闸、受控枚举闸、按 id UPDATE 幂等。亲手跑通:dry-run 273 changed → apply
  273 applied → verify 12/12 绿(Req3 按 plan 时序注记转绿)。
- **verify-genre-truth**:四需求 12 断言;DB 缺席时 SKIP 降级(CI 无本地库
  安全,E1 案例的 exit-2 惯例精神);Req4 是源码断言看 publisher 形态。
- **taxonomy 顺手项**:「生态环境」从环境保护列表删除、alias 行同步迁到自然
  生态——与 program 拍板逐字一致。
- **判例遵守**:4 条 owner 判例源样本全量复核落在裁决口径(DEV 报告 +
  decisions.json 抽查证实)。
- **owner gate**:R1-DP1 过(26 条盲审,议论判窄口径获认可),无新判例。

## nit(不开账)

apply 脚本 missing>0 时计数照常 exit 0——本刀场景(同库 classify→apply)不可
达;若日后对生产库复用,建议 missing>0 时非零退出。随生产同步时顺手。

## 并行边界确认

与 draft-desk-b 的交点仅 verify-ci.mjs / scripts/README.md 追加行(plan 预
判),合并时按后合并者 rebase 解;其余零交集(diff 文件清单证实)。
