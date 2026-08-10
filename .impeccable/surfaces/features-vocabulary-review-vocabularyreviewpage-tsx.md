---
version: 2
slug: "features-vocabulary-review-vocabularyreviewpage-tsx"
primary_target: "app/src/features/vocabulary-review/VocabularyReviewPage.tsx"
related_targets: ["app/src/features/vocabulary-review/vocabularyReviewPage.css", "app/src/features/vocabulary-listen/VocabularyListenPage.tsx", "app/src/features/vocabulary-listen/vocabularyListenPage.css"]
---

Mode: Operate

Audience: A teacher managing several students, leading rapid face-to-face vocabulary checks, and preparing reusable listening sheets.

Job: Select or create a student, then move through all 1,600 source words in order or paste a Chinese-comma-separated list of existing words, freeze a teacher-chosen set of 1–60 entries, download a named vocabulary sheet, and share a revocable QR listening page without interrupting teaching rhythm.

Primary task: Keep attention on one English headword, decide known or unfamiliar from the keyboard, and see unfamiliar words accumulate.

Content hierarchy: Current student and that student's progress establish context; current word remains first within the active review; source position is second; reveal picture, pronunciation, meaning, syllables, and example on demand; collected unfamiliar words remain visible as a quiet ledger.

Constraints: Preserve source order and source grouping. Use Enter for known, Shift for unfamiliar, Delete for undo, Space for replay, and Right Arrow for the hint; newly shown words play once. Maintain the product's neutral paper-like palette, compact radii, and single green accent. Avoid childlike game styling. The downloaded PDF stays A4, two columns by three rows, row-major, with one first-page QR.

Direction: A compact student switcher sits with overall progress and can reveal one inline name field; it never becomes a separate dashboard or modal. The setup screen has one main-progress action, a small remembered American/British choice, and a secondary direct-input option. Week and Day are display-only context inside the active review rail. A fixed central word stage remains flanked by that source rail and a live unfamiliar-word ledger. The memorable moment is immediate continuity: one Shift press records the word, adds it to the ledger, advances, and plays the next word without a dialog. The teacher can pause back to setup without losing the server-authoritative run. Frozen sets can be renamed, reopened, downloaded, reshared, or revoked within the selected student.

Deferred: Student accounts and permanent profile deletion remain outside this surface.
