// 獭獭出场动效（BRAND.md §4.6）。一次出场只演一个动作，演完就停，不循环。
// 部件靠 SVG 上的 data-otter 标记找：stone / stone-paw（01 的石头和右爪）、eye（两只眼睛）。
// 时长取 DESIGN.md §6 的动效 token（app/src/index.css），每一段都在 300ms 以内。
// 减少动态效果时什么都不演，直接是最后那一帧。再演一次时先取消正在演的，不排队。
(function () {
  const T = { micro: 80, fast: 120, base: 160, slow: 220, entrance: 260 };
  const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'; // --ease-out：入场、位移
  // 和「正在想」同一条：缓入缓出、不回弹。不是 DESIGN token，是獭獭自己的节奏（§4.6「起得慢、停得稳」）。
  const EASE_OTTER = 'cubic-bezier(0.45, 0, 0.55, 1)';
  const BEAT = 300; // 出场先停一拍再动

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cancel = (els) => els.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));

  // 01 空闲：右爪带着石头绕左爪托住的那一点转过去、再转回来，一次。
  // 石头外面包着一层用肚皮裁切的组（左爪是肚皮上的洞），转的时候不会盖到左爪。
  function turnStone(svg, { angle = -10 } = {}) {
    const parts = [...svg.querySelectorAll('[data-otter="stone"], [data-otter="stone-paw"]')];
    cancel(parts);
    if (reduced() || !parts.length) return [];
    const turn = T.slow, hold = T.fast, total = turn * 2 + hold;
    const keys = [
      { transform: 'rotate(0deg)', easing: EASE_OTTER },
      { transform: `rotate(${angle}deg)`, offset: turn / total },
      { transform: `rotate(${angle}deg)`, offset: (turn + hold) / total, easing: EASE_OTTER },
      { transform: 'rotate(0deg)' },
    ];
    return parts.map((el) => el.animate(keys, { duration: total, delay: BEAT }));
  }

  // 眨一次眼：眼睛压扁再张开。只给自己没有动作的图（浮姿 P、裹藻仰躺、直立场景）当出场。
  function blink(svg, { delay = BEAT * 2 } = {}) {
    const eyes = [...svg.querySelectorAll('[data-otter="eye"]')];
    cancel(eyes);
    if (reduced() || !eyes.length) return [];
    const close = T.micro, open = T.fast;
    const keys = [
      { transform: 'scaleY(1)', easing: 'ease-in' },
      { transform: 'scaleY(0.1)', offset: close / (close + open), easing: 'ease-out' },
      { transform: 'scaleY(1)' },
    ];
    return eyes.map((el) => el.animate(keys, { duration: close + open, delay }));
  }

  // 探头浮上来：03 待确认、05 没找到、登录页 SL。卡片边就是水面（第 31 条）。
  // back 是整只、只露卡片边以上；front 是同一张图、只露卡片边以下（越过边的爪和手里的东西）。
  // front 要从卡片边上 2px 开始裁，盖住卡片外圈的发丝边，不然那道线横穿爪子；overhang 照这个多算 2px。
  // 先整只从边后面浮上来，快到位时两只爪从边上搭下来。
  // 浮上来不用 --ease-out：它前 80ms 就走完九成，一百多 px 的距离像弹出来；缓入缓出是头顶先慢慢露出来，再稳稳停住。
  function surface({ back, front, edge, overhang }) {
    const b = back.firstElementChild, f = front.firstElementChild;
    cancel([b, f]);
    if (reduced()) return [];
    const rise = T.entrance, paws = T.fast;
    return [
      b.animate([{ transform: `translateY(${edge + 2}px)` }, { transform: 'none' }], { duration: rise, easing: EASE_OTTER }),
      f.animate([{ transform: `translateY(${-overhang}px)` }, { transform: 'none' }], {
        duration: paws, delay: rise - T.micro, easing: EASE_OUT, fill: 'backwards',
      }),
    ];
  }

  window.OtterMotion = { turnStone, blink, surface, T };
})();
