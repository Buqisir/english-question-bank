# 06 — 新题入库 normalization gate

Status: done
Blocked by: 01 — 完形填空编译器核心规范化规则; 04 — 语法填空编译器、输入方言与负例
Spec: `docs/cuts/paper-normalization/spec.md`
Worktree: `/Users/huangxuewei/Projects/wt-paper-normalization-20260724`
Branch: `codex/paper-normalization-20260724`
Initiative fixed point: `515a0f1317c95d197c98a81a36ce425b4948bde2`

## 目标

让新导入 package 在 publish 前为全部 cloze/grammarFill groups 生成并校验
canonical entries；任一 supported group `needs_review` 时整次 publish
零写入，全部 ready 时 sidecar 与 paper asset version 原子发布。

## 边界

- 正式 seam 位于 draft `paper-asset-v1` 已构建、publish 尚未开始之间。
- 建立 additive `paper-normalized-groups-v1` JSON Schema/runtime validation；
  sidecar 只含 version metadata、精确 fingerprint/digest 与 canonical groups。
- 复用现有 validator/publisher/storage 的 dry-run、version write、DB
  transaction、latest swap 与 rollback 纪律。
- 其他题型继续走现有 gates；一组 supported failure 阻断整包。
- 更新导题 runbook 的 gate、诊断与 rollback 命令。
- 不改 DB schema，不写回历史资产，不建 review UI/AI 裁决/flag 平台，不做
  renderer、生产发布或部署。

## 验收

- [x] Ready fixture 的 validation 报告含全部 supported entries；publish 在
      `versions/vN` 与对应 `latest` 同时得到同 version sidecar。
- [x] Sidecar 不含 source PDF/DOCX、答案源、绝对路径、`generatedAt` 或
      renderer state；fingerprint 由 exact group slice 计算。
- [x] 任一 supported group `needs_review` 时 public validation 失败，
      publisher 不建 DB table/row、不写 version/sidecar、不切 latest。
- [x] DB/write/latest 任一步失败时回滚新 version/sidecar，旧 latest bytes
      保持；下一次成功可复用正确 version sequence。
- [x] Stale assetVersion/fingerprint sidecar 被 consumer 拒绝；其他题型和
      现有 import gates 无回归。

## 验证

- 使用现有 `validatePaperImportPackage` / `publishPaperImportPackage`，
  临时 DB + 临时 paper-assets root 做 ready、needs_review、forced failure
  与 retry 行为测试。
- 运行 focused normalization-gate verifier、现有 C7 import contract/publish
  verifiers、schema validation、`pnpm -C app run build`、`git diff --check`。
- 结束前运行一次 `pnpm -C app run verify:all`，记录真实退出码与 declared
  skips/baseline failures。
- 本票不需要单独 browser/owner QA；Phase A QA 使用 Tickets 02/05 页面。

## 依赖

Tickets 01 与 04 的 compiler 完成 commits。虽然逻辑上不依赖 UI tickets，
同一 sequential worktree 默认在 Ticket 05 后实施。

## 完成定义 / Result

- `$implement` 完成 TDD、检查、普通 review、修复、runbook 更新与 clean
  commit。
- Ticket 状态改为 `done` 并填写结果；不得自行开始独立审查或 Ticket 07。

Commit: this Ticket 06 checkpoint (exact SHA in final handoff)
Verify: focused normalization gate 通过；C7 publish、I1/I2/I3/I4/I5/I8/I13、
paper-asset-v1、paper-assets consistency、cloze/grammar normalization 与
`pnpm -C app run build` 均退出 0；`git diff --check` 退出 0。按约定仅运行
一次 `pnpm -C app run verify:all`，真实结果为退出 1、PASS 86 / SKIP 1 /
FAIL 4：I1/I2/I5 的旧正向 fixture marker 缺口已在该次运行后修复并各自
复验退出 0；C7 剩余 2 条 forbidden-scope assertion 来自起始 HEAD 已存在的
PaperSurface initiative diff。Declared skip 为缺少 off-repo I16A fixture；
I4/I5 的 real DOCX 子测试也按 verifier 声明跳过本地缺失文件。
Notes: 新 gate 复用 Tickets 01/04 compiler、exact source slice、
sourceFingerprint 与 semanticDigest；sidecar 随 version/latest 原子发布。
Focused verifier 证明 `needs_review` 零写入、version/sidecar/DB/latest 四个
failure point 全回滚、旧 latest 全树 bytes 不变、retry version sequence
正确，以及真实 storage consumer 拒绝 stale assetVersion/fingerprint。
普通 Standards 与 Spec 双轴 review 的 findings 均已修复，focused re-review
均 PASS；未启动 Phase A 独立审查或 Ticket 07。
