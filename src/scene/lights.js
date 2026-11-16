import * as THREE from 'three'

// Sun (DirectionalLight) casts shadows for volume on islands and temple;
// Hemisphere + a touch of Ambient keep low-poly faces from going black.
// Colors/intensity are re-tinted per scroll progress by the color track.
export function createLights(scene) {
  const hemi = new THREE.HemisphereLight('#ffd0dc', '#e6b48f', 0.9)
  scene.add(hemi)

  const sun = new THREE.DirectionalLight('#ffd68a', 2.4)
  sun.position.set(60, 90, 30)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0004
  const d = 220
  sun.shadow.camera.left = -d
  sun.shadow.camera.right = d
  sun.shadow.camera.top = d
  sun.shadow.camera.bottom = -d
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 700
  sun.shadow.camera.updateProjectionMatrix()
  scene.add(sun)
  scene.add(sun.target)

  const ambient = new THREE.AmbientLight('#ffffff', 0.22)
  scene.add(ambient)

  return { hemi, sun, ambient }
}
