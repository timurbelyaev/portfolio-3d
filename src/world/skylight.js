import * as THREE from 'three'
import { env, skyGLSL } from './env.js'

// Image-based light taken from the scene's own sky. The analytic sky (the
// same skyColor() the dome and the fog use) is rendered into a prefiltered
// cube, so ambient light and reflections always match what is on screen:
// warm from the sun's side, cool from the zenith, a bright bounce from the
// cloud sea below. It is re-baked only when the mood has visibly moved.

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vDir;
  ${skyGLSL}
  void main() {
    vec3 d = normalize(vDir);
    vec3 c = skyColor(d);
    // The sun as a broad lobe: at cube resolution a true disc would alias, and
    // the direct light already supplies the sharp highlight.
    float s = max(dot(d, uSunDir), 0.0);
    c += uSunColor * pow(s, 24.0) * 1.6 * uSunGlow;
    // Below the horizon lies the cloud sea, lit from above: a soft pale bounce.
    float below = smoothstep(0.02, -0.35, d.y);
    c = mix(c, mix(uSkyBottom, vec3(1.0), 0.35) * 0.92, below);
    // Pulled part-way to neutral: under a fully tinted sky every surface
    // would take the same hue and the materials would stop reading apart.
    c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 0.62);
    gl_FragColor = vec4(c, 1.0);
  }
`

export function createSkyLight(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const sky = new THREE.Scene()
  sky.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: env,
        side: THREE.BackSide,
        depthWrite: false,
        fragmentShader,
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
      }),
    ),
  )

  const baked = { top: new THREE.Color(-1, -1, -1), bottom: new THREE.Color(), sun: new THREE.Color(), glow: 0 }
  const delta = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))
  let target = null

  return {
    // Call every frame after the mood has been applied.
    update() {
      const top = env.uSkyTop.value
      const bottom = env.uSkyBottom.value
      const sun = env.uSunColor.value
      const glow = env.uSunGlow.value
      const moved = Math.max(delta(top, baked.top), delta(bottom, baked.bottom), delta(sun, baked.sun), Math.abs(glow - baked.glow) * 0.2)
      if (moved < 0.02) return
      baked.top.copy(top)
      baked.bottom.copy(bottom)
      baked.sun.copy(sun)
      baked.glow = glow
      const next = pmrem.fromScene(sky, 0, 0.1, 100)
      scene.environment = next.texture
      if (target) target.dispose()
      target = next
    },
  }
}
