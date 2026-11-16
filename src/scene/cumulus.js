import * as THREE from 'three'
import { env, skyGLSL } from '../world/env.js'

// Cumulus: heaps of overlapping spheres, shaded as one soft volume. Unlike the
// billboard wisps these are real geometry, so they wrap around rock, hide what
// is behind them and keep their shape as the camera flies past. Edges are
// dissolved with a screen-space dither instead of alpha blending — no sorting.

function mulberry32(seed) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const vertexShader = /* glsl */ `
  attribute float aR;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vW;
  float kHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float kNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(kHash(i), kHash(i + vec3(1, 0, 0)), f.x), mix(kHash(i + vec3(0, 1, 0)), kHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(kHash(i + vec3(0, 0, 1)), kHash(i + vec3(1, 0, 1)), f.x), mix(kHash(i + vec3(0, 1, 1)), kHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  void main() {
    // Cauliflower surface: each puff is pushed in and out by slow noise.
    vec3 q = position / max(aR, 0.001);
    float n = kNoise(position * 0.16 + vec3(0.0, uTime * 0.02, 0.0)) * 0.6 + kNoise(q * 2.2 + position * 0.05) * 0.4;
    vec3 p = position + normal * (n - 0.45) * aR * 0.5;
    vW = p;
    vN = normal;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uHaze;
  varying vec3 vN;
  varying vec3 vW;
  ${skyGLSL}
  float ign(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }
  void main() {
    vec3 N = normalize(vN);
    vec3 toCam = cameraPosition - vW;
    float dist = length(toCam);
    vec3 V = toCam / dist;
    float facing = max(dot(N, V), 0.0);
    // Feathered silhouette, and a dissolve up close so the camera can fly
    // through a cloud without a hard wall.
    float a = smoothstep(0.02, 0.36, facing) * smoothstep(3.0, 30.0, dist);
    if (a < ign(gl_FragCoord.xy)) discard;

    // Light from the low sun, lifted so crowns catch it; undersides stay cool.
    vec3 L = normalize(vec3(uSunDir.x, uSunDir.y + 0.6, uSunDir.z));
    float lit = smoothstep(0.26, 0.8, (dot(N, L) * 0.5 + 0.5) * 0.6 + (N.y * 0.5 + 0.5) * 0.55);
    vec3 bright = mix(uSkyBottom, vec3(1.0), 0.72) * 0.96;
    vec3 shade = mix(uSkyTop, uSkyBottom, 0.5) * vec3(0.8, 0.72, 0.86);
    vec3 col = mix(shade, bright, lit);
    // Silver lining on edges that stand between the eye and the sun.
    float toward = pow(max(dot(-V, uSunDir), 0.0), 5.0);
    col += uSunColor * pow(1.0 - facing, 2.0) * toward * 0.55 * uSunGlow;

    float haze = 1.0 - exp(-pow(dist * uHaze, 2.0));
    vec3 dir = -V;
    col = mix(col, skyColor(dir), haze * 0.9);
    gl_FragColor = vec4(col, 1.0);
  }
`

// `clouds`: [{ c: [x, y, z], s: [sx, sy, sz], n }] — centre of the flat base,
// half-extents, number of puffs.
export function createCumulus(clouds, seed = 1) {
  const rand = mulberry32(seed)
  const lo = new THREE.IcosahedronGeometry(1, 1).attributes.position.array
  const hi = new THREE.IcosahedronGeometry(1, 2).attributes.position.array
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: env, fog: false })
  const group = new THREE.Group()
  group.name = 'cumulus'

  // One mesh per stretch of the route, so off-screen clouds are culled.
  const buckets = new Map()
  for (const cloud of clouds) {
    const key = Math.floor(-cloud.c[2] / 260)
    if (!buckets.has(key)) buckets.set(key, [])
    const puffs = buckets.get(key)
    const { c, s, n } = cloud
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1
      const w = rand() * 2 - 1
      const edge = Math.min(Math.hypot(u, w) / 1.2, 1)
      const r = s[1] * (0.5 + 0.55 * rand()) * (1 - 0.55 * edge)
      const h = rand()
      puffs.push([c[0] + u * s[0], c[1] + r * 0.5 + h * h * s[1] * 1.3 * (1 - edge), c[2] + w * s[2], r, rand() * 6.28])
    }
  }

  for (const puffs of buckets.values()) {
    const count = puffs.reduce((sum, p) => sum + (p[3] > 7 ? hi.length : lo.length) / 3, 0)
    const pos = new Float32Array(count * 3)
    const nor = new Float32Array(count * 3)
    const rad = new Float32Array(count)
    let o = 0
    for (const [x, y, z, r, spin] of puffs) {
      const src = r > 7 ? hi : lo
      // Random spin so the facets of neighbouring puffs do not line up.
      const ca = Math.cos(spin)
      const sa = Math.sin(spin)
      for (let i = 0; i < src.length; i += 3, o++) {
        const nx = src[i] * ca - src[i + 2] * sa
        const ny = src[i + 1]
        const nz = src[i] * sa + src[i + 2] * ca
        pos.set([x + nx * r, y + ny * r * 0.86, z + nz * r], o * 3)
        nor.set([nx, ny, nz], o * 3)
        rad[o] = r
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    geometry.setAttribute('aR', new THREE.BufferAttribute(rad, 1))
    geometry.computeBoundingSphere()
    group.add(new THREE.Mesh(geometry, material))
  }
  return group
}
