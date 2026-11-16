import * as THREE from 'three'

// Large back-side sphere painted with a vertical gradient. Colors are driven
// each frame by the color track, so the whole sky drama (rose → blue → gold)
// is a single continuous interpolation over scroll progress.
const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;
  varying vec3 vWorldPosition;
  void main() {
    float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
    float f = pow(max(h, 0.0), exponent);
    gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0);
  }
`

export function createSky(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color('#eaa6bf') },
    bottomColor: { value: new THREE.Color('#f7cdb0') },
    offset: { value: 40 },
    exponent: { value: 0.7 },
  }
  const geometry = new THREE.SphereGeometry(1200, 32, 16)
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  scene.add(mesh)

  return {
    mesh,
    setColors(top, bottom) {
      uniforms.topColor.value.copy(top)
      uniforms.bottomColor.value.copy(bottom)
    },
  }
}
