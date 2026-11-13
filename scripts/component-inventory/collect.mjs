// 构件清点 · 在页面里跑的收集函数（render.mjs 和 seeds.mjs 共用）。

// ---------------- 页面里跑的收集函数 ----------------
export function collectInPage({ scenario, width }) {
  const KW = /(notice|toast|undo|empty|chip|pill|tag|badge|card|row|item|menu|dialog|modal|drawer|popover|banner|error|alert|hint|warning|skeleton|loading|spinner|field|search|input|tab|seg|panel|board|sheet|tile|callout|suggestion|tip|status|toggle|switch)/i
  const INTERACTIVE = 'button,a[href],a[role],input:not([type=hidden]),textarea,select,summary,[role=button],[role=menuitem],[role=menuitemradio],[role=tab],[role=switch],[role=checkbox],[role=radio],[role=option],[tabindex]:not([tabindex="-1"])'
  const ROLES = /^(dialog|alertdialog|menu|listbox|status|alert|tooltip|group|region|log|search|tablist)$/
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1] }
  const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a) }
  const effBg = (el) => { const chain = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) chain.push(parse(getComputedStyle(e).backgroundColor)); let c = [255, 255, 255, 1]; for (let i = chain.length - 1; i >= 0; i--) c = over(chain[i], c); return c.map((v, i) => (i < 3 ? Math.round(v) : 1)) }
  const effOpacity = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o }
  const fixedAnc = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return p } return null }
  const nameOf = (el) => {
    const al = el.getAttribute('aria-label'); if (al) return al.trim()
    const lb = el.getAttribute('aria-labelledby'); if (lb) return lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim()
    if (el.id && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return l.textContent.trim() }
    const wrap = el.closest('label'); if (wrap && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return wrap.textContent.trim()
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) return el.getAttribute('title') || '' // 占位符不算名字
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim(); if (t) return t.slice(0, 80)
    const img = el.querySelector('img[alt],svg title'); if (img) return (img.getAttribute('alt') || img.textContent || '').trim()
    return el.getAttribute('title') || ''
  }
  const out = []
  let n = 0
  for (const el of document.querySelectorAll('[data-inv]')) {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const op = effOpacity(el); if (op < 0.05) continue
    const cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '')
    const role = el.getAttribute('role') || ''
    const interactive = el.matches(INTERACTIVE)
    const bg = parse(cs.backgroundColor)
    const parentBg = el.parentElement ? effBg(el.parentElement) : [255, 255, 255, 1]
    const own = effBg(el)
    const bgPainted = bg[3] > 0.02 && own.slice(0, 3).some((v, i) => Math.abs(v - parentBg[i]) > 1)
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => [parseFloat(cs[`border${s}Width`]), cs[`border${s}Style`], cs[`border${s}Color`]])
    const borderPainted = sides.some(([w, st, c]) => w > 0 && st !== 'none' && parse(c)[3] > 0.02)
    const shadowPainted = cs.boxShadow !== 'none'
    const painted = bgPainted || borderPainted || shadowPainted || cs.backgroundImage !== 'none'
    const kw = KW.test(cls) || KW.test(el.id || '')
    const semantic = ROLES.test(role) || el.hasAttribute('aria-live') || el.tagName === 'DIALOG' || el.hasAttribute('aria-modal')
    if (!(interactive || painted || kw || semantic)) continue
    const hasText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
    const svg = el.querySelector(':scope > svg, :scope > span > svg, :scope > img')
    const textAll = (el.innerText || '').trim()
    el.setAttribute('data-inv-n', String(n))
    out.push({
      n: n++, inv: el.getAttribute('data-inv'), tag: el.tagName.toLowerCase(), cls: cls.slice(0, 160), id: el.id || undefined, role: role || undefined,
      type: el.getAttribute('type') || undefined, icon: svg ? (textAll ? 'icon+text' : 'icon-only') : 'none', text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60), name: nameOf(el), hasText,
      rect: { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      interactive, painted, bgPainted, borderPainted, shadowPainted, kw, semantic,
      // 拍照时鼠标停在上面或焦点在它身上：这时的样子是状态，不算一种写法
      hovered: el.matches(':hover') || undefined, focused: el === document.activeElement || undefined, focusVisible: el.matches(':focus-visible') || undefined, opacity: Math.round(op * 100) / 100, fixed: fixedAnc(el),
      inline: cs.display.startsWith('inline') && !!el.parentElement && [...el.parentElement.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()),
      effBg: own, parentBg,
      st: {
        bg: cs.backgroundColor, bgImage: cs.backgroundImage === 'none' ? 'none' : (cs.backgroundImage.includes('gradient') ? 'gradient' : 'url'),
        border: sides.map(([w, st, c]) => (w > 0 && st !== 'none' ? `${w}px ${st} ${c}` : 'none')),
        radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
        shadow: cs.boxShadow, outline: cs.outlineStyle === 'none' ? 'none' : `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} @${cs.outlineOffset}`,
        color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, deco: cs.textDecorationLine, textTransform: cs.textTransform,
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft], height: cs.height, width: cs.width, minHeight: cs.minHeight,
        display: cs.display, position: cs.position, cursor: cs.cursor, zIndex: cs.zIndex, transition: cs.transitionDuration, gap: cs.gap,
      },
      state: {
        disabled: el.disabled === true || undefined, ariaDisabled: el.getAttribute('aria-disabled') || undefined, pressed: el.getAttribute('aria-pressed') || undefined,
        selected: el.getAttribute('aria-selected') || undefined, current: el.getAttribute('aria-current') || undefined, expanded: el.getAttribute('aria-expanded') || undefined,
        busy: el.getAttribute('aria-busy') || undefined, invalid: el.getAttribute('aria-invalid') || undefined, checked: el.checked === true || undefined,
        dataState: el.getAttribute('data-state') || undefined, dataVisible: el.getAttribute('data-visible') || undefined, ariaLive: el.getAttribute('aria-live') || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
      },
      scenario, width,
    })
  }
  return out
}
export function styleOf(n) {
  const el = document.querySelector(`[data-inv-n="${n}"]`); if (!el) return null
  const cs = getComputedStyle(el)
  return { bg: cs.backgroundColor, border: ['Top', 'Right', 'Bottom', 'Left'].map((s) => `${cs[`border${s}Width`]} ${cs[`border${s}Style`]} ${cs[`border${s}Color`]}`).join('|'),
    shadow: cs.boxShadow, outline: cs.outlineStyle === 'none' ? 'none' : `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} @${cs.outlineOffset}`,
    color: cs.color, deco: cs.textDecorationLine, transform: cs.transform, opacity: cs.opacity }
}

export function probeTokens() {
  const root = getComputedStyle(document.documentElement)
  const names = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules] } catch { return [] } })
    .filter((r) => r.selectorText === ':root').flatMap((r) => [...r.style]).filter((n) => n.startsWith('--'))
  const probe = document.createElement('div'); document.body.appendChild(probe)
  const out = { colors: {}, shadows: {}, raw: {} }
  for (const n of [...new Set(names)].sort()) {
    const v = root.getPropertyValue(n).trim(); out.raw[n] = v
    probe.style.color = ''; probe.style.color = `var(${n})`; const c = getComputedStyle(probe).color
    if (probe.style.color && /#|rgb|hsl/.test(v) && !/\d+px/.test(v)) out.colors[n] = c
    probe.style.boxShadow = 'none'; probe.style.boxShadow = `var(${n})`; const sh = getComputedStyle(probe).boxShadow
    if (/px/.test(v) && sh !== 'none') out.shadows[n] = sh
  }
  probe.remove(); return out
}

