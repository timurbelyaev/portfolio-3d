import * as THREE from 'three'
import { fogged } from '../env.js'

// Text carved into stone: a transparent plane with the lettering drawn on a
// canvas, laid just above a flat face. Lines are redrawn once the web fonts
// arrive, so the first paint never locks in a fallback face.

const FONTS = {
  // Forum is modelled on Roman inscriptional capitals: right for cut stone.
  serif: 'Forum, Georgia, serif',
  sans: '"Golos Text", system-ui, sans-serif',
}
const pending = []
let fontsRequested = false

function requestFonts() {
  if (fontsRequested || !document.fonts) return
  fontsRequested = true
  Promise.all([
    document.fonts.load('400 48px Forum', 'Ая Az'),
    document.fonts.load('700 24px "Golos Text"', 'Ая Az'),
  ])
    .catch(() => {})
    .then(() => pending.forEach((draw) => draw()))
}

// `lines`: [{ t, size, font = 'serif', weight = 600, caps, track, gap, color }]
// `size`, `gap` are in world units (same units as `w`, `h`).
export function inscription({ lines, w, h, color = '#4b3a3a', gold = '#a8802e' }) {
  const PX = Math.min(1024 / w, 150)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * PX)
  canvas.height = Math.round(h * PX)
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    const total = lines.reduce((sum, l) => sum + l.size + (l.gap ?? l.size * 0.32), 0)
    let y = (h - total) / 2
    for (const l of lines) {
      y += l.size
      const px = l.size * PX
      ctx.font = `${l.weight ?? (l.font === "sans" ? 600 : 400)} ${px}px ${FONTS[l.font ?? "serif"]}`
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${(l.track ?? 0) * px}px`
      const text = l.caps ? l.t.toUpperCase() : l.t
      // Lit lower edge under dark lettering reads as a chiselled groove.
      ctx.fillStyle = 'rgba(255, 250, 240, 0.7)'
      ctx.fillText(text, canvas.width / 2 + px * 0.012, y * PX + px * 0.035)
      ctx.fillStyle = l.color === 'gold' ? gold : color
      ctx.fillText(text, canvas.width / 2, y * PX)
      y += l.gap ?? l.size * 0.32
    }
    texture.needsUpdate = true
  }
  draw()
  pending.push(draw)
  requestFonts()

  const material = fogged(
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    { key: 'inscription' },
  )
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material)
  mesh.renderOrder = 2
  return mesh
}
