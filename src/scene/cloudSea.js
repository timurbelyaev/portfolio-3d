import * as THREE from 'three'
import { env, skyGLSL } from '../world/env.js'

// A sea of clouds far below the flight path: the world's "ground". It gives
// the descent a horizon and a sense of scale/speed that free-floating islands
// in an empty sky lack. One displaced plane, not billboards — it has to read
// as a continuous surface all the way to the horizon.

const SIZE = 1600
const SEGMENTS = 160
const CELL = SIZE / SEGMENTS

const noiseGLSL = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
`

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  ${noiseGLSL}
  // Broad billows plus a smaller octave; billowed (abs-folded) so crests are
  // round and valleys are creased, like the top of a cloud deck.
  float billow(vec2 p) {
    vec2 d = vec2(uTime * 0.6, uTime * 0.25);
    float a = vnoise(p * 0.0085 + d * 0.0085);
    float b = vnoise(p * 0.023 + d * 0.023 + 17.0);
    float h = a * 0.72 + b * 0.28;
    return 1.0 - abs(h * 2.0 - 1.0);
  }
  void main() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    float h = billow(world.xz);
    // Normal from finite differences in the vertex stage — screen-space
    // derivatives in the fragment stage are unreliable under software GL.
    float e = 5.0;
    float hx = billow(world.xz + vec2(e, 0.0));
    float hz = billow(world.xz + vec2(0.0, e));
    vNormal = normalize(vec3((h - hx) * uAmp, e, (h - hz) * uAmp));
    world.y += h * uAmp;
    vHeight = h;
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uHaze;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;
  ${noiseGLSL}
  ${skyGLSL}
  void main() {
    // Fine fluff breaks up the smooth displaced surface.
    vec2 q = vWorld.xz * 0.06 + vec2(uTime * 0.03, 0.0);
    float fluff = vnoise(q) * 0.6 + vnoise(q * 2.3 + 9.0) * 0.4;

    // The sun sits low on the horizon, so slopes facing it catch a warm rim
    // while the far sides and the creases fall into cool shadow — that raking
    // light is what makes a displaced plane read as cloud tops, not dunes.
    vec3 n = normalize(vNormal + vec3(fluff - 0.5, 0.0, fluff - 0.5) * 0.5);
    vec3 flatSun = normalize(vec3(uSunDir.x, 0.35, uSunDir.z));
    float rim = clamp(dot(n, flatSun), 0.0, 1.0);
    float lit = clamp(rim * 0.6 + vHeight * 0.5 + (fluff - 0.5) * 0.3, 0.0, 1.0);

    // Tones derive from the sky so the sea follows the scroll colour drama.
    // Warm creases (dusty rose), not lilac: the zenith blue stays out of the shade.
    vec3 shadow = mix(uSkyBottom, uSkyTop, 0.15) * vec3(0.9, 0.8, 0.79);
    // Kept below pure white: bloom blows anything brighter into flat glare.
    vec3 bright = min(mix(mix(uSkyBottom, vec3(1.0), 0.4), uSunColor, 0.15) + uSunColor * rim * 0.1 * uSunGlow, vec3(0.97));
    vec3 col = mix(shadow, bright, smoothstep(0.2, 0.85, lit));
    // Crests turned to the sun carry the same peach rim as the cloud volumes.
    float crest = smoothstep(0.55, 1.0, vHeight) * smoothstep(0.35, 0.9, rim);
    col = mix(col, uSunColor * vec3(1.0, 0.86, 0.84), crest * 0.5);

    // Same haze law as the fogged materials and the cloud volumes: anything
    // that stands on the sea must fade into the sky at the same distance.
    vec3 toFrag = vWorld - cameraPosition;
    float haze = 1.0 - exp(-pow(length(toFrag) * uHaze, 2.0));
    vec3 dir = normalize(toFrag);
    dir.y = max(dir.y, 0.0);
    gl_FragColor = vec4(mix(col, skyColor(normalize(dir)), haze), 1.0);
  }
`

export function createCloudSea(scene, { y = -16, amp = 13 } = {}) {
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS)
  geometry.rotateX(-Math.PI / 2)

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uAmp: { value: amp },
      // Shared atmosphere uniforms (sky colours + sun), mutated by the mood track.
      ...env,
    },
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'cloud-sea'
  mesh.position.y = y
  mesh.frustumCulled = false
  scene.add(mesh)

  return {
    mesh,
    update(camera, seconds) {
      material.uniforms.uTime.value = seconds
      // Follow the camera in whole grid cells: the plane never runs out, and
      // because noise is sampled in world space the billows stay put.
      mesh.position.x = Math.round(camera.position.x / CELL) * CELL
      mesh.position.z = Math.round(camera.position.z / CELL) * CELL
    },
  }
}
