import * as THREE from 'three'

// The camera spine: two arc-length-parameterized Catmull-Rom curves — one for
// the eye position, one for the look-at target. Global scroll t (0..1) maps
// straight onto both. Per-block "plateaus" are applied upstream by remapping t
// before it reaches here (see registry/ease), so this stays pure.
export function createRig(pathPoints, lookPoints) {
  // Centripetal Catmull-Rom, not uniform: block seams put short waypoint spacing
  // next to long spacing, and the uniform variant overshoots there (a bulge in
  // both the position and look curves that reads as a jerk right at the handoff).
  // The centripetal parameterization is overshoot- and cusp-free for any spacing.
  const path = new THREE.CatmullRomCurve3(pathPoints, false, 'centripetal')
  const look = new THREE.CatmullRomCurve3(lookPoints, false, 'centripetal')

  const _pos = new THREE.Vector3()
  const _look = new THREE.Vector3()

  return {
    path,
    look,
    update(t, camera) {
      const tt = THREE.MathUtils.clamp(t, 0, 1)
      path.getPointAt(tt, _pos)
      look.getPointAt(tt, _look)
      camera.position.copy(_pos)
      camera.lookAt(_look)
    },
    positionAt(t, target) {
      return path.getPointAt(THREE.MathUtils.clamp(t, 0, 1), target)
    },
  }
}
