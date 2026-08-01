# Manifest v35 migration

Manifest v35 succeeds v34 without modifying any predecessor bytes.

It replaces only current Paper Typography with v10, the compatible Grammar
Fill public-geometry fixture with v14, and the required normalization-report
and canonical-publication schema descriptors. The successor binds the locally
glyph-normalized section-heading numeric baseline calibration and advances the
Grammar Fill fixture's fail-closed manifest identity, while preserving the
existing Screen/Print/PDF question geometry, page box, families, profiles, and
all unrelated renderer authorities. Screen v35 and Print/PDF v36 bind Manifest
v35. Manifest v1 through v34 and every authority, schema, fixture, consumer,
and migration they reference remain unchanged and resolvable.
