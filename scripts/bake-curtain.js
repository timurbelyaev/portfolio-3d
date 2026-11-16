// Bakes the curtain's cloud banks (public/ui/cloud-bank-*.webp) with the
// scene's own volumetric cloud shader (src/scene/volumes.js), so the curtain
// is made of the same cumulus as the flight. The clouds stand upright, flat
// bases down; the bank's leading edge (screen right) is their flanks.
//
// Output: window.__bake = data URL (WebP with alpha), or window.__bakeError.
// Query: ?f=<mood key f>&w=<px>&seed=<n>&big=<heap size>&split=<x:y,...>

import * as THREE from 'three'
import { createCloudVolumes } from '../src/scene/volumes.js'
import { env } from '../src/world/env.js'
import { createMood } from '../src/world/director.js'
import { MOOD } from '../src/world/story.js'

const q = new URLSearchParams(location.search)
const F = Number(q.get('f') ?? 4)
const W = Number(q.get('w') ?? 1000)
const H = W * 2
const SS = 2 // supersampling: the march is jittered per pixel
const SEED = Number(q.get('seed') ?? 11)

function mulberry32(seed) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Same sky as the flight at this point of the route.
const stub = { color: new THREE.Color(), groundColor: new THREE.Color() }
createMood(MOOD, { fog: { density: 0 }, lights: { sun: stub, hemi: stub }, tintClouds() {} }).update(F)
// The bank is seen from close: keep only a trace of aerial haze.
env.uHaze.value = 0.0012
// No bloom and almost no haze here, so at the flight's strength the sunlit
// rim of the clouds reads as a drawn outline: bake it softer.
env.uSunGlow.value *= Number(q.get('glow') ?? 0.35)
// The flight's sun sits behind the clouds (the shader lifts it so crowns
// catch it); here it is also swung toward the gap between the banks, so the
// crowns and the leading flank are lit.
env.uSunDir.value.set(Number(q.get('sunx') ?? 0.5), 0.11, Number(q.get('sunz') ?? -0.6)).normalize()

const rand = mulberry32(SEED)
const heaps = []

const DIST = 260
const camera = new THREE.PerspectiveCamera(46, W / H, 1, 2000)
camera.position.set(0, 0, DIST)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld()
// Half-width of the view at z = 0 (world units).
const HALF = Math.tan(THREE.MathUtils.degToRad(23)) * DIST * (W / H)

// Tiers of heaps stacked up the image. Each tier sits higher and further back
// than the one below, so its flat bases hide behind the crowns in front (a
// towering cumulus seen from the side). Every tier runs from off-screen left
// to its own ragged end near EDGE (fraction of the image width), scaled with
// depth so the edge stays put on screen.
const G = Number(q.get('big') ?? 2.2)
const EDGE = Number(q.get('edge') ?? 0.74)
const TIER = 13 * G
// Receding tiers need to climb higher to reach the top of the frame.
const TAN = Math.tan(THREE.MathUtils.degToRad(23))
for (let t = 0, y = -HALF * 2.7, z = 0; y < TAN * (DIST - z) * 1.1; t++, y += TIER * (0.85 + rand() * 0.3)) {
  z = -t * 9 * G + (rand() - 0.5) * 6 * G
  const scale = (DIST - z) / DIST
  const end = (-HALF + 2 * HALF * (EDGE + (rand() - 0.5) * 0.12)) * scale
  for (let x = end; x > -HALF * scale * 1.6; ) {
    const k = 0.8 + rand() * 0.45
    const s = [13 * G * k, 10 * G * k, 12 * G * k]
    // The last heap of a tier carries its flank to the edge.
    heaps.push({ c: [x - s[0] * 0.7, y + (rand() - 0.5) * 4 * G, z + (rand() - 0.5) * 8 * G], s, n: 22 })
    x -= s[0] * (1.1 + rand() * 0.5)
  }
}
// Far backing: big heaps well behind, so no gap in the body shows sky.
for (let i = 0; i < 60; i++) {
  const k = 0.9 + rand() * 0.4
  heaps.push({
    c: [(-1.6 + rand() * 1.4 + EDGE * 0.6) * HALF * 2.2, (rand() - 0.5) * HALF * 7, -320 + (rand() - 0.5) * 40],
    s: [20 * G * k, 14 * G * k, 18 * G * k],
    n: 24,
  })
}

// Break up a heap that would read as one flat slab. `split` lists image
// points (fractions, as "x:y,x:y"); the front-most heap whose crown projects
// near each point is replaced by a cluster of smaller ones. The original's
// slot keeps the first piece (same puff count), the rest go to the end, so
// every other heap bakes exactly as before.
const splitRand = mulberry32(SEED + 101)
const _p = new THREE.Vector3()
for (const spec of (q.get('split') || '').split(',').filter(Boolean)) {
  const [fx, fy] = spec.split(':').map(Number)
  // The visible one is the heap nearest the camera (largest Z) at that point.
  let best = -1
  heaps.forEach((h, i) => {
    _p.set(h.c[0], h.c[1] + h.s[1] * 0.8, h.c[2]).project(camera)
    const d = Math.hypot((_p.x + 1) / 2 - fx, (1 - _p.y) / 2 - fy)
    if (d < 0.08 && (best < 0 || h.c[2] > heaps[best].c[2])) best = i
  })
  if (best < 0) continue
  const h = heaps[best]
  const pieces = []
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + splitRand()
    pieces.push({
      c: [h.c[0] + Math.cos(a) * h.s[0] * 0.75, h.c[1] + Math.sin(a) * h.s[1] * 0.6 + h.s[1] * 0.2, h.c[2] + (splitRand() - 0.5) * h.s[2] * 0.6],
      s: h.s.map((v) => v * (0.6 + splitRand() * 0.1)),
      n: h.n,
    })
  }
  heaps[best] = pieces[0]
  heaps.push(...pieces.slice(1))
  console.log('split heap', best, 'at', fx, fy)
}

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
renderer.setPixelRatio(1)
renderer.setSize(8, 8)
document.body.append(renderer.domElement)

const clouds = createCloudVolumes(renderer, heaps, { seed: SEED, steps: 40, fine: 110 })

// No opaque world: the depth the march stops at is "very far".
const depth = new THREE.DataTexture(new Float32Array([1e6, 1e6, 1e6, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
depth.needsUpdate = true


const u = clouds.uniforms
u.tLowDepth.value = depth
u.uLowSize.value.set(1, 1)
u.uCamDir.value.copy(camera.getWorldDirection(new THREE.Vector3()))
u.uTime.value = 0

// Render in strips (a single full-size march can trip the GPU watchdog).
const FW = W * SS
const FH = H * SS
const STRIP = 256
const rt = new THREE.WebGLRenderTarget(FW, STRIP, { type: THREE.FloatType, depthBuffer: false })
const full = new Float32Array(FW * FH * 4)
const strip = new Float32Array(FW * STRIP * 4)
renderer.setClearColor(0x000000, 0)

try {
  for (let y0 = 0; y0 < FH; y0 += STRIP) {
    const h = Math.min(STRIP, FH - y0)
    camera.setViewOffset(FW, FH, 0, y0, FW, STRIP)
    renderer.setRenderTarget(rt)
    renderer.clear()
    renderer.render(clouds.scene, camera)
    renderer.readRenderTargetPixels(rt, 0, 0, FW, STRIP, strip)
    // readPixels rows are bottom-up; the strip is the top-down slice [y0, y0+STRIP).
    for (let r = 0; r < h; r++) {
      const src = (STRIP - 1 - r) * FW * 4
      full.set(strip.subarray(src, src + FW * 4), (y0 + r) * FW * 4)
    }
  }
  renderer.setRenderTarget(null)

  // Downsample (premultiplied), then the scene's display transform:
  // identity up to the knee, soft roll-off above, linear → sRGB.
  const KNEE = 0.78
  const out = new ImageData(W, H)
  const enc = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * FW + x * SS + sx) * 4
          r += full[i]
          g += full[i + 1]
          b += full[i + 2]
          a += full[i + 3]
        }
      }
      const n = SS * SS
      a /= n
      const o = (y * W + x) * 4
      if (a < 1e-4) continue
      let c = [r / n / a, g / n / a, b / n / a]
      const peak = Math.max(...c)
      if (peak > KNEE) {
        const d = 1 - KNEE
        const mapped = 1 - (d * d) / (peak + d - KNEE)
        c = c.map((v) => (v * mapped) / peak)
        const gray = 1 - 1 / (0.12 * (peak - mapped) + 1)
        c = c.map((v) => v + (mapped - v) * gray)
      }
      out.data[o] = Math.round(enc(Math.min(Math.max(c[0], 0), 1)) * 255)
      out.data[o + 1] = Math.round(enc(Math.min(Math.max(c[1], 0), 1)) * 255)
      out.data[o + 2] = Math.round(enc(Math.min(Math.max(c[2], 0), 1)) * 255)
      out.data[o + 3] = Math.round(Math.min(a, 1) * 255)
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  canvas.getContext('2d').putImageData(out, 0, 0)
  window.__bake = canvas.toDataURL('image/webp', 0.86)
  const img = new Image()
  img.src = window.__bake
  document.body.append(img)
} catch (e) {
  window.__bakeError = String(e && e.stack ? e.stack : e)
}
