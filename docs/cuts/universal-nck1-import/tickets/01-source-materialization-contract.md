# 01 — NCK1 Source Materialization 合同与校验器

Status: done
Blocked by: None
Next on PASS: `02-mixed-table-media-contract.md`
Terminal: no

Spec: `docs/cuts/universal-nck1-import/spec.md`

## What to build

定义 `nck1-source-materialization-v1` schema、确定性 digest 和 fail-closed validator。
合同闭合原始文档、九题组源观察、答案来源、媒体配方与 inactive Listening；不承认
Canonical Paper 或 AI 派生内容。

## Acceptance criteria

- [x] 同一 JSON 得到稳定 digest，键序不影响结果。
- [x] 固定九题组、21–65 答案覆盖、媒体引用、表格网格和 Listening 状态可校验。
- [x] 缺源摘要、缺题、缺答案、悬空媒体、越界裁剪、未解决 issue 均失败。
- [x] 合法的纯文本卷、无听力卷和含媒体卷夹具通过。
- [x] validator 无写入。

## Out of scope

- Canonical 编译、三面渲染、真实卷导入、AI 分析。

## Result

Verify: `node scripts/verify-nck1-source-materialization.mjs` → PASS。
合同、JSON schema、稳定 digest 和无写入 validator 已落地；表格媒体只在源合同中
闭合，Canonical 表内媒体由票 02 接入。
