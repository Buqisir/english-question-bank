# Zhejiang legacy Profile v3 migration

Zhejiang legacy Profile v3 preserves the v2 part, section, slot, numbering,
scoring, answer-region, and completeness contracts. It changes only the two
source-unproven English writing declarations, `part.writing` (`Writing`) and
`section.writing` (`Writing tasks`), to canonical `renderPolicy: suppress`.

Application Writing and Continuation Writing still bind the same ordered
`writing.tasks` section. Screen, Print/PDF, and DOCX therefore render neither
suppressed declaration, while preserving both Groups, their own material, and
their distinct response regions exactly once. A shared section declaration is
valid only when every Group agrees on the complete canonical part and section
declarations; inconsistent declarations or rendered order fail closed.

Manifest v8 binds Zhejiang legacy Profile v3 with Screen v8, Print/PDF v9,
and DOCX v8 Consumer Contracts. Manifest v7, Zhejiang legacy Profile v2, and
the earlier Consumer Contracts remain immutable and resolvable for existing
Publications.
