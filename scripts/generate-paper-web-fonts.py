#!/usr/bin/env python3
"""Generate SHA-pinned browser shards; original print/PDF fonts stay untouched.

Requires fonttools[woff]==4.59.2 and installed app dependencies. Run at repo root.
All original Unicode mappings survive; static UI literals form a small common
shard, with the remainder in 256-character shards selected before DOM admission.
"""
import hashlib
import json
from pathlib import Path
import subprocess
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / "app/public/fonts/paper"
OUTPUT = BUNDLE / "web"
MANIFEST = ROOT / "app/src/shared-ui/papersurface/paperWebFonts.json"

# Parse literals, not comments or paper content. This set is only an eager-load
# optimization: other characters are retained in the indexed on-demand shards.
literal_text = subprocess.check_output(["node", "--input-type=module", "-e", """
import ts from './app/node_modules/typescript/lib/typescript.js';
import fs from 'node:fs'; import path from 'node:path';
const chars = new Set();
for (const root of ['app/src', 'shared']) {
  for (const file of fs.readdirSync(root, {recursive:true}).filter(p => /\\.(mjs|tsx?|jsx?)$/.test(p)).sort()) {
    const tree = ts.createSourceFile(file, fs.readFileSync(path.join(root,file),'utf8'), ts.ScriptTarget.Latest,
      true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isStringLiteralLike(node) || ts.isJsxText(node) ||
        [ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(node.kind)) {
        for (const char of node.text) chars.add(char);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
}
process.stdout.write([...chars].sort().join(''));
"""], cwd=ROOT).decode()
common = {ord(char) for char in literal_text} | set(range(128))
OUTPUT.mkdir(parents=True, exist_ok=True)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def ranges(codes):
    result = []
    for code in sorted(codes):
        if result and result[-1][1] + 1 == code:
            result[-1][1] = code
        else:
            result.append([code, code])
    return result

def outline(glyphs, name):
    pen = DecomposingRecordingPen(glyphs)
    glyphs[name].draw(pen)
    return pen.value

faces = []
for weight, suffix in [("400", "Regular"), ("700", "Bold")]:
    source_path = BUNDLE / f"source-han-serif/SourceHanSerifCN-{suffix}.otf"
    original = TTFont(source_path, recalcTimestamp=False)
    cmap = original.getBestCmap()
    glyphs = original.getGlyphSet()
    core = sorted(set(cmap) & common)
    remaining = sorted(set(cmap) - set(core))
    chunks = [core] + [remaining[i:i + 256] for i in range(0, len(remaining), 256)]
    original_uvs = original["cmap"].getcmap(0, 5)
    selectors = set(original_uvs.uvsDict) if original_uvs else set()
    seen, uvs = set(), {}
    shards = []
    for index, codes in enumerate(chunks):
        font = TTFont(source_path, recalcTimestamp=False)
        options = subset.Options()
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_legacy = True
        options.name_languages = ["*"]
        sub = subset.Subsetter(options=options)
        sub.populate(unicodes=set(codes) | selectors)
        sub.subset(font)
        # OFL reserved name: browser derivatives have their own primary name.
        family = "EQB Web Han Serif"
        ps_name = f"EQBWebHanSerif-{suffix}-{index}"
        for record in font["name"].names:
            value = {1: family, 3: ps_name, 4: f"{family} {suffix}",
                     6: ps_name, 16: family}.get(record.nameID)
            if value is not None:
                record.string = value.encode(record.getEncoding())
        cff = font["CFF "].cff
        cff.fontNames = [ps_name]
        cff.topDictIndex[0].FamilyName = family
        cff.topDictIndex[0].FullName = f"{family} {suffix}"
        font.flavor = "woff2"
        target = OUTPUT / f"han-{weight}-{index}.woff2"
        font.save(target)
        # Inspect the delivered WOFF2, not the pre-compression in-memory font.
        actual = TTFont(target, recalcTimestamp=False)
        actual_cmap = actual.getBestCmap()
        assert set(actual_cmap) == set(codes)
        assert not seen.intersection(codes)
        seen.update(codes)
        actual_glyphs = actual.getGlyphSet()
        for code, name in actual_cmap.items():
            source_name = cmap[code]
            assert actual["hmtx"][name] == original["hmtx"][source_name]
            assert outline(actual_glyphs, name) == outline(glyphs, source_name)
        actual_uvs = actual["cmap"].getcmap(0, 5)
        if actual_uvs:
            for selector, entries in actual_uvs.uvsDict.items():
                uvs.setdefault(selector, []).extend(entries)
                for _, name in entries:
                    if name is not None:
                        assert actual["hmtx"][name] == original["hmtx"][name]
                        assert outline(actual_glyphs, name) == outline(glyphs, name)
        data = target.read_bytes()
        shards.append({"path": f"web/{target.name}", "sha256": digest(data),
                       "byteLength": len(data), "ranges": ranges(codes)})
        font.close()
        actual.close()
    assert seen == set(cmap), "Original Unicode coverage lost"
    if original_uvs:
        assert {key: sorted(value) for key, value in uvs.items()} == {
            key: sorted(value) for key, value in original_uvs.uvsDict.items()}
    faces.append({"family": "EQB Source Han Serif", "weight": weight, "style": "normal",
                  "sourcePath": str(source_path.relative_to(BUNDLE)),
                  "sourceSha256": digest(source_path.read_bytes()), "shards": shards})
    print(f"{suffix}: {len(seen)} characters, {len(shards)} shards, core {shards[0]['byteLength']} bytes", flush=True)
    original.close()

MANIFEST.write_text(json.dumps(faces, ensure_ascii=True, separators=(",", ":")) + "\n")
print("PASS: full original cmap/variation coverage, outlines and horizontal metrics preserved")
