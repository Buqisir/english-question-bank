# Normalization Rules v5 migration

Normalization Rules v5 preserves every v4 rule except that
`canonical-visible-typography` advances from version 1 to version 2.

Version 2 changes full-width Chinese gloss parentheses and adjacent ASCII
punctuation spacing only when the gloss immediately follows an English token,
for example `ditch （沟）.` to `ditch (沟).`. Ordinary Chinese prose such as
`这是（中文）说明。` is unchanged. ASCII apostrophes between English letters
still become the owner-approved curly apostrophe. Immutable source capture,
provenance, semantic wording, identities, question order, answers, and source
digests are unchanged.
