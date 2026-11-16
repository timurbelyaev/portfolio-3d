import * as THREE from 'three'
import { cloudTexture } from './clouds.js'

// Depth atmosphere for the flight: three cheap layers that give the Hero volume
// instead of one flat cloud wall + text —
//   1. foreground wisps  — big soft clouds hugging the camera path, so you fly
//      THROUGH them and they dissolve at the lens;
//   2. dust motes        — one instanced Points field of slow glowing specks
//      that wraps around the camera (infinite, constant density) — the "air";
//   3. (silhouettes live in the block itself — just fogged meshes off to a side.)

// --- foreground wisps ------------------------------------------------------

// A few large billboard clouds strung along the early Hero path. Sprites face
// the camera for free; we fade each one out as the camera reaches it, so it
// reads as a wisp passing the lens rather than a flat card.
export function createForegroundWisps() {
  const tex = [cloudTexture(101), cloudTexture(202), cloudTexture(303)]
  const group = new THREE.Group()
  group.name = 'hero-wisps'

  // pos (near the spine, jittered) · scale · base opacity · tint
  const defs = [
    { p: [7, 63, 15], s: 52, o: 0.3, c: '#fce6e7' },
    { p: [-9, 61, 3], s: 74, o: 0.26, c: '#faece1' },
    { p: [11, 58, -8], s: 60, o: 0.32, c: '#fde8e4' },
    { p: [-13, 55, -19], s: 86, o: 0.24, c: '#f9e6ea' },
    { p: [8, 53, -31], s: 66, o: 0.3, c: '#fce8e0' },
    { p: [-7, 52, -43], s: 92, o: 0.22, c: '#f7e4eb' },
    { p: [4, 51, -53], s: 70, o: 0.28, c: '#fce7e5' },
  ]

  const wisps = defs.map((d, i) => {
    const mat = new THREE.SpriteMaterial({
      map: tex[i % tex.length],
      color: new THREE.Color(d.c),
      transparent: true,
      opacity: d.o,
      depthWrite: false,
      fog: true,
    })
    mat.rotation = (i * 1.3) % Math.PI
    const spr = new THREE.Sprite(mat)
    spr.scale.set(d.s, d.s * 0.62, 1)
    spr.position.set(...d.p)
    spr.userData = { base: d.o, home: spr.position.clone(), seed: i * 2.1 }
    spr.renderOrder = 3
    group.add(spr)
    return spr
  })

  const _c = new THREE.Vector3()
  return {
    group,
    update(camera, seconds) {
      camera.getWorldPosition(_c)
      for (const w of wisps) {
        const { base, home, seed } = w.userData
        // slow bob so the field feels alive
        w.position.set(
          home.x + Math.sin(seconds * 0.18 + seed) * 2.2,
          home.y + Math.cos(seconds * 0.13 + seed) * 1.4,
          home.z,
        )
        // Dissolve when the camera gets within ~16u (flying through), and once
        // it has passed behind, hide entirely.
        const dz = home.z - _c.z // positive while wisp is still ahead (−Z travel)
        const dist = w.position.distanceTo(_c)
        const near = THREE.MathUtils.smoothstep(dist, 6, 20)
        const behind = dz > 4 ? 0 : 1
        w.material.opacity = base * near * behind
      }
    },
  }
}

// --- dust motes ------------------------------------------------------------

function dotTexture() {
  const s = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = s
  const ctx = cv.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const dustVert = /* glsl */ `
  uniform vec3 uCam;
  uniform float uRange, uTime, uPixel;
  attribute float aScale, aSeed;
  varying float vAlpha;
  void main() {
    float s = aSeed * 6.2831;
    // slow individual drift
    vec3 p = position + vec3(
      sin(uTime * 0.06 + s), sin(uTime * 0.045 + s * 1.7), cos(uTime * 0.05 + s * 1.3)
    ) * 2.4;
    // wrap into a box centred on the camera → infinite field, constant density
    vec3 d = mod(p - uCam + uRange, 2.0 * uRange) - uRange;
    vec3 world = uCam + d;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    float depth = -mv.z;
    float dist = length(d);
    // Fade at the wrap boundary (no pop), fade at the lens so near motes don't
    // balloon into full-screen additive quads, kill anything behind the camera,
    // then twinkle. Point size is clamped for the same overdraw reason.
    float edge = smoothstep(uRange, uRange * 0.5, dist);
    float near = smoothstep(2.0, 14.0, depth);
    vAlpha = edge * near * (0.45 + 0.55 * sin(uTime * 0.9 + s * 3.0));
    gl_PointSize = clamp(aScale * uPixel * (210.0 / max(depth, 1.0)), 0.0, 38.0);
    gl_Position = projectionMatrix * mv;
  }
`

const dustFrag = /* glsl */ `
  precision mediump float;
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`

// Instanced glowing specks (one draw call) that always surround the lens.
export function createDustMotes({ count = 300, range = 85, color = '#fff1d6' } = {}) {
  const pos = new Float32Array(count * 3)
  const scale = new Float32Array(count)
  const seed = new Float32Array(count)
  // Deterministic scatter (no Math.random — keep it reproducible per build).
  let x = 1234.5
  const rnd = () => {
    x = Math.sin(x * 12.9898 + 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() * 2 - 1) * range
    pos[i * 3 + 1] = (rnd() * 2 - 1) * range
    pos[i * 3 + 2] = (rnd() * 2 - 1) * range
    scale[i] = 0.4 + rnd() * 0.9
    seed[i] = rnd()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))

  const mat = new THREE.ShaderMaterial({
    vertexShader: dustVert,
    fragmentShader: dustFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uMap: { value: dotTexture() },
      uColor: { value: new THREE.Color(color) },
      uCam: { value: new THREE.Vector3() },
      uRange: { value: range },
      uTime: { value: 0 },
      uPixel: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 4

  return {
    points,
    update(camera, seconds) {
      mat.uniforms.uCam.value.copy(camera.position)
      mat.uniforms.uTime.value = seconds
    },
  }
}
