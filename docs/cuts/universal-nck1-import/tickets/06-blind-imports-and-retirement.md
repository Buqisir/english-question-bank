# 06 — 佛山/滨州盲测与旧刀停止新增

Status: done
Blocked by: `05-chongqing-development-canary.md`
Next on PASS: independent Standards / Spec review and Owner QA
Terminal: yes

Spec: `docs/cuts/universal-nck1-import/spec.md`

## What to build

不按卷改共享代码，盲导佛山无听力卷和滨州完整听力卷；完成最终共享门禁和三面
验证。通用入口成为 agent contract 默认；旧格式刀保留回退但停止新增。

## Acceptance criteria

- [x] 两卷仅新增卷目录数据/媒体即可通过。
- [x] 佛山显式 Listening `not_supplied`；滨州完整保存 1–20 与录音稿。
- [x] PDF/DOCX 可见语义一致，答案只来自权威文件。
- [x] 最终 `verify:paper`、`verify:all`、三面真验证和独立审查完成。
- [x] 文档不再要求新卷选择格式①/②/③或新增格式刀。

## Out of scope

- 删除仍有调用方的旧代码、生产发布、激活听力消费。

## Result

佛山与滨州各闭合 9 题组；佛山 45 条非听力答案且明确 `not_supplied`，滨州
65 条答案断言并完整保留 inactive Listening。三套卷的真实 Screen、Student/
Teacher Print HTML 与 PDF 验收通过，教师版逐项呈现 45 个权威非听力答案、学生版
为 0。最终独立 Standards / Spec review 为 APPROVE。

`verify:paper` 为 70 PASS / 1 SKIP / 5 个既有 baseline FAIL；`verify:all` 为
135 PASS / 2 SKIP / 7 FAIL，其中同 5 个 baseline，加上真库已有 `self_made`
source type 与 orb 缺少 `rsync` 两项环境/数据失败；本 cut 的 focused、三卷、消费面
和独立复审均通过。
