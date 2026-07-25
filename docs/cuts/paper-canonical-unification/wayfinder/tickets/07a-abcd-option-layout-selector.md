# 定义 A–D 选项整组择形算法与金样卷 parity

Status: open
Type: prototype
Claim: unclaimed
Blocked by: 盘点全库 latest 资产与所有生产消费变体; 确定模块化试卷标准与机器权威结构; 定义题组通用 envelope 与 rich content nodes
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/08-seven-choices-canonical-variant.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

Using NEEA gold-reference page 4 questions 21–23, page 9 cloze, and the reproducible current-asset width census, what deterministic renderer-only selector should choose one layout for a complete per-question A–D option set: `four_columns` (`A B C D`), `two_by_two` (`A B` / `C D`, row-major), or `one_column` (`A` / `B` / `C` / `D`)? Prototype a small pure interface and representative Screen/Print, PDF, and DOCX projections that try modes densest-first against the target 10.5pt font, A4 content width, labels, indents, and gutters; raw character count or word count alone is not acceptable without corpus evidence. No four- or two-column candidate may rely on per-option wrapping, CSS auto-placement, or a late option falling into a hybrid extra row: if any option does not fit, the entire set moves to the next mode. Decide the conservative measurement method, cross-renderer determinism, safety margin, explicit line-break handling, and the fail-closed or hanging-indent policy when even one-column width is exceeded. The selector must consume canonical option content without storing layout in canonical semantics, must preserve cloze's tab-aligned four-column gold case, and must not govern Seven Choices A–G or listening A–C.
