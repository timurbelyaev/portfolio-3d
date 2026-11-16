import './styles.css'
import * as THREE from 'three'

import { createRenderer } from './scene/renderer.js'
import { createSky } from './scene/sky.js'
import { createLights } from './scene/lights.js'
import { createScroll } from './scroll/progress.js'
import { createRig } from './camera/rig.js'
import { ColorTrack } from './color/interpolate.js'
import { createComposer } from './postfx/composer.js'
import { buildWorld } from './blocks/registry.js'
import { Panel } from './text/Panel.js'
import { SUN_POS } from './scene/clouds.js'
import { createCloudSea } from './scene/cloudSea.js'

const canvas = document.getElementById('scene')
const renderer = createRenderer(canvas)

const scene = new THREE.Scene()
// Tight fog so the (temporary) tail geometry dissolves into the sky behind the
// Hero clouds, and later blocks emerge from the haze as the camera descends.
// Cloud billboards use their own fog uniform, so they stay crisp.
const fog = new THREE.Fog('#f0b9c2', 24, 115)
scene.fog = fog

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.5, 2000)

const sky = createSky(scene)
const lights = createLights(scene)
const cloudSea = createCloudSea(scene, {
  horizonColor: sky.mesh.material.uniforms.bottomColor.value,
})

// Build the world: camera spine + content + panels.
const world = buildWorld({ scene, THREE })
const rig = createRig(world.pathPoints, world.lookPoints)
const colorTrack = new ColorTrack()
const panels = world.panels.map((def) => new Panel(def))

// Scroll length: enough screens for a calm descent through every waypoint.
const scrollSpace = document.getElementById('scroll-space')
scrollSpace.style.height = `${Math.round(world.pointCount * 130)}vh`

const scroll = createScroll()
const post = createComposer(renderer, scene, camera)

// Debug hook: lets tooling drive scroll position deterministically for
// screenshots. Harmless in production; no UI depends on it.
window.__lenis = scroll.lenis

// Prime the first frame before revealing.
let started = false
function hideLoader() {
  if (started) return
  started = true
  const loader = document.getElementById('loader')
  loader.classList.add('is-hidden')
  setTimeout(() => loader.remove(), 900)
}

let vw = window.innerWidth
let vh = window.innerHeight

const _sun = new THREE.Vector3()

function onResize() {
  vw = window.innerWidth
  vh = window.innerHeight
  camera.aspect = vw / vh
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(vw, vh)
  post.setSize(vw, vh)
}
window.addEventListener('resize', onResize)

function frame(time) {
  scroll.raf(time)
  const t = scroll.progress

  rig.update(t, camera)
  colorTrack.update(t, { sky, lights, fog })

  // Per-frame block updaters (e.g. cloud drift). `time` is ms from RAF.
  const seconds = time * 0.001
  camera.updateMatrixWorld()
  for (const u of world.updates) u(t, seconds, camera)
  cloudSea.update(camera, seconds)

  // Anchor the screen-space god rays to the sun and fade them out past Hero.
  const sp = _sun.copy(SUN_POS).project(camera)
  const onScreen = sp.z < 1 ? 1 : 0
  const heroFade = 1 - THREE.MathUtils.smoothstep(t, 0.2, 0.28)
  post.setSun(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5, onScreen * heroFade)

  // Keep the sun roughly ahead-and-above the camera so shadows read well.
  lights.sun.position.set(camera.position.x + 60, camera.position.y + 70, camera.position.z + 40)
  lights.sun.target.position.set(camera.position.x, camera.position.y - 10, camera.position.z - 60)
  lights.sun.target.updateMatrixWorld()

  camera.updateMatrixWorld()
  for (const p of panels) p.update(t, camera, vw, vh)

  post.render()
  hideLoader()
  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)
