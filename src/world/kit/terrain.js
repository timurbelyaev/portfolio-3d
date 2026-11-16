import * as THREE from 'three'
import { LOOK } from './look.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rng, fbm, noise3, tx, scl, rot, ball, paint } from './geo.js'
import { meadow } from './flora.js'

// Regular grid of vertices from `fn(i, j) -> [x, y, z]`. `wrap` joins the last
// column to the first. `flip` reverses the winding (normal = dj × di).
export function gridGeo(rows, cols, fn, { wrap = false, flip = false } = {}) {
  const pos = new Float32Array(rows * cols * 3)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const v = fn(i, j)
      pos.set(v, (i * cols + j) * 3)
    }
  }
  const idx = []
  const jmax = wrap ? cols : cols - 1
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < jmax; j++) {
      const a = i * cols + j
      const b = i * cols + ((j + 1) % cols)
      const c = a + cols
      const d = b + cols
      if (flip) idx.push(a, b, c, b, d, c)
      else idx.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

const ROCK = LOOK.rock.map((h) => new THREE.Color(h))
const LAWN = LOOK.lawn.map((h) => new THREE.Color(h))
const _c = new THREE.Color()

// The rock ramp in use. `island()` swaps in a hue-shifted copy while it builds,
// so every stone painted inside one island (walls, boulders, crags, shards)
// shares that island's shift and no two islands look cast from one mould.
let [ROCK_TOP, ROCK_MID, ROCK_LOW] = ROCK
function shiftRock(hue) {
  const prev = [ROCK_TOP, ROCK_MID, ROCK_LOW]
  ;[ROCK_TOP, ROCK_MID, ROCK_LOW] = ROCK.map((c) => c.clone().offsetHSL(hue, 0, 0))
  return () => ([ROCK_TOP, ROCK_MID, ROCK_LOW] = prev)
}

export function rockColor(t, jitter = 0) {
  if (t < 0.4) _c.copy(ROCK_TOP).lerp(ROCK_MID, t / 0.4)
  else _c.copy(ROCK_MID).lerp(ROCK_LOW, Math.min((t - 0.4) / 0.6, 1))
  return _c.multiplyScalar(1 + jitter)
}

const TAU = Math.PI * 2
const sstep = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1)
  return t * t * (3 - 2 * t)
}

// Integer hash in [0, 1): per-stratum and per-block choices.
function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Primitives carry seams (uv, per-face normals). Welding them lets the
// position-only displacement keep the shape closed and the normals average.
// Welding is slow, so each primitive shape is welded once and cloned.
const welded = new Map()
function weld(key, make) {
  let g = welded.get(key)
  if (!g) {
    g = make()
    g.deleteAttribute('normal')
    g.deleteAttribute('uv')
    g = mergeVertices(g, 1e-4)
    welded.set(key, g)
  }
  return g.clone()
}

// Smooth shading within a surface, hard edges where it folds sharply (ledges,
// fracture faces): each triangle corner averages only the faces around its
// vertex that lie within `angle` of the triangle itself. Works on the index,
// so it costs a few passes instead of welding by position. Returns
// non-indexed geometry with normals, which Kit keeps as is.
function creased(g, angle = 40) {
  const pos = g.attributes.position.array
  // One index type keeps the loops below monomorphic (stones index in 16 bits).
  const idx = g.index.array instanceof Uint32Array ? g.index.array : Uint32Array.from(g.index.array)
  const F = idx.length / 3
  const V = pos.length / 3
  const fn = new Float32Array(F * 3)
  const fu = new Float32Array(F * 3)
  for (let f = 0; f < F; f++) {
    const a = idx[f * 3] * 3
    const b = idx[f * 3 + 1] * 3
    const c = idx[f * 3 + 2] * 3
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
    // Area-weighted: the cross product is left unnormalised for averaging.
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1)
    fn[f * 3] = nx
    fn[f * 3 + 1] = ny
    fn[f * 3 + 2] = nz
    fu[f * 3] = nx * l
    fu[f * 3 + 1] = ny * l
    fu[f * 3 + 2] = nz * l
  }
  // Vertex -> faces, compressed.
  const start = new Uint32Array(V + 1)
  for (let i = 0; i < idx.length; i++) start[idx[i] + 1]++
  for (let v = 0; v < V; v++) start[v + 1] += start[v]
  const fill = start.slice(0, V)
  const ring = new Uint32Array(idx.length)
  for (let i = 0; i < idx.length; i++) ring[fill[idx[i]]++] = (i / 3) | 0
  const lim = Math.cos((angle * Math.PI) / 180)
  // Fast path: if every face around a vertex is within half the crease
  // angle of their average, all pairs are within the angle, so every corner
  // there gets that same average. Only real creases need the per-corner pass.
  const half = Math.cos((angle * Math.PI) / 360)
  const vn = new Float32Array(V * 3)
  const smooth = new Uint8Array(V)
  for (let v = 0; v < V; v++) {
    let sx = 0, sy = 0, sz = 0
    for (let q = start[v]; q < start[v + 1]; q++) {
      const o = ring[q] * 3
      sx += fn[o]
      sy += fn[o + 1]
      sz += fn[o + 2]
    }
    const l = 1 / (Math.sqrt(sx * sx + sy * sy + sz * sz) || 1)
    sx *= l
    sy *= l
    sz *= l
    let ok = 1
    for (let q = start[v]; q < start[v + 1]; q++) {
      const o = ring[q] * 3
      if (fu[o] * sx + fu[o + 1] * sy + fu[o + 2] * sz < half) {
        ok = 0
        break
      }
    }
    vn[v * 3] = sx
    vn[v * 3 + 1] = sy
    vn[v * 3 + 2] = sz
    smooth[v] = ok
  }
  const out = new Float32Array(idx.length * 3)
  const nrm = new Float32Array(idx.length * 3)
  for (let f = 0; f < F; f++) {
    const nx = fu[f * 3], ny = fu[f * 3 + 1], nz = fu[f * 3 + 2]
    for (let k = 0; k < 3; k++) {
      const v = idx[f * 3 + k]
      const w = (f * 3 + k) * 3
      out[w] = pos[v * 3]
      out[w + 1] = pos[v * 3 + 1]
      out[w + 2] = pos[v * 3 + 2]
      if (smooth[v]) {
        nrm[w] = vn[v * 3]
        nrm[w + 1] = vn[v * 3 + 1]
        nrm[w + 2] = vn[v * 3 + 2]
        continue
      }
      let sx = 0, sy = 0, sz = 0
      for (let q = start[v]; q < start[v + 1]; q++) {
        const o = ring[q] * 3
        if (fu[o] * nx + fu[o + 1] * ny + fu[o + 2] * nz >= lim) {
          sx += fn[o]
          sy += fn[o + 1]
          sz += fn[o + 2]
        }
      }
      const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1
      nrm[w] = sx / sl
      nrm[w + 1] = sy / sl
      nrm[w + 2] = sz / sl
    }
  }
  const r = new THREE.BufferGeometry()
  r.setAttribute('position', new THREE.BufferAttribute(out, 3))
  r.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  if (g.attributes.color) {
    const col = g.attributes.color.array
    const cc = new Float32Array(idx.length * 3)
    for (let i = 0; i < idx.length; i++) {
      cc[i * 3] = col[idx[i] * 3]
      cc[i * 3 + 1] = col[idx[i] * 3 + 1]
      cc[i * 3 + 2] = col[idx[i] * 3 + 2]
    }
    r.setAttribute('color', new THREE.BufferAttribute(cc, 3))
  }
  return r
}

// Random cutting planes [nx, ny, nz, offset]. `flat` < 1 leans them toward
// vertical, so spires get long facets instead of chopped tops.
function planes(rand, n, near, far, flat = 1) {
  const out = []
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU
    const y = (rand() * 2 - 1) * flat
    const h = Math.sqrt(1 - y * y)
    out.push([Math.cos(a) * h, y, Math.sin(a) * h, near + rand() * (far - near)])
  }
  return out
}

// Broken stone: a lopsided noise-warped mass with a few fracture planes
// shaving flat faces off it, then fine breakup. Flat facets meeting at worn
// edges are what reads as "stone" rather than "dice" or "blob".
function stoneGeo(s, detail, seed) {
  const g = weld(`ball${detail}`, () => ball(1, detail))
  const rand = rng(seed * 7919 + 13)
  const ax = 0.9 + rand() * 0.35
  const ay = 0.58 + rand() * 0.25
  const az = 0.72 + rand() * 0.3
  const cuts = planes(rand, 9 + ((rand() * 3) | 0), 0.45, 0.72)
  // A flat bed underneath: boulders rest, they are not balls.
  cuts.push([0, -1, 0, 0.45 + rand() * 0.2])
  const o = (seed % 97) * 5.3
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    // Cut before the anisotropic stretch, so the planes bite on every axis.
    let x = p.getX(i)
    let y = p.getY(i)
    let z = p.getZ(i)
    const m = 0.8 + 0.4 * fbm(x * 1.2 + o, y * 1.2, z * 1.2, 2)
    x *= m
    y *= m
    z *= m
    for (const [a, b, c, d] of cuts) {
      const h = x * a + y * b + z * c - d
      if (h > 0) {
        x -= a * h
        y -= b * h
        z -= c * h
      }
    }
    x *= ax
    y *= ay
    z *= az
    const len = Math.sqrt(x * x + y * y + z * z) || 1
    const n = (noise3(x * 3.5 + o, y * 3.5, z * 3.5) - 0.5) * 0.06 + (noise3(x * 7, y * 7 + o, z * 7) - 0.5) * 0.025
    const q = (1 + n / len) * s
    p.setXYZ(i, x * q, y * q, z * q)
  }
  return g
}

// A tapering spire (crag, hanging shard): vertical fracture planes cut in a
// section normalised by the local radius so the facets run the full height,
// thin horizontal bands, a tilted break at the top and fine breakup.
function spireGeo(rb, rt, h, seed, radial, rows) {
  const ratio = Math.round((rt / rb) * 100) / 100
  const g = weld(`cyl${ratio}|${radial}|${rows}`, () => new THREE.CylinderGeometry(ratio, 1, 1, radial, rows))
  g.scale(rb, h, rb)
  const rand = rng(seed * 6007 + 3)
  const cuts = planes(rand, 4 + ((rand() * 2) | 0), 0.68, 0.9, 0.12)
  const tilt = 0.25 + rand() * 0.45
  const ta = rand() * TAU
  const top = [Math.cos(ta) * Math.sin(tilt), Math.cos(tilt), Math.sin(ta) * Math.sin(tilt), h * (0.5 - 0.06 - rand() * 0.1)]
  const o = (seed % 89) * 4.1
  const band = 4 / h
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i)
    let y = p.getY(i)
    let z = p.getZ(i)
    const k = rb + (rt - rb) * (y / h + 0.5)
    let nx = x / k
    let nz = z / k
    for (const [a, , c, d] of cuts) {
      const e = nx * a + nz * c - d
      if (e > 0) {
        nx -= a * e * 0.9
        nz -= c * e * 0.9
      }
    }
    const yy = y / h
    const mass = 0.86 + 0.28 * fbm(nx * 0.9 + o, yy * 2.2, nz * 0.9, 2)
    const strata = (noise3(o, y * band, 3.3) - 0.5) * 0.16
    const fine = (noise3(nx * 3 + o, yy * 9, nz * 3) - 0.5) * 0.1
    const rr = k * (mass + strata + fine)
    x = nx * rr
    z = nz * rr
    const e = x * top[0] + y * top[1] + z * top[2] - top[3]
    if (e > 0) {
      x -= top[0] * e
      y -= top[1] * e
      z -= top[2] * e
    }
    p.setXYZ(i, x, y, z)
  }
  return g
}

// Subdivision level for a stone of size `s` seen at island `detail`.
const stoneDetail = (s, detail) => (detail < 0.6 ? 1 : s * detail > 1.0 ? 3 : s * detail > 0.3 ? 2 : 1)

// A loose boulder: broken stone, lighter on top.
export function boulder(kit, base, s, seed, tone = 0.15, detail = 1) {
  const g = stoneGeo(s, stoneDetail(s, detail), seed)
  paint(g, (x, y, z) => rockColor(tone + 0.25 * (1 - (y / s + 1) / 2), (noise3(x * 3 / s, y * 3 / s, z * 3 / s + seed) - 0.5) * 0.14).clone())
  kit.add('rock', creased(g, 30), null, base, { smooth: true })
}

// A standing crag: a tall fractured spire, used around rims for drama.
export function crag(kit, base, s, hgt, seed, detail = 1) {
  const radial = detail < 0.6 ? 8 : 14
  const rows = Math.max(3, Math.round((hgt / s) * (detail < 0.6 ? 2 : 5)))
  const g = spireGeo(s, s * 0.42, hgt, seed, radial, rows)
  paint(g, (x, y, z) => rockColor(0.05 + 0.4 * (0.5 - y / hgt), (noise3(x * 2, y * 2, z * 2 + seed) - 0.5) * 0.16).clone())
  kit.add('rock', creased(g, 38), tx(0, hgt * 0.42, 0), base, { smooth: true })
}

// --- floating island --------------------------------------------------------------
// A lawn-topped slab of stratified rock tapering to a point. `r` is the nominal
// radius; the lawn's flat part (local y = 0) reaches about 0.85 r.
// `detail` scales tessellation and relief resolution (1 = hero islands seen
// from 15–60 units; ~0.35 is plenty for islands only seen through haze).
export function island(kit, base, { r = 14, depth = 18, seed = 1, sx = 1, sz = 1, grass = 1, crags = 0, keepOut = [], bare = false, detail = 1 } = {}) {
  const rand = rng(seed)
  const B = base.clone().multiply(scl(sx, 1, sz))
  const s1 = seed * 1.37
  const si = seed * 131 + 7
  // A few degrees of hue per island (about +-5), restored when it is built.
  const restoreRock = shiftRock((hash(seed, 21) - 0.5) * 0.03)
  // Coastline: periodic in theta because it is sampled on a circle.
  const rim = (th) => r * (0.88 + 0.26 * fbm(Math.cos(th) * 1.4 + s1, Math.sin(th) * 1.4, s1 * 0.3, 3))
  // Shards, debris and rim stones were laid out against the old side wall,
  // which drew one random number per vertex; burn the same count so every
  // existing composition keeps its stones where they were placed.
  for (let k = (r > 30 ? 56 : 40) * 11; k > 0; k--) rand()

  // Tessellation follows size: big islands are only ever seen from further.
  // Rows are denser than columns: strata are horizontal and need the rows.
  const eV = Math.min(0.55 + r * 0.006, 0.95) / detail
  const eH = eV * 1.5
  const SEG = Math.min(Math.max(Math.round((TAU * r * Math.max(sx, sz)) / eH), 40), 320)
  const ROWS = Math.min(Math.max(Math.round((depth + 0.4 * r) / eV), 12), 140)
  // Relief scale in world units.
  const U = Math.min(Math.max(r / 15, 0.7), 2.4)

  const cosT = new Float64Array(SEG)
  const sinT = new Float64Array(SEG)
  const rimT = new Float64Array(SEG)
  for (let j = 0; j < SEG; j++) {
    const th = (j / SEG) * TAU
    cosT[j] = Math.cos(th)
    sinT[j] = Math.sin(th)
    rimT[j] = rim(th)
  }

  // Lip: flat lawn out to rho0, then a rocky edge that drops, chips and
  // breaks the outline. rho0 moves out where the coast pulls in, so the
  // meadow (out to 0.86 r) and rim stones never hang over the drop.
  // Returns [x, y, z, e] with e < 0 inside the flat lawn.
  const jagF = 0.45 * r
  const lip = (j, rho) => {
    const c = cosT[j]
    const s = sinT[j]
    const rm = rimT[j]
    const rho0 = Math.min(Math.max((0.885 * r) / rm, 0.88), 0.97)
    const e = (rho - rho0) / (1.05 - rho0)
    if (e <= 0) return [c * rm * rho, 0, s * rm * rho, e]
    const jag = (fbm(c * jagF + s1, s * jagF, s1 + 5, 2) - 0.5) * 0.12 * sstep(0, 0.6, e)
    const rr = rm * rho * (1 + jag)
    const x = c * rr
    const z = s * rr
    const lump = sstep(0, 0.35, e) * (fbm(x * 0.45 + s1, 7.7, z * 0.45, 3) - 0.5) * 1.1 * U
    const chip = e * e * fbm(x * 0.3, s1 + 2, z * 0.3, 2) * 0.9 * U
    return [x, -Math.pow(e, 2.2) * 1.3 + lump - chip, z, e]
  }

  const lawnPaint = (x, y, z, e) => {
    const rock = rockColor(0.03 + 0.08 * Math.max(e, 0), (noise3(x * 0.4, y * 0.5, z * 0.4) - 0.5) * 0.14)
    if (bare) return rock.clone()
    const n = noise3(x * 0.16 + s1, 3, z * 0.16)
    const lawn = n < 0.5 ? LAWN[0].clone().lerp(LAWN[1], n * 2) : LAWN[1].clone().lerp(LAWN[2], (n - 0.5) * 1.3)
    // Ragged grass line: noise pushes it in and out along the lip.
    return lawn.lerp(rock, sstep(-0.2, 0.35, e + (noise3(x * 0.5, 1.7, z * 0.5) - 0.5) * 0.5))
  }

  // Top: only the lip needs dense columns. The flat middle is a coarse disc
  // tucked just under the lip grid, which overlaps it from 0.8 rho outward,
  // so the two never leave a gap and never z-fight.
  const IN = Math.max(24, SEG >> 2)
  const IRHO = [0, 0.35, 0.62, 0.86]
  const inner = gridGeo(
    IRHO.length,
    IN,
    (i, j) => {
      const th = (j / IN) * TAU
      const rr = rim(th) * IRHO[i]
      return [Math.cos(th) * rr, -0.02, Math.sin(th) * rr]
    },
    { wrap: true, flip: true },
  )
  paint(inner, (x, y, z) => lawnPaint(x, 0, z, -1))
  kit.add('ground', inner, null, B, { smooth: true })

  const RHO = [0.8, 0.87, 0.92, 0.96, 0.995, 1.025, 1.05]
  const topE = new Float32Array(RHO.length * SEG)
  const top = gridGeo(
    RHO.length,
    SEG,
    (i, j) => {
      const v = lip(j, RHO[i])
      topE[i * SEG + j] = v[3]
      return [v[0], v[1], v[2]]
    },
    { wrap: true, flip: true },
  )
  paint(top, (x, y, z, i) => lawnPaint(x, y, z, topE[i]))
  kit.add('ground', creased(top, 40), null, B, { smooth: true })

  // Sides: a tapering wall of stratified rock. Relief, outermost first:
  // broad masses, strata (hard bands stand out, each ledge undercut), joint
  // blocks staggered per stratum, through-going vertical fractures, grain.
  const H = Math.max(1.9 * U, 3.5 * eV)
  // Ledges fold within about one row: wider, the creased normals round them
  // into cushions; the slight zigzag where a tilted stratum crosses rows
  // reads as breakage.
  const tw = Math.min(Math.max((0.7 * eV) / H, 0.08), 0.3)
  const NB = Math.max(6, Math.round((TAU * r) / (4.5 * U)))
  const NF = Math.max(3, Math.round((TAU * r) / (11 * U)))
  const CW = 1.2 * eH
  const AS = Math.min(0.1 * r, 3.2)
  const AN = 0.35 * AS
  const AB = 0.35 * AS
  const AC = 0.2 * U
  const AF = 0.4 * U
  // Hard and soft bands roughly alternate, so neighbouring strata always differ.
  const prot = (k) => (k & 1 ? 0.22 : -0.22) + (hash(k, si) - 0.5) * 0.7
  const bendX = (hash(seed, 3) - 0.5) * r * 0.2
  const bendZ = (hash(seed, 4) - 0.5) * r * 0.2

  const lx = new Float64Array(SEG)
  const ly = new Float64Array(SEG)
  const lz = new Float64Array(SEG)
  const edgeR = new Float64Array(SEG)
  const tilt = new Float64Array(SEG)
  const jw = new Float64Array(SEG)
  const frac = new Float64Array(SEG)
  for (let j = 0; j < SEG; j++) {
    const c = cosT[j]
    const s = sinT[j]
    const v = lip(j, 1.05)
    lx[j] = v[0]
    ly[j] = v[1]
    lz[j] = v[2]
    edgeR[j] = Math.sqrt(v[0] * v[0] + v[2] * v[2])
    // Strata dip and undulate around the island instead of lying in planes.
    tilt[j] = (fbm(c * 0.9 + s1, s * 0.9, s1 + 9, 2) - 0.5) * 4 * U
    jw[j] = (noise3(c * 2.2 + s1, s * 2.2, s1 + 3) - 0.5) * 0.9
    const cf = (j / SEG) * NF + (noise3(c * 1.7, s * 1.7, s1 + 11) - 0.5) * 0.8
    const m = Math.floor(cf)
    const d = Math.min(cf - m, 1 - (cf - m)) * ((TAU * r) / NF)
    frac[j] = hash(((m % NF) + NF) % NF, si, 9) > 0.6 ? 1 - sstep(0, CW, d) : 0
  }

  let crack = 0
  const joint = (k, j, R) => {
    const cc = (j / SEG) * NB + jw[j] + hash(k, si, 5)
    const m = Math.floor(cc)
    const v = cc - m
    const open = sstep(0, CW, Math.min(v, 1 - v) * ((TAU * R) / NB))
    crack = 1 - open
    // Some blocks have fallen out of the band, breaking the ledge line.
    const hb = hash(k, ((m % NB) + NB) % NB, si)
    return (hb < 0.22 ? -0.9 : hb - 0.5) * AB * open - AC * crack
  }

  const tone = new Float32Array(ROWS * SEG)
  const side = gridGeo(
    ROWS,
    SEG,
    (i, j) => {
      if (i === 0) return [lx[j], ly[j], lz[j]]
      const c = cosT[j]
      const s = sinT[j]
      const t = i / (ROWS - 1)
      const y = ly[j] - t * depth
      const prof = t < 0.2 ? 1 - 0.12 * (t / 0.2) : 0.88 * Math.pow(1 - (t - 0.2) / 0.8, 0.75)
      const mass = 1 + (0.4 * fbm(c * 2 + s1, t * 2.6 + s1, s * 2, 2) - 0.2) * sstep(0, 0.12, t)
      const R = edgeR[j] * prof * mass
      // Relief fades in below the lip (which must meet the lawn exactly) and
      // out toward the tip, where the wall narrows to a point.
      const fade = sstep(0, 0.6 * U, t * depth) * Math.min(1, R / (0.3 * r))

      const ys = -y + tilt[j]
      const L = ys / H + 0.7 * noise3(ys / (3 * H), s1, 0.5)
      const k = Math.floor(L)
      const u = L - k
      const hm = prot(k - 1)
      const h0 = prot(k)
      const h1 = prot(k + 1)
      const n0 = 0.25 + Math.max(0, hm - h0) * 1.2
      const n1 = 0.25 + Math.max(0, h0 - h1) * 1.2
      const w = sstep(1 - tw, 1, u)
      const under = n0 * (1 - sstep(0, 0.18, u))
      const face = h0 * AS - AN * under
      const lay = face + (h1 * AS - AN * n1 - face) * w

      let jt = joint(k, j, R)
      let cr = crack
      if (w > 0) {
        jt += (joint(k + 1, j, R) - jt) * w
        cr += (crack - cr) * w
      }
      const fr = frac[j] > 0 ? frac[j] * sstep(0.5, 0.7, noise3(c * 2, ys * 0.12, s * 2 + s1)) : 0
      const fine = (fbm(c * R * 0.35 + s1, y * 0.5, s * R * 0.35, 2) - 0.5) * U

      const rr = Math.max(R + (lay + jt - fr * AF + fine) * fade, 0.02)
      const bend = t * t
      tone[i * SEG + j] = (h0 * (1 - w) + h1 * w) * 0.3 - (0.18 * Math.max(cr, fr) + 0.08 * under * (1 - w)) * fade
      return [c * rr + bendX * bend, y + (noise3(c * 3 + s1, t * 6, s * 3) - 0.5) * 0.5 * U * fade, s * rr + bendZ * bend]
    },
    { wrap: true, flip: true },
  )
  // Painted strata on top of the relief: 2-3 broad bands of terracotta at
  // different lightness and warmth (rosier / more ochre in turn), a soft dark
  // seam between them. They follow the strata dip (`tilt`) plus a slow warp,
  // so no seam is ruler-straight. The offset keeps the first seam well below
  // the lawn line. The rock texture is strong, so the steps are not subtle.
  const bandH = depth / (2.2 + hash(seed, 22) * 0.8)
  const bandL = [0, 1, 2, 3].map((k) => (k & 1 ? -0.17 : 0.06) + (hash(k, si, 23) - 0.5) * 0.06)
  const WARM = [[0.99, 1.0, 1.03], [1.02, 0.97, 0.92]]
  let bandW = WARM[0]
  const band = (x, y, z, j) => {
    const b = 0.35 + (-y + tilt[j] * 0.8 + (fbm(x * 0.06 + s1, y * 0.03, z * 0.06, 2) - 0.5) * bandH * 0.7) / bandH
    const f = Math.floor(b)
    const k = Math.min(Math.max(f, 0), 3)
    bandW = WARM[k & 1]
    const seam = 1 - sstep(0, 0.1, Math.min(b - f, 1 - (b - f)))
    return bandL[k] - 0.45 * seam
  }
  paint(side, (x, y, z, i) => {
    const c = rockColor(Math.min(-y / depth, 1) * 0.95, tone[i] + band(x, y, z, i % SEG) + (noise3(x * 0.5, y * 0.9, z * 0.5) - 0.5) * 0.14)
    return c.clone().setRGB(c.r * bandW[0], c.g * bandW[1], c.b * bandW[2])
  })
  kit.add('rock', creased(side, 42), null, B, { smooth: true })

  // Hanging shards under the rim.
  const shards = 4 + ((rand() * 4) | 0)
  for (let i = 0; i < shards; i++) {
    const a = rand() * Math.PI * 2
    const d = r * (0.3 + rand() * 0.5)
    const s = r * (0.1 + rand() * 0.12)
    const g = detail < 0.6 ? spireGeo(s, s * 0.08, s * 3.4, seed + i, 7, 4) : spireGeo(s, s * 0.08, s * 3.4, seed + i, 12, 9)
    paint(g, (x, y, z) => rockColor(0.55 + 0.3 * (y / (s * 3.4) + 0.5), (noise3(x / s * 2, y / s * 2, z / s * 2) - 0.5) * 0.14).clone())
    kit.add('rock', creased(g, 38), tx(Math.cos(a) * d, -depth * (0.28 + rand() * 0.3), Math.sin(a) * d).multiply(rot(Math.PI)), B, { smooth: true })
  }
  // Drifting debris beside the island: small rocks that broke off.
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2
    const d = r * (1.15 + rand() * 0.35)
    boulder(kit, B.clone().multiply(tx(Math.cos(a) * d, -2 - rand() * depth * 0.5, Math.sin(a) * d)), r * (0.035 + rand() * 0.05), seed + i * 3, 0.45, detail)
  }
  // Boulders and crags along the rim.
  const stones = 5 + ((rand() * 3) | 0)
  for (let i = 0; i < stones; i++) {
    const a = rand() * Math.PI * 2
    const s = Math.min(r, 16) * (0.035 + rand() * 0.06)
    boulder(kit, B.clone().multiply(tx(Math.cos(a) * rim(a) * 0.9, s * 0.25, Math.sin(a) * rim(a) * 0.9)), s, seed + i, 0.15, detail)
  }
  for (let i = 0; i < crags; i++) {
    const a = (i / crags) * Math.PI * 2 + rand() * 0.7
    const s = Math.min(r, 30) * (0.05 + rand() * 0.045)
    crag(kit, B.clone().multiply(tx(Math.cos(a) * rim(a) * 0.98, -1.5, Math.sin(a) * rim(a) * 0.98, rand() * 6.28)), s, s * (1.5 + rand() * 1.5), seed + i * 5, detail)
  }

  if (grass > 0 && !bare) meadow(kit, B, { r: r * 0.86, seed, density: grass, keepOut })
  restoreRock()
}
