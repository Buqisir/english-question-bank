# Canonical Paper font assets

Owner decision: 2026-09-08. English uses **TeX Gyre Termes**; Chinese uses
**Source Han Serif CN / 思源宋体（大陆地区子集）**. Screen, Print HTML and
server PDF must use the same pinned bytes, not locally installed Times New
Roman, SimSun or Songti. This decision supersedes the earlier font candidates.

These are unmodified upstream fonts. The adjacent upstream licenses and
copyright notices are the redistribution evidence, not a purchased commercial
authorization certificate. Retain them when distributing the fonts.

## TeX Gyre Termes 2.609

- Publisher: GUST e-foundry; authors B. Jackowski and J. M. Nowacki.
- Official page: https://www.gust.org.pl/projects/e-foundry/tex-gyre/termes
- Original OTF package, downloaded 2026-09-08:
  https://www.gust.org.pl/projects/e-foundry/tex-gyre/termes/tg_termes-otf-2_609-31_03_2026.zip
- Complete four-face OTF distribution: regular, bold, italic, bold italic.
- License: `termes/GUST-FONT-LICENSE.txt`, under LPPL 1.3c or later;
  the exact LPPL 1.3c text is retained as `termes/LPPL-1.3c.txt`.
- Original upstream `README-TeX-Gyre-Termes.txt` and
  `MANIFEST-TeX-Gyre-Termes.txt` are retained. That manifest describes the
  larger upstream TeX distribution; this directory contains its official
  standalone OTF distribution, not the Type1/TeX support files.
- License sources:
  https://www.gust.org.pl/fonts/licenses/GUST-FONT-LICENSE.txt
  https://www.latex-project.org/lppl/lppl-1-3c.txt
- README/manifest sources: files of the same names under the official
  Termes page URL above.

## Source Han Serif CN 2.003

- Publisher: Adobe; SIL Open Font License 1.1, retained verbatim in
  `source-han-serif/LICENSE.txt` (including copyright and reserved names).
- Upstream: https://github.com/adobe-fonts/source-han-serif
- Pinned release-tree commit:
  https://github.com/adobe-fonts/source-han-serif/commit/7889f11bf31170b5d092a083b357c8c8130f89e0
- Files downloaded 2026-09-08 from that commit's `SubsetOTF/CN/` directory:
  `SourceHanSerifCN-Regular.otf`, `SourceHanSerifCN-Bold.otf`.
- License downloaded from that commit's `LICENSE.txt`.
- CN is the upstream mainland-China regional subset, not an EQB modification.
  The fonts retain the upstream family names. The CSS names prefixed `EQB`
  are browser aliases only; no font tables have been renamed or edited.
- Chinese has real regular/bold faces, not italic. Do not synthesize Chinese
  italics or pretend this bundle contains a Chinese sans-serif heading face.

## Integrity and use

`SHA256SUMS` pins the fonts, original legal documents and CSS. Verify with
`sha256sum -c SHA256SUMS` from this directory. Any intentional asset update
needs new provenance, checksums and rendered verification.

`fonts.css` provides relative same-origin URLs without `local()` lookup.
The live renderer uses `shared/papersurface/paperFonts.mjs` (font policy v1):
Screen verifies the downloaded bytes before mounting paper content; standalone
Print HTML embeds the same checked bytes; PDF waits for all declared faces
before pagination. Tests inspect actual glyph providers, not only CSS names.
The font-only style block bypasses Paged.js CSS transformation, not browser
font loading (the full bundle exceeds CSS-tree's 24-bit source-offset limit).

Full original OTFs are retained for this first pinned bundle. Production
subsetting/WOFF2 conversion, if adopted later, needs its own reproducible build,
license compliance and glyph-coverage proof. Never hand-edit these binaries.
