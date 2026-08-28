# 导题格式能力 wayfinder

本目录把“某张卷长得不一样”转换成可复用的 shape capability，而不是新的格式编号或
`paperId` 特例。

- 先读 [spec](spec.md)，确认语义权威、视觉忠实和 fail-closed 边界。
- 再查 [capability matrix](capability-matrix.md) 的最接近行及 evidence catalog。
- 实现工作按 [tickets](tickets/README.md) 的依赖顺序领取；推荐从
  [01 — source-region Review pairing](tickets/01-source-region-review-pairing.md) 开始。

## 遇到陌生形状

1. **冻结来源**：只读保存 source role、media type、digest、页码和形状所在区域；不要把
   完整真实试卷复制进 fixture。
2. **查矩阵**：按真实 shape 而非文件扩展名找行。核对该行的 detection、Source Capture、
   Materialization、Canonical、三面和 Review 证据，不把 `manual`/`legacy` 当 producer
   support。
3. **已有能力则复用**：运行该行列出的 adapter 与 verifier；不得加单卷 parser、CSS 或
   renderer 分支。
4. **能力不闭合则停住 Candidate**：记录 stable issue code、source document/page/region
   及最近的语义 target；缺 locator 时明确标记 unlocated，不能丢弃或猜最近元素。
5. **建最小 fixture**：只保留一个匿名或 synthetic 正例、一个相邻未知 shape 拒绝例和
   必要的短 token。图片用自制像素，音频用 synthetic tone；不提交长原文或学生数据。
6. **扩原有 source of truth**：优先扩现有 locator、block、media、shared surface projection
   和 Review issue target。只有现有模型确实无法诚实表达时才增加最小字段。
7. **按公共 seam 验证**：source replay → Materialization → Canonical → Screen →
   Student/Teacher Print → PDF → `/ops/` source pairing；未知邻接 shape 必须稳定失败。
8. **有证据才升级矩阵**：同一 change 同步 fixture、code、verifier、ticket 和矩阵状态。
   一张真实卷通过或人工能修，不足以把 `partial` 改成 `supported`。

若 gap 会改变学生可见内容或 Canonical/presentation 权威边界，提交给 Owner 决定；纯
adapter 实现细节、overlay 是否延期等不应冒充产品决策。
