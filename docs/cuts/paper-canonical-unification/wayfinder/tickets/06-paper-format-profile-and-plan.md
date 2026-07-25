# 定义卷型模板与整卷装配单合同

Status: closed
Type: prototype
Claim: claimed
Blocked by: 确定模块化试卷标准与机器权威结构; 定义 Source Capture 与清洗留痕合同
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/07-rich-content-and-group-envelope.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

What exact semantic facts belong in a versioned Paper Format Profile, and what exact per-paper facts belong in a Canonical Paper Plan? Prototype NCK1, Zhejiang legacy, and national legacy examples that cover parts, sections, required/optional/inactive group slots, numbering maps, scoring, standardized instructions, answer regions, source deviations, and completeness status. Decide how a plan links slots to Canonical Question Groups, how incomplete sources fail closed, and how all renderers consume one plan without moving fonts, physical dimensions, pagination algorithms, passages, answers, or Analysis into it.

## Resolution

[Prototype asset: Paper Format Profile / Canonical Paper Plan](../../prototypes/paper-format-profile-and-plan.md)

Use a versioned Paper Format Profile as the sole reusable owner of ordered
parts, sections, slots, numbering and scoring rules, standardized instruction
text, semantic answer regions, and completeness policy. Slot semantics are
orthogonal: `presence: required | optional` controls completeness, while
`activation: canonical_group | inactive_source` controls whether the slot may
link one Canonical Question Group. Inactive slots preserve a closed source
slice, never carry `groupRef`, and are suppressed on every current renderer.

The three current v1 profiles have no optional slots. NCK1 has 9 active groups,
Zhejiang legacy 8, and national legacy 7; listening is required/inactive in all
three, and national legacy correction/composition are required/inactive rather
than fabricated as application/continuation Groups. Optional omission remains
an explicit contract capability and is recorded in the Plan only when a future
exact profile version declares it.

A Canonical Paper Plan contains only one paper's exact profile/manifest refs,
ordered slot bindings, source-anchor-to-canonical numbering assignments,
Transformation Record refs for accepted exact deviations, explicit optional
omissions, and `completeness.status: complete`. Each active slot binds exactly
one Group by stable `groupId`; Group content, answers, passages, Writing Tasks,
rich content, and Analysis stay outside the Plan. Missing required active or
inactive evidence returns `incomplete_source`; ambiguous or unledgered mapping
returns `needs_review`; blocked branches expose no Plan, preserving the
whole-paper atomic result selected by the compiler-interface ticket.

All Screen, Print/PDF, and DOCX Adapters consume one renderer-neutral semantic
stream produced by a shared `projectCanonicalPaper(...)` Module from the exact
Profile, Plan, Groups, and authority closure. Renderers own only typography and
surface presentation; they cannot infer profiles, order, numbering, scoring,
instructions, answer regions, or legacy fallbacks.

The throwaway logic TUI exercised the three real profile shapes plus optional
omission, ledgered renumbering, missing active/inactive evidence, and
unledgered deviation. Only the linked contract answer is retained. No glossary
change, Fog graduation, or new ticket is required.
