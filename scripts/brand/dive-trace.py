"""潜水姿势：照图像生成的草图 C（image-review-2026-11-16/dive/dive-C.png）描成平涂矢量。提案 · 单一来源（BRAND.md 第 127 条）。

用法：python3 -I scripts/brand/dive-trace.py <草图 png> <otter-head.svg> <输出 svg>
做法（描线函数借 half-shrug-sc-trace.py）：
  1. 每个像素按最近色分到 底白 / 雾白 / 浅雾薄荷 / 雾薄荷 / 墨 五类。
  2. 剪影 = 不是底白的像素，闭运算（半径 4）补上脸斑贴边处的缺口，再填洞；整块填雾薄荷。
  3. 肚皮 = 浅雾薄荷，开运算（半径 3）去掉抗锯齿细条，再和剪影往里缩 14 像素的范围取交（次色不碰外轮廓）；前爪把它切成两块，两块都描。
  4. 脸不描：用头像母版 otter-head.svg 的脸斑、两眼、鼻子、六颗胡须点，按草图两眼的中心、眼距、眼线角度整体缩放平移转动后放上去
     （house-rules 第二节第 5 条「脸只有一种画法」）；整张脸缩到 0.9，脸斑同样裁在剪影往里缩 14 像素的范围里。
颜色只用 雾薄荷 #72BFA4、浅雾薄荷 #DDF1E8、雾白 #F2FAF6、墨 #191D18。平涂，无描边、无渐变。
"""
import importlib.util
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('t', Path(__file__).with_name('half-shrug-sc-trace.py'))
t = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t)

PAL = np.array([[254, 254, 254], [237, 247, 242], [220, 238, 230], [111, 187, 159], [25, 29, 24]])
BG, MUZ, BELLY, FUR, INK = range(5)
RIM = int(__import__("os").environ.get("DIVE_RIM", "14"))
FACE_K = 0.9  # 母版脸斑比草图的头宽，整张脸缩到 0.9，脸斑才落在头里
FACE_SHIFT = (10, -6)  # 缩完往右上挪一点，让开头的左下沿（目测）
MASTER_EYES = ((336.45, 371.25), (688.25, 371.25))


def fill_holes(m):
    h, w = m.shape
    out = np.zeros((h + 2, w + 2), bool)
    pad = np.zeros_like(out)
    pad[1:-1, 1:-1] = m
    stack = [(0, 0)]
    out[0, 0] = True
    while stack:
        y, x = stack.pop()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h + 2 and 0 <= xx < w + 2 and not out[yy, xx] and not pad[yy, xx]:
                out[yy, xx] = True
                stack.append((yy, xx))
    return ~out[1:-1, 1:-1]


def trace(m, sigma=2.5, eps=1.0):
    return t.to_path(t.closed_rdp(t.smooth(t.outline(m), sigma), eps))


def main(png, head_svg, out_svg):
    a = np.asarray(Image.open(png).convert('RGB')).astype(int)
    cls = np.argmin(((a[:, :, None, :] - PAL[None, None]) ** 2).sum(-1), axis=2)
    sil = fill_holes(t.disk_op(t.disk_op(cls != BG, 4, 'dilate'), 4, 'erode'))
    sil = max(t.components(sil), key=lambda c: c[0])[1]
    belly = t.disk_op(t.disk_op(cls == BELLY, 3, 'erode'), 3, 'dilate')
    inner = t.disk_op(sil, RIM, 'erode')  # 次色不碰外轮廓（house-rules 第二节第 2 条）：四周留 RIM 像素雾薄荷；留 6 像素读成一道描边，所以留宽一点
    parts = [m for n, m in t.components(belly & inner) if n > 300]  # 前爪把肚皮切成上下两块，两块都要
    ink = [(n, m) for n, m in t.components(cls == INK) if n > 60]
    blobs = []
    for n, m in ink:
        ys, xs = np.nonzero(m)
        blobs.append((n, xs.mean(), ys.mean()))
    blobs.sort(key=lambda b: -b[0])
    eyes = sorted(blobs[1:3], key=lambda b: b[1])  # 最大的是鼻子，其次两只眼
    (_, x0, y0), (_, x1, y1) = eyes
    gap = math.hypot(x1 - x0, y1 - y0)
    deg = math.degrees(math.atan2(y1 - y0, x1 - x0))
    mg = MASTER_EYES[1][0] - MASTER_EYES[0][0]
    mc = ((MASTER_EYES[0][0] + MASTER_EYES[1][0]) / 2, MASTER_EYES[0][1])
    k = gap / mg
    head = Path(head_svg).read_text()
    pick = lambda pat: re.sub(r' id="[^"]+"', '', re.search(pat, head, re.S).group(0))
    face = ''.join([
        pick(r'<path id="_L9S-0__ziti073"[^>]*/>'),
        pick(r'<g id="_L9S-0__ziti074">.*?</g>'),
        pick(r'<path id="_L9S-0__ziti077"[^>]*/>'),
        pick(r'<g id="_L9S-0__ziti078">.*?</g>'),
    ])
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    ys, xs = np.nonzero(sil)
    pad = 8
    vb = (xs.min() - pad, ys.min() - pad, xs.max() - xs.min() + 2 * pad, ys.max() - ys.min() + 2 * pad)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{' '.join(str(int(v)) for v in vb)}">
<!-- 潜水（2026-11-16，BRAND.md 第 127 条，提案 · 单一来源）：獭獭侧身头朝左下斜潜，两只前爪收在胸口，带趾的后脚和扁尾在右上。
身子照图像生成的草图 C 描（image-review-2026-11-16/dive/），脸用头像母版的脸斑、两眼、鼻子、胡须点按草图两眼对齐放上去。
只进 240px 以上、有巨藻的中图（§4.4：头朝下拉长时剪影偏海豹）。四色平涂，无描边、无渐变。由 scripts/brand/dive-trace.py 生成。 -->
<title>獭獭 · 潜水</title>
<path id="body" d="{trace(sil)}" fill="#72BFA4"/>
<clipPath id="inside"><path d="{trace(inner)}"/></clipPath>
<path id="belly" d="{' '.join(trace(m) for m in parts)}" fill="#DDF1E8"/>
<g clip-path="url(#inside)"><g id="face" transform="translate({cx + FACE_SHIFT[0]:.2f} {cy + FACE_SHIFT[1]:.2f}) rotate({deg:.2f}) scale({k * FACE_K:.4f}) translate({-mc[0]} {-mc[1]})">{face}</g></g>
</svg>
'''
    Path(out_svg).write_text(svg)
    print('eyes', [(round(x), round(y)) for _, x, y in eyes], 'gap', round(gap, 1), 'deg', round(deg, 1), 'k', round(k, 4), 'vb', vb)


if __name__ == '__main__':
    main(*sys.argv[1:4])
