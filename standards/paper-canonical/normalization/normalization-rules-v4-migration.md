# Normalization Rules v4 migration

v4 preserves every v3 rule and adds one exact, narrow visible-typography rule.
The rule changes only:

- full-width parentheses enclosing a Chinese gloss in English text to
  half-width parentheses with one standard preceding space;
- whitespace between that gloss and immediately following ASCII punctuation
  to no space;
- an ASCII apostrophe between two English letters to the curly right
  apostrophe `’`.

Other punctuation cannot be normalized by this rule. The compiler records the
raw inline as a source observation, applies the deterministic registry once,
and emits a Transformation Record that the validator independently replays.
Raw source documents and reviewed capture bytes remain immutable.
