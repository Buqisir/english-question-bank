# Manifest v50 migration

Manifest v50 is the scoped Format2-rich renderer successor to immutable
manifest v49. It preserves every v49 core, adapter, profile, family,
normalization, and existing renderer artifact byte and adds only the
`renderer-times-compatible-metrics` v2 artifact and its schema.

The successor binds the pinned `U+2082` glyph-patch asset described by
times-compatible metrics v2. New v50 Publications use
`normalization-report-v50` and `canonical-paper-publication-v50`, and Screen
v43 and Print/PDF v44 bind the exact v50 manifest digest. Existing v49
Publications remain bound to Screen v41 and Print/PDF v42 and must continue to
resolve their original v1 metrics behavior.

This closure authorizes no additional Unicode coverage and no system-font
lookup. A renderer may consume the successor only after verifying the pinned
asset bytes and exact authority/consumer references.
