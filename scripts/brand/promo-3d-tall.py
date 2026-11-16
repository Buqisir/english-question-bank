"""3D 竖版 1080×1440 的画（2026-11-16，BRAND.md 第 128 条，提案 · 单一来源）。

用法：python3 -I scripts/brand/promo-3d-tall.py <生成的 1536×2048 png> <输出 jpg>
  1. 天抹平：从上边往下灌，和雾白 #F2FAF6 每个通道差不到 14 的像素都换成纯雾白（生成的天有一点斑驳，开屏、横版的天都是纯雾白）。
     獭獭的脸斑被雾薄荷围着，灌不进去。
  2. 整张往下挪 SHIFT 像素，上面补雾白，下面裁掉一截巨藻：字照平面竖版排在左上（口号 96px 两行），不挪会压到獭獭的头。
  3. 存 1536×2048 的 jpg，排版时按 cover 缩到 1080×1440；要印大一点的海报也用这张。
"""
import sys

import numpy as np
from PIL import Image

SKY = np.array([0xF2, 0xFA, 0xF6])
SHIFT = 160


def main(src, dst):
    a = np.asarray(Image.open(src).convert('RGB')).astype(int)
    h, w, _ = a.shape
    near = (np.abs(a - SKY).max(2) < 14)
    sky = np.zeros((h, w), bool)
    sky[0] = near[0]
    for y in range(1, h):  # 逐行往下灌（左右也连通）
        row = near[y] & sky[y - 1]
        while True:
            grown = row | (near[y] & (np.roll(row, 1) | np.roll(row, -1)))
            if (grown == row).all():
                break
            row = grown
        sky[y] = row
        if not row.any():
            break
    a[sky] = SKY
    out = np.empty_like(a)
    out[:SHIFT] = SKY
    out[SHIFT:] = a[:h - SHIFT]
    Image.fromarray(out.astype(np.uint8)).save(dst, quality=92)
    print(dst, '天抹平', int(sky.sum()), '像素', '最低到第', int(np.nonzero(sky.any(1))[0].max()), '行')


if __name__ == '__main__':
    main(*sys.argv[1:3])
