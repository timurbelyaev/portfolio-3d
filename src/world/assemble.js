import * as THREE from 'three'
import { createBillboardClouds } from '../scene/clouds.js'
import { createDustMotes } from '../scene/atmosphere.js'
import { PLACES, CASE_STATIONS, STACK, GUARANTEES } from './story.js'
import { Kit, MAT, tx, rng, torus, ball, cbox, box, white } from './kit/geo.js'
import { island } from './kit/terrain.js'
import { tree } from './kit/flora.js'
import { column, stele, slab, pedestal, SYMBOLS } from './kit/classical.js'
import {
  beacon, oracle, gate, armillaryBase, colonnade, stairs, brazier, temple, treasury, herm, hermBust, bench, lantern,
  BEACON_LIGHT_Y, ORACLE_ORB_Y, ARMILLARY_Y,
} from './kit/monuments.js'
import { inscription } from './kit/inscribe.js'

// Places every model. One island per block of the site, in the order the
// camera meets them; see story.js for the coordinates and the camera keys.

const at = (p, dy = 0) => tx(p[0], p[1] + dy, p[2])
const T = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z)
const ROMAN = ['I', 'II', 'III', 'IV']

function ring(radius, tube, material) {
  return new THREE.Mesh(white(torus(radius, tube, 8, 64)), material)
}

export function buildWorld(scene) {
  const updates = []
  const kit = new Kit()
  const rand = rng(2026)
  const carved = new THREE.Group()
  carved.name = 'inscriptions'
  scene.add(carved)

  // Lay an inscription on a model face: `M` places the model, `face` is local.
  const engrave = (M, face, mesh) => {
    mesh.applyMatrix4(M.clone().multiply(T(...face)))
    carved.add(mesh)
  }

  // --- hero: the temple seen through the painting (the hall is a DOM photo) ------------
  const vista = (() => {
    const k = new Kit()
    const B = at(PLACES.vista)
    island(k, B, { r: 28, depth: 44, seed: 5, crags: 9, grass: 0.5, keepOut: [[0, -2, 22]] })
    k.add('marbleShade', cbox(26, 1.2, 12, 0.1), T(0, -0.5, 17), B, { tone: 'plinth' })
    temple(k, B.clone().multiply(tx(0, 0, 12, 0, 1.1)), { cols: 6, rows: 7 })
    for (const s of [-1, 1]) {
      tree(k, B.clone().multiply(T(s * 19, 0, 15)), { kind: 'cypress', h: 12, seed: 3 + s })
      tree(k, B.clone().multiply(T(s * 23, 0, 4)), { kind: 'cypress', h: 9, seed: 6 + s })
      brazier(k, B.clone().multiply(T(s * 9, 0.1, 19)))
    }
    tree(k, B.clone().multiply(T(-21, 0, -8)), { kind: 'blossom', h: 9, seed: 12 })
    // A lower shelf of rock with a lone ruin, as a foreground step.
    const S = B.clone().multiply(T(-34, -16, 22))
    island(k, S, { r: 9, depth: 14, seed: 8, crags: 3 })
    column(k, S.clone().multiply(T(1, 0, 0)), { h: 9, r: 0.7, seed: 2 })
    column(k, S.clone().multiply(T(-3.5, 0, 1)), { h: 9, r: 0.7, cut: 0.5, seed: 4 })
    tree(k, S.clone().multiply(T(3, 0, -3)), { kind: 'olive', h: 6, seed: 9 })
    const g = k.build('vista')
    scene.add(g)
    return g
  })()

  // --- 01 bots: the beacon ---------------------------------------------------
  {
    kit.zone('beacon')
    const B = at(PLACES.beacon)
    island(kit, B, { r: 15, depth: 22, seed: 11, crags: 2, keepOut: [[2, -1, 5.6]] })
    beacon(kit, B.clone().multiply(T(2, 0, -1)))
    tree(kit, B.clone().multiply(T(-8, 0, 4)), { kind: 'cypress', h: 10, seed: 1 })
    tree(kit, B.clone().multiply(T(-10.5, 0, -1)), { kind: 'cypress', h: 7, seed: 2 })
    tree(kit, B.clone().multiply(T(-4, 0, 9)), { kind: 'olive', h: 6.5, seed: 3, lush: 1.3 })
    column(kit, B.clone().multiply(T(9, 0, 6)), { h: 7, r: 0.6, cut: 0.4, seed: 3 })

    // Signal pulses: rings that leave the lantern and fade — messages going out.
    const pulseMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.5, 1.15, 0.75), transparent: true, depthWrite: false, fog: false,
    })
    const pulses = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(torus(1, 0.035, 5, 48), pulseMat.clone())
      m.rotation.x = Math.PI / 2
      m.position.set(PLACES.beacon[0] + 2, PLACES.beacon[1] + BEACON_LIGHT_Y, PLACES.beacon[2] - 1)
      scene.add(m)
      return { m, phase: i / 3 }
    })
    updates.push((s) => {
      for (const p of pulses) {
        const k = (s * 0.22 + p.phase) % 1
        p.m.scale.setScalar(2 + k * 16)
        p.m.material.opacity = (1 - k) * (1 - k) * 0.7
      }
    })
  }

  // --- 02 AI: the oracle -------------------------------------------------------
  {
    kit.zone('oracle')
    const B = at(PLACES.oracle)
    island(kit, B, { r: 16, depth: 24, seed: 22, crags: 2, keepOut: [[0, 0, 9]] })
    oracle(kit, B)
    tree(kit, B.clone().multiply(T(-10.5, 0, -8)), { kind: 'cypress', h: 9, seed: 5 })
    tree(kit, B.clone().multiply(T(10, 0, -9)), { kind: 'blossom', h: 7, seed: 6, lush: 1.3 })
    tree(kit, B.clone().multiply(T(-11, 0, 6)), { kind: 'olive', h: 5.5, seed: 7 })

    // Dimmer than the lantern glow: at this size a hotter orb floods the frame.
    const orb = new THREE.Mesh(ball(1.5, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.95, 0.74), fog: false }))
    const c = new THREE.Vector3(PLACES.oracle[0], PLACES.oracle[1] + ORACLE_ORB_Y, PLACES.oracle[2])
    orb.position.copy(c)
    const halo = [ring(2.5, 0.05, MAT.gold), ring(3.1, 0.045, MAT.gold)]
    halo.forEach((h) => h.position.copy(c))
    scene.add(orb, ...halo)
    updates.push((s) => {
      orb.position.y = c.y + Math.sin(s * 0.9) * 0.35
      orb.scale.setScalar(1 + Math.sin(s * 1.7) * 0.06)
      halo[0].rotation.set(s * 0.5, s * 0.3, 0)
      halo[1].rotation.set(1.1 - s * 0.35, 0, s * 0.45)
      halo.forEach((h) => (h.position.y = orb.position.y))
    })
  }

  // --- 03 sites: the arch ------------------------------------------------------
  {
    kit.zone('gate')
    const B = at(PLACES.gate)
    island(kit, B, { r: 16, depth: 20, seed: 33, sx: 1.2, sz: 0.95, keepOut: [[0, 0, 4.5], [-6.3, 0, 5], [6.3, 0, 5]] })
    gate(kit, B)
    for (const s of [-1, 1]) {
      tree(kit, B.clone().multiply(T(s * 13, 0, 3)), { kind: 'cypress', h: 11, seed: 7 + s })
      tree(kit, B.clone().multiply(T(s * 15.5, 0, -5)), { kind: 'pine', h: 9, seed: 9 + s })
    }
  }

  // --- 04 automation: the armillary -------------------------------------------
  {
    kit.zone('armillary')
    const B = at(PLACES.armillary)
    island(kit, B, { r: 13, depth: 19, seed: 44, crags: 2, keepOut: [[0, 0, 4.4]] })
    armillaryBase(kit, B)
    column(kit, B.clone().multiply(T(-8, 0, 3)), { h: 8, r: 0.6, cut: 0.5, seed: 9 })
    tree(kit, B.clone().multiply(T(7, 0, 6)), { kind: 'olive', h: 7, seed: 10, lush: 1.3 })
    tree(kit, B.clone().multiply(T(-6, 0, -8)), { kind: 'pine', h: 8.5, seed: 11 })

    const c = new THREE.Vector3(PLACES.armillary[0], PLACES.armillary[1] + ARMILLARY_Y, PLACES.armillary[2])
    const rings = [4.8, 4.0, 3.2].map((r) => {
      const m = ring(r, 0.16, MAT.gold)
      m.position.copy(c)
      m.castShadow = true
      scene.add(m)
      return m
    })
    const core = new THREE.Mesh(ball(0.75, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.95, 0.74), fog: false }))
    core.position.copy(c)
    scene.add(core)
    updates.push((s) => {
      rings[0].rotation.set(0.4, s * 0.35, 0)
      rings[1].rotation.set(s * 0.5, 0.3, s * 0.2)
      rings[2].rotation.set(1.2, -s * 0.7, s * 0.4)
    })
  }

  // --- stack: a field of floating tablets, one per layer -------------------------
  {
    const lift = [2.5, -0.5, 3.5, 0.5, 2.5, -1]
    STACK.forEach((layer, i) => {
      const side = i % 2 ? 1 : -1
      const k = new Kit()
      const info = slab(k, tx(), { w: 7.8, h: 9.4, seed: 900 + i })
      const tablet = k.build(`tablet-${i}`)
      const text = inscription({
        w: 6.8,
        h: 8,
        lines: [
          { t: layer.title, size: 0.44, font: 'sans', weight: 700, caps: true, track: 0.2, color: 'gold', gap: 0.6 },
          ...layer.items.map((t) => ({ t, size: 0.82, gap: 0.3 })),
        ],
      })
      text.position.set(...info.face)
      tablet.add(text)
      const y = PLACES.stack[1] + lift[i]
      // Slabs stand in left/right pairs that the camera passes between (a zigzag
      // always leaves one slab half out of frame). The three gates are evenly
      // spaced and all lie ahead of camera key 12, so the field is met as one
      // group when the stack caption appears, not partly during the previous beat.
      const gate = PLACES.stack[2] + [20, -8, -36][i >> 1]
      tablet.position.set(side * 8, y, gate - (side > 0 ? 3 : 0))
      tablet.rotation.y = -side * 0.25
      scene.add(tablet)
      updates.push((s) => {
        tablet.position.y = y + Math.sin(s * 0.5 + i * 1.7) * 0.35
        tablet.rotation.z = Math.sin(s * 0.33 + i) * 0.015
      })
    })
    // Loose debris between the tablets keeps the field from reading as a row.
    kit.zone('stack')
    for (let i = 0; i < 14; i++) {
      const s = 0.5 + rand() * 1.4
      const g = new THREE.DodecahedronGeometry(s, 0)
      // Kept outside the corridor of tablets so nothing drifts across the text.
      const side = i % 2 ? 1 : -1
      kit.add('marbleShade', g, tx(side * (24 + rand() * 26), PLACES.stack[1] - 8 + rand() * 18, PLACES.stack[2] + 40 - rand() * 90, rand() * 6), null, { tone: 'plinth' })
    }
  }

  // --- cases: the colonnade, a balcony with a symbol per case -----------------------
  {
    const B = at(PLACES.colonnade)
    colonnade(kit, B, { length: 176, stations: CASE_STATIONS })
    for (const st of CASE_STATIONS) {
      kit.zone(`colonnade${Math.round(-st.z / 11) >> 2}`)
      const P = B.clone().multiply(T(st.side * 9.7, 0, st.z))
      const top = pedestal(kit, P, 2.6, 1.0)
      SYMBOLS[st.symbol](kit, P.clone().multiply(tx(0, top, 0, -st.side * 0.55, 1.55)))
      for (const dz of [-3.6, 3.6]) brazier(kit, P.clone().multiply(tx(st.side * 2.6, 0, dz, 0, 0.75)))
    }
  }

  // --- process: the stair, a numbered stele and braziers on every landing --------------
  {
    const B = at(PLACES.stairs)
    const { landings, top } = stairs(kit, B)
    landings.forEach((l, i) => {
      kit.zone(`stairs${i >> 1}`)
      for (const side of [-1, 1]) brazier(kit, B.clone().multiply(T(side * 7.2, l.y, l.z)))
      const M = B.clone().multiply(tx(4.2, l.y, l.z - 1.2, -0.3))
      const info = stele(kit, M, { w: 2.0, h: 2.8, d: 0.6 })
      engrave(M, info.face, inscription({ w: 1.8, h: 2.4, lines: [{ t: ROMAN[i], size: 1.25 }] }))
    })
    // Bridge slab from the last landing onto the court island. Its top sits a
    // hair above the landing and the lawn (both at top.y) and below the court
    // path: coplanar overlaps there flickered (z-fighting).
    kit.add('marbleShade', cbox(17, 1.4, 12, 0.08), T(top.x, top.y - 0.62, top.z - 2), B, { tone: 'plinth' })
  }

  // --- guarantees: a court of four carved steles -----------------------------------------
  {
    kit.zone('court')
    const B = at(PLACES.court)
    island(kit, B, { r: 26, depth: 34, seed: 55, crags: 0, keepOut: [[0, 0, 7], [0, 14, 9], [0, -12, 7], [-13.5, 3, 3.6], [13.5, 3, 3.6]] })
    kit.add('marbleShade', cbox(9, 0.3, 44, 0.06), T(0, 0.02, 2), B, { tone: 'plinth' })
    GUARANTEES.forEach((g, i) => {
      const side = i % 2 ? 1 : -1
      const M = B.clone().multiply(tx(side * (i < 2 ? 13.5 : 6.4), 0, i < 2 ? 3 : -12, -side * 0.4))
      const info = stele(kit, M, { w: 4.6, h: 6.4, d: 0.8 })
      engrave(M, info.face, inscription({
        w: 4.2,
        h: 5.6,
        lines: [
          { t: ROMAN[i], size: 0.42, font: 'sans', weight: 700, track: 0.2, color: 'gold', gap: 0.5 },
          ...g.carve.map((t) => ({ t, size: 0.8, gap: 0.2 })),
        ],
      }))
      // Front pair stands near the island rim: their fire goes on the inner side.
      brazier(kit, M.clone().multiply(tx((i < 2 ? -side : side) * 3.6, 0, 1.5, 0, 0.8)))
    })
    for (const s of [-1, 1]) {
      tree(kit, B.clone().multiply(T(s * 17, 0, -12)), { kind: 'olive', h: 9, seed: 30 + s, lush: 1.4 })
      tree(kit, B.clone().multiply(T(s * 18, 0, 4)), { kind: 'cypress', h: 11, seed: 33 + s })
      tree(kit, B.clone().multiply(T(s * 14, 0, -19)), { kind: 'cypress', h: 9, seed: 36 + s })
    }
  }

  // --- payment: the treasury with the scale ------------------------------------------------
  {
    kit.zone('treasury')
    const B = at(PLACES.treasury)
    island(kit, B, { r: 15, depth: 22, seed: 61, crags: 2, keepOut: [[0, 0, 7.6]] })
    treasury(kit, B)
    tree(kit, B.clone().multiply(T(-10, 0, -6)), { kind: 'pine', h: 10, seed: 40 })
    tree(kit, B.clone().multiply(T(9, 0, -9)), { kind: 'cypress', h: 9, seed: 41 })
    tree(kit, B.clone().multiply(T(-9, 0, 8)), { kind: 'olive', h: 5.5, seed: 42 })
  }

  // --- about: the garden ------------------------------------------------------------------------
  {
    kit.zone('garden')
    const B = at(PLACES.garden)
    island(kit, B, { r: 16, depth: 22, seed: 72, crags: 1, grass: 1.5, keepOut: [[-5, 2, 1.6], [1, 3, 2.2]] })
    tree(kit, B.clone().multiply(T(3, 0, -3)), { kind: 'olive', h: 13, seed: 50, lush: 2 })
    // Turned three-quarters toward the camera, which passes on the -x, +z side.
    const H = B.clone().multiply(tx(-5, 0, 2, -0.35))
    herm(kit, H)
    scene.add(hermBust(H))
    bench(kit, B.clone().multiply(tx(1, 0, 3.4, 0.35)))
    lantern(kit, B.clone().multiply(T(-1.8, 0, 4.6)))
    tree(kit, B.clone().multiply(T(-10, 0, -7)), { kind: 'blossom', h: 8, seed: 51, lush: 1.4 })
    tree(kit, B.clone().multiply(T(11, 0, 4)), { kind: 'blossom', h: 6.5, seed: 52, lush: 1.4 })
    tree(kit, B.clone().multiply(T(10, 0, -10)), { kind: 'cypress', h: 10, seed: 53 })
  }

  // --- finale: the temple on its own island ----------------------------------------------------------
  {
    kit.zone('temple')
    const [x, y, z] = PLACES.temple
    island(kit, tx(x, y - 0.6, z - 22), { r: 46, depth: 60, seed: 66, sz: 1.25, crags: 0, grass: 0.5, keepOut: [[0, 4, 26], [0, 30, 18]] })
    kit.add('marbleShade', cbox(30, 1.2, 30, 0.1), T(x, y - 0.6, z + 12), null, { tone: 'plinth' })
    temple(kit, tx(x, y, z))
    for (const side of [-1, 1]) {
      brazier(kit, tx(x + side * 9, y, z + 12))
      tree(kit, tx(x + side * 21, y - 0.6, z + 6), { kind: 'cypress', h: 14, seed: 80 + side })
      tree(kit, tx(x + side * 25, y - 0.6, z - 8), { kind: 'cypress', h: 12, seed: 84 + side })
      tree(kit, tx(x + side * 30, y - 0.6, z + 14), { kind: 'pine', h: 12, seed: 88 + side })
      column(kit, tx(x + side * 16.5, y, z + 21), { h: 9, r: 0.7, cut: side > 0 ? 0.55 : 1, seed: 90 + side })
    }
  }

  // --- depth: islands receding into the haze on both sides ------------------------
  const KINDS = ['cypress', 'olive', 'pine', 'blossom']
  for (let i = 0; i < 30; i++) {
    const side = i % 2 ? 1 : -1
    const x = side * (58 + rand() * 210)
    const z = -170 - rand() * 980
    const y = -4 + rand() * 46
    const r = 6 + rand() * 13
    kit.zone(`far${Math.floor(-z / 240)}${side > 0 ? 'r' : 'l'}`)
    const B = tx(x, y, z, rand() * 6.28)
    island(kit, B, { r, depth: r * (1.2 + rand()), seed: 700 + i, grass: 0.3, crags: rand() < 0.4 ? 2 : 0, detail: 0.35 })
    const pick = rand()
    if (pick < 0.5) tree(kit, B.clone().multiply(T(r * 0.2, 0, 0)), { kind: KINDS[(rand() * 4) | 0], h: 6 + rand() * 6, seed: i, lush: 0.6 })
    if (pick > 0.3) column(kit, B.clone().multiply(T(-r * 0.25, 0, r * 0.1)), { h: 8 + rand() * 5, r: 0.7, cut: rand() < 0.5 ? 0.3 + rand() * 0.5 : 1, seed: i, detail: 0 })
  }

  scene.add(kit.build('world'))

  // --- clouds ------------------------------------------------------------------------
  // A deck under the painting's temple, and a thin veil of wisps drifting
  // between the islands along the whole route.
  const veil = createBillboardClouds({ boxMin: [-230, -12, -1150], boxMax: [230, 30, -200], seed: 19 })
  const cloudMats = new Set()

  // Cumulus. In the painting: a deck wrapping the rock, towers framing the
  // temple, a wall behind it and a bank the camera dives through.
  const [vx, vy, vz] = PLACES.vista
  const heaps = [
    { c: [vx - 10, vy - 30, vz + 34], s: [34, 13, 16], n: 26 },
    { c: [vx + 34, vy - 26, vz + 22], s: [26, 14, 18], n: 22 },
    { c: [vx - 46, vy - 34, vz + 10], s: [30, 16, 22], n: 22 },
    { c: [vx - 78, vy - 14, vz - 30], s: [26, 26, 26], n: 26 },
    { c: [vx + 74, vy - 10, vz - 46], s: [30, 30, 28], n: 28 },
    { c: [vx - 20, vy - 30, vz - 120], s: [90, 26, 30], n: 40 },
    { c: [vx + 110, vy - 34, vz - 100], s: [50, 30, 40], n: 26 },
    { c: [vx - 150, vy - 40, vz - 90], s: [60, 34, 40], n: 28 },
    { c: [-52, 40, 46], s: [30, 16, 24], n: 22 },
    { c: [-10, 38, -10], s: [40, 14, 30], n: 22 },
    { c: [40, 24, -90], s: [50, 16, 40], n: 22 },
    { c: [-70, 18, -120], s: [44, 18, 36], n: 20 },
  ]
  // Along the route: heaps low at the sides and under the islands.
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1
    const big = 14 + rand() * 20
    heaps.push({
      c: [side * (48 + rand() * 170), -22 + rand() * 30, -210 - rand() * 960],
      s: [big * (1.2 + rand()), big * 0.55, big * (1 + rand() * 0.8)],
      n: 14 + ((rand() * 10) | 0),
    })
  }
  // Around the foot of the temple island.
  const [tx0, ty0, tz0] = PLACES.temple
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4
    heaps.push({ c: [tx0 + Math.cos(a) * 62, ty0 - 34 + rand() * 8, tz0 - 22 + Math.sin(a) * 74], s: [26, 12, 22], n: 16 })
  }

  for (const c of [veil]) {
    scene.add(c.group)
    c.group.traverse((o) => o.material && cloudMats.add(o.material))
  }
  veil.group.traverse((o) => o.material && (o.material.userData.veil = true))
  for (const m of cloudMats) m.uniforms.uOpacity.value = 0.3

  const dust = createDustMotes({ count: 260, range: 80 })
  scene.add(dust.points)

  updates.push((s, camera) => {
    veil.update(camera, s)
    dust.update(camera, s)
  })

  return {
    updates,
    // Cumulus layout; drawn as volumes by the cloud layer (scene/volumes.js).
    heaps,
    // Things that exist only for a stretch of the flight.
    setProgress(f) {
      vista.visible = f < 2.08
      // Motes would float in front of the hall photo.
      dust.points.visible = f > 1.2
    },
    // Re-tint the billboard clouds from the current sky colours.
    tintClouds(top, bottom) {
      for (const m of cloudMats) {
        m.uniforms.uFog.value.copy(bottom)
        m.uniforms.uLit.value.copy(bottom).lerp(WHITE, 0.55).lerp(PEACH, 0.18)
        // Pulled toward the horizon colour and warmed, so undersides read
        // peach-rose rather than the blue of the zenith.
        m.uniforms.uShadow.value.copy(top).lerp(bottom, 0.75).multiply(ROSE_SHADE)
      }
    },
  }
}

const WHITE = new THREE.Color('#ffffff')
const PEACH = new THREE.Color('#ffe1bd')
const ROSE_SHADE = new THREE.Color(0.94, 0.82, 0.8)
