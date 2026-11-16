import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { env, skyGLSL } from '../world/env.js'

// Volumetric cumulus. Every cloud is a box whose fragment shader marches a
// ray through a density field:
//
//   density = macro shape (a union of soft puffs, baked per cloud into a small
//             3D texture) eroded by tiling 3D noise (Worley billows)
//
// The march stops at the opaque scene's depth, so a cloud wraps rock softly
// instead of cutting it with a hard line, and the camera can fly through one.
// Rendered by WorldPass into a low-res buffer and upsampled depth-aware.

function mulberry32(seed) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- tiling 3D noise, generated once on the GPU ---------------------------------
// r: billows (inverted Worley fbm blended with gradient noise), low frequency
// g: finer Worley fbm for the crisp cauliflower detail
// b: gradient fbm (soft variation)

const NOISE_SIZE = 64

const noiseFragment = /* glsl */ `
  precision highp float;
  uniform float uZ;
  varying vec2 vUv;
  vec3 hash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }
  // 1 at a feature point, falling to 0 at one cell away. Wraps at "freq".
  float worley(vec3 uvw, float freq) {
    vec3 p = uvw * freq;
    vec3 id = floor(p);
    vec3 f = fract(p);
    float md = 1.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        for (int z = -1; z <= 1; z++) {
          vec3 g = vec3(float(x), float(y), float(z));
          vec3 r = g + hash33(mod(id + g + freq, freq)) - f;
          md = min(md, dot(r, r));
        }
      }
    }
    return 1.0 - min(sqrt(md), 1.0);
  }
  float corner(vec3 i, vec3 f, vec3 o, float freq) {
    return dot(hash33(mod(i + o + freq, freq)) * 2.0 - 1.0, f - o);
  }
  float gradient(vec3 uvw, float freq) {
    vec3 p = uvw * freq;
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = mix(mix(corner(i, f, vec3(0, 0, 0), freq), corner(i, f, vec3(1, 0, 0), freq), u.x),
                  mix(corner(i, f, vec3(0, 1, 0), freq), corner(i, f, vec3(1, 1, 0), freq), u.x), u.y);
    float b = mix(mix(corner(i, f, vec3(0, 0, 1), freq), corner(i, f, vec3(1, 0, 1), freq), u.x),
                  mix(corner(i, f, vec3(0, 1, 1), freq), corner(i, f, vec3(1, 1, 1), freq), u.x), u.y);
    return clamp(mix(a, b, u.z) * 0.75 + 0.5, 0.0, 1.0);
  }
  void main() {
    vec3 p = vec3(vUv, uZ);
    float billow = worley(p, 4.0) * 0.46 + worley(p, 8.0) * 0.34 + worley(p, 16.0) * 0.2;
    float soft = gradient(p, 4.0) * 0.55 + gradient(p, 8.0) * 0.3 + gradient(p, 16.0) * 0.15;
    float fine = worley(p, 6.0) * 0.55 + worley(p, 12.0) * 0.3 + worley(p, 24.0) * 0.15;
    gl_FragColor = vec4(mix(billow, soft, 0.3), fine, soft, 1.0);
  }
`

function bakeNoise(renderer) {
  const target = new THREE.WebGL3DRenderTarget(NOISE_SIZE, NOISE_SIZE, NOISE_SIZE, { depthBuffer: false })
  const tex = target.texture
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  const material = new THREE.ShaderMaterial({
    uniforms: { uZ: { value: 0 } },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: noiseFragment,
  })
  const quad = new FullScreenQuad(material)
  const prev = renderer.getRenderTarget()
  for (let z = 0; z < NOISE_SIZE; z++) {
    material.uniforms.uZ.value = (z + 0.5) / NOISE_SIZE
    renderer.setRenderTarget(target, z)
    quad.render(renderer)
  }
  renderer.setRenderTarget(prev)
  quad.dispose()
  material.dispose()
  return tex
}

// --- macro shape of one cloud ---------------------------------------------------

const SHAPE = [48, 32, 48]
// Puffs are ellipsoids, slightly squashed, as cumulus cells are.
const SQUASH = 0.86
// The erosion eats a quarter of each puff; grow them to keep the authored size.
const GROW = 1.22

// `cloud`: { c: centre of the flat base, s: half-extents, n: number of puffs }.
// Returns the box and a density volume: the sum of smooth puff kernels, 0 at
// the outline and rising toward the cores.
function bakeShape(cloud, rand, bud, flatBase = true) {
  const { c, s, n } = cloud
  const puffs = []
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const grow = (p) => {
    puffs.push(p)
    const ext = [p[3], p[3] * SQUASH, p[3]]
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k] - ext[k])
      max[k] = Math.max(max[k], p[k] + ext[k])
    }
  }
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1
    const w = rand() * 2 - 1
    const edge = Math.min(Math.hypot(u, w) / 1.2, 1)
    const r = s[1] * (0.5 + 0.55 * rand()) * (1 - 0.55 * edge) * GROW
    const h = rand()
    const p = [c[0] + u * s[0], c[1] + r * 0.5 + h * h * s[1] * 1.3 * (1 - edge), c[2] + w * s[2], r]
    rand() // fifth draw per puff: keeps the layout of the sphere heaps this replaced
    grow(p)
    // Buds on the upper half of each puff: a cumulus outline is lobes on
    // lobes, a few plain spheres read as a toy.
    for (let b = 0; b < 3; b++) {
      const az = bud() * Math.PI * 2
      const el = 0.15 + bud() * 1.2
      const rr = r * (0.34 + bud() * 0.22)
      const reach = r * 0.78
      grow([
        p[0] + Math.cos(az) * Math.cos(el) * reach,
        p[1] + Math.sin(el) * reach * SQUASH,
        p[2] + Math.sin(az) * Math.cos(el) * reach,
        rr,
      ])
    }
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const [nx, ny, nz] = SHAPE
  const cell = [size[0] / nx, size[1] / ny, size[2] / nz]
  const field = new Float32Array(nx * ny * nz)

  for (const [px, py, pz, r] of puffs) {
    const ry = r * SQUASH
    const x0 = Math.max(0, Math.floor((px - r - min[0]) / cell[0]))
    const x1 = Math.min(nx - 1, Math.ceil((px + r - min[0]) / cell[0]))
    const y0 = Math.max(0, Math.floor((py - ry - min[1]) / cell[1]))
    const y1 = Math.min(ny - 1, Math.ceil((py + ry - min[1]) / cell[1]))
    const z0 = Math.max(0, Math.floor((pz - r - min[2]) / cell[2]))
    const z1 = Math.min(nz - 1, Math.ceil((pz + r - min[2]) / cell[2]))
    const inv = 1 / (r * r)
    for (let z = z0; z <= z1; z++) {
      const dz = min[2] + (z + 0.5) * cell[2] - pz
      for (let y = y0; y <= y1; y++) {
        const dy = (min[1] + (y + 0.5) * cell[1] - py) / SQUASH
        const row = (z * ny + y) * nx
        for (let x = x0; x <= x1; x++) {
          const dx = min[0] + (x + 0.5) * cell[0] - px
          const q = 1 - (dx * dx + dy * dy + dz * dz) * inv
          if (q > 0) field[row + x] += q * q
        }
      }
    }
  }

  const data = new Uint8Array(field.length)
  // Flat base: real cumulus sit on the condensation level.
  const lo = c[1] - s[1] * 0.2
  const hi = c[1] + s[1] * 0.3
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      const wy = min[1] + (y + 0.5) * cell[1]
      let base = flatBase ? Math.min(Math.max((wy - lo) / (hi - lo), 0), 1) : 1
      base = base * base * (3 - 2 * base)
      // Fade on the outermost voxels so the box faces never show.
      const by = Math.min(y, ny - 1 - y, 1.5) / 1.5
      for (let x = 0; x < nx; x++) {
        const bx = Math.min(x, nx - 1 - x, z, nz - 1 - z, 1.5) / 1.5
        const i = (z * ny + y) * nx + x
        data[i] = Math.min(field[i] * base * bx * by, 1) * 255
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, nx, ny, nz)
  tex.format = THREE.RedFormat
  tex.type = THREE.UnsignedByteType
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.unpackAlignment = 1
  tex.needsUpdate = true
  return { tex, min, size }
}

// --- the march ---------------------------------------------------------------------

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;
  uniform sampler3D tShape;
  uniform sampler3D tNoise;
  uniform sampler2D tLowDepth;
  uniform vec2 uLowSize;
  uniform vec3 uCamDir;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxSize;
  uniform vec3 uOffset;
  uniform float uTime;
  uniform float uHaze;
  uniform float uDensity;
  uniform float uErode;
  varying vec3 vWorld;
  ${skyGLSL}

  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
  float shapeAt(vec3 p) {
    return texture(tShape, (p - uBoxMin) / uBoxSize).r;
  }
  // Creases between billows are carved in; the billows themselves stay, which
  // is what gives the cauliflower outline. The core is left solid.
  float densityAt(vec3 p, float shape) {
    vec3 q = p + vec3(uTime * 0.5, 0.0, uTime * 0.2);
    float billow = texture(tNoise, q * 0.019 + uOffset).r;
    float fine = texture(tNoise, q * 0.068 + uOffset.zxy).g;
    float crease = 1.0 - (billow * 0.6 + fine * 0.4);
    crease = smoothstep(0.18, 0.78, crease);
    return smoothstep(0.0, 0.11, shape - crease * uErode * (1.0 - shape * 0.35));
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - ro);

    vec3 inv = 1.0 / rd;
    vec3 t0 = (uBoxMin - ro) * inv;
    vec3 t1 = (uBoxMin + uBoxSize - ro) * inv;
    vec3 lo = min(t0, t1);
    vec3 hi = max(t0, t1);
    float tNear = max(max(max(lo.x, lo.y), lo.z), 0.0);
    float tFar = min(min(hi.x, hi.y), hi.z);

    // Stop at the opaque world.
    vec2 uv = gl_FragCoord.xy / uLowSize;
    float sceneDepth = texture2D(tLowDepth, uv).g;
    tFar = min(tFar, sceneDepth / max(dot(rd, uCamDir), 0.001));
    if (tFar <= tNear) discard;

    // Two gears. Empty space is crossed in long strides; on touching a cloud
    // the ray backs up one stride and continues in short steps sized to the
    // distance (detail on screen shrinks with it), so near clouds resolve
    // their fine billows and far ones do not pay for it.
    float stride = max((tFar - tNear) / float(STEPS), 0.6);
    float jitter = ign(gl_FragCoord.xy);
    float t = tNear + stride * jitter;
    bool inside = false;

    // Light: the low sun lifted, so the crowns catch it.
    vec3 L = normalize(vec3(uSunDir.x, uSunDir.y + 0.85, uSunDir.z));
    float h = uBoxSize.y * 0.055;
    float forward = max(dot(rd, uSunDir), 0.0);
    vec3 sky = skyColor(rd);
    // Lit crowns stay white with only a breath of the sun's peach; more sun
    // colour than this reads as yellow. Capped under 1.0 for the bloom pass.
    vec3 bright = min(mix(mix(uSkyBottom, vec3(1.0), 0.55), uSunColor, 0.12), vec3(0.97));
    // Peach-rose shade (palette: peach mist #e6cfc4 into dusty rose #d7bbb2),
    // red-leaning rather than orange so it never turns ochre. Built from the
    // warm horizon only: any share of the blue zenith turns it grey-lilac.
    vec3 shade = mix(uSkyBottom, vec3(1.0), 0.1) * vec3(0.87, 0.75, 0.74);
    // Sun-struck rim: a saturated, red-leaning peach (never yellow), kept
    // under 1.0 so the bloom pass softens the edge instead of flattening it.
    vec3 rimCol = uSunColor * vec3(1.0, 0.86, 0.84);

    vec3 acc = vec3(0.0);
    float rimAcc = 0.0;
    float T = 1.0;
    for (int i = 0; i < STEPS + FINE; i++) {
      if (t >= tFar) break;
      vec3 p = ro + rd * t;
      float shape = shapeAt(p);
      // Whatever happens, the remaining steps must be able to reach the far
      // side: a ray cut short leaves a hole shaped like the jitter pattern.
      float reach = (tFar - t) / float(STEPS + FINE - i);
      if (shape <= 0.004) {
        inside = false;
        t += max(stride, reach);
        continue;
      }
      float dt = max(clamp(t * 0.013, 0.4, stride), reach);
      if (!inside) {
        inside = true;
        t = max(t - stride + dt * jitter, tNear);
        continue;
      }
      float d = densityAt(p, shape);
      if (d > 0.002) {
        // Optical depth toward the sun: three taps, each standing for a
        // longer stretch. Macro shape only — smooth, cheap self-shadow.
        float od = shapeAt(p + L * h) + shapeAt(p + L * h * 2.6) * 1.6 + shapeAt(p + L * h * 6.0) * 3.4;
        float sun = exp(-od * 0.62);
        float height = clamp((p.y - uBoxMin.y) / uBoxSize.y, 0.0, 1.0);
        // Sky light reaches the outer shell and the crown, not the core.
        float open = (1.0 - shape * 0.55) * (0.62 + 0.38 * height);
        vec3 col = shade * (0.56 + 0.52 * open);
        // Light scattered through the body: a faint apricot glow in the
        // half-lit volume, what keeps a painted cloud from going grey.
        col += uSunColor * vec3(1.0, 0.7, 0.58) * sun * (1.0 - sun) * 0.08;
        col = mix(col, bright, smoothstep(0.08, 0.9, sun) * (0.45 + 0.55 * open));
        // Lit rim on every cloud, whatever the view direction. A sample is on
        // the silhouette when the view ray leaves the cloud just behind it
        // (one tap ahead finds almost nothing): there the sun shines through
        // the thin edge, so it glows peach while the body stays white.
        float ahead = shapeAt(p + rd * h * 2.9);
        float rimLit = (1.0 - smoothstep(0.02, 0.28, ahead)) * smoothstep(0.12, 0.7, sun);
        col = mix(col, rimCol, rimLit * 0.5);
        // Silver lining: thin cloud between the eye and the sun glows.
        col += uSunColor * sun * pow(forward, 5.0) * 0.5 * uSunGlow;

        float haze = 1.0 - exp(-pow(t * uHaze, 2.0));
        col = mix(col, sky, haze * 0.92);

        float a = 1.0 - exp(-d * uDensity * dt);
        acc += T * a * col;
        // The rim's glow is light coming straight at the eye: haze dims it
        // far less than it dims the cloud's own surface.
        rimAcc += T * a * rimLit * (1.0 - haze * 0.5);
        T *= 1.0 - a;
        if (T < 0.02) {
          T = 0.0;
          break;
        }
      } else {
        // Eroded shell: nothing here, move on a little faster.
        dt *= 2.0;
      }
      t += dt;
    }
    float alpha = 1.0 - T;
    if (alpha < 0.003) discard;
    // Emitted on top of the premultiplied colour and strongest in the wispy
    // fringe: a thin edge is mostly sky by coverage, so tinting it is not
    // enough, it has to shine to read as a line of light.
    acc += rimCol * rimAcc * (0.8 + 3.8 * (1.0 - alpha)) * uSunGlow;
    gl_FragColor = vec4(acc, alpha);
  }
`

// `heaps`: [{ c: [x, y, z], s: [sx, sy, sz], n }] — centre of the flat base,
// half-extents, number of puffs.
// `steps`: strides across a cloud's box; `fine`: budget of short steps inside it.
// `flatBase`: false rounds the underside too (the curtain bake films heaps sideways).
export function createCloudVolumes(renderer, heaps, { seed = 31, steps = 24, fine = 44, flatBase = true } = {}) {
  const rand = mulberry32(seed)
  const jitter = mulberry32(seed + 7)
  const scene = new THREE.Scene()
  const noise = bakeNoise(renderer)
  // Shared by every cloud material, by reference; WorldPass fills the first three.
  const uniforms = {
    tLowDepth: { value: null },
    uLowSize: { value: new THREE.Vector2(1, 1) },
    uCamDir: { value: new THREE.Vector3() },
    tNoise: { value: noise },
    uDensity: { value: 0.7 },
    uErode: { value: 0.8 },
    ...env,
  }
  const geometry = new THREE.BoxGeometry(1, 1, 1)

  for (const heap of heaps) {
    const { tex, min, size } = bakeShape(heap, rand, jitter, flatBase)
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: { STEPS: steps, FINE: fine },
      uniforms: {
        ...uniforms,
        tShape: { value: tex },
        uBoxMin: { value: new THREE.Vector3(...min) },
        uBoxSize: { value: new THREE.Vector3(...size) },
        uOffset: { value: new THREE.Vector3(jitter(), jitter(), jitter()) },
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      // Premultiplied "over".
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.scale.set(size[0], size[1], size[2])
    mesh.position.set(min[0] + size[0] / 2, min[1] + size[1] / 2, min[2] + size[2] / 2)
    scene.add(mesh)
  }

  return { scene, uniforms }
}
