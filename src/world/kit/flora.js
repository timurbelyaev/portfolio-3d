import * as THREE from 'three'
import { fogged } from '../env.js'
import { MAT, rng, noise3, fbm } from './geo.js'

// Trees and grass. A tree is a grown skeleton (tapered tubes) plus foliage made
// of small alpha-tested leaf cards gathered in clumps on the outer twigs, so a
// crown is a lumpy cluster of sub-volumes with gaps. Card normals follow the
// crown and the clump, not the card, so foliage shades like a soft volume;
// against the low sun the leaves glow through (see `foliageHook`).

// --- foliage textures (drawn once on a canvas) -------------------------------------
//
// Each texture is a horizontal strip of square tiles, so `uv.y` still runs 0..1
// from the base to the tip of every card (the wind sway keys on it). Tree and
// flower tiles carry their own colour; grass tiles are grey and take their hue
// from the vertex colour, which is cheaper to vary per clump.

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  draw(ctx)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  // Keep the canvas premultiplied: un-premultiplying on upload turns every
  // transparent texel black, and filtering then rims each leaf with a dark
  // fringe. The shader divides the alpha back out after filtering.
  t.premultiplyAlpha = true
  return t
}

// `tiles` square tiles side by side; `draw(ctx, size, index, rand)` paints one
// tile in its own clipped frame with the origin at the tile's top-left corner.
function strip(size, tiles, seed, draw) {
  return canvasTexture(size * tiles, size, (ctx) => {
    for (let i = 0; i < tiles; i++) {
      ctx.save()
      ctx.translate(i * size, 0)
      ctx.beginPath()
      ctx.rect(0, 0, size, size)
      ctx.clip()
      draw(ctx, size, i, rng(seed + i * 101))
      ctx.restore()
    }
  })
}

const grey = (v) => `rgb(${v | 0},${v | 0},${v | 0})`
const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`
const jitter = (c, rand, k) => {
  const v = 1 + (rand() - 0.5) * k
  return rgb(c[0] * v, c[1] * v, c[2] * v)
}

// Lanceolate leaf from the origin toward -y.
function leafShape(ctx, len, wid) {
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(wid * 0.6, -len * 0.2, wid * 0.55, -len * 0.7, 0, -len)
  ctx.bezierCurveTo(-wid * 0.55, -len * 0.7, -wid * 0.6, -len * 0.2, 0, 0)
  ctx.fill()
}

function stroke(ctx, color, width, x0, y0, x1, y1, cx, cy) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  if (cx === undefined) ctx.lineTo(x1, y1)
  else ctx.quadraticCurveTo(cx, cy, x1, y1)
  ctx.stroke()
}

// Olive: forked twigs set with narrow leaves, dark grey-green on top and
// silvery underneath; the mix of both is what makes an olive read silver.
const oliveTex = strip(512, 2, 5, (ctx, s, tile, rand) => {
  const TOP = [88, 104, 70]
  const UNDER = [182, 192, 170]
  const twig = (len, width, depth) => {
    stroke(ctx, rgb(98, 90, 74), width, 0, 0, 0, -len)
    const n = Math.round(len / (s * 0.042))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      for (const side of [-1, 1]) {
        if (rand() < 0.18) continue
        ctx.save()
        ctx.translate(0, -len * t + side * s * 0.01)
        ctx.rotate(side * (0.45 + rand() * 0.5) * (1 - t * 0.35) + (rand() - 0.5) * 0.25)
        const under = rand() < 0.5
        ctx.fillStyle = jitter(under ? UNDER : TOP, rand, 0.3)
        const l = s * (0.12 + rand() * 0.07) * (1 - t * 0.2)
        leafShape(ctx, l, s * (0.036 + rand() * 0.012))
        if (!under) stroke(ctx, 'rgba(205,215,185,0.35)', 1.2, 0, -l * 0.08, 0, -l * 0.85)
        ctx.restore()
      }
      if (depth > 0 && (k === Math.round(n * 0.35) || k === Math.round(n * 0.62))) {
        ctx.save()
        ctx.translate(0, -len * t)
        ctx.rotate((k % 2 ? 1 : -1) * (0.55 + rand() * 0.35))
        twig(len * (0.42 + rand() * 0.15), width * 0.6, depth - 1)
        ctx.restore()
      }
    }
    ctx.save()
    ctx.translate(0, -len)
    ctx.fillStyle = jitter(TOP, rand, 0.25)
    leafShape(ctx, s * 0.14, s * 0.04)
    ctx.restore()
  }
  ctx.translate(s / 2, s * 0.97)
  ctx.rotate((tile ? 0.12 : -0.08) + (rand() - 0.5) * 0.1)
  twig(s * 0.8, 4.5, 1)
})

// Stone pine: twigs ending in bursts of long needles, so the edge of every
// card is a spiky brush rather than a blob.
const pineTex = strip(512, 2, 7, (ctx, s, tile, rand) => {
  ctx.translate(s / 2, s * 0.96)
  const twigs = tile ? 4 : 3
  const bursts = []
  for (let i = 0; i < twigs; i++) {
    const a = (i / (twigs - 1) - 0.5) * 1.3 + (rand() - 0.5) * 0.25
    const len = s * (0.42 + rand() * 0.16)
    const x1 = Math.sin(a) * len
    const y1 = -Math.cos(a) * len
    stroke(ctx, rgb(92, 70, 52), 5, 0, 0, x1, y1, x1 * 0.3, y1 * 0.6)
    for (let k = 0; k < 4; k++) {
      const t = 0.45 + k * 0.18
      bursts.push([x1 * t, y1 * t, a])
    }
  }
  // Darker needles first, lit ones on top.
  for (let pass = 0; pass < 2; pass++) {
    for (const [x, y, a] of bursts) {
      const n = 18
      for (let j = 0; j < n; j++) {
        const da = a + (rand() - 0.5) * 2.9
        const l = s * (0.1 + rand() * 0.09)
        const c = pass ? [72 + rand() * 40, 104 + rand() * 36, 56 + rand() * 20] : [38 + rand() * 18, 62 + rand() * 18, 40 + rand() * 12]
        const bend = (rand() - 0.5) * l * 0.25
        const ex = x + Math.sin(da) * l
        const ey = y - Math.cos(da) * l
        stroke(ctx, rgb(...c), pass ? 1.7 : 2.4, x, y, ex, ey, (x + ex) / 2 + bend, (y + ey) / 2)
      }
    }
  }
})

// Italian cypress: flat, finely divided sprays pointing upward.
const cypressTex = strip(512, 2, 11, (ctx, s, tile, rand) => {
  const spray = (len, width, depth) => {
    const col = depth > 1 ? [56, 76, 54] : depth ? [64 + rand() * 16, 88 + rand() * 16, 60] : [86 + rand() * 26, 110 + rand() * 24, 70 + rand() * 12]
    stroke(ctx, rgb(...col), width, 0, 0, 0, -len)
    if (depth === 0) return
    const n = depth > 1 ? 7 : 5
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 0.6)
      ctx.save()
      ctx.translate(0, -len * t)
      ctx.rotate((k % 2 ? 1 : -1) * (0.5 + rand() * 0.3))
      spray(len * (0.5 - t * 0.28) * (0.85 + rand() * 0.3), width * 0.72, depth - 1)
      ctx.restore()
    }
  }
  ctx.translate(s / 2, s * 0.98)
  ctx.rotate((tile ? 0.06 : -0.06) + (rand() - 0.5) * 0.08)
  spray(s * 0.9, s * 0.03, 3)
})

// Almond blossom: dark twigs crowded with five-petalled flowers and a few
// bronze young leaves. The dark twigs showing through are what sells it.
const blossomTex = strip(512, 2, 13, (ctx, s, tile, rand) => {
  const frame = ctx.getTransform().invertSelf()
  const flowers = []
  const twig = (len, width, depth) => {
    stroke(ctx, rgb(80, 60, 58), width, 0, 0, 0, -len)
    for (let k = 1; k <= 6; k++) {
      const t = k / 6
      const pt = frame.transformPoint(ctx.getTransform().transformPoint(new DOMPoint(0, -len * t)))
      flowers.push([pt.x, pt.y, 6 + ((rand() * 4) | 0)])
      if (depth > 0 && (k === 2 || k === 4 || k === 5)) {
        ctx.save()
        ctx.translate(0, -len * t)
        ctx.rotate((k === 2 ? -1 : 1) * (0.6 + rand() * 0.3))
        twig(len * (0.45 + rand() * 0.15), width * 0.6, depth - 1)
        ctx.restore()
      }
    }
  }
  ctx.save()
  ctx.translate(s / 2, s * 0.97)
  ctx.rotate((tile ? 0.1 : -0.1) + (rand() - 0.5) * 0.1)
  twig(s * 0.82, 2.6, 1)
  ctx.restore()
  for (const [x, y, n] of flowers) {
    for (let j = 0; j < n; j++) {
      const r = s * (0.034 + rand() * 0.018)
      const fx = x + (rand() - 0.5) * s * 0.11
      const fy = y + (rand() - 0.5) * s * 0.11
      if (rand() < 0.06) {
        ctx.save()
        ctx.translate(fx, fy)
        ctx.rotate(rand() * Math.PI * 2)
        ctx.fillStyle = rand() < 0.5 ? jitter([130, 128, 78], rand, 0.2) : jitter([150, 104, 78], rand, 0.2)
        leafShape(ctx, r * 2.4, r * 1.1)
        ctx.restore()
        continue
      }
      const pink = rand()
      ctx.save()
      ctx.translate(fx, fy)
      ctx.rotate(rand() * Math.PI)
      for (let p = 0; p < 5; p++) {
        ctx.rotate((Math.PI * 2) / 5)
        ctx.fillStyle = rgb(255 - pink * 8, 248 - pink * 40, 248 - pink * 30)
        ctx.beginPath()
        ctx.ellipse(0, -r * 0.55, r * 0.46, r * 0.58, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = rgb(236, 168, 160)
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
})

// Grass, four tiles: 0 dense blades, 1 tall seed-heads, 2 fine short turf,
// 3 broad-leaved weeds. Grey: the vertex colour gives the hue.
const grassTex = strip(512, 4, 13, (ctx, s, tile, rand) => {
  const blade = (x0, lean, h, w, shade) => {
    const x1 = x0 + lean
    const g = ctx.createLinearGradient(0, s, 0, s - h)
    g.addColorStop(0, grey(shade * 0.7))
    g.addColorStop(0.5, grey(shade * 0.92))
    g.addColorStop(1, grey(shade))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x0 - w, s)
    ctx.bezierCurveTo(x0 - w * 0.8, s - h * 0.45, x0 + lean * 0.55 - w * 0.35, s - h * 0.8, x1, s - h)
    ctx.bezierCurveTo(x0 + lean * 0.55 + w * 0.3, s - h * 0.8, x0 + w * 0.7, s - h * 0.45, x0 + w, s)
    ctx.fill()
  }
  const tuft = (n, hMin, hMax, wMin, wMax, spread) => {
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < n; i++) {
        const x0 = s / 2 + (rand() - 0.5) * s * spread
        const h = s * (hMin + rand() * (hMax - hMin)) * (layer ? 1 : 0.82)
        const lean = (x0 - s / 2) * (0.6 + rand() * 1.1) + (rand() - 0.5) * s * 0.2
        blade(x0, lean, h, wMin + rand() * (wMax - wMin), (layer ? 212 : 178) + rand() * 43)
      }
    }
  }
  if (tile === 0) tuft(40, 0.42, 0.95, 3, 7, 0.6)
  if (tile === 1) {
    tuft(22, 0.35, 0.75, 2.5, 5, 0.5)
    for (let i = 0; i < 6; i++) {
      const x0 = s / 2 + (rand() - 0.5) * s * 0.36
      const x1 = x0 + (rand() - 0.5) * s * 0.34
      const top = s * (0.03 + rand() * 0.12)
      stroke(ctx, grey(222), 2.4, x0, s, x1, top + 40, x0, s * 0.5)
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = grey(232 + rand() * 23)
        ctx.beginPath()
        ctx.ellipse(x1 + (k % 2 ? 5 : -5), top + 40 - k * 6, 3.2, 7, k % 2 ? 0.5 : -0.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  if (tile === 2) tuft(60, 0.22, 0.6, 1.6, 3.6, 0.75)
  if (tile === 3) {
    tuft(10, 0.3, 0.6, 2, 4, 0.5)
    for (let i = 0; i < 9; i++) {
      ctx.save()
      ctx.translate(s / 2 + (rand() - 0.5) * s * 0.12, s)
      ctx.rotate((rand() - 0.5) * 2.4)
      const l = s * (0.28 + rand() * 0.2)
      const sh = 170 + rand() * 60
      const g = ctx.createLinearGradient(0, 0, 0, -l)
      g.addColorStop(0, grey(sh * 0.7))
      g.addColorStop(1, grey(sh))
      ctx.fillStyle = g
      leafShape(ctx, l, s * (0.1 + rand() * 0.05))
      stroke(ctx, 'rgba(255,255,255,0.22)', 1.6, 0, 0, 0, -l * 0.9)
      ctx.restore()
    }
  }
})

// Meadow flowers, four tiles: daisies, poppies, yellow composites, wild
// lavender. Heads are drawn large: at 15 units a real flower is one pixel.
const flowerTex = strip(256, 4, 17, (ctx, s, tile, rand) => {
  const STEM = 'rgb(86,112,62)'
  for (let i = 0; i < 4; i++) {
    ctx.save()
    ctx.translate(s / 2 + (rand() - 0.5) * s * 0.3, s)
    ctx.rotate((rand() - 0.5) * 1.6)
    ctx.fillStyle = jitter([92, 122, 66], rand, 0.3)
    leafShape(ctx, s * (0.2 + rand() * 0.15), s * 0.07)
    ctx.restore()
  }
  const heads = tile === 2 ? 6 : tile === 3 ? 5 : 3 + ((rand() * 2) | 0)
  for (let i = 0; i < heads; i++) {
    const x0 = s / 2 + (rand() - 0.5) * s * 0.25
    const x1 = s / 2 + (rand() - 0.5) * s * 0.66
    const y1 = s * (0.14 + rand() * 0.34)
    stroke(ctx, STEM, 3, x0, s, x1, y1, x0, (s + y1) / 2)
    ctx.save()
    ctx.translate(x1, y1)
    if (tile === 0) {
      const r = s * 0.1
      for (let p = 0; p < 13; p++) {
        ctx.rotate((Math.PI * 2) / 13)
        ctx.fillStyle = rgb(250 - rand() * 14, 248 - rand() * 14, 240 - rand() * 14)
        ctx.beginPath()
        ctx.ellipse(0, -r * 0.6, r * 0.17, r * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = rgb(236, 176, 48)
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2)
      ctx.fill()
    } else if (tile === 1) {
      const r = s * 0.12
      for (let p = 0; p < 4; p++) {
        ctx.fillStyle = rgb(224 + rand() * 24, 88 + rand() * 30, 66 + rand() * 20)
        ctx.beginPath()
        ctx.ellipse((p - 1.5) * r * 0.42, -r * 0.2 - (p % 2) * r * 0.12, r * 0.55, r * 0.62, (p - 1.5) * 0.35, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = rgb(44, 26, 34)
      ctx.beginPath()
      ctx.ellipse(0, -r * 0.35, r * 0.22, r * 0.14, 0, 0, Math.PI * 2)
      ctx.fill()
    } else if (tile === 2) {
      const r = s * 0.065
      for (let p = 0; p < 10; p++) {
        ctx.rotate((Math.PI * 2) / 10)
        ctx.fillStyle = rgb(250, 206 + rand() * 24, 52 + rand() * 30)
        ctx.beginPath()
        ctx.ellipse(0, -r * 0.6, r * 0.24, r * 0.52, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = rgb(210, 128, 40)
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2)
      ctx.fill()
    } else {
      for (let k = 0; k < 11; k++) {
        ctx.fillStyle = rgb(150 + rand() * 30, 116 + rand() * 30, 200 + rand() * 30)
        ctx.beginPath()
        ctx.ellipse((k % 2 ? 1 : -1) * s * 0.018, k * s * 0.022, s * 0.022, s * 0.032, k % 2 ? 0.4 : -0.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }
})

// Un-premultiply the filtered texel (see canvasTexture), then keep alpha
// coverage down the mip chain: averaged texels fall under the cutoff and
// distant crowns would otherwise thin out into a sieve.
const MIP_ALPHA = /* glsl */ `
  #ifdef USE_MAP
    diffuseColor.rgb /= max(diffuseColor.a, 0.004);
    vec2 texel = vMapUv * vec2(textureSize(map, 0));
    float lod = 0.5 * log2(max(dot(dFdx(texel), dFdx(texel)), dot(dFdy(texel), dFdy(texel))));
    diffuseColor.a *= 1.0 + max(lod, 0.0) * 0.24;
  #endif
`

// `glow` scales the light that passes through a leaf toward the eye. The
// thin outer shell of a crown (rim) and the far, sunlit side (cards facing
// away from the viewer) transmit most; the dark interior is already darkened
// by its vertex colour, so it transmits little.
// `sky` adds skylight from the analytic sky: Lambert gets no image-based
// light, and without it foliage sits visibly darker than the IBL-lit ground.
function foliageHook(key, glow, sky) {
  return {
    key,
    // Wind: the top edge of each card (uv.y = 1) sways, the base stays put.
    vertex: /* glsl */ `
      float sway = uv.y * 0.07;
      transformed.x += sin(uTime * 1.3 + position.x * 0.7 + position.y * 0.9) * sway;
      transformed.z += cos(uTime * 1.05 + position.z * 0.8 + position.y * 0.6) * sway;
    `,
    color: MIP_ALPHA,
    // Keep the authored canopy normal on both faces of a card.
    replace: [
      [
        '#include <normal_fragment_begin>',
        'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;',
      ],
    ],
    preFog: /* glsl */ `
      float facing = dot(normal, normalize(vViewPosition));
      float shell = mix(0.15, 1.0, pow(1.0 - abs(facing), 2.0));
      shell = max(shell, smoothstep(0.0, -0.7, facing));
      float toSun = max(dot(fogDir, uSunDir), 0.0);
      float through = pow(toSun, 4.0) + pow(toSun, 24.0) * 0.6;
      // Bright petals would flare into the bloom pass; dark leaves need the most help.
      float luma = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
      vec3 lit = diffuseColor.rgb * uSunColor * through * shell * ${glow.toFixed(2)} / (1.0 + 4.0 * luma);
      gl_FragColor.rgb += min(lit, vec3(0.4));
      vec3 worldN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
      gl_FragColor.rgb += diffuseColor.rgb * skyColor(normalize(worldN + vec3(0.0, 0.6, 0.0))) * ${sky.toFixed(2)};
    `,
  }
}

function depthMaterial(map) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42 })
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n${MIP_ALPHA}`)
  }
  m.customProgramCacheKey = () => 'foliageDepth'
  return m
}

function leafMaterial(map, hook) {
  const m = fogged(
    new THREE.MeshLambertMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true }),
    hook,
  )
  m.userData.depth = depthMaterial(map)
  m.userData.noReceive = true
  return m
}

const crownHook = foliageHook('foliage', 2.6, 0.22)
MAT.leafOlive = leafMaterial(oliveTex, crownHook)
MAT.leafPine = leafMaterial(pineTex, crownHook)
MAT.leafCypress = leafMaterial(cypressTex, crownHook)
MAT.leafBlossom = leafMaterial(blossomTex, crownHook)
MAT.grassCard = leafMaterial(grassTex, foliageHook('grass', 1.4, 0.38))
MAT.flowerCard = leafMaterial(flowerTex, foliageHook('flower', 1.6, 0.3))
// Opaque dark body inside a cypress: gaps between cards show deep foliage, not
// sky, without stacking more alpha-tested layers (cheaper in fill rate too).
MAT.foliageCore = fogged(new THREE.MeshLambertMaterial({ vertexColors: true }))

// --- card accumulator -----------------------------------------------------------------

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _n = new THREE.Vector3()
const _c = new THREE.Vector3()
const _d = new THREE.Vector3()
const _o = new THREE.Vector3()
const _s = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const smooth = THREE.MathUtils.smoothstep
const clamp01 = (v) => Math.min(1, Math.max(0, v))

class Cards {
  constructor() {
    this.pos = []
    this.nor = []
    this.uv = []
    this.col = []
  }
  // Quad spanned by `right` (width) and `up` (height). `anchor` 0 = centred,
  // 1 = `p` is the middle of the bottom edge. `normal` is the shading normal.
  // `root` (0..1) darkens the bottom edge: cheap contact shadow for grass.
  // `u0` / `du` select a tile of a strip texture; a negative `du` mirrors it.
  push(p, right, up, w, h, normal, color, anchor = 0, root = 1, u0 = 0, du = 1) {
    const y0 = anchor ? 0 : -h / 2
    const hw = w / 2
    const bx = p.x + up.x * y0
    const by = p.y + up.y * y0
    const bz = p.z + up.z * y0
    const tx = bx + up.x * h
    const ty = by + up.y * h
    const tz = bz + up.z * h
    this.quad(bx, by, bz, tx, ty, tz, right, hw, normal, u0, u0 + du, 0, 1, color, root, 1)
  }
  // Card standing on `p` in two segments; the upper one leans along `bend`,
  // so a tuft curves in depth instead of standing as a flat sheet.
  bent(p, right, up, bend, w, h, normal, color, root, u0, du) {
    const hw = w / 2
    const m = _c.copy(p).addScaledVector(up, h * 0.5)
    const t = _d.copy(up).add(bend).normalize().multiplyScalar(h * 0.5).add(m)
    const mid = (1 + root) / 2
    this.quad(p.x, p.y, p.z, m.x, m.y, m.z, right, hw, normal, u0, u0 + du, 0, 0.5, color, root, mid)
    this.quad(m.x, m.y, m.z, t.x, t.y, t.z, right, hw, normal, u0, u0 + du, 0.5, 1, color, mid, 1)
  }
  // Two triangles between a bottom and a top centre point, `hw` to each side
  // along `right`. Written flat: this runs a few hundred thousand times at load.
  quad(ax, ay, az, bx, by, bz, right, hw, n, uL, uR, v0, v1, c, k0, k1) {
    const rx = right.x * hw
    const ry = right.y * hw
    const rz = right.z * hw
    const P = this.pos
    const N = this.nor
    const U = this.uv
    const C = this.col
    P.push(
      ax - rx, ay - ry, az - rz, ax + rx, ay + ry, az + rz, bx + rx, by + ry, bz + rz,
      ax - rx, ay - ry, az - rz, bx + rx, by + ry, bz + rz, bx - rx, by - ry, bz - rz,
    )
    N.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z)
    U.push(uL, v0, uR, v0, uR, v1, uL, v0, uR, v1, uL, v1)
    const r0 = c.r * k0
    const g0 = c.g * k0
    const b0 = c.b * k0
    const r1 = c.r * k1
    const g1 = c.g * k1
    const b1 = c.b * k1
    C.push(r0, g0, b0, r0, g0, b0, r1, g1, b1, r0, g0, b0, r1, g1, b1, r1, g1, b1)
  }
  get empty() {
    return this.pos.length === 0
  }
  build() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    return g
  }
}

// Random tile of a two-tile strip, mirrored half of the time.
function pickTile(rand) {
  const u0 = rand() < 0.5 ? 0 : 0.5
  return rand() < 0.5 ? [u0, 0.5] : [u0 + 0.5, -0.5]
}

// Orient a leaf card: face roughly along `face`, then spin it at random.
function cardFrame(face, spin) {
  _a.crossVectors(face, UP)
  if (_a.lengthSq() < 0.01) _a.set(1, 0, 0)
  _a.normalize().applyAxisAngle(face, spin)
  _b.crossVectors(face, _a)
}

// --- limbs ------------------------------------------------------------------------------

// Tapered tube through `pts` with per-point `radii` (parallel-transport frames).
// `gnarl` adds fluted ridges that wind along the limb (`twist` radians per
// point), the look of an old olive or a twisted cherry trunk.
function tube(pts, radii, sides, c0, c1, gnarl = 0, twist = 0.7) {
  const pos = []
  const col = []
  const idx = []
  const t = new THREE.Vector3()
  const nrm = new THREE.Vector3(1, 0, 0)
  const bin = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < pts.length; i++) {
    t.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize()
    if (i === 0 && Math.abs(t.x) > 0.9) nrm.set(0, 0, 1)
    nrm.addScaledVector(t, -nrm.dot(t)).normalize()
    bin.crossVectors(t, nrm)
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2
      // Knotty bark: radius wobbles along and around the limb.
      const p = pts[i]
      const knot = 0.82 + noise3(p.x * 1.7 + s * 0.9, p.y * 1.7, p.z * 1.7) * 0.36
      const flute = gnarl ? 1 + gnarl * (Math.sin(a * 3 + i * twist) * 0.6 + Math.sin(a * 5 - i * twist * 0.6) * 0.4) * 0.5 : 1
      const r = radii[i] * knot * flute
      pos.push(
        p.x + (Math.cos(a) * nrm.x + Math.sin(a) * bin.x) * r,
        p.y + (Math.cos(a) * nrm.y + Math.sin(a) * bin.y) * r,
        p.z + (Math.cos(a) * nrm.z + Math.sin(a) * bin.z) * r,
      )
      // Ridges catch light, furrows stay dark.
      const k = noise3(p.x * 3 + s, p.y * 2, p.z * 3) * (gnarl ? 0.6 + 0.4 * flute * flute - 0.2 : 1)
      c.copy(c0).lerp(c1, clamp01(k))
      col.push(c.r, c.g, c.b)
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s
      const b = i * sides + ((s + 1) % sides)
      const d = a + sides
      const e = b + sides
      idx.push(a, d, b, b, d, e)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// Root flare: a swollen collar and a few surface roots that dive into the
// lawn, so the trunk grows out of the ground instead of standing on it.
function roots(kit, base, r0, c0, c1, rand, count) {
  const collar = [new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, r0 * 0.6, 0), new THREE.Vector3(0, r0 * 2.6, 0)]
  kit.add('bark', tube(collar, [r0 * 1.75, r0 * 1.3, r0 * 1.0], 10, c0, c1), null, base, { smooth: true })
  for (let i = 0; i < count; i++) {
    const a = ((i + rand() * 0.6) / count) * Math.PI * 2
    const len = r0 * (3.5 + rand() * 3)
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const pts = [
      new THREE.Vector3(dx * r0 * 0.5, r0 * 2.2, dz * r0 * 0.5),
      new THREE.Vector3(dx * r0 * 1.3, r0 * 0.7, dz * r0 * 1.3),
      new THREE.Vector3(dx * len * 0.6, r0 * 0.05, dz * len * 0.6),
      new THREE.Vector3(dx * len, -r0 * 0.5, dz * len),
    ]
    kit.add('bark', tube(pts, [r0 * 0.7, r0 * 0.55, r0 * 0.28, r0 * 0.08], 6, c0, c1), null, base, { smooth: true })
  }
}

// Per species: skeleton (trunk share of h, radius, wander, lift toward the
// light, recursion depth, children per level, branching angle per level,
// length shrink, trunk gnarl) and foliage (clump radius and vertical squash
// as a share of h, cards per clump, card size, how strongly cards face up,
// how dark the underside gets, tone range, per-clump tints).
const KINDS = {
  olive: {
    trunk: 0.3, r: 0.06, wander: 0.55, lift: 0.16, levels: 3, split: [3, 3, 2], angle: [0.72, 0.8, 0.8], shrink: 0.74, gnarl: 0.45,
    clump: 0.13, squash: 0.68, cards: 42, size: 0.06, up: 0.25, under: 0.45, shade: [0.36, 1.2],
    hues: ['#fbf1ee', '#f1ece6', '#f6eee4', '#ebe8e4'], tex: 'leafOlive', bark: ['#4a413a', '#9a9083'],
  },
  blossom: {
    trunk: 0.3, r: 0.045, wander: 0.42, lift: 0.24, levels: 3, split: [3, 3, 2], angle: [0.6, 0.72, 0.75], shrink: 0.74, gnarl: 0.2,
    clump: 0.11, squash: 0.78, cards: 58, size: 0.06, up: 0.2, under: 0.3, shade: [0.7, 1.12], along: true,
    hues: ['#fff6fa', '#ffeaf3', '#f9dcea', '#fff0f0'], tex: 'leafBlossom', bark: ['#3a2b29', '#6f5650'],
  },
  pine: {
    trunk: 0.56, r: 0.036, wander: 0.16, lift: 0.08, levels: 3, split: [5, 3, 2], angle: [0.62, 0.8, 0.95], shrink: 0.45, gnarl: 0.12,
    clump: 0.13, squash: 0.5, cards: 52, size: 0.065, up: 0.9, under: 0.75, shade: [0.32, 1.0], flat: true,
    hues: ['#f8ece0', '#efe6d8', '#f4e8dc'], tex: 'leafPine', bark: ['#5b4034', '#a47c62'],
  },
}

function grow(out, p, dir, len, r, level, cfg, rand) {
  const n = level === 0 ? 7 : level === 1 ? 5 : 4
  const pts = [p.clone()]
  const radii = [r]
  const d = dir.clone()
  let q = p.clone()
  for (let i = 1; i <= n; i++) {
    d.x += (rand() - 0.5) * cfg.wander
    d.y += (rand() - 0.5) * cfg.wander * 0.4 + (level ? cfg.lift * 0.35 : 0)
    d.z += (rand() - 0.5) * cfg.wander
    d.normalize()
    q = q.clone().addScaledVector(d, len / n)
    pts.push(q)
    radii.push(r * (1 - (i / n) * 0.4))
  }
  out.limbs.push({ pts, radii, level, dir: d.clone() })
  if (level >= cfg.levels) return
  const k = cfg.split[level]
  const a0 = rand() * Math.PI * 2
  _a.set(1, 0, 0)
  if (Math.abs(d.x) > 0.9) _a.set(0, 0, 1)
  const u = _a.clone().addScaledVector(d, -_a.dot(d)).normalize()
  const v = new THREE.Vector3().crossVectors(d, u)
  for (let i = 0; i < k; i++) {
    const a = a0 + (i / k) * Math.PI * 2 + (rand() - 0.5) * 0.6
    const spread = cfg.angle[level] * (0.75 + rand() * 0.5)
    const child = d
      .clone()
      .multiplyScalar(Math.cos(spread))
      .addScaledVector(u, Math.cos(a) * Math.sin(spread))
      .addScaledVector(v, Math.sin(a) * Math.sin(spread))
    child.y += cfg.lift
    child.normalize()
    // Children leave along the last stretch of the parent, not from one knot.
    const at = level ? n - (i % 2) : n - (i % 3)
    grow(out, pts[at], child, len * cfg.shrink * (0.85 + rand() * 0.3), radii[at] * 0.74, level + 1, cfg, rand)
  }
}

// `h` is the nominal height. `lush` scales the leaf count (hero trees > 1,
// background trees < 1; below 0.8 the crown is built from fewer, larger cards).
export function tree(kit, base, { kind = 'olive', h = 7, seed = 1, lush = 1 } = {}) {
  if (kind === 'cypress') return cypress(kit, base, { h, seed, lush })
  const cfg = KINDS[kind]
  const far = lush < 0.8
  const rand = rng(seed * 7919 + 13)
  const out = { limbs: [] }
  const lean = new THREE.Vector3((rand() - 0.5) * 0.3, 1, (rand() - 0.5) * 0.3).normalize()
  grow(out, new THREE.Vector3(0, -0.2, 0), lean, h * cfg.trunk, h * cfg.r, 0, cfg, rand)

  const c0 = new THREE.Color(cfg.bark[0])
  const c1 = new THREE.Color(cfg.bark[1])
  for (const l of out.limbs) {
    const thick = l.radii[0] > h * 0.02
    if (far && !thick) continue
    kit.add('bark', tube(l.pts, l.radii, thick ? (l.level ? 8 : 12) : 5, c0, c1, l.level < 2 ? cfg.gnarl : 0), null, base, { smooth: true })
  }
  if (!far) roots(kit, base, h * cfg.r, c0, c1, rand, kind === 'pine' ? 4 : 6)
  else kit.add('bark', tube([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, h * cfg.r * 2, 0)], [h * cfg.r * 1.6, h * cfg.r], 6, c0, c1), null, base, { smooth: true })

  // Leaf clumps sit on the outer twigs: at each tip and part-way along, so the
  // crown is a lumpy cluster of sub-volumes with gaps between them.
  const clumps = []
  for (const l of out.limbs) {
    if (l.level < cfg.levels - 1) continue
    const n = l.pts.length - 1
    if (l.level === cfg.levels) {
      clumps.push(l.pts[n].clone().addScaledVector(l.dir, h * cfg.clump * 0.35))
      if (cfg.along || rand() < 0.65) clumps.push(l.pts[Math.ceil(n / 2)].clone())
      if (rand() < (lush - 1) * 0.6) clumps.push(l.pts[1].clone())
    } else if (cfg.along) clumps.push(l.pts[n - 1].clone())
  }
  if (far) for (let i = clumps.length - 1; i >= 0; i--) if (rand() < 0.45) clumps.splice(i, 1)
  // Stone pine: the umbrella is flat on top, the clumps only differ below.
  if (cfg.flat) {
    const ys = clumps.map((c) => c.y).sort((a, b) => a - b)
    const top = ys[Math.floor(ys.length * 0.65)]
    for (const c of clumps) if (c.y > top) c.y = top + (c.y - top) * 0.2
  }

  const centre = new THREE.Vector3()
  for (const c of clumps) centre.add(c)
  centre.divideScalar(clumps.length)
  let reach = 0.001
  for (const c of clumps) reach = Math.max(reach, _d.copy(c).sub(centre).setY((c.y - centre.y) / cfg.squash).length())

  const cards = new Cards()
  const col = new THREE.Color()
  const hues = cfg.hues.map((c) => new THREE.Color(c))
  const sizeK = far ? 1.8 : 1
  const _hue = new THREE.Color()
  for (const c of clumps) {
    const rc = h * cfg.clump * (0.75 + rand() * 0.5) * (far ? 1.25 : 1)
    // Position of the clump in the crown, in squashed units: 0 core, 1 rim.
    _s.copy(c).sub(centre)
    _s.y /= cfg.squash
    const co = clamp01(_s.length() / reach)
    _s.normalize()
    // Each clump gets its own tone, so the crown reads as separate masses.
    const hue = _hue.copy(hues[(rand() * hues.length) | 0]).multiplyScalar(0.8 + rand() * 0.35)
    // Clumps buried in the crown are mostly hidden: fewer cards, less fill.
    const n = Math.max(3, Math.round(cfg.cards * Math.sqrt(Math.max(lush, 0.5)) * (0.5 + 0.5 * co) * (far ? 0.42 : 1)))
    for (let j = 0; j < n; j++) {
      // Cards hug the clump's shell; its inside is never seen.
      do _o.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1)
      while (_o.lengthSq() > 1 || _o.lengthSq() < 0.01)
      const shell = 0.5 + 0.5 * Math.cbrt(rand())
      _o.normalize().multiplyScalar(shell)
      const p = _c.set(c.x + _o.x * rc, c.y + _o.y * rc * cfg.squash, c.z + _o.z * rc)
      // Random facing, only nudged outward: cards that all face out turn edge-on
      // at the silhouette and read as spikes.
      _n.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).addScaledVector(_o, 0.45).addScaledVector(UP, cfg.up).normalize()
      cardFrame(_n, rand() * Math.PI * 2)
      // Shading normal: the crown as a whole, bulged by the clump, tipped to the sky.
      const shadeN = _d.copy(_s).multiplyScalar(0.55).addScaledVector(_o, 0.6).addScaledVector(UP, 0.3).normalize()
      // Self-shadowing painted in: core and undersides dark, outer tops light.
      let ao = clamp01(co * 0.55 + (shell - 0.5) * 0.5 + (0.5 + 0.5 * _o.y) * 0.25)
      ao *= 1 - cfg.under * (0.5 - 0.5 * _o.y) * (1 - co * 0.5)
      const tone = THREE.MathUtils.lerp(cfg.shade[0], cfg.shade[1], ao) * (0.88 + rand() * 0.24)
      col.copy(hue).multiplyScalar(tone)
      const s = h * cfg.size * (0.75 + rand() * 0.5) * sizeK
      const [u0, du] = pickTile(rand)
      cards.push(p, _a, _b, s, s, shadeN, col, 0, 1, u0, du)
    }
  }
  kit.add(cfg.tex, cards.build(), null, base, { smooth: true })
}

// Italian cypress: a narrow, dense column with a blunt point, its surface
// broken into vertical flame-like lobes. Cards lie on the column's shell and
// point upward; normals follow the column and its lobes.
function cypress(kit, base, { h = 9, seed = 1, lush = 1 } = {}) {
  const rand = rng(seed * 4099 + 3)
  const far = lush < 0.8
  const c0 = new THREE.Color('#47372f')
  const c1 = new THREE.Color('#7a6253')
  const trunk = [new THREE.Vector3(0, -0.25, 0), new THREE.Vector3(0, h * 0.3, 0), new THREE.Vector3(0, h * 0.88, 0)]
  kit.add('bark', tube(trunk, [h * 0.028, h * 0.019, h * 0.005], 8, c0, c1, 0.2), null, base, { smooth: true })
  if (!far) roots(kit, base, h * 0.024, c0, c1, rand, 4)

  const R = h * 0.1
  const prof = (t) => (t < 0.28 ? 0.62 + 0.38 * Math.sin((t / 0.28) * Math.PI * 0.5) : Math.pow(1 - (t - 0.28) / 0.72, 1.05))
  const ph = seed * 3.1
  const lobe = (a, t) => 1 + (noise3(Math.cos(a) * 1.7 + ph, t * 5, Math.sin(a) * 1.7) - 0.5) * 0.55
  const cards = new Cards()
  const col = new THREE.Color()
  // Green held under red and blue: the darkest foliage, leaning plum like the
  // cypresses in the reference instead of a saturated bottle green.
  const hues = [new THREE.Color('#d9c6cf'), new THREE.Color('#d0c0c8'), new THREE.Color('#d8c8c4')]
  const radial = new THREE.Vector3()
  const tang = new THREE.Vector3()
  const p = new THREE.Vector3()
  const n = Math.round(850 * (h / 12) ** 2 * lush * (far ? 0.35 : 1))
  for (let i = 0; i < n; i++) {
    let t
    do t = rand()
    while (rand() > prof(t) * 0.9 + 0.1)
    const y = h * (0.05 + 0.93 * t)
    const a = rand() * Math.PI * 2
    const L = lobe(a, t)
    const Rr = R * prof(t) * L + h * 0.006
    const rho = Rr * (0.6 + 0.4 * Math.sqrt(rand()))
    radial.set(Math.cos(a), 0, Math.sin(a))
    tang.set(-Math.sin(a), 0, Math.cos(a))
    p.set(radial.x * rho, y, radial.z * rho)
    // Lobe flanks turn sideways; the narrowing top turns toward the sky.
    const slope = (lobe(a + 0.15, t) - lobe(a - 0.15, t)) / 0.3
    const taper = ((prof(Math.max(0, t - 0.02)) - prof(Math.min(1, t + 0.02))) / 0.04) * (R / (h * 0.93))
    const shadeN = _d.copy(radial).addScaledVector(tang, -slope * 0.9).addScaledVector(UP, 0.22 + taper).normalize()
    _n.copy(radial).add(_a.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.7)).addScaledVector(UP, 0.15).normalize()
    _b.set(radial.x * 0.3 + (rand() - 0.5) * 0.3, 1, radial.z * 0.3 + (rand() - 0.5) * 0.3)
    _b.addScaledVector(_n, -_b.dot(_n)).normalize()
    _a.crossVectors(_b, _n)
    const ao = clamp01(((rho / Rr - 0.6) / 0.4) * 0.45 + (L - 0.72) * 0.7 + t * 0.2)
    const tone = THREE.MathUtils.lerp(0.36, 1.0, ao) * (0.88 + rand() * 0.24)
    col.copy(hues[(rand() * 3) | 0]).multiplyScalar(tone)
    // Finer sprays toward the point, or the tip turns into a ragged spike.
    const w = h * 0.058 * (0.8 + rand() * 0.4) * (0.45 + 0.55 * Math.sqrt(prof(t))) * (far ? 1.6 : 1)
    const [u0, du] = pickTile(rand)
    cards.push(p, _a, _b, w, w * 1.5, shadeN, col, 0, 1, u0, du)
  }
  kit.add('leafCypress', cards.build(), null, base, { smooth: true })

  const rows = 14
  const core = new THREE.LatheGeometry(
    Array.from({ length: rows + 1 }, (_, i) => new THREE.Vector2(Math.max(0.01, R * prof(i / rows)), h * (0.06 + 0.9 * (i / rows)))),
    14,
  )
  const cp = core.attributes.position
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i)
    const z = cp.getZ(i)
    const k = 0.62 * lobe(Math.atan2(z, x), (cp.getY(i) / h - 0.06) / 0.9)
    cp.setXYZ(i, x * k, cp.getY(i), z * k)
  }
  core.computeVertexNormals()
  kit.add('foliageCore', core, null, base, { smooth: true, color: '#3a3c34' })
}

// A meadow over a disc of radius `r` (local XZ): grass clumps whose size,
// height and hue follow noise fields (lush hollows, thin dry patches, bare
// ground), a low turf between them and flowers in drifts of one species.
// `keepOut` is a list of [x, z, radius] circles left bare (plinths, paths).
// Below density 0.4 (background islands) clumps are single, unbent tufts.
export function meadow(kit, base, { r = 10, seed = 1, density = 1, keepOut = [] } = {}) {
  const rand = rng(seed * 331 + 7)
  const lite = density < 0.4
  const grass = new Cards()
  const flowers = new Cards()
  // Dry sage and straw: the reference has no saturated green anywhere.
  const greens = ['#a5ad7a', '#b4b58a', '#9aa476', '#c2bf94'].map((c) => new THREE.Color(c))
  const straw = new THREE.Color('#dccf9e')
  const col = new THREE.Color()
  const tint = new THREE.Color()
  const p = new THREE.Vector3()
  const q = new THREE.Vector3()
  const nrm = new THREE.Vector3()
  const bend = new THREE.Vector3()
  const ox = seed * 13.7
  const blocked = (x, z) => keepOut.some(([kx, kz, k]) => (x - kx) ** 2 + (z - kz) ** 2 < k * k)
  const lushAt = (x, z) => smooth(fbm(x * 0.15 + ox, 0.5, z * 0.15, 3), 0.3, 0.64)
  const dryAt = (x, z) => smooth(noise3(x * 0.08 + 9, ox, z * 0.08), 0.45, 0.8)
  const disc = (v) => {
    const rho = Math.sqrt(rand()) * r
    const a = rand() * Math.PI * 2
    return v.set(Math.cos(a) * rho, -0.04, Math.sin(a) * rho)
  }
  // Tile widths and heights relative to the clump height.
  const TILE = [
    [1.35, 1],
    [1.2, 1.4],
    [1.5, 0.6],
    [1.5, 0.5],
  ]
  const tuft = (at, tile, hh, base, crossed, root = 0.78) => {
    const [kw, kh] = TILE[tile]
    const height = hh * kh
    const yaw = rand() * Math.PI
    nrm.set((rand() - 0.5) * 0.5, 1, (rand() - 0.5) * 0.5).normalize()
    tint.copy(base).multiplyScalar(0.86 + rand() * 0.26)
    for (let k = 0; k < crossed; k++) {
      const ang = yaw + (k * Math.PI) / crossed
      _a.set(Math.cos(ang), 0, Math.sin(ang))
      _b.set((rand() - 0.5) * 0.25, 1, (rand() - 0.5) * 0.25).normalize()
      const u0 = tile * 0.25
      const du = rand() < 0.5 ? 0.25 : -0.25
      if (lite) {
        grass.push(at, _a, _b, height * kw, height, nrm, tint, 1, root, du > 0 ? u0 : u0 + 0.25, du)
      } else {
        // Lean perpendicular to the card, plus a common drift (the wind's set).
        _n.crossVectors(_a, UP)
        bend.copy(_n).multiplyScalar((rand() - 0.5) * 0.9).addScaledVector(_a, (rand() - 0.5) * 0.4)
        bend.x += 0.15
        grass.bent(at, _a, _b, bend, height * kw, height, nrm, tint, root, du > 0 ? u0 : u0 + 0.25, du)
      }
    }
  }

  const clumps = Math.min(lite ? 700 : 3600, Math.round(r * r * 3 * density))
  for (let i = 0; i < clumps; i++) {
    disc(p)
    if (blocked(p.x, p.z)) continue
    const L = lushAt(p.x, p.z)
    if (L <= 0 || rand() > 0.35 + L * 0.65) continue
    const dry = dryAt(p.x, p.z)
    col.copy(greens[(rand() * greens.length) | 0]).lerp(straw, clamp01(dry * 0.75 + (1 - L) * 0.25 + (rand() - 0.5) * 0.2))
    // Lush grass is deeper and darker; thin grass is short and pale.
    col.multiplyScalar(1.12 - L * 0.16)
    const hc = 0.16 + L * 0.38 + rand() * 0.18
    const n = lite ? 1 : 1 + Math.floor(rand() * (1.5 + L * 3.5))
    for (let k = 0; k < n; k++) {
      const spread = (0.12 + L * 0.3) * Math.sqrt(rand())
      const a = rand() * Math.PI * 2
      q.set(p.x + Math.cos(a) * spread, p.y, p.z + Math.sin(a) * spread)
      if (k && blocked(q.x, q.z)) continue
      const roll = rand()
      const tile = L > 0.55 ? (roll < 0.22 + dry * 0.3 ? 1 : roll < 0.85 ? 0 : 3) : roll < 0.45 ? 2 : roll < 0.7 ? 3 : dry > 0.4 ? 1 : 0
      tuft(q, tile, hc * (0.65 + rand() * 0.6), col, !lite && hc > 0.5 && rand() < 0.5 ? 3 : 2)
    }
  }

  // Low turf between the clumps, so the lawn reads as grass and not paint.
  if (!lite) {
    const turf = Math.min(9000, Math.round(r * r * 7 * density))
    for (let i = 0; i < turf; i++) {
      disc(p)
      if (blocked(p.x, p.z)) continue
      const L = lushAt(p.x, p.z)
      if (rand() > 0.3 + L) continue
      col.copy(greens[(rand() * greens.length) | 0]).lerp(straw, clamp01(dryAt(p.x, p.z) * 0.6 + (rand() - 0.3) * 0.3))
      tuft(p, 2, 0.22 + rand() * 0.2 + L * 0.12, col.multiplyScalar(1.1), 1, 0.95)
    }
  }

  // Flower drifts: one species per patch, several heads per spot.
  const drifts = lite ? 0 : Math.min(1200, Math.round(r * r * 1.0 * density))
  const white = new THREE.Color(1, 1, 1)
  for (let i = 0; i < drifts; i++) {
    disc(p)
    if (noise3(p.x * 0.2 + 40, ox, p.z * 0.2) < 0.62 || blocked(p.x, p.z)) continue
    // Daisies and yellow composites dominate; poppies and lavender are accents.
    const species = [0, 2, 0, 3, 1, 2][Math.min(5, Math.floor(noise3(p.x * 0.05 - 7, ox + 3, p.z * 0.05) * 6))]
    const spots = 1 + ((rand() * 2) | 0)
    for (let k = 0; k < spots; k++) {
      q.set(p.x + (rand() - 0.5) * 0.7, p.y, p.z + (rand() - 0.5) * 0.7)
      if (blocked(q.x, q.z)) continue
      const s = 0.3 + rand() * 0.22
      const yaw = rand() * Math.PI
      tint.copy(white).multiplyScalar(0.85 + rand() * 0.2)
      nrm.set((rand() - 0.5) * 0.4, 1, (rand() - 0.5) * 0.4).normalize()
      for (let c = 0; c < 2; c++) {
        _a.set(Math.cos(yaw + c * 1.57), 0, Math.sin(yaw + c * 1.57))
        _b.set((rand() - 0.5) * 0.3, 1, (rand() - 0.5) * 0.3).normalize()
        flowers.push(q, _a, _b, s, s, nrm, tint, 1, 0.75, species * 0.25, 0.25)
      }
    }
  }
  if (!grass.empty) kit.add('grassCard', grass.build(), null, base, { smooth: true })
  if (!flowers.empty) kit.add('flowerCard', flowers.build(), null, base, { smooth: true })
}
