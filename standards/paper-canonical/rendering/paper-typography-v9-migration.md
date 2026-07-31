# Paper Typography v9 migration

Paper Typography v9 succeeds v8
(`sha256:a6df33ca2104dc644f9e4b5ecace6386e958da7af87a97cac2b68d26af3cc073`)
without modifying it.

It gives the current public-paper authority the regular visible weights for
section headings and instructions. Screen and Print/PDF consume those roles
directly, so no public-paper CSS or renderer path supplies a shadow `400` or
`normal` literal. The v8 bytes remain reloadable.
