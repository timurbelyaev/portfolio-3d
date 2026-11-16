import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

// Shared loaders. DRACO is wired for compressed .glb (gltf-transform output);
// the decoder is loaded from a CDN only if a model actually needs it.
const draco = new DRACOLoader()
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')

const loader = new GLTFLoader()
loader.setDRACOLoader(draco)

const cache = new Map()

// Root URL for static models (public/models). Respects Vite's base so it works
// both on the dev server and in a build deployed behind a path prefix.
export const MODELS = `${import.meta.env.BASE_URL}models/`

// Colored low-poly stand-in used until the real .glb for a block is dropped
// into public/models/. Keeps every block visible so we never block on assets.
export function placeholderBox(size = [8, 8, 8], color = '#c9a24a') {
  const geo = new THREE.BoxGeometry(...size)
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.placeholder = true
  return mesh
}

// Scale/position a loaded model in-place so it occupies `fit` world units on its
// largest axis and sits centered on X/Z, with its base ('bottom') or middle
// ('center') at the local origin. Lets us drop kit pieces (~1u) and a temple
// scan (~50u) into the same scene addressed by one predictable size.
function normalize(obj, fit, align) {
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const s = fit / (Math.max(size.x, size.y, size.z) || 1)
  obj.scale.setScalar(s)
  obj.position.set(
    -center.x * s,
    align === 'center' ? -center.y * s : -box.min.y * s,
    -center.z * s,
  )
}

// Loads a .glb, returns its scene graph. On any failure (missing file, decode
// error) resolves to a fallback so the flight keeps working during development.
export function loadModel(url, { fallback } = {}) {
  if (cache.has(url)) return cache.get(url)

  const promise = new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true
            o.receiveShadow = true
          }
        })
        resolve(gltf.scene)
      },
      undefined,
      (err) => {
        console.warn(`[loadModel] "${url}" unavailable → placeholder`, err?.message || err)
        resolve(fallback ? fallback() : placeholderBox())
      },
    )
  })

  cache.set(url, promise)
  return promise
}

// Synchronous placement: returns an empty holder Group immediately (so callers
// stay synchronous inside block build()), then fills it once the .glb resolves —
// a normalized clone on success, a sized/colored box on failure. Position and
// rotate the returned holder; the model inside is already fit + base-aligned.
export function spawnModel(url, { fit = 10, align = 'bottom', fallback } = {}) {
  const holder = new THREE.Group()
  loadModel(url, { fallback: () => null }).then((scene) => {
    const inst = scene ? scene.clone(true) : (fallback ? fallback() : placeholderBox([fit, fit, fit]))
    normalize(inst, fit, align)
    holder.add(inst)
  })
  return holder
}
