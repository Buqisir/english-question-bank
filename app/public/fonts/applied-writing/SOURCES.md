# Applied-writing lecture v3 font sources

The two files in this directory are self-hosted, payload-codepoint subsets.
They contain no CDN or package dependency.

| Output | Source | Source SHA-256 | Output SHA-256 |
| --- | --- | --- | --- |
| `xiaolai-awl-v3.woff2` | `lxgw/kose-font@v3.121` release asset `Xiaolai-Regular.ttf` | `cc0acde1d1d44f4dee5c44c65384992b1c49ec9bc57537c5c82d6fb9c8f9346f` | `63b049c861287dada463502299b57530c83acf55b5aaef26f77dd822083087e5` |
| `shantell-sans-awl-v3.woff2` | `google/fonts@00e726a90e0b9698971c37b88c35ef958965448b` `ofl/shantellsans/ShantellSans[BNCE,INFM,SPAC,wght].ttf` | `d98a7913853f78d71aa0b86daf66b5eddb5a3266c07bfd51ef70632b88c41084` | `e4a76c80b8dab5bd53ef33b4fa83645c90af4fb499408286dc66367d0154e08d` |

Build command (FontTools 4.62.1; `payload-text.txt` is the concatenated
`reviewMarks[].note`, `lectureAnnotation.label`, `.note`, and optional
`.transferExample` values in both locked packets):

```text
pyftsubset SOURCE.ttf --output-file=OUTPUT.woff2 --flavor=woff2 --text-file=payload-text.txt --layout-features='*' --name-IDs='*' --name-legacy --notdef-glyph --notdef-outline --recommended-glyphs
```

Coverage assertion: FontTools read each generated WOFF2 cmap and compared it
with the code points it is responsible for: Xiaolai covers every Chinese
annotation code point; Shantell Sans covers every English annotation and
transfer-example code point. Result: `PASS (Chinese 173/173; English 33/33)`.

Licenses are preserved verbatim as `OFL-Xiaolai.txt` and
`OFL-Shantell-Sans.txt`.
