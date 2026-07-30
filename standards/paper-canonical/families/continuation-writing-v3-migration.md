# Continuation Writing family v3 migration

Continuation Writing v3 preserves the closed v2 variant, starter contracts,
response semantics, and geometry. It advances only the accepted source capture
and transcription contracts to immutable v2 successors.

The v2 evidence records the exact v1 predecessor digest and applies one
source-text normalization: Unicode NFC plus collapse of ASCII layout
whitespace introduced by PDF line wrapping. Punctuation code points,
punctuation-adjacent spacing, apostrophe code points, and word presence remain
distinct. Existing v1 capture/transcription bytes and every publication through
Manifest v28 remain immutable and resolvable.
