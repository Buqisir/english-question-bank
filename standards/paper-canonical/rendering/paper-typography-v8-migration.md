# Paper Typography v8 migration

Paper Typography v8 succeeds v7 without modifying it.

- Exact closure now covers the complete artifact, including coordinates and
  provenance.
- Reading visible weights remain `400` and are consumed directly from Paper
  Typography instead of shadow CSS or Cloze Rhythm.
- The part-heading to first-section relation is normalized to `1.882` local
  visible-glyph-height proxies across Screen, Print HTML, and PDF.
- The canonical PDF footer is dynamic:
  `英语试题第 ${page} 页（共 ${pages} 页）`.
