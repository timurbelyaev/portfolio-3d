import * as THREE from 'three'

// Photo-scanned surface detail (CC0 textures from Poly Haven, in
// public/textures). The procedural geometry has no usable UVs, so every
// texture is projected triplanar in world space. Albedo is applied as a
// relative detail (texture / its mean), which keeps the authored palette and
// only borrows the texture's grain; the normal map adds real relief. An
// optional roughness map drives the material's roughness the same way.

const loader = new THREE.TextureLoader()
const cache = new Map()

function load(name, srgb) {
  const key = `${name}|${srgb}`
  if (cache.has(key)) return cache.get(key)
  const t = loader.load(`${import.meta.env.BASE_URL}textures/${name}.webp`)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  cache.set(key, t)
  return t
}

// Mean colour of each diffuse map (linear), measured offline; dividing by it
// turns the texture into a detail multiplier centred on 1.
const MEAN = {
  marble: [0.4408, 0.3386, 0.1948],
  rock: [0.1214, 0.0615, 0.0319],
  ground: [0.1706, 0.1228, 0.0282],
  bark: [0.2462, 0.1941, 0.1514],
}

const vertex = {
  vpars: 'varying vec3 vWorldN;',
  vpost: 'vWorldN = normalize(mat3(modelMatrix) * objectNormal);',
}

const pars = /* glsl */ `
  varying vec3 vWorldN;
  uniform sampler2D tDiff;
  uniform sampler2D tNor;
  uniform vec3 tMean;
  uniform vec4 tCfg; // scale, albedo gain, chroma (0 = luminance only), normal strength
  vec3 triW(vec3 n) {
    vec3 w = pow(abs(n), vec3(4.0));
    return w / (w.x + w.y + w.z);
  }
  vec3 triSample(sampler2D t, vec3 p, vec3 w) {
    return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z;
  }
`

const color = /* glsl */ `
  {
    vec3 tw = triW(vWorldN);
    // Two scales mixed so the tile never repeats visibly on big faces.
    vec3 td = mix(triSample(tDiff, vWorldP * tCfg.x, tw), triSample(tDiff, vWorldP * tCfg.x * 0.27 + 0.37, tw), 0.45);
    vec3 rel = td / tMean;
    float lum = dot(rel, vec3(0.3333));
    vec3 detail = mix(vec3(lum), rel, tCfg.z);
    diffuseColor.rgb *= max(mix(vec3(1.0), detail, tCfg.y), vec3(0.0));
  }
`

// Whiteout-style blend of three tangent-space normals into a world offset.
const normal = /* glsl */ `
  #include <normal_fragment_maps>
  {
    vec3 tw = triW(vWorldN);
    vec3 tp = vWorldP * tCfg.x;
    vec3 nx = texture2D(tNor, tp.zy).xyz * 2.0 - 1.0;
    vec3 ny = texture2D(tNor, tp.xz).xyz * 2.0 - 1.0;
    vec3 nz = texture2D(tNor, tp.xy).xyz * 2.0 - 1.0;
    vec3 wd = vec3(0.0, nx.y, nx.x) * tw.x + vec3(ny.x, 0.0, ny.y) * tw.y + vec3(nz.x, nz.y, 0.0) * tw.z;
    normal = normalize(normal + mat3(viewMatrix) * wd * tCfg.w);
  }
`

// The stock chunk declares `float roughnessFactor = roughness;`, so the
// override has to come right after it. Same two-scale mix as the albedo.
const roughParsGLSL = /* glsl */ `
  uniform sampler2D tRough;
  uniform vec4 tRoughCfg; // out min, out max, map value mapped to min, map value mapped to max
`

const roughness = /* glsl */ `
  #include <roughnessmap_fragment>
  {
    vec3 tw = triW(vWorldN);
    float r = mix(
      triSample(tRough, vWorldP * tCfg.x, tw).g,
      triSample(tRough, vWorldP * tCfg.x * 0.27 + 0.37, tw).g,
      0.45
    );
    float k = clamp((r - tRoughCfg.z) / (tRoughCfg.w - tRoughCfg.z), 0.0, 1.0);
    roughnessFactor = mix(tRoughCfg.x, tRoughCfg.y, k);
  }
`

// Merge texture detail into an existing material hook. `rough: [lo, hi]` turns
// on the roughness map: map values inside `roughIn` are remapped into [lo, hi].
export function surface(
  hook,
  name,
  { scale = 0.25, gain = 1, chroma = 0, normal: ns = 1, rough, roughIn = [0, 1] } = {},
) {
  const uniforms = {
    tDiff: { value: load(`${name}_diff`, true) },
    tNor: { value: load(`${name}_nor`, false) },
    tMean: { value: new THREE.Vector3(...MEAN[name]) },
    tCfg: { value: new THREE.Vector4(scale, gain, chroma, ns) },
  }
  const replace = [...(hook.replace || []), ['#include <normal_fragment_maps>', normal]]
  let extraPars = pars
  let suffix = name
  if (rough) {
    uniforms.tRough = { value: load(`${name}_rough`, false) }
    uniforms.tRoughCfg = { value: new THREE.Vector4(rough[0], rough[1], roughIn[0], roughIn[1]) }
    replace.push(['#include <roughnessmap_fragment>', roughness])
    extraPars += roughParsGLSL
    // Shader programs are cached by key, and this variant has extra uniforms.
    suffix += '+rough'
  }
  return {
    ...hook,
    ...vertex,
    key: `${hook.key || 'plain'}+${suffix}`,
    uniforms,
    pars: `${hook.pars || ''}\n${extraPars}`,
    color: `${hook.color || ''}\n${color}`,
    replace,
  }
}
