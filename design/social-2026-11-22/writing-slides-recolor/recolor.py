import sys, numpy as np
from PIL import Image
from scipy import ndimage
src, dst, newhex = sys.argv[1], sys.argv[2], sys.argv[3]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = im.shape
old = im[20, 20].copy()
new = np.array([int(newhex[i:i+2], 16) for i in (1, 3, 5)], np.float32)
# cards: big near-white components, holes filled
white = (im.min(axis=2) >= 252)
lab, n = ndimage.label(white)
sizes = ndimage.sum(white, lab, range(1, n + 1))
card = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 0.02 * H * W])
card = ndimage.binary_fill_holes(card)

# weight: how much of the pixel is background (dark ink -> 0, bg -> 1)
L = im.mean(axis=2); Lbg = old.mean(); Link = 20.0
w = np.clip((L - Link) / (Lbg - Link), 0, 1)[..., None]
out = im + (new - old) * w
out = np.where(card[..., None], im, out)
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst)
print(src, 'old', old, 'cards', int(card.sum()))
