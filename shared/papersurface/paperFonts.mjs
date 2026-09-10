// Live renderer font policy v1. Publication/semantic authority stays immutable.
export const paperFontStack = '"EQB Termes", "EQB Source Han Serif", serif'

export const paperFontFaces = Object.freeze([
  ['EQB Termes', 'normal', '400', 'termes/texgyretermes-regular.otf', '1ec66f0460a3f48280aa714ac9613f3dbe6c67a24727aba5c78b0b122d85f643'],
  ['EQB Termes', 'normal', '700', 'termes/texgyretermes-bold.otf', 'b6b1c2beae711d48653363a2152e22e9fe3721caec006b35e0fa64c7e98e3c7e'],
  ['EQB Termes', 'italic', '400', 'termes/texgyretermes-italic.otf', '7c4abfb949923dc2d860a93ee93d14ba194a3324ea0a3815ce2626aaa18b67bb'],
  ['EQB Termes', 'italic', '700', 'termes/texgyretermes-bolditalic.otf', '4cf2326825cf35d7bb537c2b01d62d32dd4a6d215581d1f322aa744d8c1cd769'],
  ['EQB Source Han Serif', 'normal', '400', 'source-han-serif/SourceHanSerifCN-Regular.otf', '3754ea669c530e2473354f8f6d9f79680a44d7e26ec7d00eeabee4a7e0753c5d'],
  ['EQB Source Han Serif', 'normal', '700', 'source-han-serif/SourceHanSerifCN-Bold.otf', '4ee555ae58b3d22f6a95c2c494f2c36b7cccfc1d2224635f6461a03756f0e3c1'],
].map(([family, style, weight, path, sha256]) => Object.freeze({ family, style, weight, path, sha256 })))
