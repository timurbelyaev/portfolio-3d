import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { WorldPass } from './world.js'

// Screen-space volumetric light scattering (crepuscular / god rays). Radial-
// blurs the frame outward from the sun's screen position, keeping only pixels
// brighter than a threshold (the sun glow + lit cloud crests), so bright light
// fans out through the cloud gaps. No geometry → no hard cut-offs.
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLightPos: { value: new THREE.Vector2(0.5, 0.7) },
    uExposure: { value: 0.28 },
    uDecay: { value: 0.96 },
    uDensity: { value: 0.72 },
    uWeight: { value: 0.55 },
    uThreshold: { value: 0.92 },
    uVisible: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #define SAMPLES 48
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uLightPos;
    uniform float uExposure, uDecay, uDensity, uWeight, uThreshold, uVisible;
    varying vec2 vUv;
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      vec2 tc = vUv;
      vec2 delta = (vUv - uLightPos) * (uDensity / float(SAMPLES));
      float decay = 1.0;
      vec3 accum = vec3(0.0);
      for (int i = 0; i < SAMPLES; i++) {
        tc -= delta;
        vec3 s = texture2D(tDiffuse, tc).rgb;
        float b = max(0.0, (s.r + s.g + s.b) / 3.0 - uThreshold);
        // Only the sun and its halo may throw shafts. Without this, every
        // bright highlight (gilding, lamps, lit marble) grows a streak.
        b *= smoothstep(0.2, 0.04, distance(tc, uLightPos));
        accum += s * b * decay;
        decay *= uDecay;
      }
      accum *= uWeight * uExposure * uVisible;
      accum *= vec3(1.06, 0.98, 0.82); // warm the shafts
      gl_FragColor = vec4(base + accum, 1.0);
    }
  `,
}

// Final pass: display transform. Colours in this project are authored as what
// you see on screen, so the curve is the identity up to a knee and only rolls
// off above it (hue-preserving, like the Khronos neutral curve but without its
// black offset). Sunlit marble and the sun's halo compress instead of
// clipping to flat white. A sub-LSB dither removes banding in the sky.
const DisplayShader = {
  uniforms: { tDiffuse: { value: null }, uKnee: { value: 0.78 }, uExposure: { value: 1.0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uKnee, uExposure;
    varying vec2 vUv;
    float ign(vec2 p) {
      return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    }
    void main() {
      vec3 c = max(texture2D(tDiffuse, vUv).rgb * uExposure, 0.0);
      float peak = max(c.r, max(c.g, c.b));
      if (peak > uKnee) {
        float d = 1.0 - uKnee;
        float mapped = 1.0 - d * d / (peak + d - uKnee);
        c *= mapped / peak;
        // Very bright light loses its colour, as on film.
        float g = 1.0 - 1.0 / (0.12 * (peak - mapped) + 1.0);
        c = mix(c, vec3(mapped), g);
      }
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
    }
  `,
}

export function createComposer(renderer, scene, camera, { coarse = false } = {}) {
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  composer.setSize(window.innerWidth, window.innerHeight)

  const world = new WorldPass(scene, camera, { aoSamples: coarse ? 6 : 10 })
  composer.addPass(world)

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3, // strength
    0.7, // radius
    0.9, // threshold — lit clouds read bright without blowing out
  )
  composer.addPass(bloom)

  const godRays = new ShaderPass(GodRaysShader)
  composer.addPass(godRays)

  const display = new ShaderPass(DisplayShader)
  display.material.toneMapped = false
  composer.addPass(display)

  return {
    composer,
    world,
    bloom,
    godRays,
    display,
    // Screen-space sun position (0..1) and a 0..1 visibility factor (faded when
    // the sun is off-screen / behind the camera / past the hero section).
    setSun(x, y, visible) {
      godRays.uniforms.uLightPos.value.set(x, y)
      godRays.uniforms.uVisible.value = visible
    },
    setSize(w, h) {
      composer.setSize(w, h)
    },
    render() {
      composer.render()
    },
  }
}
