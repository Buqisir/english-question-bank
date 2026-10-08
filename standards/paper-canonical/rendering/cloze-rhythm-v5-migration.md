# Cloze Rhythm v5 migration

Cloze Rhythm v5 succeeds immutable v4. v4 keeps its fixed column origins and must not be reinterpreted as proportional tracks. v5 keeps the v4 question label at 17.3pt and allocates the remaining row width by the frozen shares 110.5:104.1:104.65:101.65. `rendererMapping.proportional` is true only on this successor. Manifest v60, Screen v45 and Print/PDF v46 select it. Presentation policy, Candidate 59 and global accepted 36 stay unchanged. Historical consumer 44/45 keep the v4 fixed mapping.

Reproduce: `node scripts/generate-cloze-proportional-v60.mjs --check`.
