# Manifest v16 migration

Manifest v16 corrects the Seven Choices renderer authority without changing
canonical source semantics. The immutable original-question PDF has no
standalone Seven Choices passage title: its first visible line is body text.
`seven-choices-rhythm-v2` therefore removes the unexecutable `passage_title`
role and `passage_title_to_body` edge, while preserving the measured Golden
Geometry values and every executable body, blank, bank, tail, boundary, and
page-relation edge.

The correction is source-bound by
`20-seven-choices-source-oracles-v2.json`, which digest-binds the immutable
question PDF and official-answer source. Real Screen, Print HTML, and
Chromium A4 PDF checks derive visible-text expectations from those sources,
not from the production projection under test. Producer-seam attacks cover
missing, duplicate, wrong, and structurally drifted Seven Choices inputs;
public artifacts cover optional chrome and bank-heading collapse, one-line
and wrapped A-G rows, inline blanks, Student and Teacher tails, Reading-D and
following-section boundaries, same- and cross-page passage flow, passage-to-
bank pagination, and between-option bank pagination.

New canonical Publications bind Manifest v16, Screen v16, and Print/PDF v17.
Manifest v1-v15, their schemas and renderer artifacts, Reading Typography v4,
and all accepted evidence bytes remain immutable and resolvable for historical
Publications.
