# Personal annotation font assets

Owner decision: 2026-09-29 (#489 「我的批注」). These fonts render only a
teacher's own annotation text inside `.eqb-personal-text`. They never change
the Canonical Paper fonts (`../paper/`), public print output, or the site UI.

These are unmodified upstream fonts. The adjacent upstream licenses are the
redistribution evidence; retain them when distributing the fonts.

## Xiaolai SC (小赖 简体比例版) v3.120

- Author: lxgw. Upstream: https://github.com/lxgw/kose-font
- Release tag `v3.120`, tag commit
  https://github.com/lxgw/kose-font/commit/e4b2b0c02a73e78c3556043ed7ceb9b90815d5e2
- File downloaded 2026-09-29 from the release asset
  https://github.com/lxgw/kose-font/releases/download/v3.120/XiaolaiSC-Regular.ttf
  (22,183,944 bytes). v3.120 is the last release that ships the simplified
  proportional `XiaolaiSC-Regular`; later releases publish only the
  Japanese-oriented `Xiaolai-Regular`. The Mono variant is not used.
- License: SIL Open Font License 1.1, `xiaolai/License.txt`, downloaded from
  `License.txt` at the tag commit above.
- Only a Regular face exists. Bold personal text in this font is synthesised
  by the renderer (`syntheticBold` in `shared/personal-text/fontRegistry.mjs`);
  EQB does not claim a real Xiaolai Bold.

## Fuzzy Bubbles

- Designer: Robert Leuschke. Upstream project:
  https://github.com/googlefonts/fuzzy-bubbles (source commit
  `16d63fbca17f057559d0187fa7c07dd302d2276d` per `METADATA.pb`).
- Files downloaded 2026-09-29 from google/fonts commit
  https://github.com/google/fonts/tree/a60a77e14f28abd4ef243a1b5dfc48df0cec5205/ofl/fuzzybubbles :
  `FuzzyBubbles-Regular.ttf` (400), `FuzzyBubbles-Bold.ttf` (700),
  `OFL.txt`, `METADATA.pb`.
- License: SIL Open Font License 1.1, `fuzzy-bubbles/OFL.txt`.
- Latin/Vietnamese only. Chinese in the 「Fuzzy Bubbles」 preset falls back
  to Xiaolai SC, then system CJK fonts.

## Integrity and use

`SHA256SUMS` pins every file here; verify with `shasum -a 256 -c SHA256SUMS`
from this directory. `shared/personal-text/fontRegistry.mjs` records the same
checksums, and `scripts/verify-personal-paper-layer.mjs` fails on any drift.
The CSS family names prefixed `EQB` are browser aliases only; no font tables
have been renamed or edited. Fonts are self-hosted and never requested from
Google Fonts or another third party, so no user text leaves the site.

Full original TTFs are retained. Subsetting or WOFF2 conversion, if adopted
later, needs its own reproducible build, license compliance and glyph-coverage
proof. Never hand-edit these binaries.
