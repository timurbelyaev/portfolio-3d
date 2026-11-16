import * as THREE from 'three'
import { rng, tx, rot, scl, box, cbox, cyl, ball, torus, white, MAT } from './geo.js'
import { bustGeometry, laurelGeometry } from './statue.js'
import { island, gridGeo } from './terrain.js'
import { column, flutedShaft, lathe, entablature, ENTABLATURE_H, pediment, palmette } from './classical.js'

// The set pieces: one monument per block of the site.

const TAU = Math.PI * 2
const T = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z)
const flat = (g) => g.rotateX(Math.PI / 2)

// Stepped round dais; returns the height of its top.
function dais(kit, base, r, steps = 2) {
  for (let i = 0; i < steps; i++) {
    const rr = r - i * 0.75
    kit.add(i % 2 ? 'marble' : 'marbleShade', cyl(rr, rr + 0.12, 0.55, 36), T(0, 0.275 + i * 0.55, 0), base, { smooth: i > 99, tone: 'plinth' })
  }
  return steps * 0.55
}

// Closed ring beam (a circular entablature) from `ri` to `ro`, bottom at y = 0.
function ringBeam(kit, base, ri, ro) {
  const p = [[ri, 0], [ro, 0], [ro, 0.75], [ro + 0.28, 0.85], [ro + 0.28, 1.2], [ri - 0.2, 1.2], [ri - 0.2, 0.85], [ri, 0.75], [ri, 0]]
  kit.add('marble', gridGeo(p.length, 40, (i, j) => {
    const a = (j / 40) * TAU
    return [Math.cos(a) * p[i][0], p[i][1], Math.sin(a) * p[i][0]]
  }, { wrap: true }), null, base, { tone: 'moulding' })
  kit.add('gold', flat(torus(ro + 0.02, 0.07, 6, 48)), T(0, 0.78, 0), base, { smooth: true, tone: 'oldGilt' })
  return 1.2
}

// --- 01 bots: a signal beacon ----------------------------------------------------------
// A lit lantern that never goes out: orders and payments keep arriving at night.
export function beacon(kit, base) {
  const y = dais(kit, base, 4.9, 2)
  kit.add('marble', flutedShaft(2.9, 2.05, 14.6, { flutes: 18, seg: 4, rings: 12, depth: 0.06 }), T(0, y, 0), base, { smooth: true, tone: 'field' })
  kit.add('gold', flat(torus(2.93, 0.11, 6, 40)), T(0, y + 0.25, 0), base, { smooth: true, tone: 'oldGilt' })
  kit.add('marbleShade', lathe([[2.0, 15.4], [2.5, 15.75], [3.3, 16.1], [3.3, 16.55], [0.2, 16.6]], 32), null, base, { tone: 'moulding' })
  kit.add('gold', flat(torus(3.25, 0.06, 6, 40)), T(0, 17.5, 0), base, { smooth: true, tone: 'oldGilt' })
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU
    kit.add('gold', cyl(0.035, 0.035, 0.95, 5), T(Math.cos(a) * 3.25, 17.05, Math.sin(a) * 3.25), base, { tone: 'oldGilt' })
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU
    kit.add('marble', cyl(0.13, 0.15, 3.3, 8), T(Math.cos(a) * 2.0, 18.2, Math.sin(a) * 2.0), base, { smooth: true, tone: 'field' })
  }
  kit.add('glow', ball(1.1, 2), T(0, 18.1, 0), base, { smooth: true })
  kit.add('marbleShade', cyl(2.75, 2.55, 0.4, 32), T(0, 20.0, 0), base, { tone: 'moulding' })
  kit.add('gold', lathe([[2.7, 20.2], [2.2, 21.0], [1.2, 22.0], [0.25, 22.8], [0.02, 23.5]], 32), null, base, { smooth: true, tone: 'oldGilt' })
  kit.add('gold', ball(0.28, 1), T(0, 23.5, 0), base, { smooth: true, tone: 'gilt' })
}
export const BEACON_LIGHT_Y = 18.1

// --- 02 AI: an oracle ----------------------------------------------------------------------
// A round open temple around a glowing sphere that answers.
export function oracle(kit, base) {
  const y = dais(kit, base, 8.6, 2)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2
    column(kit, base.clone().multiply(T(Math.cos(a) * 5.9, y, Math.sin(a) * 5.9)), { h: 8.7, r: 0.5, cut: i === 5 ? 0.45 : 1, seed: 40 + i })
  }
  ringBeam(kit, base.clone().multiply(T(0, y + 8.7, 0)), 5.25, 6.55)
  kit.add('marbleShade', lathe([[1.6, y], [1.45, y + 0.3], [1.15, y + 0.5], [1.15, y + 1.2], [1.4, y + 1.45], [0.1, y + 1.5]], 24), null, base, { tone: 'plinth' })
  kit.add('gold', flat(torus(1.17, 0.07, 6, 24)), T(0, y + 0.85, 0), base, { smooth: true, tone: 'oldGilt' })
}
export const ORACLE_ORB_Y = 5.8

// --- 03 sites: a triumphal arch ------------------------------------------------------------
// The entrance customers walk through. The opening is 8 wide and 12 high.
export function gate(kit, base) {
  const w = 17
  const h = 15
  const d = 4.2
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, h)
  s.lineTo(-w / 2, h)
  s.closePath()
  const hole = new THREE.Path()
  hole.moveTo(-4, 0)
  hole.lineTo(-4, 8)
  hole.absarc(0, 8, 4, Math.PI, 0, true)
  hole.lineTo(4, 0)
  hole.closePath()
  s.holes.push(hole)
  const body = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1, curveSegments: 20 })
  kit.add('marble', body.translate(0, 0, -d / 2), null, base, { tone: 'field' })
  // Gilt archivolt and keystone.
  kit.add('gold', new THREE.TorusGeometry(4.25, 0.14, 6, 28, Math.PI), T(0, 8, d / 2 + 0.1), base, { smooth: true, tone: 'oldGilt' })
  kit.add('gold', new THREE.TorusGeometry(4.25, 0.14, 6, 28, Math.PI), T(0, 8, -d / 2 - 0.1), base, { smooth: true, tone: 'oldGilt' })
  palmette(kit, base.clone().multiply(T(0, 12.5, d / 2 + 0.15)), 1.3)
  for (const side of [-1, 1]) {
    kit.add('marbleShade', cbox(5.2, 1.2, d + 4.2, 0.08), T(side * 6.25, 0.6, 0), base, { tone: 'plinth' })
    for (const z of [-1, 1]) column(kit, base.clone().multiply(T(side * 6.25, 1.2, z * (d / 2 + 1.1))), { h: 13.8, r: 0.72, seed: 60 + side + z })
  }
  entablature(kit, base.clone().multiply(T(0, h, 0)), w + 1.2, d + 3.6)
  kit.add('marbleShade', cbox(w - 1, 2.0, d + 1.2, 0.08), T(0, h + ENTABLATURE_H + 1.0, 0), base, { tone: 'recess' })
  for (const z of [-1, 1]) pediment(kit, base.clone().multiply(T(0, h + ENTABLATURE_H + 2.0, z * (d / 2 + 0.2))), w + 0.4, 3.2, 1.2)
  for (const z of [-1, 1]) for (let i = 0; i < 3; i++) kit.add(i % 2 ? 'marble' : 'marbleShade', cbox(10 - i * 0.6, 0.4, 1.7, 0.06), T(0, 0.2 + i * 0.4, z * (7.6 - i * 1.5)), base, { tone: 'plinth' })
}

// --- 04 automation: the pedestal of an armillary sphere --------------------------------------
// The rings themselves are animated meshes added by the world builder.
export function armillaryBase(kit, base) {
  kit.add('marbleShade', cbox(6.6, 0.7, 6.6, 0.08), T(0, 0.35, 0), base, { tone: 'plinth' })
  kit.add('marble', cbox(5.0, 0.7, 5.0, 0.08), T(0, 1.05, 0), base, { tone: 'plinth' })
  kit.add('marble', lathe([[1.9, 1.4], [1.7, 1.7], [1.05, 2.1], [0.85, 3.6], [1.1, 4.5], [1.5, 4.8], [1.5, 5.0], [0.1, 5.05]], 28), null, base, { smooth: true, tone: 'field' })
  kit.add('gold', flat(torus(0.95, 0.09, 6, 24)), T(0, 3.0, 0), base, { smooth: true, tone: 'oldGilt' })
  kit.add('bronze', cyl(0.16, 0.22, 3.0, 8), T(0, 6.5, 0), base, { smooth: true, tone: 'bronzeGold' })
  // Cradle arms that hold the sphere.
  for (const s of [-1, 1]) kit.add('bronze', new THREE.TorusGeometry(5.3, 0.14, 6, 24, Math.PI * 0.42), T(0, 10.4, 0).multiply(rot(0, s > 0 ? 0 : Math.PI, 0)).multiply(rot(0, 0, -Math.PI * 0.71)), base, { smooth: true, tone: 'bronzeGold' })
}
export const ARMILLARY_Y = 10.4

// --- cases: colonnade bridge ---------------------------------------------------------------------
// Runs along -Z from local z = 0 to z = -length; deck top at local y = 0.
// `stations` ([{ z, side }]) are bays where the row of columns opens into a
// round balcony for a case symbol.
export function colonnade(kit, base, { length = 176, width = 15, spacing = 11, h = 12, stations = [] } = {}) {
  const rand = rng(77)
  const n = Math.floor(length / spacing)
  const x = width / 2
  const along = rot(0, Math.PI / 2, 0)
  for (let i = 0; i <= n; i++) {
    kit.zone(`colonnade${i >> 2}`)
    const z = -i * spacing
    if (i < n) {
      kit.add('marbleShade', cbox(width + 4, 1.2, spacing, 0.08), T(0, -0.6, z - spacing / 2), base, { tone: 'plinth' })
      kit.add('marbleShade', box(width - 5, 0.12, spacing), T(0, 0.06, z - spacing / 2), base, { tone: 'plinth' })
      for (const s of [-1, 1]) kit.add('gold', box(0.18, 0.14, spacing), T(s * (width / 2 - 2.5), 0.07, z - spacing / 2), base, { tone: 'oldGilt' })
    }
    for (const side of [-1, 1]) {
      const open = stations.some((st) => st.side === side && Math.abs(st.z - z) < spacing * 0.75)
      const openNext = stations.some((st) => st.side === side && Math.abs(st.z - (z - spacing)) < spacing * 0.75)
      if (open) continue
      const broken = rand() < 0.14 && i > 1 && i < n - 1
      column(kit, base.clone().multiply(T(side * x, 0, z)), { h, r: 0.95, cut: broken ? 0.3 + rand() * 0.4 : 1, seed: i * 7 + side })
      // Skipped next to a broken column or a balcony: the ruin gets gaps the
      // light falls through.
      if (i < n && !broken && !openNext && rand() > 0.12) entablature(kit, base.clone().multiply(T(side * x, h, z - spacing / 2)).multiply(along), spacing, 2.5)
    }
    if (i % 4 === 2) entablature(kit, base.clone().multiply(T(0, h + ENTABLATURE_H, z)), width + 3, 2.4, { dentils: false })
  }
  for (const st of stations) {
    kit.zone(`colonnade${Math.round(-st.z / spacing) >> 2}`)
    kit.add('marbleShade', cyl(5.2, 5.2, 1.2, 28), T(st.side * (x + 2.2), -0.6, st.z), base, { tone: 'plinth' })
    kit.add('gold', flat(torus(5.0, 0.07, 6, 40)), T(st.side * (x + 2.2), 0.04, st.z), base, { smooth: true, tone: 'oldGilt' })
  }
  // Rock hanging beneath the deck.
  const lumps = Math.round(length / 28)
  for (let i = 0; i < lumps; i++) {
    const z = -14 - (i * (length - 28)) / (lumps - 1)
    kit.zone(`colonnade${Math.round(-z / spacing) >> 2}`)
    island(kit, base.clone().multiply(tx((rand() - 0.5) * 4, -1.0, z)), { r: 11 + rand() * 4, depth: 14 + rand() * 12, seed: 300 + i, bare: true })
  }
}

// --- process: the stair ------------------------------------------------------------------------------
// `flights` flights of steps climbing along -Z, each followed by a landing.
// Returns the landing centres (local coords).
export function stairs(kit, base, { flights = 4, steps = 8, rise = 0.75, run = 2.2, width = 13, landing = 7 } = {}) {
  const landings = []
  let y = 0
  let z = 0
  for (let f = 0; f < flights; f++) {
    kit.zone(`stairs${f >> 1}`)
    for (let s = 0; s < steps; s++) {
      y += rise
      // Each tread is a deep block reaching down, so the flight reads as solid.
      kit.add(s % 2 ? 'marble' : 'marbleShade', cbox(width, rise * 4, run + 0.1, 0.06), T(0, y - rise * 2, z - run / 2), base, { tone: 'plinth' })
      z -= run
    }
    kit.add('marble', cbox(width + 4, 1.4, landing, 0.08), T(0, y - 0.7, z - landing / 2), base, { tone: 'plinth' })
    for (const s of [-1, 1]) kit.add('gold', box(0.16, 0.1, landing), T(s * (width / 2 + 1.2), y + 0.02, z - landing / 2), base, { tone: 'oldGilt' })
    landings.push(new THREE.Vector3(0, y, z - landing / 2))
    island(kit, base.clone().multiply(T(0, y - 1.3, z - landing / 2)), { r: 10, depth: 15 + f * 3, seed: 500 + f, bare: true })
    z -= landing
  }
  return { landings, top: new THREE.Vector3(0, y, z) }
}

export function brazier(kit, base) {
  kit.add('marbleShade', cbox(1.5, 0.4, 1.5, 0.05), T(0, 0.2, 0), base, { tone: 'plinth' })
  kit.add('marble', lathe([[0.55, 0.4], [0.42, 0.7], [0.3, 1.6], [0.4, 2.3], [0.48, 2.5]], 16), null, base, { smooth: true, tone: 'field' })
  kit.add('bronze', lathe([[0.4, 2.5], [0.85, 2.85], [1.08, 3.3], [1.0, 3.3], [0.75, 2.95], [0.1, 2.75]], 20), null, base, { smooth: true, tone: 'bronzeGold' })
  kit.add('gold', flat(torus(1.05, 0.06, 6, 24)), T(0, 3.3, 0), base, { smooth: true, tone: 'oldGilt' })
  kit.add('ember', ball(0.6, 1), T(0, 3.35, 0).multiply(scl(1, 0.75, 1)), base, { smooth: true })
}

// --- finale: the temple ---------------------------------------------------------------------------------
// Peripteral temple, front facing +Z. Floor (top of the steps) at local y = 2.1.
export function temple(kit, base, { cols = 6, rows = 9, spacing = 4.4, h = 15, detail = 1 } = {}) {
  const w = (cols - 1) * spacing
  const d = (rows - 1) * spacing
  for (let i = 0; i < 3; i++) {
    const g = (2 - i) * 1.5
    kit.add(i % 2 ? 'marble' : 'marbleShade', cbox(w + 5 + g * 2, 0.7, d + 5 + g * 2, 0.08), T(0, 0.35 + i * 0.7, -d / 2), base, { tone: 'plinth' })
  }
  const floor = 2.1
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (i > 0 && i < cols - 1 && j > 0 && j < rows - 1) continue
      column(kit, base.clone().multiply(T(-w / 2 + i * spacing, floor, -j * spacing)), { h, r: 1.05, seed: i * 31 + j, detail })
    }
  }
  const top = floor + h
  const side = rot(0, Math.PI / 2, 0)
  for (const z of [0, -d]) entablature(kit, base.clone().multiply(T(0, top, z)), w + 3, 2.7)
  for (const s of [-1, 1]) entablature(kit, base.clone().multiply(T((s * w) / 2, top, -d / 2)).multiply(side), d - 2.7, 2.7)
  const ey = top + ENTABLATURE_H
  const ped = 5.2
  for (const z of [0.4, -d - 0.4]) pediment(kit, base.clone().multiply(T(0, ey, z)), w + 4.4, ped, 1.8)
  // Roof: two slabs meeting at a gilded ridge.
  const half = (w + 4.4) / 2
  const slope = Math.atan2(ped, half)
  const len = Math.hypot(ped, half) + 0.5
  for (const s of [-1, 1]) kit.add('marbleShade', cbox(len, 0.45, d + 1.2, 0.06), T((s * -half) / 2, ey + ped / 2 + 0.1, -d / 2).multiply(rot(0, 0, s * slope)), base, { tone: 'plinth' })
  kit.add('gold', cyl(0.22, 0.22, d + 2, 8).rotateX(Math.PI / 2), T(0, ey + ped + 0.25, -d / 2), base, { smooth: true, tone: 'oldGilt' })

  // Cella: the inner room. The back wall is left out on purpose — the sun
  // shines straight through the doorway at the end of the flight.
  const cw = w - spacing * 2.2
  const cd = d - spacing * 2.4
  for (const s of [-1, 1]) kit.add('marbleShade', cbox(0.9, h, cd, 0.06), T((s * cw) / 2, floor + h / 2, -d / 2), base, { tone: 'recess' })
  for (const z of [-d / 2 + cd / 2, -d / 2 - cd / 2]) {
    for (const s of [-1, 1]) kit.add('marbleShade', cbox(cw * 0.3, h, 0.9, 0.06), T(s * cw * 0.35, floor + h / 2, z), base, { tone: 'recess' })
    kit.add('marbleShade', cbox(cw, h * 0.2, 0.9, 0.06), T(0, floor + h * 0.9, z), base, { tone: 'recess' })
    kit.add('gold', box(cw * 0.46, 0.22, 1.1), T(0, floor + h * 0.8 - 0.1, z), base, { tone: 'oldGilt' })
  }

  // Rotunda rising behind the roof, crowned with a gilded dome.
  const R = base.clone().multiply(T(0, ey + ped * 0.45, -d * 0.6))
  kit.add('marble', cyl(4.4, 4.6, 3.6, 32), T(0, 1.8, 0), R, { smooth: true, tone: 'field' })
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    kit.add('marbleShade', cbox(0.5, 3.2, 0.5, 0.05), T(Math.cos(a) * 4.55, 1.8, Math.sin(a) * 4.55).multiply(rot(0, -a, 0)), R, { tone: 'moulding' })
  }
  kit.add('marbleShade', cyl(5.0, 4.9, 0.45, 32), T(0, 3.8, 0), R, { tone: 'moulding' })
  const dome = []
  for (let i = 0; i <= 9; i++) {
    const a = (i / 9) * (Math.PI / 2)
    dome.push([Math.max(4.5 * Math.cos(a), 0.05), 4.0 + 4.2 * Math.sin(a)])
  }
  kit.add('gold', lathe(dome, 32), null, R, { smooth: true, tone: 'oldGilt' })
  kit.add('gold', lathe([[0.5, 8.1], [0.7, 8.5], [0.35, 9.0], [0.12, 9.6], [0.02, 10.4]], 12), null, R, { smooth: true, tone: 'gilt' })
  return { width: w, depth: d, floor }
}

// --- payment: a treasury with a balance scale -------------------------------------------------------------
// Two equal pans: part of the money before the work, the rest after delivery.
export function treasury(kit, base) {
  const y = dais(kit, base, 7.2, 3)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6
    column(kit, base.clone().multiply(T(Math.cos(a) * 5.2, y, Math.sin(a) * 5.2)), { h: 8.4, r: 0.48, seed: 120 + i })
  }
  const top = y + 8.4
  ringBeam(kit, base.clone().multiply(T(0, top, 0)), 4.6, 5.8)
  kit.add('gold', lathe([[6.2, top + 1.2], [4.6, top + 2.3], [2.4, top + 3.5], [0.5, top + 4.4], [0.04, top + 5.4]], 36), null, base, { smooth: true, tone: 'oldGilt' })
  kit.add('gold', ball(0.3, 1), T(0, top + 5.4, 0), base, { smooth: true, tone: 'gilt' })

  // The scale.
  kit.add('marble', lathe([[1.25, y], [1.1, y + 0.3], [0.45, y + 0.7], [0.3, y + 2.6], [0.42, y + 3.0], [0.1, y + 3.05]], 20), null, base, { smooth: true, tone: 'field' })
  kit.add('gold', cyl(0.09, 0.11, 2.6, 8), T(0, y + 4.3, 0), base, { smooth: true, tone: 'bronzeGold' })
  kit.add('gold', cbox(5.6, 0.18, 0.18, 0.04), T(0, y + 5.5, 0), base, { tone: 'bronzeGold' })
  kit.add('gold', ball(0.24, 1), T(0, y + 5.62, 0), base, { smooth: true, tone: 'gilt' })
  for (const s of [-1, 1]) {
    const P = base.clone().multiply(T(s * 2.6, y + 3.0, 0))
    kit.add('gold', lathe([[0.04, 0], [0.8, 0.07], [1.08, 0.32], [1.0, 0.32], [0.75, 0.14], [0.04, 0.08]], 24), null, P, { smooth: true, tone: 'bronzeGold' })
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5
      kit.add('gold', cyl(0.018, 0.018, 2.35, 4), T(Math.cos(a) * 0.5, 1.42, Math.sin(a) * 0.5).multiply(rot(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4)), P, { tone: 'oldGilt' })
    }
    const coins = s < 0 ? 4 : 9
    for (let i = 0; i < coins; i++) {
      const a = i * 2.4
      const r = i ? 0.2 + (i % 3) * 0.14 : 0
      kit.add('gold', cyl(0.2, 0.2, 0.07, 12), T(Math.cos(a) * r, 0.16 + Math.floor(i / 3) * 0.07, Math.sin(a) * r), P, { smooth: true, tone: 'gilt' })
    }
  }
}

// --- about: a quiet garden -----------------------------------------------------------------------------------

// A herm: the classical portrait pillar. Stands for "the person behind the work".
export function herm(kit, base) {
  kit.add('marbleShade', cbox(1.9, 0.4, 1.6, 0.06), T(0, 0.2, 0), base, { tone: 'plinth' })
  kit.add('marble', cbox(1.15, 3.0, 0.95, 0.07), T(0, 1.9, 0), base, { tone: 'field' })
  kit.add('marble', cbox(1.75, 0.55, 1.0, 0.1), T(0, 3.675, 0), base, { tone: 'moulding' })
  // Socle the bust rests on.
  kit.add('marble', lathe([[0.44, 3.95], [0.46, 4.02], [0.3, 4.12], [0.29, 4.24], [0.38, 4.34]], 24), null, base, { smooth: true, tone: 'moulding' })
  kit.add('gold', box(0.5, 0.5, 0.04), T(0, 2.5, 0.5).multiply(rot(0, 0, Math.PI / 4)), base, { tone: 'gilt' })
}

// Scale of the portrait on the herm (world units per head) and the height of
// the chin above the herm's foot.
const BUST_SCALE = 1.05
const BUST_Y = 5.24

// The portrait itself: a sculpted bust with a gilded laurel wreath. It is not
// merged into the kit: the bust is sculpted in a worker and joins the group
// when it is ready (the garden is at the far end of the flight).
export function hermBust(base) {
  const place = base.clone().multiply(T(0, BUST_Y, 0)).multiply(scl(BUST_SCALE))
  const group = new THREE.Group()
  group.name = 'herm-bust'
  const add = (geometry, material) => {
    const mesh = new THREE.Mesh(white(geometry.applyMatrix4(place)), material)
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
  }
  add(laurelGeometry(), MAT.gold)
  bustGeometry().then((geometry) => add(geometry, MAT.marble))
  return group
}

export function bench(kit, base) {
  kit.add('marble', cbox(3.6, 0.32, 1.2, 0.07), T(0, 1.0, 0), base, { tone: 'field' })
  for (const s of [-1, 1]) kit.add('marbleShade', cbox(0.45, 0.84, 1.05, 0.06), T(s * 1.3, 0.42, 0), base, { tone: 'plinth' })
}

export function lantern(kit, base) {
  kit.add('bronze', cyl(0.07, 0.11, 2.6, 8), T(0, 1.3, 0), base, { smooth: true })
  kit.add('bronze', cyl(0.3, 0.22, 0.12, 6), T(0, 2.62, 0), base)
  kit.add('glow', ball(0.24, 1), T(0, 2.95, 0), base, { smooth: true })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4
    kit.add('bronze', cyl(0.018, 0.018, 0.62, 4), T(Math.cos(a) * 0.26, 2.98, Math.sin(a) * 0.26), base)
  }
  kit.add('gold', lathe([[0.36, 3.28], [0.2, 3.5], [0.03, 3.72]], 6), null, base, { tone: 'oldGilt' })
}
