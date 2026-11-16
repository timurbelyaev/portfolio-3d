import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { sculptBust } from './bust-sculpt.js'

// The portrait bust (see bust-sculpt.js) and its laurel wreath, as three.js
// geometry in head units: chin y = 0, crown y ≈ 1, face toward +z.

function toGeometry({ position, normal, index }) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  return geo
}

// Resolves with the bust geometry, sculpted off the main thread. Phones get a
// coarser mesh: the cost grows with the cube of the cell size.
export function bustGeometry() {
  const cell = window.matchMedia('(pointer: coarse)').matches ? 0.028 : 0.02
  return new Promise((resolve) => {
    let worker
    try {
      worker = new Worker(new URL('./bust.worker.js', import.meta.url), { type: 'module' })
    } catch {
      resolve(toGeometry(sculptBust(cell)))
      return
    }
    worker.onmessage = (e) => {
      worker.terminate()
      resolve(toGeometry(e.data))
    }
    // No module workers (or a blocked script): fall back to the main thread.
    worker.onerror = () => {
      worker.terminate()
      resolve(toGeometry(sculptBust(cell)))
    }
    worker.postMessage({ cell })
  })
}

// A laurel wreath for the bust: two rows of leaves running from the nape up
// to the brow on each side, in the same head units.
export function laurelGeometry() {
  const leaf = new THREE.IcosahedronGeometry(1, 1)
  leaf.scale(0.075, 0.016, 0.034)
  const parts = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const tangent = new THREE.Vector3()
  const X = new THREE.Vector3(1, 0, 0)
  const N = 15
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      // From the nape (t = 0) round to just short of the centre of the brow.
      const t = i / (N - 1)
      const th = -Math.PI / 2 + side * (0.12 + t * 2.85)
      const ring = (a, out) => out.set(Math.cos(a) * 0.41, 0.62 + 0.085 * Math.sin(a) + 0.03, -0.07 + Math.sin(a) * 0.5)
      ring(th, p)
      tangent.copy(ring(th + side * 0.05, new THREE.Vector3())).sub(p).normalize()
      for (const row of [-1, 1]) {
        q.setFromUnitVectors(X, tangent)
        // Leaves splay up and down from the stem and lift off the hair.
        const splay = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(p.x, 0, p.z + 0.07).normalize(), row * side * 0.5)
        m.compose(new THREE.Vector3(p.x * 1.02, p.y + row * 0.03, (p.z + 0.07) * 1.02 - 0.07), splay.multiply(q), one)
        parts.push(leaf.clone().applyMatrix4(m))
      }
    }
  }
  return mergeGeometries(parts)
}
