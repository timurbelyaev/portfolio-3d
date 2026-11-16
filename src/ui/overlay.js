import './story.css'
import './hero.css'
import { BEATS, CHAPTERS, HALL, HERO, KEYS, NAV, SHEETS, TELEGRAM } from '../world/story.js'

const clamp01 = (x) => Math.min(Math.max(x, 0), 1)
const smooth = (x) => x * x * (3 - 2 * x)

function el(tag, cls, text) {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

// Split a title into word spans so each word can rise in on its own.
function words(node, text) {
  const spans = []
  text.split(' ').forEach((w, i, all) => {
    const span = el('span', 'w', w)
    node.append(span)
    if (i < all.length - 1) node.append(' ')
    spans.push(span)
  })
  return spans
}

const FADE = 0.2 // length of a beat's fade, in key-index units
// Hero copy column (left inset + text width + air), in hero units.
const COPY_U = 38
// Narrower screens stack the hero: copy centred on top, the picture below.
const STACK_BELOW = 1260

const px = (v) => `${v.toFixed(1)}px`

// Scenes the step buttons fly between: the hero, then every text beat. A beat
// is held at the middle of its range (fully faded in); the last one rests on
// the final key so the flight ends on the temple's facade.
const END = KEYS.length - 1
const STOPS = [
  { f: 0, label: `${HERO.first} ${HERO.last}` },
  ...BEATS.map(({ at: [a, z], stop, title }) => ({
    f: stop ?? (z > END ? END : (a + z) / 2),
    label: title.replace(/[.\s]+$/, ''),
  })),
]
// Stops closer than this to the current position count as "here".
const NEAR = 0.04
const RING = 2 * Math.PI * 22

const chevron = (up) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${up ? 'M6 14.5l6-6 6 6' : 'M6 9.5l6 6 6-6'}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`

// The whole 2D layer over the canvas: hero mask, text beats, navigation,
// progress rail and the detail sheet. Everything is driven by `f`, the same
// key-index position that drives the camera. `onFly(f)` scrolls there and
// returns the flight's duration in seconds.
export function createOverlay({ root, onJump, onFly, onSheet }) {
  // --- hero: a painted hall; the live world shows through the picture -------
  const hall = el('div', 'hall')
  const art = el('img', 'hall__art')
  art.src = HALL.src
  art.alt = ''
  art.decoding = 'async'
  const plate = el('a', 'hall__plate')
  plate.href = '#'
  plate.setAttribute('aria-label', 'Войти в картину')
  plate.append(
    el('span', 'hall__title', `«${HERO.plate.title}»`),
    el('span', 'hall__meta', HERO.plate.meta),
    el('span', 'hall__cue', HERO.cue),
    el('span', 'hall__line'),
  )
  plate.addEventListener('click', (e) => {
    e.preventDefault()
    // Same scene the "next" button lands on, so both entrances look alike.
    onJump(STOPS[1].f)
  })
  // Blurred copy of the hall behind the photo, wherever the photo stops short.
  const haze = el('div', 'hall__haze')
  const hazeArt = el('img', 'hall__haze-art')
  hazeArt.src = HALL.blur
  hazeArt.alt = ''
  haze.append(hazeArt)
  hall.append(haze, art, plate)

  const hero = el('section', 'hero')
  hero.setAttribute('aria-label', `${HERO.first} ${HERO.last}`)
  const intro = el('div', 'hero__intro')
  const status = el('p', 'hero__status')
  status.append(el('i'), HERO.status)
  const name = el('h1', 'hero__name')
  name.append(HERO.first, el('br'), el('span', '', HERO.last))
  const heroActions = el('div', 'hero__actions')
  const talk = el('a', 'hero__btn', HERO.cta.label)
  talk.href = HERO.cta.href
  talk.target = '_blank'
  talk.rel = 'noopener'
  const more = el('button', 'hero__link', HERO.more.label)
  more.type = 'button'
  more.addEventListener('click', () => onJump(HERO.more.f))
  heroActions.append(talk, more)
  const facts = el('ul', 'hero__facts')
  const laurel = (flip) =>
    `<svg class="laurel${flip ? ' laurel--r' : ''}" viewBox="0 0 14 36" aria-hidden="true"><g fill="none" stroke="#8f6c38" stroke-width="1"><path d="M11 2 Q2 18 11 34"/><ellipse cx="7.2" cy="8" rx="1.3" ry="3" transform="rotate(35 7.2 8)"/><ellipse cx="5.2" cy="14" rx="1.3" ry="3" transform="rotate(20 5.2 14)"/><ellipse cx="4.6" cy="20" rx="1.3" ry="3"/><ellipse cx="5.4" cy="26" rx="1.3" ry="3" transform="rotate(-20 5.4 26)"/><ellipse cx="7.6" cy="31" rx="1.3" ry="2.6" transform="rotate(-40 7.6 31)"/></g></svg>`
  for (const [a, b] of HERO.facts) {
    const li = el('li')
    li.innerHTML = laurel(false)
    const text = el('span')
    text.append(a, el('br'), b)
    li.append(text)
    li.insertAdjacentHTML('beforeend', laurel(true))
    facts.append(li)
  }
  // Availability sits with the call to action it qualifies, not above the name.
  intro.append(el('span', 'hero__rule'), status, name, el('p', 'hero__role', HERO.role), el('p', 'hero__lead', HERO.lead), heroActions, facts)
  hero.append(el('div', 'hero__veil'), intro)

  // Soft white-out while the camera is inside the cloud (hides a scene swap).
  const veil = el('div', 'veil')

  // --- navigation + progress --------------------------------------------------
  const top = el('header', 'top')
  const brand = el('div', 'top__brand')
  const mark = el('button', 'top__mark')
  mark.type = 'button'
  mark.setAttribute('aria-label', 'В начало')
  const logo = el('img')
  logo.src = `${import.meta.env.BASE_URL}ui/logo.webp`
  logo.alt = 'Т.Б.'
  logo.decoding = 'async'
  mark.append(logo)
  mark.addEventListener('click', () => onJump(0, `${HERO.first} ${HERO.last}`))
  brand.append(mark)
  const nav = el('nav', 'top__nav')
  const menu = el('button', 'top__menu', 'Меню')
  menu.type = 'button'
  const setMenu = (open) => {
    top.classList.toggle('is-open', open)
    menu.textContent = open ? 'Закрыть' : 'Меню'
  }
  menu.addEventListener('click', () => setMenu(!top.classList.contains('is-open')))
  const navItems = CHAPTERS.map((c) => {
    const b = el('button', '', c.label)
    b.type = 'button'
    b.addEventListener('click', () => {
      setMenu(false)
      onJump(c.f, c.label)
    })
    // The bar lists the main chapters only; the rest still count in the chip.
    if (NAV.includes(c.id)) nav.append(b)
    return { b, from: c.from, label: c.label }
  })
  top.append(brand, nav, menu)

  const rail = el('div', 'rail')
  const railFill = el('i')
  rail.append(railFill)

  // "Where am I": chapter number and name, bottom-left.
  const chip = el('div', 'chip')
  const chipNo = el('b')
  const chipName = el('span')
  chip.append(chipNo, chipName)
  let chapter = -2

  // Step buttons, bottom-right: fly to the previous / next scene. Mostly for
  // touch screens, where a long swipe through the flight is clumsy.
  const pager = el('nav', 'pager')
  pager.setAttribute('aria-label', 'Сцены')
  const hint = el('p', 'pager__hint')
  const hintKind = el('span', '', 'Далее')
  const hintName = el('b')
  hint.append(hintKind, hintName)
  const prev = el('button', 'pager__btn')
  prev.type = 'button'
  prev.setAttribute('aria-label', 'Предыдущая сцена')
  prev.innerHTML = chevron(true)
  const next = el('button', 'pager__btn pager__btn--next')
  next.type = 'button'
  next.setAttribute('aria-label', 'Следующая сцена')
  // The ring around "next" fills with the whole flight's progress.
  next.innerHTML = `<svg class="pager__ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22"/><circle class="pager__ring-fill" cx="24" cy="24" r="22" stroke-dasharray="${RING.toFixed(2)}" stroke-dashoffset="${RING.toFixed(2)}"/></svg>${chevron(false)}`
  const ringFill = next.querySelector('.pager__ring-fill')
  pager.append(hint, prev, next)

  let lastF = 0
  // While a flight runs, steps count from where it is heading, so quick taps
  // chain scene after scene instead of repeating the same one.
  let aim = null
  let aimUntil = 0
  const base = () => (aim !== null && performance.now() < aimUntil ? aim : lastF)
  const nextStop = (from) => STOPS.find((s) => s.f > from + NEAR)
  const prevStop = (from) => STOPS.findLast((s) => s.f < from - NEAR)
  function step(dir) {
    const to = dir > 0 ? nextStop(base()) : prevStop(base())
    // Past the last scene "next" turns into "back to the start" (a cut).
    if (!to && dir > 0) return onJump(0, STOPS[0].label)
    if (!to) return
    const seconds = onFly(to.f)
    aim = to.f
    aimUntil = performance.now() + seconds * 1000 + 150
  }
  prev.addEventListener('click', () => step(-1))
  next.addEventListener('click', () => step(1))
  let hintFor = null

  // --- beats ------------------------------------------------------------------
  const beatsRoot = el('div', 'beats')
  const beats = BEATS.map((def) => {
    // A centred line without an eyebrow is an opening statement: set a step larger.
    const statement = def.side === 'center' && !def.eyebrow
    const node = el('article', `beat beat--${def.side}${statement ? ' beat--statement' : ''}`)
    const inner = el('div', 'beat__inner')
    if (def.eyebrow) inner.append(el('p', 'beat__eyebrow', def.eyebrow))
    const title = el('h2', 'beat__title')
    const spans = words(title, def.title)
    inner.append(title)
    if (def.stats) {
      const row = el('div', 'beat__stats')
      for (const [value, label] of def.stats) {
        const stat = el('p', 'beat__stat')
        stat.append(el('b', 'beat__stat-value', value), el('span', 'beat__stat-label', label))
        row.append(stat)
      }
      inner.append(row)
    }
    if (def.text) inner.append(el('p', 'beat__text', def.text))
    const actions = el('div', 'beat__actions')
    if (def.cta) {
      const a = el('a', 'btn btn--solid', def.cta.label)
      a.href = def.cta.href
      a.target = '_blank'
      a.rel = 'noopener'
      actions.append(a)
    }
    if (def.sheet) {
      const b = el('button', 'btn', 'Подробнее')
      b.type = 'button'
      b.addEventListener('click', () => open(def.sheet))
      actions.append(b)
    }
    if (actions.children.length) inner.append(actions)
    if (def.links) {
      const links = el('div', 'beat__links')
      for (const l of def.links) {
        if (l.href) {
          const a = el('a', '', l.label)
          a.href = l.href
          if (!l.href.startsWith('mailto:')) {
            a.target = '_blank'
            a.rel = 'noopener'
          }
          links.append(a)
          continue
        }
        const b = el('button', '', l.label)
        b.type = 'button'
        b.addEventListener('click', () => open(l.sheet))
        links.append(b)
      }
      inner.append(links)
    }
    node.append(inner)
    beatsRoot.append(node)
    return { def, node, inner, spans, shown: false }
  })

  // --- detail sheet -------------------------------------------------------------
  const scrim = el('div', 'scrim')
  const sheet = el('aside', 'sheet')
  sheet.setAttribute('role', 'dialog')
  sheet.setAttribute('aria-modal', 'true')
  const close = el('button', 'sheet__close', 'Закрыть')
  close.type = 'button'
  const body = el('div', 'sheet__body')
  sheet.append(close, body)
  let isOpen = false

  function open(id) {
    const s = SHEETS[id]
    if (!s) return
    body.replaceChildren()
    body.append(el('p', 'sheet__eyebrow', s.eyebrow), el('h2', 'sheet__title', s.title))
    if (s.lead) body.append(el('p', 'sheet__lead', s.lead))
    if (s.list) {
      const ul = el('ul', 'sheet__list')
      s.list.forEach((t) => ul.append(el('li', '', t)))
      body.append(ul)
    }
    if (s.items) {
      for (const it of s.items) {
        const block = el('div', 'sheet__item')
        block.append(el('h3', '', it.h), el('p', it.strong ? 'sheet__result' : '', it.p))
        body.append(block)
      }
    }
    if (s.list && s.items) body.append(body.querySelector('.sheet__list'))
    if (s.tags) {
      const tags = el('div', 'sheet__tags')
      s.tags.forEach((t) => tags.append(el('span', '', t)))
      body.append(tags)
    }
    if (s.note) body.append(el('p', 'sheet__note', s.note))
    const actions = el('div', 'sheet__actions')
    const cta = el('a', 'btn btn--solid', 'Обсудить в Telegram')
    cta.href = TELEGRAM
    cta.target = '_blank'
    cta.rel = 'noopener'
    actions.append(cta)
    if (s.link) {
      const a = el('a', 'btn', s.link.label)
      a.href = s.link.href
      a.target = '_blank'
      a.rel = 'noopener'
      actions.append(a)
    }
    body.append(actions)
    body.scrollTop = 0
    isOpen = true
    root.classList.add('sheet-open')
    onSheet(true)
    close.focus()
  }
  function shut() {
    if (!isOpen) return
    isOpen = false
    root.classList.remove('sheet-open')
    onSheet(false)
  }
  close.addEventListener('click', shut)
  scrim.addEventListener('click', shut)
  window.addEventListener('keydown', (e) => e.key === 'Escape' && shut())

  root.append(veil, beatsRoot, hall, hero, pager, top, rail, chip, el('div', 'vignette'), el('div', 'grain'), scrim, sheet)

  // Hole of the picture on screen (px), refreshed by layout().
  const hole = { cx: 0, cy: 0, w: 1, h: 1 }
  let vw = 1
  let vh = 1

  return {
    hole,
    // Fit the hall photo to the viewport and cut the hole in it. Wide screens:
    // copy on the left, the photo on the right (covering the screen while it
    // can). Narrower ones: copy centred on top, the frame centred below it.
    layout(w, h) {
      vw = w
      vh = h
      const { w: W, h: H, hole: P, frame: F, bust: B } = HALL
      const edge = F.r + 24
      const cover = Math.max(vw / W, vh / H)
      let u = Math.min(vw, (vh * 16) / 9) / 100
      // Narrowing a wide screen crops the photo from the left, so the bust
      // slides under the copy. Below cover scale the photo hugs the right edge
      // and shrinks just enough to keep the bust clear of the copy column,
      // but the frame keeps at least 44% of the width.
      const fit = (vw - COPY_U * u) / (edge - B)
      let s = Math.min(cover, Math.max(fit, (vw * 0.44) / (F.r - F.l)))
      // Crop mostly from the hazy left, never into the frame on the right.
      let ox = s < cover ? vw - edge * s : Math.min((vw - W * s) * 0.75, vw - edge * s)
      // Short of cover, most of the spare height goes above the photo (under
      // the bar), so the floor stays close to the bottom edge.
      let oy = s < cover ? Math.max(0, vh - H * s) * 0.7 : (vh - H * s) / 2
      u = Math.min(u, (ox + B * s) / COPY_U)
      let fade = { l: 0, r: 0, t: Math.min(H * s * 0.14, oy * 2), b: Math.min(H * s * 0.1, (vh - oy - H * s) * 2) }

      // Below ~9.6u the button and the link no longer fit on one line.
      let stacked = vw / vh < 1.05 || u < 9.6 || vw < STACK_BELOW
      if (stacked) {
        const st = this.stack()
        // A short landscape screen would squeeze the stacked frame to a stamp:
        // keep it side by side unless the frame keeps most of its size.
        stacked = vw / vh < 1.05 || u < 9.6 || st.s > s * 0.75
        if (stacked) ({ s, ox, oy, u, fade } = st)
      }
      root.classList.toggle('is-stacked', stacked)
      hall.classList.toggle('is-stacked', stacked)
      hero.classList.toggle('is-stacked', stacked)
      hero.classList.toggle('is-roomy', stacked && vw >= 700)

      Object.assign(art.style, { left: px(ox), top: px(oy), width: px(W * s), height: px(H * s) })
      // The photo melts into the blurred hall wherever it stops short of the screen.
      const faded = fade.l + fade.r + fade.t + fade.b > 0.5
      const mask = faded
        ? `linear-gradient(90deg, transparent 0, #000 ${px(fade.l)}, #000 calc(100% - ${px(fade.r)}), transparent 100%), ` +
          `linear-gradient(180deg, transparent 0, #000 ${px(fade.t)}, #000 calc(100% - ${px(fade.b)}), transparent 100%)`
        : ''
      Object.assign(art.style, { webkitMaskImage: mask, maskImage: mask, webkitMaskComposite: 'source-in', maskComposite: 'intersect' })
      haze.style.display = faded ? '' : 'none'
      if (faded) {
        // The blurred hall covers the screen, its frame spot under the frame.
        const fx = (F.l + F.r) / 2
        const fy = (F.t + F.b) / 2
        const X = ox + fx * s
        const Y = oy + fy * s
        const sb = Math.max(s, X / fx, (vw - X) / (W - fx), Y / fy, (vh - Y) / (H - fy)) * 1.02
        Object.assign(hazeArt.style, { left: px(X - fx * sb), top: px(Y - fy * sb), width: px(W * sb), height: px(H * sb) })
        // ...except the picture's opening, where the world shows through.
        const m = 16
        const cut = [ox + (P.cx - P.w / 2 - m) * s, oy + (P.cy - P.h / 2 - m) * s, (P.w + 2 * m) * s, (P.h + 2 * m) * s]
        Object.assign(haze.style, {
          webkitMaskSize: `100% 100%, ${px(cut[2])} ${px(cut[3])}`,
          maskSize: `100% 100%, ${px(cut[2])} ${px(cut[3])}`,
          webkitMaskPosition: `0 0, ${px(cut[0])} ${px(cut[1])}`,
          maskPosition: `0 0, ${px(cut[0])} ${px(cut[1])}`,
        })
      }
      hall.style.setProperty('--s', s.toFixed(4))
      Object.assign(plate.style, { left: px(ox + P.cx * s), top: px(oy + (F.b + 22) * s) })

      hall.style.transformOrigin = `${px(ox + P.cx * s)} ${px(oy + P.cy * s)}`

      Object.assign(hole, { cx: ox + P.cx * s, cy: oy + P.cy * s, w: P.w * s, h: P.h * s })
      root.style.setProperty('--u', px(u))
      if (!stacked) {
        // The copy block is centred on the hole's height, but keeps clear air
        // under the bar (hugging it reads as part of the header) and above
        // the bottom edge. Hidden mid-flight it measures 0: assume ~43u.
        const introH = intro.offsetHeight || u * 43
        const barBottom = top.getBoundingClientRect().bottom
        const introTop = Math.max(barBottom + u * 2, Math.min(Math.max(barBottom + u * 5.5, hole.cy - introH / 2 + u * 1.5), vh - introH - u * 3))
        hero.style.setProperty('--intro-top', px(introTop))
        hero.style.setProperty('--veil-y', px(introTop + introH / 2))
      }
      return hole
    },
    // Stacked hero: copy centred under the bar, the frame below it with its
    // centre a little under the screen's middle, never down at the edge.
    // Leaves the stacked classes and copy position applied (it measures them).
    stack() {
      const { w: W, h: H, frame: F } = HALL
      const u = Math.max(6, Math.min(vw, (vh * 16) / 9) / 100)
      root.style.setProperty('--u', px(u))
      root.classList.add('is-stacked')
      hero.classList.add('is-stacked')
      hero.classList.toggle('is-roomy', vw >= 700)
      const introTop = top.getBoundingClientRect().bottom + Math.min(32, Math.max(12, vh * 0.025))
      const introH = intro.offsetHeight
      hero.style.setProperty('--intro-top', px(introTop))
      hero.style.setProperty('--veil-y', px(introTop + introH / 2))
      const from = introTop + introH + Math.min(48, Math.max(16, vh * 0.035))
      const to = vh - Math.max(16, vh * 0.05)
      const group = F.plate - F.t
      const s = Math.max(0.05, Math.min(Math.min(vw * 0.94, 1100) / (F.r - F.l), (to - from) / group))
      const frameTop = Math.min(Math.max(vh * 0.56 - ((F.b - F.t) * s) / 2, from), to - group * s)
      const ox = vw / 2 - ((F.l + F.r) / 2) * s
      const oy = frameTop - F.t * s
      // Fades stay off the frame: only the hall around it dissolves.
      const fade = { l: F.l * s * 0.7, r: (W - F.r) * s * 0.8, t: F.t * s * 0.85, b: (H - F.b) * s * 0.8 }
      return { s, ox, oy, u, fade }
    },
    // How far the hero has handed over to the world: 1 at rest, 0 once inside.
    heroHold(f) {
      return 1 - smooth(clamp01(f / 0.9))
    },
    update(f, progress) {
      // The hall scales about the hole until the hole fills the screen, while
      // the hole's centre drifts to the screen centre (in step with the 3D
      // view offset in app.js).
      const inHall = f < 0.95
      hall.style.display = inHall ? '' : 'none'
      root.classList.toggle('on-hall', f < 0.6)
      if (inHall) {
        const end = Math.max(vw / hole.w, vh / hole.h) * 1.12
        const zoom = end ** smooth(clamp01(f / 0.9))
        const drift = 1 - this.heroHold(f)
        const dx = (vw / 2 - hole.cx) * drift
        const dy = (vh / 2 - hole.cy) * drift
        hall.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${zoom.toFixed(4)})`
        hall.style.opacity = (1 - smooth(clamp01((f - 0.75) / 0.18))).toFixed(3)
      }
      const gone = f > 0.5
      hero.style.display = gone ? 'none' : ''
      if (!gone) {
        hero.style.opacity = (1 - clamp01(f / 0.3)).toFixed(3)
        // The copy drifts left and away as the camera moves into the picture.
        hero.style.transform = `translate3d(${(-f * 220).toFixed(1)}px, 0, 0)`
        hero.classList.toggle('is-live', f < 0.05)
      }
      veil.style.opacity = (smooth(clamp01((f - 1.5) / 0.5)) * (1 - smooth(clamp01((f - 2.2) / 0.75)))).toFixed(3)

      for (const b of beats) {
        const [a, z] = b.def.at
        const fin = clamp01((f - a) / FADE)
        const fout = clamp01((z - f) / FADE)
        const v = Math.min(fin, fout)
        if (v <= 0) {
          if (b.shown) {
            b.shown = false
            b.node.style.visibility = 'hidden'
            b.node.classList.remove('is-on')
          }
          continue
        }
        if (!b.shown) {
          b.shown = true
          b.node.style.visibility = 'visible'
        }
        const e = smooth(v)
        b.inner.style.opacity = e.toFixed(3)
        const y = (1 - smooth(fin)) * 34 - (1 - smooth(fout)) * 26
        b.inner.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`
        const n = b.spans.length
        for (let i = 0; i < n; i++) {
          const w = smooth(clamp01(fin * (1 + n * 0.22) - i * 0.22))
          b.spans[i].style.opacity = w.toFixed(3)
          b.spans[i].style.transform = `translate3d(0, ${((1 - w) * 0.45).toFixed(3)}em, 0)`
        }
        b.node.classList.toggle('is-on', v > 0.6)
      }

      railFill.style.transform = `scaleY(${progress.toFixed(4)})`

      lastF = f
      const from = base()
      const ahead = nextStop(from)
      if (ahead !== hintFor) {
        hintFor = ahead
        hintKind.textContent = ahead ? 'Далее' : 'Вернуться'
        hintName.textContent = ahead ? ahead.label : 'В начало'
        next.classList.toggle('is-loop', !ahead)
        next.setAttribute('aria-label', ahead ? 'Следующая сцена' : 'В начало')
      }
      const atStart = !prevStop(from)
      if (prev.disabled !== atStart) prev.disabled = atStart
      ringFill.style.strokeDashoffset = (RING * (1 - progress)).toFixed(2)
      let active = -1
      navItems.forEach((it, i) => {
        if (f >= it.from) active = i
      })
      if (active !== chapter) {
        chapter = active
        navItems.forEach((it, i) => it.b.classList.toggle('is-active', i === active))
        chip.classList.toggle('is-on', active >= 0)
        if (active >= 0) {
          chipNo.textContent = `${String(active + 1).padStart(2, '0')} / ${String(navItems.length).padStart(2, '0')}`
          chipName.textContent = navItems[active].label
        }
      }
    },
  }
}
