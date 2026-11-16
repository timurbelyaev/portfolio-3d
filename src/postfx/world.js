import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { env } from '../world/env.js'

// The world pass replaces RenderPass. It owns the frame up to the point where
// bloom takes over:
//
//   1. opaque world            → sceneRT (colour + depth texture, MSAA)
//   2. ambient occlusion       → half-res, from depth alone (no extra scene
//                                render, so alpha-tested leaves and displaced
//                                surfaces occlude exactly as drawn)
//   3. volumetric clouds       → low-res, ray-marched against the same depth
//   4. composite               → scene × AO, clouds over, into the composer
//
// Order matters: the clouds go on AFTER the occlusion, otherwise creases of
// geometry hidden behind a cloud would print through it.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const depthGLSL = /* glsl */ `
  uniform sampler2D tDepth;
  uniform mat4 uProjInv;
  vec3 viewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    vec4 c = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return c.xyz / c.w;
  }
`

// Depth stored for sky pixels: far beyond anything, still inside half-float.
const SKY_DEPTH = '60000.0'

// Scalable ambient obscurance. Output: r = visibility, g = linear view depth
// (kept for the depth-aware blur and for the cloud pass and upsampling).
const aoFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform mat4 uProj;
  uniform vec2 uTexel; // one full-resolution depth texel
  uniform float uRadius;
  uniform float uPower;
  ${depthGLSL}
  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
  void main() {
    float raw = texture2D(tDepth, vUv).x;
    if (raw >= 0.999999) {
      gl_FragColor = vec4(1.0, ${SKY_DEPTH}, 0.0, 1.0);
      return;
    }
    vec3 p = viewPos(vUv);
    // Normal from depth: on each axis take the neighbour on the same surface
    // (the smaller depth step), so silhouettes do not get a false normal.
    vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0));
    vec3 pl = viewPos(vUv - vec2(uTexel.x, 0.0));
    vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y));
    vec3 pd = viewPos(vUv - vec2(0.0, uTexel.y));
    vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
    vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
    vec3 n = normalize(cross(dx, dy));

    float depth = -p.z;
    // World radius → uv radius, clamped so near surfaces do not sample half
    // the screen and far ones still span a few texels.
    float rUv = clamp(uRadius * uProj[1][1] * 0.5 / depth, uTexel.y * 4.0, 0.1);
    float rWorld = rUv * depth * 2.0 / uProj[1][1];
    vec2 aspect = vec2(uProj[0][0] / uProj[1][1], 1.0);

    float phi = ign(gl_FragCoord.xy) * 6.2831853;
    float occ = 0.0;
    for (int i = 0; i < AO_SAMPLES; i++) {
      float t = (float(i) + 0.5) / float(AO_SAMPLES);
      float a = phi + t * 6.2831853 * 2.618;
      vec2 o = vec2(cos(a), sin(a)) * rUv * (0.15 + 0.85 * t) * aspect;
      vec3 v = viewPos(vUv + o) - p;
      float d2 = dot(v, v);
      float nv = dot(v, n) - 0.02 * rWorld - 0.0015 * depth;
      // Samples farther than the radius belong to another object.
      float range = smoothstep(rWorld * rWorld * 1.6, rWorld * rWorld * 0.4, d2);
      occ += max(nv, 0.0) / (d2 + rWorld * rWorld * 0.01) * rWorld * range;
    }
    float ao = clamp(1.0 - occ / float(AO_SAMPLES) * 1.35, 0.0, 1.0);
    gl_FragColor = vec4(pow(ao, uPower), depth, 0.0, 1.0);
  }
`

// Separable blur that will not smear occlusion across a depth edge.
const blurFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tAO;
  uniform vec2 uStep;
  void main() {
    vec2 c = texture2D(tAO, vUv).rg;
    float sum = c.r * 0.227;
    float wsum = 0.227;
    float tol = c.g * 0.02 + 0.08;
    for (int i = 1; i <= 4; i++) {
      float g = i == 1 ? 0.194 : i == 2 ? 0.121 : i == 3 ? 0.054 : 0.016;
      for (int s = -1; s <= 1; s += 2) {
        vec2 q = texture2D(tAO, vUv + uStep * float(i * s)).rg;
        float w = g * max(0.0, 1.0 - abs(q.g - c.g) / tol);
        sum += q.r * w;
        wsum += w;
      }
    }
    gl_FragColor = vec4(sum / wsum, c.g, 0.0, 1.0);
  }
`

// The march starts each ray at a jittered offset, which trades banding for
// grain; a 3×3 filter turns that grain into a smooth gradient. Depth-aware,
// because a cloud texel ends where the scene behind ITS pixel ends.
const cloudBlurFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tCloud;
  uniform sampler2D tAO;
  uniform vec2 uLowSize;
  void main() {
    vec2 inv = 1.0 / uLowSize;
    float depth = texture2D(tAO, vUv).g;
    float tol = depth * 0.03 + 0.15;
    vec4 sum = vec4(0.0);
    float wsum = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 uv = vUv + vec2(float(i), float(j)) * inv;
        float w = max(0.0, 1.0 - abs(texture2D(tAO, uv).g - depth) / tol) + (i == 0 && j == 0 ? 0.001 : 0.0);
        sum += texture2D(tCloud, uv) * w;
        wsum += w;
      }
    }
    gl_FragColor = sum / wsum;
  }
`

const compositeFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform sampler2D tAO;
  uniform sampler2D tCloud;
  uniform vec2 uLowSize; // size of the low-res buffers, in texels
  uniform vec3 uAoTint;
  uniform float uAoStrength;
  uniform float uHaze;
  uniform float uClouds;
  ${depthGLSL}

  // Nearest-depth upsampling: a low-res texel is only allowed to contribute to
  // a full-res pixel on the same surface. Without it every silhouette in
  // front of a cloud (or of an occluded wall) gets a one-texel halo.
  void lowRes(float depth, out float ao, out vec4 cloud) {
    vec2 st = vUv * uLowSize - 0.5;
    vec2 base = floor(st);
    vec2 inv = 1.0 / uLowSize;
    float best = 1e9;
    vec2 bestUv = vUv;
    float worst = 0.0;
    for (int j = 0; j < 2; j++) {
      for (int i = 0; i < 2; i++) {
        vec2 uv = (base + vec2(float(i), float(j)) + 0.5) * inv;
        float d = abs(texture2D(tAO, uv).g - depth);
        worst = max(worst, d);
        if (d < best) {
          best = d;
          bestUv = uv;
        }
      }
    }
    // All four on the same surface → plain bilinear; else the closest texel.
    vec2 uv = worst < depth * 0.03 + 0.15 ? vUv : bestUv;
    ao = texture2D(tAO, uv).r;
    cloud = texture2D(tCloud, uv);
  }

  void main() {
    vec3 col = texture2D(tScene, vUv).rgb;
    float raw = texture2D(tDepth, vUv).x;
    vec3 p = viewPos(vUv);
    float depth = raw >= 0.999999 ? ${SKY_DEPTH} : -p.z;

    float ao;
    vec4 cloud;
    lowRes(depth, ao, cloud);

    // Occlusion fades with the haze: a wall that is mostly sky colour already
    // must not keep crisp dark creases.
    float dist = length(p);
    float clear = raw >= 0.999999 ? 0.0 : exp(-uHaze * uHaze * dist * dist);
    col *= mix(vec3(1.0), uAoTint, (1.0 - ao) * uAoStrength * clear);

    // Clouds are premultiplied.
    col = col * (1.0 - cloud.a * uClouds) + cloud.rgb * uClouds;
    gl_FragColor = vec4(col, 1.0);
  }
`

export class WorldPass extends Pass {
  constructor(scene, camera, { samples = 4, aoSamples = 10, lowScale = 0.5 } = {}) {
    super()
    this.scene = scene
    this.camera = camera
    this.needsSwap = false
    this.lowScale = lowScale
    // Set by the cloud layer: { scene, uniforms } (see scene/volumes.js).
    this.clouds = null

    const depthTexture = new THREE.DepthTexture(1, 1)
    depthTexture.type = THREE.UnsignedIntType
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthTexture })

    const low = () => {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter
      return rt
    }
    this.aoA = low()
    this.aoB = low()
    this.cloudRT = low()
    this.cloudB = low()

    const shared = {
      tDepth: { value: depthTexture },
      uProjInv: { value: new THREE.Matrix4() },
    }
    const material = (fragmentShader, uniforms, defines = {}) =>
      new THREE.ShaderMaterial({
        vertexShader, fragmentShader, defines, depthTest: false, depthWrite: false, toneMapped: false,
        uniforms: { ...shared, ...uniforms },
      })

    this.aoMat = material(aoFragment, {
      uProj: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: 1.6 },
      uPower: { value: 1.5 },
    }, { AO_SAMPLES: aoSamples })
    this.blurMat = material(blurFragment, { tAO: { value: null }, uStep: { value: new THREE.Vector2() } })
    this.compositeMat = material(compositeFragment, {
      tScene: { value: this.sceneRT.texture },
      tAO: { value: this.aoA.texture },
      tCloud: { value: this.cloudB.texture },
      uLowSize: { value: new THREE.Vector2(1, 1) },
      // Occluded light is the cool bounce, never black: keeps the pastel key.
      uAoTint: { value: new THREE.Color(0.47, 0.4, 0.5) },
      uAoStrength: { value: 0.85 },
      uHaze: env.uHaze,
      uClouds: { value: 0 },
    })
    this.cloudBlurMat = material(cloudBlurFragment, {
      tCloud: { value: this.cloudRT.texture },
      tAO: { value: this.aoA.texture },
      uLowSize: this.compositeMat.uniforms.uLowSize,
    })
    this.fsq = new FullScreenQuad(this.aoMat)
    this._clear = new THREE.Color()
    this._dir = new THREE.Vector3()
  }

  setSize(width, height) {
    this.sceneRT.setSize(width, height)
    const lw = Math.max(1, Math.round(width * this.lowScale))
    const lh = Math.max(1, Math.round(height * this.lowScale))
    this.aoA.setSize(lw, lh)
    this.aoB.setSize(lw, lh)
    this.cloudRT.setSize(lw, lh)
    this.cloudB.setSize(lw, lh)
    this.aoMat.uniforms.uTexel.value.set(1 / width, 1 / height)
    this.compositeMat.uniforms.uLowSize.value.set(lw, lh)
    this.width = width
    this.height = height
  }

  // Resolution of the low-res buffers relative to the frame (quality governor).
  setLowScale(scale) {
    if (scale === this.lowScale) return
    this.lowScale = scale
    if (this.width) this.setSize(this.width, this.height)
  }

  draw(renderer, material, target) {
    this.fsq.material = material
    renderer.setRenderTarget(target)
    this.fsq.render(renderer)
  }

  render(renderer, writeBuffer, readBuffer) {
    const camera = this.camera

    renderer.setRenderTarget(this.sceneRT)
    renderer.clear()
    renderer.render(this.scene, camera)

    this.aoMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse)
    this.aoMat.uniforms.uProj.value.copy(camera.projectionMatrix)
    this.draw(renderer, this.aoMat, this.aoA)
    const blur = this.blurMat.uniforms
    blur.tAO.value = this.aoA.texture
    blur.uStep.value.set(1 / this.aoA.width, 0)
    this.draw(renderer, this.blurMat, this.aoB)
    blur.tAO.value = this.aoB.texture
    blur.uStep.value.set(0, 1 / this.aoA.height)
    this.draw(renderer, this.blurMat, this.aoA)

    const clouds = this.clouds
    this.compositeMat.uniforms.uClouds.value = clouds ? 1 : 0
    if (clouds) {
      const u = clouds.uniforms
      u.tLowDepth.value = this.aoA.texture
      u.uLowSize.value.set(this.aoA.width, this.aoA.height)
      u.uCamDir.value.copy(camera.getWorldDirection(this._dir))
      renderer.getClearColor(this._clear)
      const alpha = renderer.getClearAlpha()
      renderer.setClearColor(0x000000, 0)
      renderer.setRenderTarget(this.cloudRT)
      renderer.clear()
      renderer.render(clouds.scene, camera)
      renderer.setClearColor(this._clear, alpha)
      this.draw(renderer, this.cloudBlurMat, this.cloudB)
    }

    this.draw(renderer, this.compositeMat, this.renderToScreen ? null : readBuffer)
  }

  dispose() {
    this.sceneRT.dispose()
    this.aoA.dispose()
    this.aoB.dispose()
    this.cloudRT.dispose()
    this.cloudB.dispose()
    this.cloudBlurMat.dispose()
    this.aoMat.dispose()
    this.blurMat.dispose()
    this.compositeMat.dispose()
    this.fsq.dispose()
  }
}
