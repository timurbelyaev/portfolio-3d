import * as THREE from 'three'

// Shared world position of the sun — the source for the screen-space god rays
// (see postfx/composer.js) and the in-scene glow sprite (see blocks/hero.js).
export const SUN_POS = new THREE.Vector3(38, 80, -6)

// --- seeded procedural cloud textures -------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Perlin-ish value noise.
function makeNoise(seed) {
  const rnd = mulberry32(seed)
  const perm = new Uint8Array(512)
  const src = new Uint8Array(256)
  for (let i = 0; i < 256; i++) src[i] = i
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0
    const t = src[i]
    src[i] = src[j]
    src[j] = t
  }
  for (let i = 0; i < 512; i++) perm[i] = src[i & 255]
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
  const lerp = (a, b, t) => a + (b - a) * t
  const grad = (h, x, y) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y)
  return function (x, y) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u = fade(x)
    const v = fade(y)
    const aa = perm[perm[X] + Y]
    const ab = perm[perm[X] + Y + 1]
    const ba = perm[perm[X + 1] + Y]
    const bb = perm[perm[X + 1] + Y + 1]
    return (
      lerp(lerp(grad(aa, x, y), grad(ba, x - 1, y), u), lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v) * 0.5 +
      0.5
    )
  }
}

const ss = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

// A detailed, wispy cloud puff: domain-warped FBM gives cauliflower structure
// and ragged edges (not a smooth "soap" disc). RGB carries a brightness map so
// the shader can shade internal billows; alpha is the silhouette.
export function cloudTexture(seed) {
  const size = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')
  const img = ctx.createImageData(size, size)
  const noise = makeNoise(seed)
  const fbm = (x, y, oct) => {
    let v = 0
    let a = 0.5
    let f = 1
    for (let i = 0; i < oct; i++) {
      v += a * noise(x * f, y * f)
      f *= 2
      a *= 0.5
    }
    return v
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size
      const ny = y / size
      const wx = fbm(nx * 2.0, ny * 2.0, 3)
      const wy = fbm(nx * 2.0 + 7.3, ny * 2.0 + 2.1, 3)
      const n = fbm(nx * 3.0 + wx * 1.7, ny * 3.0 + wy * 1.7, 5)
      const dx = nx - 0.5
      const dy = ny - 0.5
      const r = Math.sqrt(dx * dx + dy * dy) / 0.5
      const mask = ss(1.05, 0.1, r)
      const dens = n * mask
      const alpha = ss(0.34, 0.62, dens)
      const lum = Math.min(Math.max(0.42 + n * 0.72, 0), 1)
      const i = (y * size + x) * 4
      img.data[i] = lum * 255
      img.data[i + 1] = lum * 255
      img.data[i + 2] = lum * 255
      img.data[i + 3] = alpha * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// --- billboard cloud field -------------------------------------------------

const vertexShader = /* glsl */ `
  uniform vec3 uCamRight, uCamUp;
  varying vec2 vUv;
  varying float vFade;
  varying float vDist;
  void main() {
    vUv = uv;
    vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 world = center + uCamRight * position.x + uCamUp * position.y;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vDist = -mv.z;
    // Dissolve as a plane approaches the camera so we fly THROUGH the bank
    // instead of clipping hard through flat cards.
    vFade = smoothstep(1.5, 20.0, vDist);
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform vec3 uLit, uShadow, uFog;
  uniform float uOpacity, uFogNear, uFogFar;
  varying vec2 vUv;
  varying float vFade;
  varying float vDist;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * uOpacity * vFade;
    if (a < 0.004) discard;
    // Internal shading: texture brightness + a top-lit vertical bias.
    float lit = clamp(t.r * 0.7 + vUv.y * 0.5, 0.0, 1.0);
    vec3 col = mix(uShadow, uLit, lit);
    float fog = smoothstep(uFogNear, uFogFar, vDist);
    col = mix(col, uFog, fog);
    gl_FragColor = vec4(col, a);
  }
`

export function createBillboardClouds({ boxMin, boxMax, seed = 7 }) {
  const rand = mulberry32(seed)
  const variants = [11, 29, 47, 83].map((s) => cloudTexture(s))
  const materials = variants.map(
    (tex) =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMap: { value: tex },
          uCamRight: { value: new THREE.Vector3(1, 0, 0) },
          uCamUp: { value: new THREE.Vector3(0, 1, 0) },
          uLit: { value: new THREE.Color('#fff2e6') },
          uShadow: { value: new THREE.Color('#b0a0bd') },
          uFog: { value: new THREE.Color('#f0c4c8') },
          uOpacity: { value: 0.62 },
          uFogNear: { value: 150.0 },
          uFogFar: { value: 380.0 },
        },
      }),
  )

  const group = new THREE.Group()
  group.name = 'hero-clouds'
  const minX = boxMin[0]
  const maxX = boxMax[0]
  const width = maxX - minX
  const planes = []

  const addPlane = (x, y, z, w, flat) => {
    const geo = new THREE.PlaneGeometry(w, w * flat)
    const m = new THREE.Mesh(geo, materials[(rand() * materials.length) | 0])
    m.position.set(x, y, z)
    m.frustumCulled = false
    m.renderOrder = 1
    m.userData.baseX = x
    group.add(m)
    planes.push(m)
  }

  // Clustered puffs → billowing masses rather than an even wall. Two layers: a
  // dense low floor that occludes whatever sits below the bank, and taller
  // billows above it for silhouette.
  const layers = [
    { clusters: 30, per: 7, y: [boxMin[1], boxMin[1] + 22], spread: 66, wide: [80, 165], flat: [0.4, 0.58] },
    { clusters: 18, per: 5, y: [boxMin[1] + 20, boxMax[1]], spread: 50, wide: [44, 104], flat: [0.66, 0.92] },
  ]
  for (const L of layers) {
    for (let c = 0; c < L.clusters; c++) {
      const cx = boxMin[0] + rand() * (boxMax[0] - boxMin[0])
      const cy = L.y[0] + rand() * (L.y[1] - L.y[0])
      const cz = boxMin[2] + rand() * (boxMax[2] - boxMin[2])
      for (let i = 0; i < L.per; i++) {
        const w = L.wide[0] + rand() * (L.wide[1] - L.wide[0])
        const flat = L.flat[0] + rand() * (L.flat[1] - L.flat[0])
        addPlane(
          cx + (rand() - 0.5) * L.spread,
          cy + (rand() - 0.5) * 22,
          cz + (rand() - 0.5) * L.spread,
          w,
          flat,
        )
      }
    }
  }

  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const fwd = new THREE.Vector3()
  const wind = 1.4 // world units / second — a slow drift

  return {
    group,
    update(camera, seconds) {
      camera.matrixWorld.extractBasis(right, up, fwd)
      for (const mat of materials) {
        mat.uniforms.uCamRight.value.copy(right)
        mat.uniforms.uCamUp.value.copy(up)
      }
      for (const m of planes) {
        const x = m.userData.baseX + seconds * wind
        m.position.x = minX + (((x - minX) % width) + width) % width
      }
    },
  }
}
