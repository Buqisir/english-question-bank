# Times-compatible metrics v2 migration

Times-compatible metrics v2 succeeds immutable v1 without modifying its
bytes. It preserves the v1 Times New Roman primary metrics, Songti fallback,
and kerning data, and adds one renderer-owned glyph patch for `U+2082` only.

The glyph patch is derived from the official STIX Two Text Regular source at
tag `v2.13b171`. The source hash, deterministic HarfBuzz subset arguments,
runtime asset path, runtime asset hash, public URL, license, Unicode range,
and measured advance are closed by the v2 artifact and its schema. Screen,
Print HTML, and PDF may select this successor only through an authority and
consumer contract that bind manifest v50. Earlier authorities continue to
resolve times-compatible metrics v1 and must not consume the new asset.

The subset remains licensed under the SIL Open Font License 1.1. Its copyright
notice and complete license are distributed beside the font asset at
`app/public/paper-fonts/OFL.txt`.
