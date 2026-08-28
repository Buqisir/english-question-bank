# Manifest v47 migration

Manifest v47 succeeds the immutable Candidate-only Manifest v46
(`sha256:75214e1d16315d78b7c576ddf7969fb4a9c655af4eae3ab299d8bdad9a69c8ef`)
without modifying predecessor bytes. It extends only the universal NCK1
Candidate fork: source-bound `title` and `subtitle` roles on Seven Choices
paragraphs are retained in the family variant and projected Consumption
occurrence. Role records must reference top-level paragraph nodes uniquely,
serialize by `nodeId`, and contain at most one title; invalid or unbound
references fail closed before Review or publication.

Review Screen and new local Publications consume the same digest-bound
occurrence. The shared Screen and Student/Teacher Print/PDF seams render a
title centered and bold, a subtitle bold, and unmarked paragraphs with the
unchanged body treatment. The synthetic NCK1 conformance fixture proves the
role closure, rejection paths, Review/publication identity, and all three
rendered surfaces without paper-specific data.

Manifest v46 and its schemas remain registered and resolvable for immutable
historical Candidates and Review revisions. Manifest v47 does not advance the
globally accepted Manifest v36 authority or reinterpret an existing revision;
only a newly derived Candidate can carry the added role semantics.
