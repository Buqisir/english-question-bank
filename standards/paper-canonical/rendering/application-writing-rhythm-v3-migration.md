# Application Writing rhythm v3 migration

v3 preserves the complete v2 role graph, spacing, 144mm × 65mm response
geometry, atomicity, evidence digests, and 18pt Print/PDF baseline. It replaces
`borderPt: 0.48` with explicit medium-specific thin-rule targets:
`screenBorderPx: 1` and `printBorderPt: 0.5`.
