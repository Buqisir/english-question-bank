"""潜水第二版（2026-11-17）：Owner「这个下潜獭獭要重新画，当时画的很丑」「先用 OpenAI 生图，然后你再描」。
草图 image-review-2026-11-17/dive/D1-1.png。身子、肚皮照 dive-trace.py 的办法描（五类最近色、闭运算补缝、肚皮离外沿 RIM 像素）；
头不描：直接放坐石全身像 mascot/otter-sit.svg 的整颗头（耳朵、头形、脸都不改），按草图两眼对齐；下巴的直切换成圆裁。
草图头部那一圈先从剪影里挖掉，免得描出来的头边和母版头边叠出鼓包。
用法：python3 -I scripts/brand/dive-trace2.py <草图 png> <otter-sit.svg> <输出 svg>"""
import importlib.util, math, re, sys
from pathlib import Path
import numpy as np
from PIL import Image

here = Path(__file__).parent
def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), here / name)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
t = load('half-shrug-sc-trace.py'); d1 = load('dive-trace.py')

MASTER_EYES = ((336.45, 371.25), (688.25, 371.25))
NECK = 16  # 头右上方让出的像素（草图 1024 宽）
RIM = 14

def main(png, sit_svg, out_svg):
    a = np.asarray(Image.open(png).convert('RGB')).astype(int)
    cls = np.argmin(((a[:, :, None, :] - d1.PAL[None, None]) ** 2).sum(-1), axis=2)
    BG, MUZ, BELLY, FUR, INK = range(5)
    sil = d1.fill_holes(t.disk_op(t.disk_op(cls != BG, 4, 'dilate'), 4, 'erode'))
    sil = max(t.components(sil), key=lambda c: c[0])[1]
    ink = sorted(((n, m) for n, m in t.components(cls == INK) if n > 60), key=lambda c: -c[0])
    eyes = []
    for n, m in ink[1:3]:
        ys, xs = np.nonzero(m); eyes.append((xs.mean(), ys.mean()))
    (x0, y0), (x1, y1) = sorted(eyes)
    k = math.hypot(x1 - x0, y1 - y0) / (MASTER_EYES[1][0] - MASTER_EYES[0][0])
    deg = math.degrees(math.atan2(y1 - y0, x1 - x0))
    ex, ey = (x0 + x1) / 2, (y0 + y1) / 2
    # 挖头
    H, W = sil.shape
    yy, xx = np.mgrid[0:H, 0:W]
    # 母版头大致是个椭圆：心 (512, 400)，横半径 390、竖半径 300（母版坐标，耳朵不算）；换到草图坐标
    cx, cy = ex + (512 - 512.35) * k, ey + (400 - 371.25) * k
    rx, ry = 390 * k, 300 * k
    def ell(g):
        return ((xx - cx) / (rx + g)) ** 2 + ((yy - cy) / (ry + g)) ** 2 < 1
    cut = ell(0)
    # 头的右上方再让出 NECK 像素，后背在那里和头分开，露出颈窝
    upper_right = (yy < cy - 0.12 * ry) & (xx > cx - 0.2 * rx)
    cut = cut | (ell(NECK) & upper_right)
    # 草图自己的左耳在母版头外面一点，会和母版的耳朵叠成双包，一并挖掉
    cut = cut | (ell(70) & (xx < cx - 0.5 * rx) & (yy < cy + 0.35 * ry))
    body = sil & ~cut
    body = max(t.components(body), key=lambda c: c[0])[1]
    inner = t.disk_op(sil, RIM, 'erode')
    belly = t.disk_op(t.disk_op(cls == BELLY, 3, 'erode'), 3, 'dilate')
    parts = [m for n, m in t.components(belly & inner & ~cut) if n > 300]
    # 母版头
    s = Path(sit_svg).read_text()
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    i = s.index('<g transform="translate(392.9 -7.8) scale(0.3261)">')
    head = s[i:s.rindex('</g>') + 4]
    head = re.sub(r'^<g transform="[^"]*">', '', head)[:-4]
    head = head.replace('<clipPath id="f6-chin"><rect x="-200" y="-200" width="1500" height="880"/></clipPath>',
        '<clipPath id="dive-chin"><rect x="-200" y="-200" width="1500" height="700"/><ellipse cx="512" cy="470" rx="400" ry="262"/></clipPath>')
    head = head.replace('url(#f6-chin)', 'url(#dive-chin)')
    mc = ((MASTER_EYES[0][0] + MASTER_EYES[1][0]) / 2, MASTER_EYES[0][1])
    ys, xs = np.nonzero(sil); pad = 16
    vb = (xs.min() - pad, ys.min() - pad, xs.max() - xs.min() + 2 * pad, ys.max() - ys.min() + 2 * pad)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{' '.join(str(int(v)) for v in vb)}">
<!-- 潜水第二版（2026-11-17，提案 · 单一来源）：草图 image-review-2026-11-17/dive/D1-1.png 描身子，头是坐石全身像的整颗头。
四色平涂，无描边、无渐变。由 scripts/brand/dive-trace2.py 生成。 -->
<title>獭獭 · 潜水</title>
<path id="body" d="{d1.trace(body)}" fill="#72BFA4"/>
<path id="belly" d="{' '.join(d1.trace(m) for m in parts)}" fill="#DDF1E8"/>
<g id="head" transform="translate({ex:.2f} {ey:.2f}) rotate({deg:.2f}) scale({k:.4f}) translate({-mc[0]} {-mc[1]})">{head}</g>
</svg>
'''
    Path(out_svg).write_text(svg)
    print('k', round(k, 4), 'deg', round(deg, 2), 'eyes', (round(ex), round(ey)))

if __name__ == '__main__':
    main(*sys.argv[1:4])
