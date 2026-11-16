import * as THREE from 'three'
import { MAT, rng, noise3, tx, rot, scl, box, cbox, ball, torus } from './geo.js'
import { gridGeo, boulder } from './terrain.js'

// Classical parts: the column (the workhorse of the whole world), entablature,
// pediment, steles, pedestals and the small gilded symbols that stand on them.

MAT.gold.side = THREE.DoubleSide
MAT.goldFrame.side = THREE.DoubleSide

const TAU = Math.PI * 2
const T = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z)

// Surface of revolution through `pts` ([radius, y] pairs). Faces point outward
// when the profile runs upward; a downward profile is flipped automatically.
export function lathe(pts, seg = 28) {
  const down = pts[pts.length - 1][1] < pts[0][1]
  return gridGeo(
    pts.length,
    seg,
    (i, j) => {
      const a = (j / seg) * TAU
      return [Math.cos(a) * pts[i][0], pts[i][1], Math.sin(a) * pts[i][0]]
    },
    { wrap: true, flip: down },
  )
}

// Fluted shaft with entasis (the slight swelling real columns have). Each flute
// is its own strip of vertices, so the arris between two flutes stays sharp.
// `jag` > 0 breaks the top off unevenly.
export function flutedShaft(rb, rt, h, { flutes = 20, seg = 4, rings = 10, depth = 0.075, jag = 0, seed = 0 } = {}) {
  const cols = flutes * (seg + 1)
  const pos = new Float32Array((rings + 1) * cols * 3)
  const idx = []
  const rand = rng(seed + 1)
  const chip = Array.from({ length: flutes }, () => rand())
  // Stone breaks along a rough tilted plane, with small chips off the arrises.
  const tilt = rand() * TAU
  const slope = (jag * 0.55) / rb
  const plane = (x, z) => (x * Math.cos(tilt) + z * Math.sin(tilt)) * slope
  const chipAt = (f, u) => (chip[(f + (u > 0.5 ? 1 : 0)) % flutes] - 0.5) * jag * 0.32
  for (let j = 0; j <= rings; j++) {
    const t = j / rings
    const r = rb + (rt - rb) * t + rb * 0.022 * Math.sin(Math.PI * t)
    const fadeIn = Math.min(t / 0.05, 1) * Math.min((1 - t) / 0.05, 1)
    for (let f = 0; f < flutes; f++) {
      for (let s = 0; s <= seg; s++) {
        const u = s / seg
        const a = ((f + u) / flutes) * TAU
        const rad = r * (1 - depth * fadeIn * Math.sin(Math.PI * u))
        const x = Math.cos(a) * rad
        const z = Math.sin(a) * rad
        const top = j === rings && jag ? plane(x, z) + chipAt(f, u) : 0
        pos.set([x, h * t + top, z], (j * cols + f * (seg + 1) + s) * 3)
      }
    }
  }
  const strip = (j0, j1) => {
    for (let f = 0; f < flutes; f++) {
      for (let s = 0; s < seg; s++) {
        const a = j0 * cols + f * (seg + 1) + s
        const c = j1 * cols + f * (seg + 1) + s
        idx.push(a, c, a + 1, a + 1, c, c + 1)
      }
    }
  }
  for (let j = 0; j < rings; j++) strip(j, j + 1)
  const wallTris = idx.length / 3
  const verts = Array.from(pos)

  // A broken shaft is solid stone: close the top with a fracture surface that
  // starts at the ragged rim (duplicated, so the break keeps a sharp edge),
  // settles onto the break plane and gets a coarse granular relief. Rings
  // depend only on angle, so flute seams stay shut.
  if (jag) {
    const CAP = 4
    const rim = rings * cols
    const first = verts.length / 3
    const relief = (x, z) => (noise3(x * 3.1 / rb + seed, 2.7, z * 3.1 / rb) - 0.5) * jag * 0.28
    for (let c = 0; c < CAP; c++) {
      const k = c / CAP
      for (let v = 0; v < cols; v++) {
        const x = pos[(rim + v) * 3] * (1 - k)
        const y = pos[(rim + v) * 3 + 1]
        const z = pos[(rim + v) * 3 + 2] * (1 - k)
        const edge = y - h - plane(pos[(rim + v) * 3], pos[(rim + v) * 3 + 2])
        verts.push(x, h + plane(x, z) + edge * (1 - k) * (1 - k) + (c ? relief(x, z) : 0), z)
      }
    }
    for (let c = 0; c < CAP - 1; c++) strip(first / cols + c, first / cols + c + 1)
    const tip = verts.length / 3
    verts.push(0, h + relief(0, 0), 0)
    const last = first + (CAP - 1) * cols
    for (let f = 0; f < flutes; f++) {
      for (let s = 0; s < seg; s++) {
        const a = last + f * (seg + 1) + s
        idx.push(a, tip, a + 1)
      }
    }
  }
  let g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  if (!jag) return g
  // Facet the fracture: smooth normals there read as folded cloth, not stone.
  g = g.toNonIndexed()
  const P = g.attributes.position
  const N = g.attributes.normal
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  const p0 = new THREE.Vector3()
  for (let t = wallTris; t < P.count / 3; t++) {
    p0.fromBufferAttribute(P, t * 3)
    e1.fromBufferAttribute(P, t * 3 + 1).sub(p0)
    e2.fromBufferAttribute(P, t * 3 + 2).sub(p0)
    e1.cross(e2).normalize()
    for (let k = 0; k < 3; k++) N.setXYZ(t * 3 + k, e1.x, e1.y, e1.z)
  }
  return g
}

// One acanthus leaf: rises along +Y, leans out along +Z and curls at the tip.
function acanthus(len, width) {
  return gridGeo(
    6,
    3,
    (i, j) => {
      const s = i / 5
      const w = width * Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * s)), 0.7)
      const out = 0.1 * len * s + 0.55 * len * s * s * s
      const y = (len * Math.sin(s * 1.9)) / 0.946
      return [((j - 1) * w) / 2, y, out + (j === 1 ? 0.08 * len : 0)]
    },
    { flip: true },
  )
}

// Fan of gilded blades: the ornament on roof corners and stele tops.
export function palmette(kit, base, s = 1, mat = 'gold') {
  for (let i = -2; i <= 2; i++) {
    const len = s * (1 - Math.abs(i) * 0.16)
    kit.add(mat, ball(0.5, 1), rot(0, 0, -i * 0.5).multiply(T(0, len * 0.55, 0)).multiply(scl(s * 0.2, len, s * 0.12)), base, { smooth: true, tone: 'gilt' })
  }
  kit.add(mat, ball(s * 0.2, 1), T(0, s * 0.08, 0), base, { smooth: true, tone: 'gilt' })
}

// Attic base profile, in shaft radii.
const BASE = [[1.3, 0.42], [1.43, 0.5], [1.43, 0.62], [1.3, 0.72], [1.15, 0.76], [1.1, 0.86], [1.22, 0.93], [1.25, 1.02], [1.13, 1.1], [1.0, 1.15]]

function capital(kit, B, r, rt, detail) {
  kit.add('gold', torus(rt * 1.03, r * 0.075, 6, 24).rotateX(Math.PI / 2), T(0, r * 0.04, 0), B, { smooth: true, tone: 'oldGilt' })
  if (detail) {
    kit.add('marble', lathe([[rt, 0], [rt * 1.02, r * 0.35], [rt * 1.14, r * 0.85], [rt * 1.4, r * 1.3], [rt * 1.58, r * 1.45]], 24), null, B, { smooth: true, tone: 'moulding' })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU
      kit.add('gold', acanthus(r * 0.95, r * 0.66), T(0, r * 0.08, 0).multiply(rot(0, a, 0)).multiply(T(0, 0, rt * 0.99)), B, { tone: 'gilt' })
      kit.add('gold', acanthus(r * 0.82, r * 0.58), T(0, r * 0.62, 0).multiply(rot(0, a + TAU / 16, 0)).multiply(T(0, 0, rt * 1.08)), B, { tone: 'gilt' })
    }
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2
      kit.add('gold', torus(r * 0.2, r * 0.08, 6, 14), T(Math.sin(a) * rt * 1.72, r * 1.3, Math.cos(a) * rt * 1.72).multiply(rot(0, a + Math.PI / 2, 0)), B, { smooth: true, tone: 'gilt' })
    }
  } else {
    kit.add('gold', lathe([[rt * 1.03, r * 0.08], [rt * 1.25, r * 0.85], [rt * 1.58, r * 1.45]], 12), null, B, { smooth: true, tone: 'gilt' })
  }
  kit.add('marble', cbox(r * 2.8, r * 0.3, r * 2.8, r * 0.05), T(0, r * 1.6, 0), B, { tone: 'moulding' })
  kit.add('gold', box(r * 2.9, r * 0.1, r * 2.9), T(0, r * 1.8, 0), B, { tone: 'oldGilt' })
}

// --- column ----------------------------------------------------------------------------
// Plinth, Attic base, fluted shaft, gilded Corinthian capital. `h` is the full
// height. `cut` (0..1) breaks the shaft off at that fraction and drops a drum
// beside it. `detail: 0` is the cheap version for the far background.
export function column(kit, base, { h = 12, r = 0.9, cut = 1, seed = 1, detail = 1 } = {}) {
  const rand = rng(seed)
  kit.add('marbleShade', cbox(r * 2.9, r * 0.42, r * 2.9, r * 0.05), T(0, r * 0.21, 0), base, { tone: 'plinth' })
  kit.add('marble', lathe(BASE.map(([a, b]) => [a * r, b * r]), detail ? 28 : 14), null, base, { smooth: true, tone: 'moulding' })
  const y0 = r * 1.15
  const hs = (h - y0 - r * 1.85) * cut
  const rt = r * (1 - 0.16 * cut)
  const fl = detail ? { flutes: 20, seg: 4, rings: 10 } : { flutes: 12, seg: 2, rings: 4 }
  if (cut >= 1) {
    kit.add('marble', flutedShaft(r, rt, hs, fl), T(0, y0, 0), base, { smooth: true, tone: 'field' })
    capital(kit, base.clone().multiply(T(0, y0 + hs, 0)), r, rt, detail)
    return
  }
  // Broken: ragged top, with a fallen drum lying beside it.
  kit.add('marble', flutedShaft(r, rt, hs, { ...fl, jag: r * 0.9, seed }), T(0, y0, 0), base, { smooth: true, tone: 'field' })
  const a = rand() * TAU
  const D = base.clone().multiply(tx(Math.cos(a) * r * 3.3, r * 0.9, Math.sin(a) * r * 3.3, rand() * TAU)).multiply(rot(0, 0, Math.PI / 2)).multiply(T(0, -r * 1.15, 0))
  kit.add('marble', flutedShaft(r * 0.9, r * 0.9, r * 2.3, { flutes: fl.flutes, seg: fl.seg, rings: 2, jag: r * 0.3, seed: seed + 5 }), null, D, { smooth: true, tone: 'field' })
  // The clean end sits flush with the unfluted bottom ring of the drum.
  kit.add('marble', new THREE.CircleGeometry(r * 0.9, fl.flutes * fl.seg).rotateX(Math.PI / 2), null, D, { tone: 'field' })
}

// --- entablature ---------------------------------------------------------------------------
// Beam along local X, centred, bottom at y = 0: architrave, gilt band, frieze,
// dentils, cornice. Returns its height.
export const ENTABLATURE_H = 2.64
export function entablature(kit, base, L, depth = 2.6, { dentils = true } = {}) {
  kit.add('marble', cbox(L, 1.0, depth, 0.06), T(0, 0.5, 0), base, { tone: 'moulding' })
  kit.add('gold', box(L + 0.02, 0.12, depth + 0.08), T(0, 1.06, 0), base, { tone: 'oldGilt' })
  kit.add('marbleShade', cbox(L, 0.8, depth * 0.94, 0.05), T(0, 1.52, 0), base, { tone: 'recess' })
  if (dentils) {
    const n = Math.max(1, Math.floor(L / 0.72))
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + ((i + 0.5) * L) / n
      for (const s of [-1, 1]) kit.add('marble', box(0.36, 0.3, 0.3), T(x, 2.07, s * (depth * 0.47 + 0.15)), base, { tone: 'moulding' })
    }
  }
  kit.add('marble', cbox(L + 0.7, 0.42, depth + 0.9, 0.07), T(0, 2.43, 0), base, { tone: 'moulding' })
  return ENTABLATURE_H
}

// Triangular prism spanning `w` along X, `h` tall, `d` deep.
export function gable(w, h, d) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(0, h)
  s.closePath()
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2)
}

// Pediment: recessed tympanum with a gilt wreath, raking cornices, akroteria.
export function pediment(kit, base, w, h, d = 1.6) {
  kit.add('marbleShade', gable(w * 0.95, h * 0.94, d * 0.5), T(0, 0, -d * 0.1), base, { tone: 'recess' })
  kit.add('marble', cbox(w + 0.7, 0.42, d + 0.7, 0.07), T(0, 0.05, 0), base, { tone: 'moulding' })
  const half = w / 2
  const slope = Math.atan2(h, half)
  const len = Math.hypot(h, half) + 0.7
  for (const side of [-1, 1]) {
    kit.add('marble', cbox(len, 0.5, d + 0.6, 0.07), T((side * -half) / 2, h / 2 + 0.22, 0).multiply(rot(0, 0, side * slope)), base, { tone: 'moulding' })
    palmette(kit, base.clone().multiply(T(side * (half + 0.1), 0.3, 0)), h * 0.24)
  }
  palmette(kit, base.clone().multiply(T(0, h + 0.35, 0)), h * 0.34)
  kit.add('gold', torus(h * 0.22, h * 0.045, 6, 24), T(0, h * 0.37, d * 0.2), base, { smooth: true, tone: 'gilt' })
  kit.add('gold', ball(h * 0.1, 1), T(0, h * 0.37, d * 0.2).multiply(scl(1, 1, 0.4)), base, { smooth: true, tone: 'gilt' })
}

// --- steles, slabs, pedestals -----------------------------------------------------------------

// Upright inscribed stone. Returns where the text plane goes (local coords).
export function stele(kit, base, { w = 3.2, h = 6, d = 0.7 } = {}) {
  kit.add('marbleShade', cbox(w + 1, 0.5, d + 1.1, 0.07), T(0, 0.25, 0), base, { tone: 'plinth' })
  kit.add('marble', cbox(w, h, d, 0.07), T(0, 0.5 + h / 2, 0), base, { tone: 'field' })
  kit.add('gold', box(w + 0.06, 0.1, d + 0.06), T(0, 0.5 + h - 0.25, 0), base, { tone: 'oldGilt' })
  kit.add('marbleShade', gable(w + 0.36, w * 0.24, d + 0.16), T(0, 0.5 + h, 0), base, { tone: 'moulding' })
  palmette(kit, base.clone().multiply(T(0, 0.5 + h + w * 0.24, 0)), w * 0.2)
  return { face: [0, 0.5 + h / 2, d / 2 + 0.03], w, h }
}

// A broken-off tablet of stone with a flat face, floating free (the stack).
export function slab(kit, base, { w = 7, h = 8, d = 0.8, seed = 1 } = {}) {
  const rand = rng(seed)
  const pts = []
  const N = 14
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU
    // Superellipse (a rounded rectangle) with chipped, uneven edges.
    const c = Math.cos(a)
    const s = Math.sin(a)
    const k = Math.pow(Math.abs(c) ** 5 + Math.abs(s) ** 5, -1 / 5) * (0.93 + rand() * 0.14)
    pts.push(new THREE.Vector2((c * k * w) / 2, (s * k * h) / 2))
  }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: d, bevelEnabled: true, bevelSize: 0.16, bevelThickness: 0.16, bevelSegments: 1 })
  kit.add('marble', g.translate(0, 0, -d / 2), null, base, { tone: 'field' })
  for (let i = 0; i < 4; i++) {
    const s = 0.25 + rand() * 0.45
    boulder(kit, base.clone().multiply(T((rand() - 0.5) * w * 1.3, -h * (0.5 + rand() * 0.35), (rand() - 0.5) * 3)), s, seed + i, 0.1)
  }
  return { face: [0, 0, d / 2 + 0.19], w, h }
}

// Short fluted drum to stand a symbol on. Returns the height of its top.
export function pedestal(kit, base, h = 2.4, r = 0.95) {
  kit.add('marbleShade', cbox(r * 2.7, 0.35, r * 2.7, 0.06), T(0, 0.175, 0), base, { tone: 'plinth' })
  kit.add('marble', flutedShaft(r, r * 0.94, h, { flutes: 16, seg: 3, rings: 3 }), T(0, 0.35, 0), base, { smooth: true, tone: 'field' })
  kit.add('gold', torus(r * 0.98, 0.07, 6, 24).rotateX(Math.PI / 2), T(0, 0.35 + h, 0), base, { smooth: true, tone: 'oldGilt' })
  kit.add('marbleShade', cbox(r * 2.5, 0.3, r * 2.5, 0.06), T(0, 0.5 + h, 0), base, { tone: 'moulding' })
  return 0.65 + h
}

// --- case symbols (gilded, about 2.3 units tall, standing on local y = 0) ------------------------
// Small precious objects seen up close, so they get real profiles instead of
// primitives: bevelled plates for flat silhouettes, fine lathes for turned
// parts, tubes for wire-like parts. Flat faces face +Z (toward the aisle).
// Every gold part of a symbol takes the close-up `gilt` role, bands included:
// next to the bronze of the amphorae an old-gilt band would read as dirt.

const _fa = new THREE.Vector3()
const _fb = new THREE.Vector3()
const _fc = new THREE.Vector3()

// Normals averaged only across edges flatter than `angle`: curved surfaces
// shade smooth while cut edges and steps keep a crisp line of light. (three's
// toCreasedNormals hashes positions to 0.01, too coarse for parts this small.)
// `flatZ` keeps faces lying exactly in the XY plane flat: the long thin cap
// triangles of an extrusion otherwise pick up a fan of shading from the bevel.
export function crease(geo, angle = 0.85, flatZ = false) {
  const g = geo.index ? geo.toNonIndexed() : geo
  const P = g.attributes.position
  const faces = P.count / 3
  const area = new Float32Array(faces * 3)
  const unit = new Float32Array(faces * 3)
  const keys = new Array(P.count)
  const shared = new Map()
  const q = (v) => Math.round(v * 1e4)
  for (let f = 0; f < faces; f++) {
    _fa.fromBufferAttribute(P, f * 3)
    _fb.fromBufferAttribute(P, f * 3 + 1).sub(_fa)
    _fc.fromBufferAttribute(P, f * 3 + 2).sub(_fa)
    _fb.cross(_fc)
    area.set([_fb.x, _fb.y, _fb.z], f * 3)
    const l = _fb.length() || 1
    unit.set([_fb.x / l, _fb.y / l, _fb.z / l], f * 3)
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k
      const h = `${q(P.getX(i))},${q(P.getY(i))},${q(P.getZ(i))}`
      keys[i] = h
      if (!shared.has(h)) shared.set(h, [])
      shared.get(h).push(f)
    }
  }
  const cos = Math.cos(angle)
  const N = new Float32Array(P.count * 3)
  for (let i = 0; i < P.count; i++) {
    const f = (i / 3) | 0
    if (flatZ && Math.abs(unit[f * 3 + 2]) > 0.9999) {
      N.set([0, 0, Math.sign(unit[f * 3 + 2])], i * 3)
      continue
    }
    let x = 0
    let y = 0
    let z = 0
    for (const o of shared.get(keys[i])) {
      if (unit[o * 3] * unit[f * 3] + unit[o * 3 + 1] * unit[f * 3 + 1] + unit[o * 3 + 2] * unit[f * 3 + 2] < cos) continue
      x += area[o * 3]
      y += area[o * 3 + 1]
      z += area[o * 3 + 2]
    }
    const l = Math.hypot(x, y, z) || 1
    N.set([x / l, y / l, z / l], i * 3)
  }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3))
  return g
}

// Flat part cut from a 2D outline, `depth` thick and centred on z = 0. The
// bevel is inset so the outline keeps its drawn size; with crease() it reads
// as a rounded edge, while notches and corners stay sharp. `inset: false`
// grows the bevel outward instead: the cap then keeps the drawn outline
// exactly, which avoids flipped cap triangles on outlines with long slivers.
function plate(shape, depth, bevel, curve = 8, segs = 2, inset = true) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    curveSegments: curve,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: inset ? -bevel : 0,
    bevelSegments: segs,
  })
  g.computeBoundingBox()
  return g.translate(0, 0, -(g.boundingBox.min.z + g.boundingBox.max.z) / 2)
}

// Tube along a smooth curve through `pts`; `taper(t)` scales the radius.
function tube(pts, r, { closed = false, seg = 24, radial = 6, taper } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'centripetal')
  const g = new THREE.TubeGeometry(curve, seg, r, radial, closed)
  if (taper) {
    const P = g.attributes.position
    const c = new THREE.Vector3()
    for (let i = 0; i <= seg; i++) {
      curve.getPointAt(i / seg, c)
      const k = taper(i / seg)
      for (let j = 0; j <= radial; j++) {
        const v = i * (radial + 1) + j
        P.setXYZ(v, c.x + (P.getX(v) - c.x) * k, c.y + (P.getY(v) - c.y) * k, c.z + (P.getZ(v) - c.z) * k)
      }
    }
  }
  return g
}

const polyShape = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))

// Ring of `n` touching beads around the Y axis as one surface (a piped or
// pearled border). It sits in the corner between a wall and a floor, so only
// the outer half of the section is built: the rest would be buried.
function beadRing(R, r, n, { per = 3, radial = 3 } = {}) {
  const cols = n * per
  const g = gridGeo(
    radial + 1,
    cols,
    (i, j) => {
      const u = (j / cols) * TAU
      const rr = r * (0.42 + 0.58 * Math.sqrt(Math.sin((Math.PI * (j % per)) / per)))
      const v = (i / radial - 0.5) * Math.PI
      const out = R + Math.cos(v) * rr
      return [Math.cos(u) * out, Math.sin(v) * rr, Math.sin(u) * out]
    },
    { wrap: true },
  )
  return crease(g)
}

// Four overlapping circles: the outline of a Gothic quatrefoil.
function quatrefoil(cx, cy, d, R) {
  const s = new THREE.Shape()
  const t = (d + Math.sqrt(2 * R * R - d * d)) / 2
  const half = Math.atan2(t, t - d)
  for (let k = 0; k < 4; k++) {
    const phi = (k * Math.PI) / 2
    s.absarc(cx + Math.cos(phi) * d, cy + Math.sin(phi) * d, R, phi - half, phi + half, false)
  }
  return s
}

const circlePath = (x, y, r) => new THREE.Path().absarc(x, y, r, 0, TAU, true)

export const SYMBOLS = {
  // Subscriptions: the key that opens the closed channel. An antique key on
  // its tip in a small turned mount: quatrefoil bow with pierced lobes, a
  // baluster collar, ringed shaft and a bit with wards cut into it.
  key(kit, B) {
    const smooth = { smooth: true, tone: 'gilt' }
    kit.add('gold', crease(lathe([[0, 0], [0.38, 0], [0.39, 0.024], [0.37, 0.044], [0.25, 0.056], [0.17, 0.072], [0.14, 0.088], [0.135, 0.11], [0, 0.11]], 32)), null, B, smooth)
    const shaft = [
      [0, 0.08], [0.06, 0.08], [0.088, 0.1], [0.09, 0.13], [0.07, 0.15], [0.07, 0.66], [0.096, 0.675], [0.096, 0.715], [0.07, 0.73],
      [0.072, 0.98], [0.092, 1.0], [0.11, 1.04], [0.092, 1.08], [0.074, 1.1], [0.076, 1.27], [0.1, 1.3], [0.13, 1.35],
      [0.142, 1.4], [0.124, 1.45], [0.094, 1.48], [0.112, 1.5], [0.112, 1.535], [0, 1.545],
    ]
    kit.add('gold', crease(lathe(shaft.map(([r, y]) => [r * 1.2, y > 0.8 ? y - 0.12 : y]), 24), 0.6), null, B, smooth)
    // Bit: two wards notched into the outer edge and a slot up from below.
    const bit = polyShape([
      [0.03, 0.17], [0.17, 0.17], [0.17, 0.27], [0.23, 0.27], [0.23, 0.17], [0.44, 0.17], [0.44, 0.27], [0.36, 0.27], [0.36, 0.33],
      [0.44, 0.33], [0.44, 0.44], [0.33, 0.44], [0.33, 0.5], [0.44, 0.5], [0.44, 0.6], [0.03, 0.6],
    ].map(([x, y]) => [0.03 + (x - 0.03) * 1.15, 0.17 + (y - 0.17) * 1.1]))
    kit.add('gold', crease(plate(bit, 0.1, 0.013, 1), 0.85, true), null, B, smooth)
    // Bow: quatrefoil plate, each lobe pierced, a boss at the crossing.
    const by = 1.835
    const bow = quatrefoil(0, by, 0.235, 0.245)
    for (let k = 0; k < 4; k++) bow.holes.push(circlePath(Math.cos((k * Math.PI) / 2) * 0.235, by + Math.sin((k * Math.PI) / 2) * 0.235, 0.115))
    kit.add('gold', crease(plate(bow, 0.12, 0.022, 8), 0.85, true), null, B, smooth)
    kit.add('gold', crease(lathe([[0, -0.095], [0.06, -0.09], [0.1, -0.055], [0.115, 0], [0.1, 0.055], [0.06, 0.09], [0, 0.095]], 16)).rotateX(Math.PI / 2), T(0, by, 0), B, smooth)
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2
      kit.add('gold', ball(0.05, 1), T(Math.cos(a) * 0.37, by + Math.sin(a) * 0.37, 0), B, smooth)
    }
    kit.add('gold', ball(0.055, 1), T(0, by + 0.53, 0), B, smooth)
  },
  // Barbershop: barber's shears, a little open. Bevelled tapering blades on a
  // domed pivot screw, offset finger loops, a finger rest on one of them.
  scissors(kit, B) {
    const smooth = { smooth: true, tone: 'gilt' }
    const P = 1.045
    const L = 1.22
    const open = 0.17
    const w = (t) => 0.19 * Math.pow(1 - Math.pow(t, 1.6), 0.8) * (0.8 + 0.2 * Math.min(t / 0.12, 1))
    for (const r of [1, -1]) {
      // `r` = +1 is the front half; its blade leans left and its loop sits right.
      const M = T(0, P, r * 0.04).multiply(rot(0, 0, r * open))
      const pts = []
      for (let i = 0; i <= 14; i++) pts.push([r * 0.012 * Math.sin((Math.PI * i) / 14), (i / 14) * L])
      for (let i = 14; i >= 0; i--) pts.push([-r * w(i / 14), (i / 14) * L])
      const blade = plate(polyShape(pts), 0.07, 0.011, 1)
      // Grind the outer face down toward the cutting edge: the bevel that
      // makes a blade read as a blade. The inner face stays flat.
      const V = blade.attributes.position
      for (let i = 0; i < V.count; i++) {
        const z = V.getZ(i)
        if (z * r <= 0) continue
        const t = Math.min(Math.max(V.getY(i) / L, 0), 1)
        const f = Math.min(Math.max((-r * V.getX(i)) / Math.max(w(t), 1e-3), 0), 1)
        V.setZ(i, z * (0.18 + 0.82 * Math.sqrt(f)))
      }
      kit.add('gold', crease(blade, 0.6, true), null, B.clone().multiply(M), smooth)
      // Handle: one flat forged plate like the blade. Its outline runs down
      // the shank, round a teardrop ring and back up; the finger hole is a
      // hole in the same shape, and the ring loop's finger rest is part of
      // the same contour. Drawn for the front half, mirrored for the back.
      const big = r < 0
      const Rx = big ? 0.19 : 0.17
      const Ry = big ? 0.27 : 0.24
      const cx = 0.07
      // Both rings reach the same low point, so the shears stand on the two.
      const cy = big ? -0.8 : -0.8 - 0.27 + Ry
      const ring = (th, rx, ry, dy = 0) => new THREE.Vector2(r * (cx + rx * Math.sin(th) * (1 - 0.15 * Math.cos(th))), cy + dy + ry * Math.cos(th))
      // The bevel grows outward by `b`, so the outline is drawn that much
      // inside the finished silhouette.
      const b = 0.017
      const tj = 0.5
      const handle = new THREE.Shape()
      handle.moveTo(r * -0.065, 0.04)
      const jl = ring(-tj, Rx - b, Ry - b)
      const jr = ring(tj, Rx - b, Ry - b)
      // Shank edges arrive along the ring's own tangent, so the shank widens
      // into the ring instead of meeting it at a corner.
      const flare = (j, s) => {
        const d = new THREE.Vector2(r * s * (Rx - b) * Math.cos(tj), (Ry - b) * Math.sin(tj)).normalize().multiplyScalar(0.05)
        return [j.x + d.x, j.y + d.y]
      }
      const [lx, ly] = flare(jl, 1)
      const [rx2, ry2] = flare(jr, -1)
      handle.bezierCurveTo(r * -0.03, -0.25, lx, ly, jl.x, jl.y)
      // Round the ring the long way (outer side last), with the finger rest
      // leaving its lower outer edge.
      const N = 32
      const th0 = Math.PI * 0.8
      const th1 = Math.PI * 0.68
      for (let i = 1; i < N; i++) {
        const th = -tj - (i / N) * (TAU - 2 * tj)
        const u = th + TAU
        if (big && u < th0 && u > th1) continue
        handle.lineTo(...ring(th, Rx - b, Ry - b).toArray())
        if (big && u >= th0 && u - (TAU - 2 * tj) / N < th0) {
          const base = ring(Math.PI * 0.74, Rx - b, Ry - b)
          const kx = r * 0.1 + base.x
          const ky = base.y - 0.03
          const rk = 0.04 - b
          handle.quadraticCurveTo(kx - r * 0.03, ky - 0.035, kx, ky - rk)
          handle.absarc(kx, ky, rk, -Math.PI / 2, r > 0 ? (Math.PI * 5) / 6 : Math.PI / 6, r < 0)
          const back = ring(th1, Rx - b, Ry - b)
          handle.quadraticCurveTo(kx - r * 0.06, ky + 0.035, back.x, back.y)
        }
      }
      handle.lineTo(jr.x, jr.y)
      handle.bezierCurveTo(rx2, ry2, r * 0.1, -0.25, r * 0.065, 0.04)
      // Finger hole: same teardrop, inset so the band stays even, a touch
      // lower so the band is widest where the shank joins.
      const band = 0.058
      const hole = new THREE.Path()
      for (let i = 0; i < 28; i++) {
        const pt = ring((i / 28) * TAU, Rx - band + b, Ry - band + b, -0.008)
        if (i === 0) hole.moveTo(pt.x, pt.y)
        else hole.lineTo(pt.x, pt.y)
      }
      handle.holes.push(hole)
      kit.add('gold', crease(plate(handle, 0.07, b, 6, 3, false), 0.85, true), null, B.clone().multiply(M), smooth)
    }
    // Pivot screw: domed head in front, a flat nut behind.
    const screw = lathe([[0, -0.1], [0.1, -0.1], [0.12, -0.082], [0.12, 0.07], [0.11, 0.098], [0.078, 0.12], [0.036, 0.13], [0, 0.132]], 20)
    kit.add('gold', crease(screw, 0.6).rotateX(Math.PI / 2), T(0, P, 0), B, smooth)
    kit.add('gold', torus(0.12, 0.016, 5, 20), T(0, P, 0.07), B, smooth)
  },
  // Confectionery: a three-tier celebration cake on a gilded stand. Pearl
  // borders at the foot of each tier, garlands looped round the sides, a
  // finial with a small flame on top.
  cake(kit, B) {
    const smooth = { smooth: true, tone: 'gilt' }
    const stand = [
      [0, 0], [0.6, 0], [0.62, 0.025], [0.6, 0.05], [0.3, 0.1], [0.16, 0.16], [0.2, 0.205],
      [0.16, 0.25], [0.55, 0.32], [1.04, 0.34], [1.11, 0.37], [1.06, 0.4], [0, 0.4],
    ]
    kit.add('gold', crease(lathe(stand, 36), 0.7), null, B, smooth)
    const tiers = [[0.92, 0.48], [0.66, 0.44], [0.42, 0.4]]
    let y = 0.4
    tiers.forEach(([r, h], ti) => {
      const prof = [[r - 0.01, y], [r, y + 0.03], [r, y + h - 0.06], [r - 0.012, y + h - 0.018], [r - 0.045, y + h], [0, y + h]]
      kit.add('marble', crease(lathe(prof, 32), 0.7), null, B, { smooth: true, tone: 'field' })
      const br = [0.05, 0.044, 0.038][ti]
      kit.add('gold', beadRing(r, br, Math.round((TAU * r) / (br * 2.5))), T(0, y + br * 0.6, 0), B, smooth)
      // Garlands hang from the top edge between gilded rosettes.
      const n = [8, 6, 5][ti]
      const sag = h * 0.42
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * TAU + ti * 0.3
        const a1 = ((k + 1) / n) * TAU + ti * 0.3
        const pts = []
        for (let i = 0; i <= 4; i++) {
          const t = i / 4
          const a = a0 + (a1 - a0) * t
          const rr = r + 0.012 + 0.02 * Math.sin(Math.PI * t)
          pts.push([Math.cos(a) * rr, y + h - 0.07 - sag * Math.sin(Math.PI * t), Math.sin(a) * rr])
        }
        kit.add('gold', crease(tube(pts, 0.022, { seg: 8, radial: 5, taper: (t) => 0.6 + 0.6 * Math.sin(Math.PI * t) })), null, B, smooth)
        kit.add('gold', ball(0.032, 0), T(Math.cos(a0) * (r + 0.015), y + h - 0.07, Math.sin(a0) * (r + 0.015)), B, smooth)
      }
      y += h
    })
    // Topper: a turned gilt finial holding a small flame.
    const fin = [[0, 0], [0.13, 0], [0.135, 0.02], [0.11, 0.04], [0.065, 0.06], [0.05, 0.1], [0.06, 0.13], [0.09, 0.16], [0.1, 0.19], [0.085, 0.21], [0.04, 0.215], [0, 0.215]]
    kit.add('gold', crease(lathe(fin, 18), 0.7), T(0, y, 0), B, smooth)
    const flame = [[0, 0], [0.045, 0.02], [0.06, 0.06], [0.05, 0.11], [0.025, 0.16], [0, 0.2]]
    kit.add('ember', lathe(flame, 12), T(0, y + 0.2, 0), B, { smooth: true })
  },
  // Shop: amphorae, the shipping container of antiquity. Fine turned bronze
  // with a moulded foot and rim, handles from shoulder to neck, gilt bands and
  // a meander frieze round the big jar's belly.
  amphora(kit, B) {
    const smooth = { smooth: true, tone: 'gilt' }
    const body = new THREE.SplineCurve(
      [[0.125, 0.1], [0.2, 0.2], [0.34, 0.38], [0.46, 0.6], [0.525, 0.86], [0.53, 1.06], [0.47, 1.3], [0.34, 1.48], [0.21, 1.6], [0.16, 1.7], [0.15, 1.84], [0.16, 1.97]]
        .map(([r, y]) => new THREE.Vector2(r, y)),
    ).getPoints(12).map((p) => [p.x, p.y])
    const prof = [[0, 0], [0.21, 0], [0.225, 0.02], [0.215, 0.05], [0.16, 0.07], ...body, [0.215, 2.01], [0.255, 2.045], [0.255, 2.09], [0.225, 2.12], [0.18, 2.11], [0.135, 1.98]]
    const radiusAt = (y) => {
      for (let i = 1; i < body.length; i++) if (body[i][1] >= y) return body[i - 1][0] + ((body[i][0] - body[i - 1][0]) * (y - body[i - 1][1])) / (body[i][1] - body[i - 1][1])
      return body[body.length - 1][0]
    }
    const band = (M, k, y0, seg) => {
      const r = radiusAt(y0) - 0.004
      kit.add('gold', crease(lathe([[r, y0 - 0.017], [r + 0.017, y0], [r, y0 + 0.017]].map(([a, b]) => [a * k, b * k]), seg), 1.6), null, M, smooth)
    }
    const jar = (M, k, seg, frieze) => {
      kit.add('bronze', crease(lathe(prof.map(([r, y]) => [r * k, y * k]), seg), 0.6), null, M, { smooth: true })
      for (const s of [-1, 1]) {
        const h = [[0.37, 1.37], [0.5, 1.5], [0.54, 1.71], [0.47, 1.89], [0.32, 1.95], [0.14, 1.9]].map(([x, y]) => [s * x * k, y * k, 0])
        kit.add('bronze', crease(tube(h, 0.036 * k, { seg: 14, radial: 6, taper: (t) => 1.15 - 0.3 * Math.sin(Math.PI * t) })), null, M, { smooth: true })
      }
      band(M, k, 1.66, seg)
      if (!frieze) {
        band(M, k, 0.9, seg)
        band(M, k, 1.06, seg)
        return
      }
      band(M, k, 0.86, seg)
      band(M, k, 1.1, seg)
      // Running meander between the bands, one continuous hooked line.
      const units = 14
      const y0 = 0.9
      const hb = 0.16
      const lw = 0.022
      const path = [[0, 0], [0, 1], [0.66, 1], [0.66, 0.5], [0.33, 0.5], [0.33, 0], [1, 0]]
      for (let u = 0; u < units; u++) {
        for (let i = 0; i < path.length - 1; i++) {
          const [u0, v0] = path[i]
          const [u1, v1] = path[i + 1]
          const a0 = ((u + u0) / units) * TAU
          const a1 = ((u + u1) / units) * TAU
          const yA = y0 + v0 * hb
          const yB = y0 + v1 * hb
          const am = (a0 + a1) / 2
          const r = radiusAt((yA + yB) / 2) + 0.004
          const len = a0 === a1 ? Math.abs(yB - yA) + lw : 2 * r * Math.sin(Math.abs(a1 - a0) / 2) + lw
          const g = a0 === a1 ? box(lw, len, 0.02) : box(len, lw, 0.02)
          kit.add('gold', g, tx(Math.cos(am) * r * k, ((yA + yB) / 2) * k, Math.sin(am) * r * k, -(am + Math.PI / 2), k), M, { tone: 'gilt' })
        }
      }
    }
    jar(B.clone().multiply(T(-0.3, 0, 0)), 1, 36, true)
    // The small jar stands on the same plinth, leaning a little off the big one.
    jar(B.clone().multiply(T(0.44, 0, 0.18)).multiply(rot(0, 0, -0.2)), 0.62, 32, false)
  },
}
