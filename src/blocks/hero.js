import * as THREE from 'three'
import { hero as heroName } from '../content/blocks.js'
import { createBillboardClouds, SUN_POS } from '../scene/clouds.js'
import { createForegroundWisps, createDustMotes } from '../scene/atmosphere.js'

// Soft radial glow for the sun core. It is the bright source the screen-space
// god-ray pass (postfx/composer.js) fans into shafts, and reads as the sun disc.
let glowTex
function glowTexture() {
  if (glowTex) return glowTex
  const s = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const ctx = cv.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.28, 'rgba(255,255,255,0.55)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  glowTex = new THREE.CanvasTexture(cv)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}

// Procedural white marble: warm off-white base veined with turbulent grey
// strokes, for the polished frame moulding. No external texture needed.
let marbleTex
function marbleTexture() {
  if (marbleTex) return marbleTex
  const S = 1024
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')

  ctx.fillStyle = '#d4d7d9'
  ctx.fillRect(0, 0, S, S)

  // Wavy veins: a few dark structural ones over many faint capillaries.
  function vein(width, alpha, color) {
    ctx.strokeStyle = color
    ctx.globalAlpha = alpha
    ctx.lineWidth = width
    ctx.beginPath()
    let x = Math.random() * S
    let y = -20
    ctx.moveTo(x, y)
    while (y < S + 20) {
      const nx = x + (Math.random() - 0.5) * 160
      const ny = y + 40 + Math.random() * 60
      const cx = (x + nx) / 2 + (Math.random() - 0.5) * 120
      const cy = (y + ny) / 2
      ctx.quadraticCurveTo(cx, cy, nx, ny)
      x = nx
      y = ny
    }
    ctx.stroke()
  }
  for (let i = 0; i < 6; i++) vein(2 + Math.random() * 3, 0.3, '#7c7c80')
  for (let i = 0; i < 24; i++) vein(0.6 + Math.random(), 0.15, '#a9a9ae')

  // Fine speckle so the polish never looks like flat paint.
  for (let i = 0; i < 9000; i++) {
    const l = Math.random() < 0.5 ? 60 : 255
    ctx.globalAlpha = Math.random() * 0.04
    ctx.fillStyle = `rgb(${l},${l},${l})`
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2)
  }
  ctx.globalAlpha = 1

  marbleTex = new THREE.CanvasTexture(cv)
  marbleTex.colorSpace = THREE.SRGBColorSpace
  marbleTex.wrapS = marbleTex.wrapT = THREE.RepeatWrapping
  marbleTex.anisotropy = 4
  return marbleTex
}

// A sharp-cornered rectangle as a THREE.Shape path (frame outline + hole).
function rect(w, h) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x, y)
  s.lineTo(x + w, y)
  s.lineTo(x + w, y + h)
  s.lineTo(x, y + h)
  s.lineTo(x, y)
  return s
}

// Gold, softly glowing name floating in a hole punched through a polished marble
// picture frame. The text is a transparent emissive plane (crisp Cyrillic, any
// font) — it reads as light hanging in the air and blooms in the postfx pass.
// Text lives ONLY in Hero for now — later blocks are colour-coded instead.
function floatingName() {
  const group = new THREE.Group()

  const OUT_W = 30
  const OUT_H = 14.4
  const IN_W = 28.2
  const IN_H = 12.6
  const DEPTH = 1.0

  // Marble moulding: sharp-cornered outer rect with a sharp inner hole, extruded
  // with a tight bevel so the thin profile still catches the sun as a real frame.
  const shape = rect(OUT_W, OUT_H)
  shape.holes.push(rect(IN_W, IN_H))
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.18,
    bevelSize: 0.18,
    bevelSegments: 1,
    curveSegments: 1,
  })
  geo.translate(0, 0, -DEPTH / 2)
  geo.computeVertexNormals()

  // Cool-grey tint so the warm Hero sun doesn't read the near-white marble as
  // yellow/wood. The tint multiplies the veined texture.
  const marble = new THREE.MeshPhysicalMaterial({
    map: marbleTexture(),
    roughness: 0.45,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
    color: '#aeb4b8',
  })
  const frame = new THREE.Mesh(geo, marble)
  frame.castShadow = true
  frame.receiveShadow = true
  group.add(frame)

  // Name + role on a transparent canvas, gold gradient fill with a dark rim for
  // legibility against the bright clouds behind the open frame.
  const CW = 2000
  const CH = 900
  const cv = document.createElement('canvas')
  cv.width = CW
  cv.height = CH
  const ctx = cv.getContext('2d')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const grad = ctx.createLinearGradient(0, CH * 0.2, 0, CH * 0.8)
  grad.addColorStop(0, '#3a3a3d')
  grad.addColorStop(1, '#141416')

  // Soft light halo behind the dark letters keeps them legible over the clouds.
  ctx.font = '700 210px Georgia, "Times New Roman", serif'
  ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(255,255,255,0.6)'
  ctx.shadowBlur = 22
  ctx.lineWidth = 12
  ctx.strokeStyle = 'rgba(250,250,250,0.5)'
  ctx.strokeText(heroName.title, CW / 2, CH * 0.42)
  ctx.shadowBlur = 0
  ctx.fillStyle = grad
  ctx.fillText(heroName.title, CW / 2, CH * 0.42)

  ctx.font = '600 62px Georgia, "Times New Roman", serif'
  ctx.fillStyle = 'rgba(40,40,44,0.9)'
  ctx.letterSpacing = '6px'
  ctx.fillText(heroName.eyebrow.toUpperCase(), CW / 2, CH * 0.72)

  const textTex = new THREE.CanvasTexture(cv)
  textTex.colorSpace = THREE.SRGBColorSpace
  textTex.anisotropy = 8

  const planeH = IN_H - 1.2
  const planeW = planeH * (CW / CH)
  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(planeW, planeH),
    new THREE.MeshBasicMaterial({
      map: textTex,
      transparent: true,
      depthWrite: false,
    }),
  )
  text.position.z = 0.05
  group.add(text)

  return group
}

// Block 5.1 — Hero. The flight opens on the engraved name-plate over a drifting
// cloud bank, then the camera dives forward-and-down through the clouds.
export default {
  id: 'hero',

  // The flight is an S-sweep, not a straight ramp: the camera banks right to arc
  // past the name, crests, then plunges and banks left for a smooth tail handoff.
  waypoints: [
    { pos: [0, 66, 24], look: [0, 59, -14] },
    { pos: [11, 64, 6], look: [1, 57, -28] },
    { pos: [14, 61, -14], look: [0, 56, -32] },
    { pos: [5, 59, -32], look: [1, 54, -54] },
    { pos: [-9, 54, -46], look: [1, 52, -80] },
    { pos: [-4, 51, -57], look: [1, 51, -94] },
  ],

  panels: [],

  build({ scene, onFrame }) {
    const clouds = createBillboardClouds({
      boxMin: [-220, 20, -240],
      boxMax: [220, 88, 45],
    })
    scene.add(clouds.group)

    // Marble-framed name floating in the air, angled slightly back to face the
    // descending camera.
    const nameplate = floatingName()
    nameplate.position.set(0, 56, -18)
    nameplate.rotation.x = -0.06
    scene.add(nameplate)

    // Bright sun disc — the source the screen-space god rays fan out from.
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color('#fff2d8'),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    glow.scale.set(52, 52, 1)
    glow.position.copy(SUN_POS)
    glow.renderOrder = 2
    scene.add(glow)

    // Depth layers: foreground wisps to fly through + a wrapping dust field.
    const wisps = createForegroundWisps()
    scene.add(wisps.group)
    const dust = createDustMotes({ count: 300, range: 85 })
    scene.add(dust.points)

    if (onFrame) {
      onFrame((t, seconds, camera) => {
        clouds.update(camera, seconds)
        wisps.update(camera, seconds)
        dust.update(camera, seconds)
      })
    }
  },
}
