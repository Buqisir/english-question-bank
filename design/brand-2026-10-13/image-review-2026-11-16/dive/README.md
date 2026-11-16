# 潜水姿势草图（2026-11-16）

状态：提案 · 单一来源（BRAND.md 第 127 条）。图像生成的草图只用来定身子的姿势；定稿描成矢量，脸用头像母版。

参考图 `source-otter-sit.png` 是现在的坐石全身像（`mascot/otter-sit.svg`）渲染图。图像编辑接口，1024×1024，quality medium，共 4 次生成。

| 稿 | 想要的 | 看到的（目测） | 判断 |
| --- | --- | --- | --- |
| A | 两爪收胸口，侧身 | 斜度太平（约 25°），脸侧过去，后脚上多一块深色阴影 | 不用 |
| B | 一只爪往前伸，像要去摸 | 脸和品牌脸一致；伸出的那条胳膊太长，像人的手臂 | 不用 |
| B2 | 伸爪改短 | 胳膊还是偏长，后脚又出了深色阴影 | 不用 |
| C | 两爪收胸口，约 45° 陡潜 | 最干净：斜度对，带趾的后脚和扁尾清楚，没有阴影块 | 照它描 |

描法见 `scripts/brand/dive-trace.py`：剪影整块雾薄荷，肚皮浅雾薄荷四周留 14 像素雾薄荷（留 6 像素读成一道描边，试过不用），脸换成头像母版缩到 0.9 往右上挪一点，裁在头里。成品 `mascot/otter-dive-2026-11-16.svg`。

## 提示词原文

共用开头：

The attached image is a flat vector mascot: an adult mint green sea otter. Redraw this SAME character in the SAME clean flat vector style: crisp hard edges, NO glow, NO blur, NO halo, NO shadow, NO outlines, NO gradients, NO texture, pure white background, no text, no water, no plants, no rock. Keep exactly: head shape, two small round ears, mint-white muzzle patch with the notch, two small ink-black dot eyes, wide ink-black nose, three whisker dots per cheek, NO mouth line, the pale mint belly, the colours (#72BFA4 fur, #DDF1E8 pale mint belly, #F2FAF6 muzzle, #191D18 ink). Adult proportions, calm and capable, not childish. NEW POSE: the otter is swimming underwater, diving head-first down toward the LOWER LEFT, seen from the side (three-quarter side view), body long and streamlined along a diagonal from upper right to lower left, at about 35 degrees.

A：Front paws tucked close against the chest. Hind feet with visible webbed toes and the short flat tapered tail trail behind at the upper right, kicking. The face is turned slightly toward the viewer so both eyes and the wide nose are clearly visible. The pale belly shows as a band along the underside. Clearly an otter, not a seal: round head with ears, muzzle patch, webbed hind feet, thick tail.

B：One front paw reaches forward ahead of the nose as if about to pick something up from the sea floor, the other paw tucked at the chest. Hind feet with visible webbed toes and the short flat tapered tail trail behind at the upper right. Face turned slightly toward the viewer so both eyes and the wide nose are visible. Clearly an otter, not a seal: round head with ears, muzzle patch, webbed hind feet, thick tail.

B2：One front arm reaches a little forward, SHORT and natural, the paw just in front of and below the chin, as if about to pick something up from the sea floor; the other paw tucked at the chest. Arms are short like a real sea otter's, never long or stretched. Hind feet with visible webbed toes and the short flat tapered tail trail behind at the upper right. The head faces the viewer in three-quarter view so both eyes and the wide nose are clearly visible, same face as the reference. Clearly an otter, not a seal. Single flat colours, no darker shading patches anywhere.

C：Both front paws tucked close against the chest. The dive is steep, about 45 degrees. Hind feet with visible webbed toes and the short flat tapered tail trail behind at the upper right. The head faces the viewer in three-quarter view so both eyes and the wide nose are clearly visible, same face as the reference. Clearly an otter, not a seal. Single flat colours, no darker shading patches anywhere.
