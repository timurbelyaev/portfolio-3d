import * as THREE from 'three'
import { LIGHT } from './kit/look.js'

// Shared atmosphere state. Every uniform object here is passed BY REFERENCE to
// the sky dome, the cloud sea and every fogged material, so the mood track only
// has to mutate these values once per frame.
export const env = {
  uSkyTop: { value: new THREE.Color('#e3a6b5') },
  uSkyBottom: { value: new THREE.Color('#f8d7c0') },
  uSunDir: { value: new THREE.Vector3(...LIGHT.sun).normalize() },
  uSunColor: { value: new THREE.Color('#ffd9a0') },
  uSunGlow: { value: 1 },
  uTime: { value: 0 },
  uHaze: { value: 0.005 }, // mirrors the scene fog density
}

// One analytic sky: vertical gradient + a wide halo around the sun. Used by the
// dome itself AND as the fog colour, so distant geometry dissolves into exactly
// the sky behind it (and washes out toward the sun) instead of a flat tint.
export const skyGLSL = /* glsl */ `
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunGlow;
  vec3 skyColor(vec3 d) {
    // Steep near the horizon: the zenith colour is already there at eye level.
    float h = clamp(d.y * 1.7 + 0.04, 0.0, 1.0);
    vec3 c = mix(uSkyBottom, uSkyTop, pow(h, 0.5));
    float s = max(dot(d, uSunDir), 0.0);
    c += uSunColor * (pow(s, 5.0) * 0.09 + pow(s, 40.0) * 0.26) * uSunGlow;
    return c;
  }
`

// Patch a built-in material so its fog blends toward skyColor(viewDir).
//
// `hook` lets a material add its own GLSL at fixed points of the built-in
// shader: `vertex` (after begin_vertex, may move `transformed`), `pars`
// (fragment globals), `color` (after color_fragment, may edit diffuseColor),
// `preFog` (may edit gl_FragColor before the haze), `replace` ([from, to]
// pairs on the fragment source), `vpars` / `vpost` (vertex globals and code
// after the world position is known), `uniforms` (extra uniforms, by
// reference). `key` must be unique per distinct hook:
// three caches programs by it.
export function fogged(material, hook = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, env, hook.uniforms || {})
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <fog_pars_vertex>',
        `#include <fog_pars_vertex>\nvarying vec3 vFogView;\nvarying vec3 vWorldP;\nuniform float uTime;\n${hook.vpars || ''}`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${hook.vertex || ''}`)
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>\nvFogView = mvPosition.xyz;\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n${hook.vpost || ''}`,
      )
    let frag = shader.fragmentShader
      .replace(
        '#include <fog_pars_fragment>',
        `#include <fog_pars_fragment>\nvarying vec3 vFogView;\nvarying vec3 vWorldP;\nuniform float uTime;\n${skyGLSL}\n${hook.pars || ''}`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${hook.color || ''}`)
      .replace(
        '#include <fog_fragment>',
        /* glsl */ `
        vec3 fogDir = normalize((vec4(vFogView, 0.0) * viewMatrix).xyz);
        ${hook.preFog || ''}
        #ifdef USE_FOG
          float skyFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyColor(fogDir), skyFog);
        #endif
        `,
      )
    for (const [from, to] of hook.replace || []) frag = frag.replace(from, to)
    shader.fragmentShader = frag
  }
  material.customProgramCacheKey = () => `fogged:${hook.key || 'plain'}`
  return material
}

export function createSkyDome(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: env,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vDir;
      ${skyGLSL}
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = skyColor(d);
        float s = max(dot(d, uSunDir), 0.0);
        // The disc: angular distance from the centre in disc radii (the small-
        // angle form stays precise where acos(s) would lose float bits).
        float x = sqrt(max(2.0 * (1.0 - s), 0.0)) / 0.034;
        float mu = sqrt(max(1.0 - x * x, 0.0));
        // Limb darkening, stronger in blue, so the rim warms and dims toward
        // the edge; the core stays far above 1.0 for bloom and god rays.
        vec3 limb = vec3(1.0) - vec3(0.38, 0.5, 0.62) * (1.0 - pow(mu, 0.7));
        float disc = 1.0 - smoothstep(0.86, 1.04, x);
        // Tight aureole hugging the disc, fading into the halo of skyColor().
        float aureole = exp(-max(x - 1.0, 0.0) * 2.2) * 0.18 + exp(-max(x - 1.0, 0.0) * 0.6) * 0.035;
        c += uSunColor * (disc * limb * 1.65 + (1.0 - disc) * aureole) * uSunGlow;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -10
  scene.add(mesh)
  return {
    mesh,
    update(camera) {
      mesh.position.copy(camera.position)
    },
  }
}
