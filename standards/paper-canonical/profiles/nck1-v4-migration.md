# NCK1 Profile v4 migration

NCK1 Profile v4 preserves every v3 part, section, slot, score, family binding,
answer region, and completeness rule. It changes only the
`writing.continuation` slot's instruction closure.

The hash-bound paper source
`sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f`
contains this exact instruction immediately after `第二节（满分25分）` and
before the Emily material:

`阅读下面材料，根据其内容和所给段落开头语续写两段话，使之构成一篇完整的短文。`

The checked-in accepted correction evidence records why the legacy Paper
Asset text without `话` is not canonical authority. Profile v4 owns the exact
instruction as `writing.continuation.prompt`; the continuation slot owns its
occurrence through `instructionRefs`. The projector carries it into
`paperChrome.instructions`, and renderers may only translate that projection.

Manifest v9 retains every earlier closure for existing Publications and makes
NCK1 Profile v4 the only NCK1 Profile accepted for new compilation.
