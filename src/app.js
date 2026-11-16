import './styles.css'
import * as THREE from 'three'

import { createRenderer } from './scene/renderer.js'
import { createScroll } from './scroll/progress.js'
import { createCloudSea } from './scene/cloudSea.js'
import { createCloudVolumes } from './scene/volumes.js'
import { createComposer } from './postfx/composer.js'
import { env, createSkyDome } from './world/env.js'
import { LIGHT } from './world/kit/look.js'
import { createSkyLight } from './world/skylight.js'
import { buildWorld } from './world/assemble.js'
import { createDirector, createMood } from './world/director.js'
import { KEYS, MOOD } from './world/story.js'
import { createOverlay } from './ui/overlay.js'
import { createCurtain } from './ui/curtain.js'

const curtain = createCurtain()
// Texture loads feed the loader's progress; the loader also waits for them so
// the first view does not pop in surface detail.
let assetsReady = false
THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => curtain.progress(loaded / total)
THREE.DefaultLoadingManager.onLoad = () => {
  assetsReady = true
}

const canvas = document.getElementById('scene')
const renderer = createRenderer(canvas)
// The look is authored directly in display colours (pastel haze): the display
// transform lives in the last post pass (see postfx/composer.js), not here.
renderer.toneMapping = THREE.NoToneMapping
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
// Ambient light and reflections come from the sky itself (re-baked as the mood
// changes), so shaded sides take the colour of the air around them.
const skyLight = createSkyLight(renderer, scene)
scene.environmentIntensity = LIGHT.env
const fog = new THREE.FogExp2('#ffffff', 0.006)
scene.fog = fog

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 3000)

const sky = createSkyDome(scene)
const sea = createCloudSea(scene, { y: -16, amp: 13 })

// Low sun dead ahead (rim light). The sky bake carries the ambient; the
// hemisphere and the cool fill from behind the camera only lift it a little
// so faces turned toward the viewer keep their form.
const lights = {
  hemi: new THREE.HemisphereLight('#ffffff', '#f6d2b8', 0.35),
  sun: new THREE.DirectionalLight('#ffe1bd', 4.6),
  fill: new THREE.DirectionalLight('#c8d8e8', 0.45),
}
lights.fill.position.set(-30, 40, 100)
scene.add(lights.hemi, lights.sun, lights.sun.target, lights.fill)

// The shadow light keeps the sun's heading but sits higher than the visible
// disc: at the true 6° every shadow would be an endless streak. Its box
// follows the camera (see frame()).
const SHADOW_DIR = new THREE.Vector3(...LIGHT.shadow).normalize()
const coarse = window.matchMedia('(pointer: coarse)').matches
lights.sun.castShadow = true
lights.sun.shadow.mapSize.setScalar(coarse ? 2048 : 4096)
Object.assign(lights.sun.shadow.camera, { left: -85, right: 85, top: 75, bottom: -75, near: 1, far: 560 })
lights.sun.shadow.camera.updateProjectionMatrix()
lights.sun.shadow.bias = -0.0005
lights.sun.shadow.normalBias = 0.07

const world = buildWorld(scene)
// The hall zooming into the hole (overlay.js, f 0..0.9) is most of what moves
// at the start; it counts as a 70-unit move so the first flight takes its time.
const director = createDirector(KEYS, { extra: (f) => 70 * THREE.MathUtils.smoothstep(f, 0, 0.9) })
const mood = createMood(MOOD, { fog, lights, tintClouds: world.tintClouds })

const scrollSpace = document.getElementById('scroll-space')
scrollSpace.style.height = `${Math.round((director.totalScreens + 1) * 100)}vh`

const scroll = createScroll()
const post = createComposer(renderer, scene, camera, { coarse })
post.world.clouds = createCloudVolumes(renderer, world.heaps, coarse ? { steps: 14, fine: 22 } : {})
post.bloom.strength = 0.28
post.bloom.radius = 0.85
post.bloom.threshold = 0.93
post.godRays.uniforms.uExposure.value = 0.12
// Short shafts: a long blur smears small bright objects into dotted trails.
post.godRays.uniforms.uDensity.value = 0.34
post.godRays.uniforms.uThreshold.value = 0.97

// Scripted flight to f. It is timed and eased in the director's visual effort
// (distance + turn + zoom), not in scroll: Lenis gets an easing that maps
// time → effort → f → scroll, so the camera keeps an even pace through every
// key it passes and long or turning hops get more time. A flight started
// while another one runs is already at speed, so it only eases out.
const easeInOut = (t) => 0.5 - Math.cos(Math.PI * t) / 2
const easeOut = (t) => Math.sin((Math.PI * t) / 2)
let flyingUntil = 0
function fly(f) {
  const limit = document.documentElement.scrollHeight - window.innerHeight
  const from = scroll.lenis.animatedScroll
  const to = director.scrollAt(f) * limit
  const c0 = director.effortAt(director.fAt(from / limit))
  const c1 = director.effortAt(f)
  // Grows slower than the effort: big hops cruise a little faster rather
  // than dragging on.
  const seconds = THREE.MathUtils.clamp(2 + Math.abs(c1 - c0) / 60, 2.6, 5.4)
  const now = performance.now()
  const shape = now < flyingUntil ? easeOut : easeInOut
  const span = to - from
  const easing = (t) => {
    if (Math.abs(span) < 1) return shape(t)
    const s = director.scrollAt(director.fAtEffort(c0 + (c1 - c0) * shape(t))) * limit
    return (s - from) / span
  }
  scroll.lenis.scrollTo(to, { duration: seconds, easing })
  flyingUntil = now + seconds * 1000
  return seconds
}

const overlay = createOverlay({
  root: document.getElementById('ui'),
  onFly: fly,
  onJump(f, label) {
    const limit = document.documentElement.scrollHeight - window.innerHeight
    const to = director.scrollAt(f) * limit
    // Short hops still fly; anything longer is a cut behind the cloud curtain
    // (a long scripted scroll races through the world and stutters).
    if (Math.abs(director.fAt(scroll.progress) - f) < 2.2) {
      fly(f)
      return
    }
    curtain.travel(label, async () => {
      scroll.lenis.stop()
      scroll.lenis.scrollTo(to, { immediate: true, force: true })
      director.snap()
      // A few frames at the new spot: shader compiles and uploads happen
      // here, behind the clouds, not after they part.
      for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r))
      scroll.lenis.start()
    })
  },
  onSheet(open) {
    if (open) scroll.lenis.stop()
    else scroll.lenis.start()
  },
})

// Debug hooks: deterministic scroll for screenshots / tuning.
window.__lenis = scroll.lenis
window.__director = director

let vw = window.innerWidth
let vh = window.innerHeight
function onResize() {
  vw = window.innerWidth
  vh = window.innerHeight
  camera.aspect = vw / vh
  camera.updateProjectionMatrix()
  overlay.layout(vw, vh)
  applyQuality()
}

// Quality governor. The low-res buffers (occlusion, clouds) and the pixel
// ratio are the two levers that scale with fill rate; when frames stay slow
// the next rung is taken, and never given back (no oscillation).
const RUNGS = [
  { ratio: 2, low: 0.5 },
  { ratio: 2, low: 0.36 },
  { ratio: 1.5, low: 0.36 },
  { ratio: 1.5, low: 0.25 },
  { ratio: 1, low: 0.25 },
]
let rung = coarse ? 1 : 0
function applyQuality() {
  const q = RUNGS[rung]
  const ratio = Math.min(window.devicePixelRatio, q.ratio)
  // Dense screens already put four pixels under every low-res texel.
  post.world.setLowScale(ratio > 1.4 ? Math.min(q.low, 0.36) : q.low)
  renderer.setPixelRatio(ratio)
  renderer.setSize(vw, vh)
  post.composer.setPixelRatio(ratio)
  post.setSize(vw, vh)
}
let slow = 0
let lastTime = 0
function govern(time) {
  const dt = time - lastTime
  lastTime = time
  // Long gaps are tab switches, not slow frames.
  if (dt <= 0 || dt > 250) return
  slow = dt > 25 ? slow + 1 : Math.max(slow - 2, 0)
  if (slow > 50 && rung < RUNGS.length - 1) {
    rung++
    slow = 0
    applyQuality()
  }
}
window.addEventListener('resize', onResize)
overlay.layout(vw, vh)
applyQuality()

// The loader parts once textures and fonts are in and a few frames have run
// (the first frames compile shaders and stall). Capped so a stuck request
// never keeps the site hidden.
let framesDrawn = 0
let revealing = false
const bootStart = performance.now()
const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve()
let fontsDone = false
fontsReady.then(() => {
  fontsDone = true
  // The stacked hero places its copy by measured height, which the web fonts change.
  overlay.layout(vw, vh)
})
function hideLoader() {
  if (revealing) return
  framesDrawn++
  const waited = performance.now() - bootStart
  if ((assetsReady && fontsDone && framesDrawn > 6) || waited > 12000) {
    revealing = true
    curtain.reveal()
  }
}

const _sun = new THREE.Vector3()

// Vertical angle of the world seen through the picture's hole at rest.
const HOLE_VIEW = 30

function render(time) {
  scroll.raf(time)
  const seconds = time * 0.001
  const progress = scroll.progress
  const f = director.fAt(progress)

  env.uTime.value = seconds
  mood.update(f)
  skyLight.update()
  world.setProgress(f)
  director.update(f, camera, seconds)
  camera.updateMatrixWorld()

  // Shadow box: centred ahead of the camera (far ahead while the painting's
  // temple is the subject), snapped to whole units so edges do not crawl.
  const reach = f < 2 ? 130 : 45
  const target = lights.sun.target.position
  target.set(Math.round(camera.position.x / 2) * 2, Math.round(camera.position.y - 4), Math.round((camera.position.z - reach) / 2) * 2)
  lights.sun.position.copy(target).addScaledVector(SHADOW_DIR, 280)

  // Hero: the world is framed by the hole in the hall photo. The projection
  // centre sits on the hole and the lens is narrowed so the hole shows
  // HOLE_VIEW degrees; both melt into the flight as the hall zooms away.
  const k = overlay.heroHold(f)
  if (k > 0.0005) {
    const hole = overlay.hole
    const holeFov = THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(HOLE_VIEW / 2)) * vh) / hole.h))
    camera.fov = THREE.MathUtils.lerp(camera.fov, holeFov, k)
    camera.setViewOffset(vw, vh, -(hole.cx - vw / 2) * k, -(hole.cy - vh / 2) * k, vw, vh)
  } else if (camera.view && camera.view.enabled) camera.clearViewOffset()
  camera.updateMatrixWorld()

  sky.update(camera)
  sea.update(camera, seconds)
  for (const u of world.updates) u(seconds, camera)

  // God rays fan out from the sun's screen position while it is in view.
  _sun.copy(camera.position).addScaledVector(env.uSunDir.value, 1000).project(camera)
  const inView = _sun.z < 1 && Math.abs(_sun.x) < 1.3 && Math.abs(_sun.y) < 1.3 ? 1 : 0
  // No shafts in the hero: they would spill past the hole over the hall.
  post.setSun(_sun.x * 0.5 + 0.5, _sun.y * 0.5 + 0.5, inView * THREE.MathUtils.smoothstep(f, 1.0, 2.6))

  overlay.update(f, progress, vw, vh)

  post.render()
  hideLoader()
}

function frame(time) {
  govern(time)
  render(time)
  requestAnimationFrame(frame)
}

// Debug hook: render one frame on demand (background tabs pause rAF).
window.__render = () => render(performance.now())
window.__dbg = { scene, lights, renderer, camera, post }

requestAnimationFrame(frame)
