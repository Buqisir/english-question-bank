# Normalization Rules v3 migration

Manifest v10 makes the NCK1 continuation-instruction correction executable.
Admission requires a `profile-writing-source-evidence-v1` sidecar whose source
document digest is the same digest used by the structured continuation source
capture. The admitted correction produces an exact Transformation Record
bound to that source span.

Manifest v10 also closes schema descriptor identity: every schema descriptor
must match the schema's declared `$id`. The corrected v9 report and publication
schemas are current v10 dependencies at identity-corrected versioned paths.
Manifest v9 still resolves its original paths and bytes so earlier Publications
keep their immutable read authority.
