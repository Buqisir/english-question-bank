# Manifest v25 migration

Manifest v25 publishes the corrected Grammar Fill prompt-provision closure.
Manifest v24 and every artifact, schema, consumer, fixture, request, and
evidence byte that it references remain unchanged and resolvable.

Grammar Fill family v3 selects
`grammar-fill-prompt-provision-v2`. The provision contract has exactly two
executable shapes: `source_prompt` requires a `prompt` string, while
`source_proven_none` forbids the `prompt` field. Source Adapter v7 registers
Grammar Fill prompt evidence adapter v2 and applies that same provision
contract to every reviewed evidence row before producing an observation or
canonical binding.

The canonical projector and sealed Publication validator apply the same
versioned provision contract to the source observation before public
projection. A contradictory `source_proven_none` observation carrying
`prompt` therefore fails at admission, direct canonical projection, and
sealed Publication validation; it cannot be accepted and silently discarded.

Grammar Fill public-geometry-fixtures v4 republishes the unchanged v3
variants and projected-occurrence digests with only the compatible
Consumption Plan manifest version advanced to v25. Screen v25 and Print/PDF v26
bind only Manifest v25 and Grammar Fill family v3. This migration changes
no renderer geometry, generated DOCX route, production configuration, or R2
state.
