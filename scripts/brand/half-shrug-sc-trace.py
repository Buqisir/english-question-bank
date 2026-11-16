"""半身像「没找到」摊手：从草图 SC-shrug 原图（1024×1024 PNG）里描出两只手臂连爪，写成 SVG 路径。

只用标准库 + numpy + Pillow。
用法：python3 scripts/brand/half-shrug-sc-trace.py <SC 原图 png> <现在半身在同一画布上的渲染 png> <输出 json>
  - 第二张图是把 mascot/states/half-not-found.svg 放在 1024 画布正中、按 820×820 渲染出来的（和生成草图时的参考图同一种放法），
    用来拿到现在半身的身体轮廓，只描身体外面多出来的那部分手臂。
  - 像素坐标换回 SVG 坐标：svg_x = 294 + (px - 228.7 - DX) / 1.14685，svg_y = 12 + (py - 102 - DY) / 1.14685。
    DX、DY 是用眼睛、鼻子的重心核对出来的偏移，两张图差不到 0.3 像素，所以取 0。
做法：
  1. 草图里「身体色」（含肘上那块深色阴影）按颜色阈值抠出来：G - R > 38。阴影也算身体色，出图时一律填 #72BFA4。
  2. 只看手臂那一带（左：px x < 445，右：px x > 640；y 440～650），去掉现在半身已经有的部分，剩下的就是身体外沿外面的手臂。
     开运算（半径 3）去掉身体外沿上草图和现在轮廓不重合留下的细条。
  3. 手臂往身体里多吃进 8 像素（只吃身体色，不碰肚皮），这样手臂和身体接得上、不露缝；吃进去的部分和身体同色，看不出来。
  4. 沿像素边界描出外轮廓，高斯平滑，按 0.9 像素容差删点，最后用 Catmull-Rom 转成三次贝塞尔。
"""
import json
import sys

import numpy as np
from PIL import Image

DX, DY = 0.0, 0.0
SIGMA, EPS = 3.5, 1.3  # 平滑（像素）和删点容差（像素）
S = 1.14685


def to_svg(px, py):
    return 294 + (px - 228.7 - DX) / S, 12 + (py - 102 - DY) / S


def rgb(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(int)


def disk_op(m, r, op):
    out = m.copy()
    h, w = m.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            sh = np.zeros_like(m)
            ys0, ys1 = max(0, dy), min(h, h + dy)
            xs0, xs1 = max(0, dx), min(w, w + dx)
            sh[ys0:ys1, xs0:xs1] = m[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
            out = (out | sh) if op == 'dilate' else (out & sh)
    return out


def components(m):
    """四连通标记，返回 [(面积, 掩码)]。"""
    lab = np.zeros(m.shape, int)
    comps = []
    ys, xs = np.nonzero(m)
    n = 0
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        lab[y0, x0] = n
        cnt = 0
        while stack:
            y, x = stack.pop()
            cnt += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    stack.append((yy, xx))
        comps.append((cnt, lab == n))
    return comps


def outline(m):
    """沿像素边界走一圈外轮廓（单块、无洞），返回像素角点坐标序列。"""
    h, w = m.shape
    p = np.zeros((h + 2, w + 2), bool)
    p[1:-1, 1:-1] = m
    # 有向边：让形状在左手边。key 起点 -> 终点
    nxt = {}
    ys, xs = np.nonzero(p)
    for y, x in zip(ys, xs):
        if not p[y - 1, x]:
            nxt[(x + 1, y)] = (x, y)          # 上边，从右往左
        if not p[y + 1, x]:
            nxt[(x, y + 1)] = (x + 1, y + 1)  # 下边，从左往右
        if not p[y, x - 1]:
            nxt[(x, y)] = (x, y + 1)          # 左边，从上往下
        if not p[y, x + 1]:
            nxt[(x + 1, y + 1)] = (x + 1, y)  # 右边，从下往上
    start = min(nxt)
    pts = [start]
    cur = nxt[start]
    while cur != start:
        pts.append(cur)
        cur = nxt[cur]
    return [(x - 1, y - 1) for x, y in pts]  # 去掉补边


def smooth(pts, sigma=2.0):
    a = np.array(pts, float)
    n = len(a)
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = np.zeros_like(a)
    for i, kv in enumerate(k):
        out += kv * np.roll(a, i - r, axis=0)
    return out


def rdp(a, eps):
    if len(a) < 3:
        return a
    s, e = a[0], a[-1]
    d = e - s
    L = np.hypot(*d) or 1.0
    dist = np.abs(d[0] * (a[:, 1] - s[1]) - d[1] * (a[:, 0] - s[0])) / L
    i = int(np.argmax(dist))
    if dist[i] > eps:
        return np.vstack([rdp(a[:i + 1], eps)[:-1], rdp(a[i:], eps)])
    return np.vstack([s, e])


def closed_rdp(a, eps):
    # 从离第一个点最远的点切开，分两段做
    j = int(np.argmax(np.hypot(*(a - a[0]).T)))
    p1 = rdp(a[:j + 1], eps)
    p2 = rdp(np.vstack([a[j:], a[:1]]), eps)
    return np.vstack([p1[:-1], p2[:-1]])


def to_path(P):
    f = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')
    n = len(P)
    d = f'M{f(P[0][0])} {f(P[0][1])}'
    for i in range(n):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6
        c2 = p2 - (p3 - p1) / 6
        d += f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}'
    return d + 'Z'


def main(sc_png, base_png, out_json):
    sc, base = rgb(sc_png), rgb(base_png)
    sc_mint = (sc[..., 1] - sc[..., 0]) > 38
    base_mint = (base[..., 1] - base[..., 0]) > 38
    base_sil = base.sum(2) < 740
    base_pale = ((base[..., 1] - base[..., 0]) <= 38) & (base.sum(2) < 740)
    base_body = base_sil & ~disk_op(base_pale, 2, 'dilate')  # 现在半身的身体色，连带边上的抗锯齿像素，离肚皮留 2 像素
    H, W = sc_mint.shape
    yy, xx = np.mgrid[0:H, 0:W]
    band = (yy >= 440) & (yy <= 650)
    near24 = disk_op(base_sil, 24, 'dilate')
    res = {}
    for side, zone in (('left', band & (xx < 445)), ('right', band & (xx > 640))):
        near = disk_op(base_sil, 3, 'dilate')
        a = sc_mint & zone & ~near  # 离现在的身体 3 像素以内的不算手臂：那是草图和现在轮廓没对齐的细条
        a = disk_op(disk_op(a, 3, 'erode'), 3, 'dilate')  # 开运算，去细条
        comps = sorted(components(a), key=lambda c: -c[0])
        arm = comps[0][1]
        # 往回长：往身体里长 10 像素（只吃身体色，不吃身体外沿的抗锯齿像素，免得手臂边和身体边叠在一起出浅色细缝）；
        # 手臂根部贴着身体的那 3 像素和身体外沿的抗锯齿像素只从手臂边上补 3～4 像素，接上不露缝，
        # 又不把草图身体比现在宽出来的细条（腋窝上方那段）带进来
        grow = (disk_op(arm, 10, 'dilate') & zone & base_mint & sc_mint) \
            | (disk_op(arm, 4, 'dilate') & sc_mint & zone & near & ~base_sil) \
            | (disk_op(arm, 3, 'dilate') & zone & base_body)
        shape = arm | grow
        shape = max(components(shape), key=lambda c: c[0])[1]
        pts = outline(shape)
        sm = smooth(pts, SIGMA)
        simp = closed_rdp(sm, EPS)
        # 腋窝修顺：草图身体在腋窝上方比现在宽几像素，描出来的手臂上沿会在那里多出一个小台阶。
        # 找到腋窝（离身体外沿 24 像素以内、在身体外面的点里最低的那个），把它上方离身体 24 像素以内、又在身体外面的点删掉，
        # 让手臂上沿从腋窝直接顺到身体外沿上。
        ins = lambda q: base_sil[min(H - 1, int(q[1])), min(W - 1, int(q[0]))]
        cy = simp[:, 1].mean()
        cand = [i for i, q in enumerate(simp) if not ins(q) and near24[int(q[1]), int(q[0])] and q[1] < cy + 30]
        if cand:
            apex = max(cand, key=lambda i: simp[i][1])
            drop = {i for i in cand if simp[i][1] < simp[apex][1] - 2 and not ins(simp[i])}
            simp = np.array([q for i, q in enumerate(simp) if i not in drop])
            res_drop = len(drop)
        else:
            res_drop = 0
        svg = np.array([to_svg(x, y) for x, y in simp])
        ys_, xs_ = np.nonzero(arm)
        res[side] = {
            'd': to_path(svg),
            'points': len(simp),
            'dropped_near_armpit': res_drop,
            'px_bbox_outside_body': [int(xs_.min()), int(ys_.min()), int(xs_.max()) + 1, int(ys_.max()) + 1],
            'svg_x_range': [round(float(svg[:, 0].min()), 1), round(float(svg[:, 0].max()), 1)],
            'svg_y_range': [round(float(svg[:, 1].min()), 1), round(float(svg[:, 1].max()), 1)],
        }
    json.dump(res, open(out_json, 'w'), ensure_ascii=False, indent=1)
    for k, v in res.items():
        print(k, v['points'], 'drop', v['dropped_near_armpit'], 'x', v['svg_x_range'], 'y', v['svg_y_range'])


if __name__ == '__main__':
    main(*sys.argv[1:4])
