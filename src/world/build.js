import * as THREE from 'three'
import { createBillboardClouds } from '../scene/clouds.js'
import { createDustMotes } from '../scene/atmosphere.js'
import { PLACES } from './story.js'
import {
  Kit, MAT, tx, rng,
  island, column, cypress, beacon, oracle, gate, armillaryBase, colonnade, stairs, brazier, temple,
  BEACON_LIGHT_Y, ORACLE_ORB_Y, ARMILLARY_Y,
} from './models.js'

const at = (p, dy = 0) => tx(p[0], p[1] + dy, p[2])

function ring(radius, tube, material) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 5, 40), material)
}

export function buildWorld(scene) {
  const updates = []
  const kit = new Kit()
  const rand = rng(2026)

  // --- 01 bots: the beacon ---------------------------------------------------
  {
    const B = at(PLACES.beacon)
    island(kit, B, { r: 15, depth: 22, seed: 11 })
    beacon(kit, B.clone().multiply(tx(2, 0, -1)))
    cypress(kit, B.clone().multiply(tx(-8, 0, 4)), { h: 9, seed: 1 })
    cypress(kit, B.clone().multiply(tx(-10, 0, -1)), { h: 6.5, seed: 2 })
    column(kit, B.clone().multiply(tx(9, 0, 6)), { h: 7, r: 0.6, cut: 0.4, seed: 3 })

    // Signal pulses: rings that leave the lantern and fade — messages going out.
    const pulseMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.5, 1.15, 0.75), transparent: true, depthWrite: false, fog: false,
    })
    const pulses = [0, 1, 2].map((i) => {
      const m = ring(1, 0.035, pulseMat.clone())
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
    const B = at(PLACES.oracle)
    island(kit, B, { r: 16, depth: 24, seed: 22 })
    oracle(kit, B)
    cypress(kit, B.clone().multiply(tx(-10, 0, -8)), { h: 8, seed: 5 })

    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 2), MAT.glow)
    const c = new THREE.Vector3(PLACES.oracle[0], PLACES.oracle[1] + ORACLE_ORB_Y, PLACES.oracle[2])
    orb.position.copy(c)
    const halo = [ring(2.5, 0.05, MAT.glow), ring(3.1, 0.04, MAT.glow)]
    halo.forEach((h) => h.position.copy(c))
    scene.add(orb, ...halo)
    updates.push((s) => {
      orb.position.y = c.y + Math.sin(s * 0.9) * 0.35
      const pulse = 1 + Math.sin(s * 1.7) * 0.06
      orb.scale.setScalar(pulse)
      halo[0].rotation.set(s * 0.5, s * 0.3, 0)
      halo[1].rotation.set(1.1 - s * 0.35, 0, s * 0.45)
      halo.forEach((h) => (h.position.y = orb.position.y))
    })
  }

  // --- 03 sites: the gateway ---------------------------------------------------
  {
    const B = at(PLACES.gate)
    island(kit, B, { r: 15, depth: 20, seed: 33, sx: 1.15, sz: 0.9 })
    gate(kit, B)
    cypress(kit, B.clone().multiply(tx(-12.5, 0, 3)), { h: 10, seed: 7 })
    cypress(kit, B.clone().multiply(tx(12.5, 0, 3)), { h: 10, seed: 8 })
  }

  // --- 04 automation: the armillary -------------------------------------------
  {
    const B = at(PLACES.armillary)
    island(kit, B, { r: 13, depth: 19, seed: 44 })
    armillaryBase(kit, B)
    column(kit, B.clone().multiply(tx(-8, 0, 3)), { h: 8, r: 0.6, cut: 0.5, seed: 9 })
    cypress(kit, B.clone().multiply(tx(7, 0, 6)), { h: 7.5, seed: 10 })

    const c = new THREE.Vector3(PLACES.armillary[0], PLACES.armillary[1] + ARMILLARY_Y, PLACES.armillary[2])
    const rings = [4.8, 4.0, 3.2].map((r) => {
      const m = ring(r, 0.2, MAT.bronze)
      m.position.copy(c)
      scene.add(m)
      return m
    })
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), MAT.glow)
    core.position.copy(c)
    scene.add(core)
    updates.push((s) => {
      rings[0].rotation.set(0.4, s * 0.35, 0)
      rings[1].rotation.set(s * 0.5, 0.3, s * 0.2)
      rings[2].rotation.set(1.2, -s * 0.7, s * 0.4)
    })
  }

  // --- cases: the colonnade ------------------------------------------------------
  colonnade(kit, at(PLACES.colonnade), { length: 160 })

  // --- process: the stair, a brazier on every landing ----------------------------
  {
    const B = at(PLACES.stairs)
    const { landings } = stairs(kit, B)
    for (const l of landings) {
      for (const side of [-1, 1]) brazier(kit, B.clone().multiply(tx(side * 6.6, l.y, l.z)))
    }
  }

  // --- finale: the temple on its own island --------------------------------------
  {
    const [x, y, z] = PLACES.temple
    island(kit, tx(x, y - 0.6, z - 22), { r: 46, depth: 60, seed: 66, sz: 1.25 })
    kit.add('marbleShade', new THREE.BoxGeometry(34, 1.2, 40), tx(x, y - 0.6, z + 14))
    temple(kit, tx(x, y, z))
    for (const side of [-1, 1]) {
      brazier(kit, tx(x + side * 9, y, z + 12))
      cypress(kit, tx(x + side * 21, y, z + 6), { h: 13, seed: 80 + side })
      cypress(kit, tx(x + side * 25, y, z - 8), { h: 11, seed: 84 + side })
      column(kit, tx(x + side * 16, y, z + 20), { h: 9, r: 0.7, cut: side > 0 ? 0.55 : 1, seed: 90 + side })
    }
  }

  // --- depth: islands receding into the haze on both sides ------------------------
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1
    const x = side * (55 + rand() * 210)
    const z = -170 - rand() * 860
    const y = -4 + rand() * 46
    const r = 6 + rand() * 13
    const B = tx(x, y, z, rand() * 6.28)
    island(kit, B, { r, depth: r * (1.2 + rand()), seed: 700 + i })
    const pick = rand()
    if (pick < 0.35) cypress(kit, B.clone().multiply(tx(r * 0.2, 0, 0)), { h: 6 + rand() * 6, seed: i })
    else if (pick < 0.7) column(kit, B.clone().multiply(tx(0, 0, 0)), { h: 8 + rand() * 5, r: 0.7, cut: rand() < 0.5 ? 0.3 + rand() * 0.5 : 1, seed: i })
  }

  scene.add(kit.build('world'))

  // --- clouds ------------------------------------------------------------------------
  // The bank the story starts inside, and a thin veil of wisps drifting between
  // the islands along the whole route.
  const bank = createBillboardClouds({ boxMin: [-260, 34, -175], boxMax: [260, 88, 95], seed: 7 })
  const veil = createBillboardClouds({ boxMin: [-230, -12, -980], boxMax: [230, 30, -200], seed: 19 })
  const cloudMats = new Set()
  for (const c of [bank, veil]) {
    scene.add(c.group)
    c.group.traverse((o) => o.material && cloudMats.add(o.material))
  }
  veil.group.traverse((o) => o.material && (o.material.userData.veil = true))
  for (const m of cloudMats) m.uniforms.uOpacity.value = m.userData.veil ? 0.34 : 0.62

  const dust = createDustMotes({ count: 260, range: 80 })
  scene.add(dust.points)

  updates.push((s, camera) => {
    bank.update(camera, s)
    veil.update(camera, s)
    dust.update(camera, s)
  })

  return {
    updates,
    // Re-tint the billboard clouds from the current sky colours.
    tintClouds(top, bottom) {
      for (const m of cloudMats) {
        m.uniforms.uFog.value.copy(bottom)
        m.uniforms.uLit.value.copy(bottom).lerp(WHITE, 0.55)
        m.uniforms.uShadow.value.copy(top).multiplyScalar(0.86)
      }
    },
  }
}

const WHITE = new THREE.Color('#ffffff')
