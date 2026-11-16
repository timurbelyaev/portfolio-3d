import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fogged } from './env.js'

// Every model in the world is authored here in code: classical architecture and
// floating rock, built from a handful of primitives. The look relies on
// silhouette and backlight (the flight heads into a low sun through haze), so
// shapes are kept bold and readable rather than detailed.

export function rng(seed) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lambert = (color, extra = {}) => fogged(new THREE.MeshLambertMaterial({ color, ...extra }))

export const MAT = {
  rock: lambert('#6a5564', { side: THREE.DoubleSide }),
  rockDark: lambert('#4b3c4f', { side: THREE.DoubleSide }),
  grass: lambert('#8a8f6c'),
  marble: lambert('#f1e6d8'),
  marbleShade: lambert('#cfc0b8'),
  bronze: lambert('#7a6252'),
  cypress: lambert('#46524b'),
  // Emissive accents: values above 1.0 so the bloom pass makes them glow.
  glow: fogged(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.45, 0.9) })),
  ember: fogged(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.1, 0.62) })),
}

// Faceted normals baked into the geometry. material.flatShading derives face
// normals from screen-space derivatives, which stalls under software GL.
function facet(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  g.computeVertexNormals()
  return g
}

// Weld, then push every vertex by a seeded random offset so the solid stays
// closed (shared vertices move together) but loses its machined regularity.
function rough(geo, amount, rand, yScale = 1) {
  geo.deleteAttribute('uv')
  geo.deleteAttribute('normal')
  const g = mergeVertices(geo)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(
      i,
      p.getX(i) + (rand() - 0.5) * amount,
      p.getY(i) + (rand() - 0.5) * amount * yScale,
      p.getZ(i) + (rand() - 0.5) * amount,
    )
  }
  return g
}

export const tx = (x = 0, y = 0, z = 0, ry = 0, s = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(s, s, s),
  )

const _m = new THREE.Matrix4()

// Collects geometry per material and bakes each bucket into ONE mesh, so a
// temple with a hundred parts costs a handful of draw calls.
export class Kit {
  constructor() {
    this.parts = {}
  }
  // `local` positions the part inside its model; `base` places the model.
  add(mat, geo, local, base) {
    const g = facet(geo)
    g.applyMatrix4(base ? _m.multiplyMatrices(base, local) : local)
    ;(this.parts[mat] ||= []).push(g)
    return this
  }
  build(name) {
    const group = new THREE.Group()
    group.name = name
    for (const [mat, list] of Object.entries(this.parts)) {
      const mesh = new THREE.Mesh(mergeGeometries(list), MAT[mat])
      mesh.frustumCulled = false
      group.add(mesh)
    }
    return group
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg, 1)

// --- floating island ---------------------------------------------------------
// A tapering mass of rock hanging under a flat cap. `r` is the walkable radius,
// the cap's top face sits at local y = 0.
export function island(kit, base, { r = 14, depth = 18, seed = 1, sx = 1, sz = 1 } = {}) {
  const rand = rng(seed)
  const shape = new THREE.Matrix4().makeScale(sx, 1, sz)
  const B = base.clone().multiply(shape)

  const profile = []
  const rings = 6
  for (let i = 0; i <= rings; i++) {
    const t = i / rings
    const rad = r * Math.pow(1 - t, 0.62) * (0.86 + 0.2 * rand())
    profile.push(new THREE.Vector2(Math.max(rad, 0.05), -0.4 - t * depth))
  }
  kit.add('rock', rough(new THREE.LatheGeometry(profile, 10), r * 0.16, rand, 0.5), tx(), B)

  // Cap: a thin slab slightly wider than the rock, edge chipped.
  kit.add('grass', rough(cyl(r * 1.03, r * 0.97, 1.1, 13), r * 0.07, rand, 0.12), tx(0, -0.55, 0), B)

  // Hanging shards under the rim.
  const shards = 3 + ((rand() * 3) | 0)
  for (let i = 0; i < shards; i++) {
    const a = rand() * Math.PI * 2
    const d = r * (0.35 + rand() * 0.45)
    const s = r * (0.14 + rand() * 0.14)
    kit.add(
      'rockDark',
      rough(new THREE.ConeGeometry(s, s * 3.2, 6), s * 0.5, rand),
      tx(Math.cos(a) * d, -depth * (0.3 + rand() * 0.35), Math.sin(a) * d).multiply(new THREE.Matrix4().makeRotationX(Math.PI)),
      B,
    )
  }
  // Boulders on the cap edge.
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2
    // Capped: on a large platform, radius-scaled boulders turn into walls.
    const s = Math.min(r, 15) * (0.05 + rand() * 0.07)
    kit.add(
      'rock',
      rough(new THREE.DodecahedronGeometry(s, 0), s * 0.5, rand),
      tx(Math.cos(a) * r * 0.86, s * 0.4, Math.sin(a) * r * 0.86),
      B,
    )
  }
}

// --- column --------------------------------------------------------------------
// Doric-ish: plinth, base, tapered 12-sided shaft (facets read as fluting),
// flared capital and abacus. `cut` (0..1) breaks the shaft off at that height.
export function column(kit, base, { h = 12, r = 0.9, cut = 1, seed = 1 } = {}) {
  const rand = rng(seed)
  kit.add('marbleShade', box(r * 3, r * 0.5, r * 3), tx(0, r * 0.25, 0), base)
  kit.add('marble', cyl(r * 1.28, r * 1.42, r * 0.5), tx(0, r * 0.75, 0), base)
  const shaftH = (h - r * 2.1) * cut
  const topR = r * (1 - 0.16 * cut)
  if (cut >= 1) {
    kit.add('marble', cyl(topR, r, shaftH), tx(0, r + shaftH / 2, 0), base)
    kit.add('marble', cyl(r * 1.5, topR, r * 0.6), tx(0, r + shaftH + r * 0.3, 0), base)
    kit.add('marbleShade', box(r * 3.1, r * 0.5, r * 3.1), tx(0, r + shaftH + r * 0.85, 0), base)
  } else {
    // Broken: ragged top, with a fallen drum lying beside it.
    kit.add('marble', rough(cyl(topR, r, shaftH, 12), r * 0.22, rand, 1.6), tx(0, r + shaftH / 2, 0), base)
    const a = rand() * Math.PI * 2
    kit.add(
      'marbleShade',
      cyl(r * 0.9, r * 0.9, r * 2.4),
      tx(Math.cos(a) * r * 3.4, r * 0.9, Math.sin(a) * r * 3.4, a).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)),
      base,
    )
  }
}

export function cypress(kit, base, { h = 9, seed = 1 } = {}) {
  const rand = rng(seed)
  kit.add('bronze', cyl(h * 0.03, h * 0.045, h * 0.2, 6), tx(0, h * 0.1, 0), base)
  kit.add('cypress', rough(new THREE.ConeGeometry(h * 0.15, h * 0.9, 7, 3), h * 0.016, rand, 0.4), tx(0, h * 0.6, 0), base)
}

// Triangular prism spanning `w` along X, `h` tall, `d` deep (a pediment).
function gable(w, h, d) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(0, h)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false })
  g.translate(0, 0, -d / 2)
  return g
}

// --- services: four monuments ----------------------------------------------------

// Bots — a signal beacon. A lit lantern that never goes out: orders and
// payments keep arriving while the owner sleeps.
export function beacon(kit, base) {
  kit.add('marbleShade', cyl(4.2, 4.6, 0.8, 10), tx(0, 0.4, 0), base)
  kit.add('marble', cyl(2.0, 3.0, 15, 10), tx(0, 8.3, 0), base)
  kit.add('marbleShade', cyl(3.3, 2.4, 0.9, 10), tx(0, 16.2, 0), base)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    kit.add('marble', cyl(0.16, 0.16, 3.2, 6), tx(Math.cos(a) * 2.1, 18.2, Math.sin(a) * 2.1), base)
  }
  kit.add('glow', new THREE.IcosahedronGeometry(1.15, 1), tx(0, 18.1, 0), base)
  kit.add('marbleShade', cyl(2.8, 2.6, 0.4, 10), tx(0, 19.9, 0), base)
  kit.add('bronze', new THREE.ConeGeometry(2.7, 2.6, 10), tx(0, 21.4, 0), base)
}
export const BEACON_LIGHT_Y = 18.1

// AI — an oracle: a round open temple with a glowing sphere that answers.
export function oracle(kit, base) {
  kit.add('marbleShade', cyl(8.2, 8.6, 0.6, 16), tx(0, 0.3, 0), base)
  kit.add('marble', cyl(7.2, 7.5, 0.6, 16), tx(0, 0.9, 0), base)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2
    column(kit, base.clone().multiply(tx(Math.cos(a) * 5.9, 1.2, Math.sin(a) * 5.9)), { h: 8.6, r: 0.5, cut: i === 5 ? 0.45 : 1, seed: 40 + i })
  }
  const ring = new THREE.TorusGeometry(5.9, 0.62, 4, 20)
  ring.rotateX(Math.PI / 2)
  kit.add('marbleShade', ring, tx(0, 10.4, 0), base)
  kit.add('marbleShade', cyl(1.3, 1.6, 1.4, 8), tx(0, 1.9, 0), base)
}
export const ORACLE_ORB_Y = 5.6

// Sites — a monumental gateway: the entrance customers walk through.
export function gate(kit, base) {
  for (const side of [-1, 1]) {
    kit.add('marbleShade', box(4.4, 1, 5), tx(side * 6.2, 0.5, 0), base)
    kit.add('marble', box(3.4, 13, 4), tx(side * 6.2, 7.5, 0), base)
    kit.add('marbleShade', box(4, 0.7, 4.6), tx(side * 6.2, 14.3, 0), base)
  }
  kit.add('marble', box(17.4, 2.2, 4.4), tx(0, 15.7, 0), base)
  kit.add('marbleShade', box(18.6, 0.6, 5.2), tx(0, 17.1, 0), base)
  kit.add('marble', gable(18.6, 3.6, 4.6), tx(0, 17.4, 0), base)
  for (let i = 0; i < 3; i++) kit.add('marbleShade', box(11 - i * 0.2, 0.4, 2.2), tx(0, 0.2 + i * 0.4, 6.4 - i * 1.6), base)
}

// Automation — the pedestal of an armillary sphere (the rings are animated
// meshes added by the world builder): a mechanism that runs by itself.
export function armillaryBase(kit, base) {
  kit.add('marbleShade', box(6.4, 0.8, 6.4), tx(0, 0.4, 0), base)
  kit.add('marble', box(4.6, 0.8, 4.6), tx(0, 1.2, 0), base)
  kit.add('marble', cyl(0.9, 1.5, 3.4, 8), tx(0, 3.3, 0), base)
  kit.add('bronze', cyl(0.25, 0.25, 2.4, 6), tx(0, 6.2, 0), base)
}
export const ARMILLARY_Y = 10.4

// --- cases: colonnade bridge ---------------------------------------------------
// Runs along -Z from local z = 0 to z = -length; deck top at local y = 0.
export function colonnade(kit, base, { length = 160, width = 15, spacing = 10, h = 12 } = {}) {
  const rand = rng(77)
  kit.add('marbleShade', box(width + 4, 1.2, length), tx(0, -0.6, -length / 2), base)
  kit.add('marble', box(width - 5, 0.25, length), tx(0, 0.12, -length / 2), base)
  const n = Math.floor(length / spacing)
  const x = width / 2
  for (let i = 0; i <= n; i++) {
    const z = -i * spacing
    for (const side of [-1, 1]) {
      const broken = rand() < 0.16 && i > 1 && i < n - 1
      column(kit, base.clone().multiply(tx(side * x, 0, z)), { h, r: 0.95, cut: broken ? 0.3 + rand() * 0.4 : 1, seed: i * 7 + side })
      // Architrave beam to the next column — skipped next to a broken one so the
      // ruin has gaps the light falls through.
      if (i < n && !broken && rand() > 0.14) {
        kit.add('marble', box(2.6, 1.3, spacing), tx(side * x, h + 0.85, z - spacing / 2), base)
        kit.add('marbleShade', box(3.2, 0.4, spacing), tx(side * x, h + 1.7, z - spacing / 2), base)
      }
    }
    // Cross-beams overhead every few bays: frames the sun as you fly under.
    if (i % 4 === 2) kit.add('marble', box(width + 2.6, 1.1, 2.2), tx(0, h + 2.4, z), base)
  }
  // Rock hanging beneath the deck.
  for (let i = 0; i < 6; i++) {
    island(kit, base.clone().multiply(tx((rand() - 0.5) * 4, -1.1, -14 - i * (length - 28) / 5)), {
      r: 11 + rand() * 4,
      depth: 14 + rand() * 12,
      seed: 300 + i,
    })
  }
}

// --- process: the stair ------------------------------------------------------------
// `flights` flights of steps climbing along -Z, each followed by a landing.
// Returns the landing centres (local coords) so braziers/text can sit on them.
export function stairs(kit, base, { flights = 4, steps = 8, rise = 0.75, run = 2.2, width = 13, landing = 7 } = {}) {
  const landings = []
  let y = 0
  let z = 0
  for (let f = 0; f < flights; f++) {
    for (let s = 0; s < steps; s++) {
      y += rise
      // Each tread is a deep block reaching down, so the flight reads as solid.
      kit.add(s % 2 ? 'marble' : 'marbleShade', box(width, rise * 4, run), tx(0, y - rise * 2, z - run / 2), base)
      z -= run
    }
    kit.add('marble', box(width + 3, 1.4, landing), tx(0, y - 0.7, z - landing / 2), base)
    landings.push(new THREE.Vector3(0, y, z - landing / 2))
    island(kit, base.clone().multiply(tx(0, y - 1.4, z - landing / 2)), { r: 9.5, depth: 15 + f * 3, seed: 500 + f })
    z -= landing
  }
  return { landings, top: new THREE.Vector3(0, y, z) }
}

export function brazier(kit, base) {
  kit.add('marbleShade', box(1.5, 0.4, 1.5), tx(0, 0.2, 0), base)
  kit.add('marble', cyl(0.36, 0.52, 2.2, 8), tx(0, 1.5, 0), base)
  kit.add('bronze', cyl(1.05, 0.4, 0.7, 8), tx(0, 2.95, 0), base)
  kit.add('ember', new THREE.IcosahedronGeometry(0.62, 0), tx(0, 3.5, 0), base)
}

// --- finale: the temple ---------------------------------------------------------------
// Peripteral temple, front facing +Z. Floor (top of the steps) at local y = 2.1.
export function temple(kit, base, { cols = 6, rows = 9, spacing = 4.4, h = 15 } = {}) {
  const w = (cols - 1) * spacing
  const d = (rows - 1) * spacing
  for (let i = 0; i < 3; i++) {
    const g = (2 - i) * 1.5
    kit.add(i % 2 ? 'marble' : 'marbleShade', box(w + 5 + g * 2, 0.7, d + 5 + g * 2), tx(0, 0.35 + i * 0.7, -d / 2), base)
  }
  const floor = 2.1
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (i > 0 && i < cols - 1 && j > 0 && j < rows - 1) continue
      column(kit, base.clone().multiply(tx(-w / 2 + i * spacing, floor, -j * spacing)), { h, r: 1.05, seed: i * 31 + j })
    }
  }
  const top = floor + h
  kit.add('marble', box(w + 3.4, 1.5, d + 3.4), tx(0, top + 0.75, -d / 2), base)
  kit.add('marbleShade', box(w + 4.4, 0.6, d + 4.4), tx(0, top + 1.8, -d / 2), base)
  const ped = 5.2
  kit.add('marble', gable(w + 4.4, ped, 1.2), tx(0, top + 2.1, 1.4), base)
  kit.add('marble', gable(w + 4.4, ped, 1.2), tx(0, top + 2.1, -d - 1.4), base)
  // Roof: two slabs meeting at the ridge.
  const half = (w + 4.4) / 2
  const slope = Math.atan2(ped, half)
  const len = Math.hypot(ped, half) + 0.6
  for (const side of [-1, 1]) {
    const slab = box(len, 0.5, d + 3.6)
    slab.rotateZ(side * slope)
    kit.add('marbleShade', slab, tx((side * -half) / 2, top + 2.1 + ped / 2 + 0.2, -d / 2), base)
  }
  // Cella: the inner room. Open to the back wall is left out on purpose — the
  // sun shines straight through the doorway at the end of the flight.
  const cw = w - spacing * 2.2
  const cd = d - spacing * 2.4
  for (const side of [-1, 1]) kit.add('marbleShade', box(0.9, h, cd), tx((side * cw) / 2, floor + h / 2, -d / 2), base)
  for (const side of [-1, 1]) {
    kit.add('marbleShade', box(cw * 0.3, h, 0.9), tx(side * cw * 0.35, floor + h / 2, -d / 2 + cd / 2), base)
    kit.add('marbleShade', box(cw * 0.3, h, 0.9), tx(side * cw * 0.35, floor + h / 2, -d / 2 - cd / 2), base)
  }
  kit.add('marbleShade', box(cw, h * 0.2, 0.9), tx(0, floor + h * 0.9, -d / 2 + cd / 2), base)
  kit.add('marbleShade', box(cw, h * 0.2, 0.9), tx(0, floor + h * 0.9, -d / 2 - cd / 2), base)
  return { width: w, depth: d, floor }
}
