"""3D 母版高清版去白底（2026-11-16，BRAND.md 第 128 条，提案 · 单一来源）。

用法：python3 -I scripts/brand/promo-3d-cutout.py <白底 png> <输出透明 png> [补边像素=120] [参考母版 png] [中值滤波边长=0]
图像编辑接口的这个模型不出透明底，所以先出纯白底，再抠：
  1. 从四边往里灌：接近白（三个通道都 ≥ 246）的像素算底。脸斑、肚皮被雾薄荷围着，灌不进去。
  2. 抗锯齿带：獭獭外沿往里 4 像素（渲染的最外一圈偏白）加往外 3 像素。透明度按「离白多远 / 里面最近那个像素离白多远」算，颜色换成里面最近那个像素的颜色，
     免得放到深色底上出一圈白边。
  3. 按獭獭外框裁，四周补同样宽的透明边。
  4. 给了参考母版（illustration/promo-3d/otter-3d.png）就校色：在两张图上各取墨（最暗）、毛色（绿）和脸斑（最亮）的中位数当三个锚点，
     逐通道分段线性映射到母版的值（只用两个锚点时，墨被外推成棕色）。新出的图整体比母版亮一点，不校会和开屏、横版放在一起时不一样。
  5. 中值滤波边长大于 0 时，只对獭獭身上做中值滤波，压掉生成时带出来的细颗粒（§4.8：3D 版不加纹理）。
"""
import sys

import numpy as np

INSET = 4
from PIL import Image


def shift(m, dy, dx):
    out = np.zeros_like(m)
    h, w = m.shape[:2]
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = m[max(0, -dy):h + min(0, -dy), max(0, -dx):w + min(0, -dx)]
    return out


def anchors(rgb, mask):
    c = rgb[mask]
    s, g = c.sum(1), c[:, 1] - c[:, 0]
    return np.median(c[s < 150], 0), np.median(c[(g > 50) & (s > 350)], 0), np.median(c[s > 720], 0)


def main(src, dst, pad=120, ref_png=None, median=0):
    a = np.asarray(Image.open(src).convert('RGB')).astype(float)
    h, w, _ = a.shape
    white = a.min(2) >= 246
    bg = np.zeros((h, w), bool)
    bg[0, :] = white[0, :]; bg[-1, :] = white[-1, :]; bg[:, 0] = white[:, 0]; bg[:, -1] = white[:, -1]
    while True:  # 四连通灌水，按整张图迭代膨胀
        grown = bg | ((shift(bg, 1, 0) | shift(bg, -1, 0) | shift(bg, 0, 1) | shift(bg, 0, -1)) & white)
        if (grown == bg).all():
            break
        bg = grown
    fig = ~bg
    core = fig.copy()
    for _ in range(INSET):  # 獭獭最外一圈渲染偏白，也算进抗锯齿带：参考色从往里缩 INSET 像素的地方取
        core = core & shift(core, 1, 0) & shift(core, -1, 0) & shift(core, 0, 1) & shift(core, 0, -1)
    rgb = a.copy()
    known = core.copy()
    alpha = core.astype(float)
    for _ in range(INSET + 3):  # 抗锯齿带：往外一圈一圈取里面最近的颜色
        ring = np.zeros((h, w), bool)
        acc = np.zeros_like(a)
        cnt = np.zeros((h, w))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            k = shift(known, dy, dx)
            acc += shift(rgb * known[..., None], dy, dx)
            cnt += k
            ring |= k
        ring &= ~known
        ref = acc[ring] / cnt[ring][:, None]
        dist_px = 765 - a[ring].sum(1)
        dist_ref = np.maximum(765 - ref.sum(1), 1)
        alpha[ring] = np.clip(dist_px / dist_ref, 0, 1)
        alpha[ring & fig] = np.maximum(alpha[ring & fig], np.clip(dist_px / dist_ref, 0, 1)[fig[ring]])
        rgb[ring] = ref
        known |= ring
    if median:
        from PIL import ImageFilter
        sm = np.asarray(Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(median))).astype(float)
        inner = core.copy()
        for _ in range(median):
            inner = inner & shift(inner, 1, 0) & shift(inner, -1, 0) & shift(inner, 0, 1) & shift(inner, 0, -1)
        rgb[inner] = sm[inner]
    if ref_png:
        r = np.asarray(Image.open(ref_png).convert('RGBA')).astype(float)
        dst_a, src_a = anchors(r[..., :3], r[..., 3] > 250), anchors(rgb, core)
        for ch in range(3):  # 每个通道按 0、墨、毛色、脸斑、255 分段线性插值
            xs = [0, *(a[ch] for a in src_a), 255]
            ys = [0, *(a[ch] for a in dst_a), 255]
            rgb[..., ch] = np.interp(rgb[..., ch], xs, ys)
        print('校色 墨/毛色/脸斑', [a.round().tolist() for a in src_a], '→', [a.tolist() for a in dst_a])
    ys, xs = np.nonzero(alpha > 0.02)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    out = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)[y0:y1, x0:x1]
    canvas = np.zeros((y1 - y0 + 2 * pad, x1 - x0 + 2 * pad, 4), np.uint8)
    canvas[pad:pad + y1 - y0, pad:pad + x1 - x0] = out
    Image.fromarray(canvas, 'RGBA').save(dst, optimize=True)
    print(dst, canvas.shape[1], 'x', canvas.shape[0])


if __name__ == '__main__':
    args = sys.argv[1:]
    main(args[0], args[1], int(args[2]) if len(args) > 2 else 120, args[3] if len(args) > 3 else None, int(args[4]) if len(args) > 4 else 0)
