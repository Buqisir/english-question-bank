#!/usr/bin/env python3
"""字标草稿用的取字小工具：从可变字体里按字重取单个字的轮廓，输出 SVG 路径（JSON）。

只给 scripts/brand/wordmark-drafts.mjs 调用，不单独用。提案 · 单一来源，第一轮草稿。

输入（stdin，JSON 数组），每项：
  {"key": "...", "font": "/path/x.woff2", "char": "獭", "wght": 400,
   "contourWeights": {"3": 350, "4": 350}}   # 可选：指定几个轮廓（按字体里的轮廓序号）改用别的字重
输出（stdout，JSON 对象）：key -> {"d": SVG 路径, "advance": 前进宽, "contours": 轮廓数,
  "bbox": [xMin, yMin, xMax, yMax], "font": {...}}
坐标：字体单位，em 1000；y 已翻成向下，em 框上沿（理想字面框上沿 880）是 0，下沿是 1000。

fontTools 不在仓库依赖里。用环境变量 EQB_FONTTOOLS_PATH 指向装了 fonttools 和 brotli 的目录
（例如 pip install --target <临时目录> fonttools brotli），本脚本把它加进 sys.path。
"""
import json
import os
import sys

extra = os.environ.get("EQB_FONTTOOLS_PATH")
if extra:
    sys.path.insert(0, extra)

from fontTools.ttLib import TTFont  # noqa: E402
from fontTools.pens.recordingPen import DecomposingRecordingPen  # noqa: E402

EM_TOP = 880  # 思源 / Noto CJK 的理想字面框上沿（OS/2 sTypoAscender），下沿 -120


def contours_of(glyph_set, name):
    pen = DecomposingRecordingPen(glyph_set)
    glyph_set[name].draw(pen)
    out, cur = [], []
    for op, args in pen.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def to_d(contours):
    parts = []
    xs, ys = [], []

    def pt(p):
        x, y = p[0], EM_TOP - p[1]
        xs.append(x)
        ys.append(y)
        return f"{fmt(x)} {fmt(y)}"

    for c in contours:
        for op, args in c:
            if op == "moveTo":
                parts.append("M" + pt(args[0]))
            elif op == "lineTo":
                parts.append("L" + pt(args[0]))
            elif op == "qCurveTo":
                # TrueType 二次曲线：连续离线点之间补隐含的在线点
                pts = list(args)
                on_end = pts[-1]
                offs = pts[:-1]
                for i, off in enumerate(offs):
                    if i < len(offs) - 1:
                        nxt = offs[i + 1]
                        mid = ((off[0] + nxt[0]) / 2, (off[1] + nxt[1]) / 2)
                        parts.append("Q" + pt(off) + " " + pt(mid))
                    else:
                        parts.append("Q" + pt(off) + " " + pt(on_end))
                if not offs:
                    parts.append("L" + pt(on_end))
            elif op == "curveTo":
                parts.append("C" + " ".join(pt(p) for p in args))
            elif op == "closePath":
                parts.append("Z")
    bbox = [min(xs), min(ys), max(xs), max(ys)] if xs else [0, 0, 0, 0]
    return "".join(parts), bbox


_fonts = {}


def load(path):
    if path not in _fonts:
        _fonts[path] = TTFont(path)
    return _fonts[path]


def main():
    jobs = json.load(sys.stdin)
    result = {}
    for job in jobs:
        font = load(job["font"])
        name = font.getBestCmap()[ord(job["char"])]
        has_fvar = "fvar" in font
        loc = {"wght": job["wght"]} if has_fvar else None
        base = contours_of(font.getGlyphSet(location=loc) if loc else font.getGlyphSet(), name)
        cw = job.get("contourWeights") or {}
        if cw:
            if not has_fvar:
                raise SystemExit("contourWeights 只能用在可变字体上")
            for idx_s, w in cw.items():
                idx = int(idx_s)
                alt = contours_of(font.getGlyphSet(location={"wght": w}), name)
                if len(alt) != len(base):
                    raise SystemExit("两个字重的轮廓数不一样，不能逐个替换")
                base[idx] = alt[idx]
        if "expectContours" in job and len(base) != job["expectContours"]:
            raise SystemExit(f"{job['char']} 轮廓数是 {len(base)}，脚本按 {job['expectContours']} 写的，字体版本可能变了")
        d, bbox = to_d(base)
        result[job["key"]] = {
            "d": d,
            "advance": font["hmtx"][name][0],
            "contours": len(base),
            "bbox": [round(v, 1) for v in bbox],
            "font": {
                "family": font["name"].getDebugName(1),
                "version": font["name"].getDebugName(5),
                "unitsPerEm": font["head"].unitsPerEm,
                "axes": [[a.axisTag, a.minValue, a.maxValue] for a in font["fvar"].axes] if has_fvar else None,
            },
        }
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
