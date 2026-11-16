import * as THREE from 'three'
import hero from './hero.js'
import tail from './tail.js'

// Ordered list of blocks. Each block contributes camera waypoints, 3D content
// and text panels. Adding a real block later = insert its module here; nothing
// else needs to change. Phases 2–9 replace `tail` with the real blocks.
const BLOCKS = [hero, tail]

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2])

// Approximate each control point's position on the unit curve by cumulative
// chord length. Good enough to line panel timing up with where the camera
// actually is (arc-length curve param ≈ chord fraction for smooth paths).
function chordParams(points) {
  const d = [0]
  for (let i = 1; i < points.length; i++) d.push(d[i - 1] + points[i].distanceTo(points[i - 1]))
  const total = d[d.length - 1] || 1
  return d.map((x) => x / total)
}

export function buildWorld(ctx) {
  const pathPoints = []
  const lookPoints = []
  const spans = [] // [startIndex, endIndex] per block

  // Blocks may register per-frame updaters (e.g. time-driven cloud drift) via
  // ctx.onFrame; the main loop calls them each frame with (t, seconds).
  const updates = []
  const buildCtx = { ...ctx, onFrame: (fn) => updates.push(fn) }

  for (const block of BLOCKS) {
    const start = pathPoints.length
    for (const w of block.waypoints) {
      pathPoints.push(v3(w.pos))
      lookPoints.push(v3(w.look))
    }
    spans.push([start, pathPoints.length - 1])
  }

  const tAt = chordParams(pathPoints)

  const panels = []
  BLOCKS.forEach((block, i) => {
    const [s, e] = spans[i]
    const t0 = tAt[s]
    const t1 = tAt[e]
    for (const p of block.panels || []) {
      panels.push({
        ...p,
        showGlobal: [
          THREE.MathUtils.lerp(t0, t1, p.show[0]),
          THREE.MathUtils.lerp(t0, t1, p.show[1]),
        ],
      })
    }
    if (block.build) block.build(buildCtx)
  })

  return {
    pathPoints,
    lookPoints,
    panels,
    updates,
    blockCount: BLOCKS.length,
    pointCount: pathPoints.length,
  }
}
