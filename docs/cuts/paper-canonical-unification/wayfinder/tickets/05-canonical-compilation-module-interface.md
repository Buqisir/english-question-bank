# 设计 canonical compilation 深模块接口

Status: open
Type: prototype
Claim: unclaimed
Blocked by: 确定模块化试卷标准与机器权威结构; 定义 Source Capture 与清洗留痕合同
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/06-paper-format-profile-and-plan.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

What small external interface can hide source-format parsing, normalization rules, per-family adapters, validation, source maps, fingerprints, semantic digests, and structured diagnostics while remaining pure and testable? Prototype at least two materially different type-only interfaces and representative result artifacts, then select the deeper module by leverage, locality, fail-closed behavior, and compatibility with new-import and historical-compilation callers. The public seam must not expose renderer, React, DB, filesystem, AI Analysis, or source-format-specific dialect details.
