import * as THREE from 'three'

// A DOM text panel tied to a 3D world anchor. Each frame we project the anchor
// to screen space and move the element there — crisp text, cheap, responsive.
// Visibility fades in/out across the panel's global scroll sub-range.
export class Panel {
  constructor(def) {
    this.def = def
    this.anchor = new THREE.Vector3(...def.anchor)
    this._v = new THREE.Vector3()
    this.el = buildElement(def.content)
    this.el.classList.add('panel')
    if (def.center) this.el.classList.add('panel--center')
    document.getElementById('panels').appendChild(this.el)
    this._visible = false
  }

  update(globalT, camera, width, height) {
    const [s, e] = this.def.showGlobal
    const fade = this.def.fade ?? 0.035

    let alpha = 0
    if (globalT >= s - fade && globalT <= e + fade) {
      const inEdge = THREE.MathUtils.smoothstep(globalT, s - fade, s + fade)
      const outEdge = 1 - THREE.MathUtils.smoothstep(globalT, e - fade, e + fade)
      alpha = Math.min(inEdge, outEdge)
    }

    if (alpha <= 0.001) {
      if (this._visible) {
        this.el.style.opacity = '0'
        this.el.style.transform = 'translate3d(-9999px,-9999px,0)'
        this._visible = false
      }
      return
    }

    this._v.copy(this.anchor).project(camera)
    // Behind the camera → hide.
    if (this._v.z > 1) {
      this.el.style.opacity = '0'
      return
    }

    const x = (this._v.x * 0.5 + 0.5) * width
    const y = (-this._v.y * 0.5 + 0.5) * height
    const ox = this.def.offset?.[0] ?? 0
    const oy = this.def.offset?.[1] ?? 0

    const recenter = this.def.center ? ' translate(-50%, -50%)' : ''
    this.el.style.transform = `translate3d(${Math.round(x + ox)}px, ${Math.round(y + oy)}px, 0)${recenter}`
    this.el.style.opacity = String(alpha)
    this._visible = true
  }
}

function buildElement(content) {
  const wrap = document.createElement('article')
  if (content.eyebrow) {
    const eb = document.createElement('p')
    eb.className = 'panel__eyebrow'
    eb.textContent = content.eyebrow
    wrap.appendChild(eb)
  }
  if (content.title) {
    const h = document.createElement('h2')
    h.className = 'panel__title'
    h.textContent = content.title
    wrap.appendChild(h)
  }
  if (content.lead) {
    const p = document.createElement('p')
    p.className = 'panel__lead'
    p.textContent = content.lead
    wrap.appendChild(p)
  }
  if (content.note) {
    const p = document.createElement('p')
    p.className = 'panel__note'
    p.textContent = content.note
    wrap.appendChild(p)
  }
  return wrap
}
