import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { fogged } from '../env.js'
import { surface } from './surface.js'
import { LOOK } from './look.js'

// Shared modelling toolbox: seeded randomness, noise, matrix shorthands, the
// material palette and `Kit`, which bakes thousands of small parts into a few
// meshes. Every model in the world is code built on top of this file.

export function rng(seed) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash3(x, y, z) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t) => t * t * (3 - 2 * t)
const mix = (a, b, t) => a + (b - a) * t

// Trilinear value noise in [0, 1].
export function noise3(x, y, z) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const u = fade(x - xi)
  const v = fade(y - yi)
  const w = fade(z - zi)
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz)
  return mix(
    mix(mix(c(0, 0, 0), c(1, 0, 0), u), mix(c(0, 1, 0), c(1, 1, 0), u), v),
    mix(mix(c(0, 0, 1), c(1, 0, 1), u), mix(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  )
}

export function fbm(x, y, z, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += noise3(x, y, z) * amp
    norm += amp
    x *= 2.03
    y *= 2.03
    z *= 2.03
    amp *= 0.5
  }
  return sum / norm
}

export const tx = (x = 0, y = 0, z = 0, ry = 0, s = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(s, s, s),
  )
export const rot = (rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))
export const scl = (x = 1, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z)

// --- primitives ----------------------------------------------------------------

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
// Box with chamfered edges: the bevel catches a line of light on every block,
// which is most of what separates "cut stone" from "grey cube".
export const cbox = (w, h, d, bevel = 0.07) =>
  new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, w * 0.45, h * 0.45, d * 0.45))
export const cyl = (rt, rb, h, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)
export const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)
export const ball = (r, detail = 2) => new THREE.IcosahedronGeometry(r, detail)
export const torus = (r, tube, radial = 8, tubular = 32) => new THREE.TorusGeometry(r, tube, radial, tubular)

// Per-vertex colour from a function of position; `fn` returns a THREE.Color.
export function paint(geo, fn) {
  const p = geo.attributes.position
  const arr = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), i)
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

// Uniform white vertex colour, for standalone meshes that use a Kit material.
export const white = (geo) => paint(geo, () => WHITE)
const WHITE = new THREE.Color(1, 1, 1)

// Displace every vertex along a noise field (welded geometry stays closed
// because the offset depends only on position).
export function crumple(geo, amount, scale = 1, seed = 0, yScale = 1) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const s = seed * 17.3
    p.setXYZ(
      i,
      x + (noise3(x * scale + s, y * scale, z * scale) - 0.5) * 2 * amount,
      y + (noise3(x * scale, y * scale + s + 31, z * scale) - 0.5) * 2 * amount * yScale,
      z + (noise3(x * scale, y * scale, z * scale + s + 77) - 0.5) * 2 * amount,
    )
  }
  return geo
}

// --- materials --------------------------------------------------------------------

const noiseGLSL = /* glsl */ `
  float kHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float kNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(kHash(i), kHash(i + vec3(1, 0, 0)), f.x), mix(kHash(i + vec3(0, 1, 0)), kHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(kHash(i + vec3(0, 0, 1)), kHash(i + vec3(1, 0, 1)), f.x), mix(kHash(i + vec3(0, 1, 1)), kHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
`

// Soft clouding of the look's patina tone over the stone, at the scale of whole
// blocks, so a wall drifts between its sibling tones instead of one fill.
function patinaGLSL() {
  if (!LOOK.patina) return ''
  const [hex, amt] = LOOK.patina
  const c = new THREE.Color(hex).multiply(_inv(LOOK.marble[0]))
  return `
    float cloud = kNoise(vWorldP * 0.21 + 7.0) * 0.65 + kNoise(vWorldP * 0.63) * 0.35;
    cloud = smoothstep(0.38, 0.78, cloud);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)}), cloud * ${amt.toFixed(3)});`
}
function _inv(hex) {
  const c = new THREE.Color(hex)
  return new THREE.Color(1 / c.r, 1 / c.g, 1 / c.b)
}

// Marble: a slow tonal drift and a few faint grey veins on top of the photo
// texture, computed in world space so neighbouring blocks never repeat.
const marbleHook = {
  key: 'marble',
  pars: noiseGLSL,
  color: /* glsl */ `
    vec3 mp = vWorldP * 0.8;
    float warp = kNoise(mp * 0.9) * 2.4;
    float vein = 1.0 - abs(kNoise(mp * vec3(1.0, 2.2, 1.0) + warp) * 2.0 - 1.0);
    vein = pow(vein, 9.0);
    float drift = kNoise(vWorldP * 0.11);
    diffuseColor.rgb *= 1.0 - vein * 0.075;
    diffuseColor.rgb *= 0.94 + drift * 0.08;
    ${patinaGLSL()}
  `,
}

// Rock: fine grain so large faces are never a flat fill.
const rockHook = {
  key: 'rock',
  pars: noiseGLSL,
  color: /* glsl */ `
    float grain = kNoise(vWorldP * 1.7) * 0.6 + kNoise(vWorldP * 5.1) * 0.4;
    diffuseColor.rgb *= 0.86 + grain * 0.24;
  `,
}

const std = (color, params = {}, hook) =>
  fogged(new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.8, metalness: 0, ...params }), hook)

// Texture detail per family. Gains are set from each map's measured contrast.
// Marble (Poly Haven marble_01) is a polished stone: its roughness map is
// remapped so the flat polish reads as a soft sheen and the pits stay matte.
const marbleSurface = surface(marbleHook, 'marble', {
  scale: 0.3,
  gain: 0.9,
  chroma: 0.2,
  normal: 0.3,
  rough: [0.42, 0.72],
  roughIn: [0.48, 0.75],
})
const rockSurface = surface(rockHook, 'rock', { scale: 0.11, gain: 1.0, chroma: 0.15, normal: 1.2 })
const groundSurface = surface(rockHook, 'ground', { scale: 0.09, gain: 0.45, chroma: 0.3, normal: 0.6 })
const barkSurface = surface({ key: 'bark' }, 'bark', { scale: 0.9, gain: 0.7, normal: 1 })

// Gold keeps a direct sun highlight everywhere except on the hero frame, where
// the sun sits behind the wall and could not physically reach it.
const unlitDirect = {
  key: 'nodirect',
  // Mouldings facing straight up or down mirror the bright ceiling / floor
  // panels of the room environment as a hot bar along a rail; damp them so
  // all four rails read as one gilded surface.
  replace: [[
    '#include <aomap_fragment>',
    `reflectedLight.directSpecular *= 0.0;
    reflectedLight.directDiffuse *= 0.0;
    float upFacing = (vec4(normal, 0.0) * viewMatrix).y;
    reflectedLight.indirectSpecular *= mix(1.0, 0.5, smoothstep(0.2, 0.85, abs(upFacing)));
    #include <aomap_fragment>`,
  ]],
}

export const MAT = {
  marble: std(LOOK.marble[0], { roughness: 0.5, envMapIntensity: 0.5 }, marbleSurface),
  marbleShade: std(LOOK.marbleShade[0], { roughness: 0.5, envMapIntensity: 0.5 }, marbleSurface),
  rock: std('#ffffff', { roughness: 1, side: THREE.DoubleSide }, rockSurface),
  ground: std('#ffffff', { roughness: 1 }, groundSurface),
  gold: std(LOOK.gold[0], { roughness: 0.42, metalness: 1, envMapIntensity: 3.0 }),
  goldFrame: std('#f3c870', { roughness: 0.3, metalness: 1, envMapIntensity: 1.45 }, unlitDirect),
  bronze: std(LOOK.bronze[0], { roughness: 0.45, metalness: 0.7 }),
  bark: std('#ffffff', { roughness: 1 }, barkSurface),
  // Dark matte lining, e.g. the inner lip of the picture frame.
  liner: std('#2c1f1c', { roughness: 1, envMapIntensity: 0 }),
  // Emissive accents: values above 1.0 so the bloom pass makes them glow.
  glow: fogged(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.5, 0.9), vertexColors: true })),
  ember: fogged(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.1, 0.55), vertexColors: true })),
}
MAT.glow.userData.noShadow = true
MAT.ember.userData.noShadow = true

// --- tones -----------------------------------------------------------------------

// Vertex colour of a part with no explicit colour: a sibling tone from the
// look's family, as a ratio to the material colour. Parts in the same 5-unit
// cell share a tone (dentils, rings and leaves of one moulding stay one stone);
// a small per-part lightness jitter keeps neighbouring blocks apart.
const FAMILIES = {}
for (const key of ['marble', 'marbleShade', 'gold']) {
  const list = LOOK[key]
  if (list.length < 2) continue
  const inv = _inv(list[0])
  FAMILIES[key] = list.map((h) => new THREE.Color(h).multiply(inv))
}
const _box = new THREE.Box3()
const _ctr = new THREE.Vector3()
function cellHash(a, b, c, d) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ Math.imul(d | 0, 0x85ebca77)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
// Role tones, absolute (linear) colours; divided by the material colour at
// `Kit.add` time, so one role reads the same on `marble` and `marbleShade`.
const ROLES = {}
for (const family of Object.values(LOOK.roles || {})) {
  for (const [role, list] of Object.entries(family)) ROLES[role] = list.map((h) => new THREE.Color(h))
}
// Big surfaces vary block by block; everything else takes one tone per model.
const BLOCK_ROLES = new Set(['field', 'plinth'])
const _anchor = new THREE.Vector3()

// `anchor` is the matrix that places the part's model (or null). Small-part
// roles hash the model's origin instead of the part's centre: dentils, leaves
// and rings of one moulding then share a tone even where they straddle a cell
// border, and they skip the per-part jitter that would speckle them.
function roleTone(mat, role, g, anchor, out) {
  const list = ROLES[role]
  const block = BLOCK_ROLES.has(role)
  if (block || !anchor) _box.setFromBufferAttribute(g.attributes.position).getCenter(_anchor)
  else _anchor.setFromMatrixPosition(anchor)
  const salt = role.length * 977 + role.charCodeAt(0)
  const pick = cellHash(Math.floor(_anchor.x / 5), Math.floor(_anchor.y / 5), Math.floor(_anchor.z / 5), salt)
  const base = MAT[mat].color
  const tone = list[Math.floor(pick * list.length)]
  out.setRGB(tone.r / base.r, tone.g / base.g, tone.b / base.b)
  if (!block) return out
  const j = cellHash(Math.round(_anchor.x * 7), Math.round(_anchor.y * 7), Math.round(_anchor.z * 7), salt + 1)
  return out.multiplyScalar(0.985 + j * 0.03)
}

function toneOf(mat, g, out) {
  const fam = FAMILIES[mat]
  if (!fam) return out.setRGB(1, 1, 1)
  _box.setFromBufferAttribute(g.attributes.position).getCenter(_ctr)
  const salt = mat.length * 131
  const cx = Math.floor(_ctr.x / 5)
  const cy = Math.floor(_ctr.y / 5)
  const cz = Math.floor(_ctr.z / 5)
  out.copy(fam[Math.floor(cellHash(cx, cy, cz, salt) * fam.length)])
  const j = cellHash(Math.round(_ctr.x * 7), Math.round(_ctr.y * 7), Math.round(_ctr.z * 7), salt + 1)
  return out.multiplyScalar(0.985 + j * 0.03)
}

// --- Kit --------------------------------------------------------------------------

const KEEP = new Set(['position', 'normal', 'uv', 'color'])
const _m = new THREE.Matrix4()
const _c = new THREE.Color()

// Collects geometry per (zone, material) and bakes each bucket into ONE mesh.
// Zones are spatial chunks, so frustum culling still works on the merged world.
export class Kit {
  constructor() {
    this.parts = new Map()
    this.zoneName = 'main'
  }
  zone(name) {
    this.zoneName = name
    return this
  }
  // `local` positions the part inside its model; `base` places the model.
  // Faceted by default; pass `smooth` to keep/compute averaged normals.
  // `tone` names an architectural role from the look (see look.js); an
  // explicit `color` wins over it, and no role keeps the family hash.
  add(mat, geo, local, base, { smooth = false, color, tone } = {}) {
    let g = geo
    if (smooth) {
      if (!g.attributes.normal) g.computeVertexNormals()
      if (g.index) g = g.toNonIndexed()
    } else {
      if (g.index) g = g.toNonIndexed()
      g.computeVertexNormals()
    }
    const n = g.attributes.position.count
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
    for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name)
    const m = local && base ? _m.multiplyMatrices(base, local) : local || base
    if (m) g.applyMatrix4(m)
    if (!g.attributes.color) {
      if (color !== undefined) _c.set(color)
      else if (tone && ROLES[tone]) roleTone(mat, tone, g, base || local, _c)
      else toneOf(mat, g, _c)
      const arr = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        arr[i * 3] = _c.r
        arr[i * 3 + 1] = _c.g
        arr[i * 3 + 2] = _c.b
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    }
    const key = `${this.zoneName}|${mat}`
    if (!this.parts.has(key)) this.parts.set(key, [])
    this.parts.get(key).push(g)
    return this
  }
  build(name, { shadows = true } = {}) {
    const group = new THREE.Group()
    group.name = name
    for (const [key, list] of this.parts) {
      const mat = MAT[key.split('|')[1]]
      const mesh = new THREE.Mesh(mergeGeometries(list), mat)
      mesh.name = key
      mesh.geometry.computeBoundingSphere()
      const lit = shadows && !mat.userData.noShadow
      mesh.castShadow = lit
      mesh.receiveShadow = lit && !mat.userData.noReceive
      if (mat.userData.depth) mesh.customDepthMaterial = mat.userData.depth
      group.add(mesh)
    }
    return group
  }
}
