# 设计 canonical compilation 深模块接口

Status: closed
Type: prototype
Claim: claimed
Blocked by: 确定模块化试卷标准与机器权威结构; 定义 Source Capture 与清洗留痕合同
Next on PASS: `docs/cuts/paper-canonical-unification/wayfinder/tickets/06-paper-format-profile-and-plan.md`
Terminal: no
Map: `docs/cuts/paper-canonical-unification/wayfinder/map.md`

## Question

What small external interface can hide source-format parsing, normalization rules, per-family adapters, validation, source maps, fingerprints, semantic digests, and structured diagnostics while remaining pure and testable? Prototype at least two materially different type-only interfaces and representative result artifacts, then select the deeper module by leverage, locality, fail-closed behavior, and compatibility with new-import and historical-compilation callers. The public seam must not expose renderer, React, DB, filesystem, AI Analysis, or source-format-specific dialect details.

## Resolution

[Prototype asset: Canonical compilation Module Interface](../../prototypes/canonical-compilation-module-interface.md)

Select one pure external entry point, `compileCanonicalPaper(request)`, as a
one-shot evidence compiler. The request contains immutable source-document
bytes and roles, separately identified operator assertions, optional prior
review decisions, and an exact manifest id/version/digest; it contains no
profile, family, rule, parser, adapter, source dialect, caller mode, renderer,
React, DB, filesystem, or AI Analysis choice.

The Module internally creates the immutable Source Capture, resolves and
validates the exact executable-standard closure, selects private source-format
and family Adapters, applies exact normalization, assembles the Canonical Paper
Plan and all Canonical Question Groups, verifies semantic conformance, and
produces the source map, Transformation Records, fingerprints, semantic
digest, and structured diagnostics in one Normalization Report.

The result is a whole-paper discriminated union. Only `disposition: ready`
contains the atomic canonical Plan and Groups. `needs_review`, `unsupported`,
`incomplete_source`, and `answer_conflict` retain the Source Capture and
Normalization Report but expose no partial canonical package and no semantic
digest. Expected evidence and authority failures are data outcomes rather than
exceptions.

The prototype compared three materially different type-only Interfaces and
representative ready/blocked artifacts. Compiling an already-built Source
Capture left parsing coordination spread across callers; a two-stage
authority-bound protocol compiler added ordering and leaked an ingress
protocol that could become a disguised source dialect. The selected one-shot
Interface gives new-import prepublish and historical `latest` compilation the
same one-step call with no behavior-changing mode, while keeping authority
closure reuse as an internal memo keyed by manifest digest.

No domain glossary update is required: the decision uses the existing Source
Capture, Canonical Paper Plan, Canonical Question Group, Normalization Report,
Transformation Record, and Source Span meanings. No Fog graduates; later
tickets already own profile/plan fields, family variants, publication,
rollout, migration, and historical-version scope.
