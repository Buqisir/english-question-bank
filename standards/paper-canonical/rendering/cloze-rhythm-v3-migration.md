# Cloze Rhythm v3 migration

Cloze Rhythm v3 succeeds v2
(`sha256:2eb00498b8888786b1db84d9afc6ee14e7c0a8888f821c20c7876257b0fc5f23`)
and preserves source Questions 41-55, choices, answers, explanations, fixed
18pt Print/PDF rhythm, and Student/Teacher isolation.

The successor replaces the renderer-local equal-pitch assumption with the
Owner-gold normalized row: the question number shares the passage
continuation origin, A begins at 17.3pt (1.647em at the 10.5pt local font),
and A-D use the four measured fixed origins. No whitespace or CSS gap is
inserted between the `41.` and `A.` tracks, and question, labels, and option
text use regular 400 weight. The v2 bytes remain reloadable.

