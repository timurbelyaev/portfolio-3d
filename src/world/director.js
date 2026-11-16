import * as THREE from 'three'
import { env } from './env.js'
import { LIGHT } from './kit/look.js'

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2])
const clamp01 = (x) => Math.min(Math.max(x, 0), 1)
const smooth = (x) => x * x * (3 - 2 * x)

// Camera along the storyboard. Scroll (0..1) → f (float key index) → position
// on two Catmull-Rom curves (eye + look-at) sampled by key index, so every key
// is hit exactly and the easing below makes the camera linger at each one.
// `extra(f)`: an optional monotonic measure of motion that is not the camera's
// own (the hero hall zooming), counted into the flight effort below.
export function createDirector(keys, { extra } = {}) {
  const n = keys.length - 1
  const path = new THREE.CatmullRomCurve3(keys.map((k) => v3(k.pos)), false, 'centripetal')
  // Interpolate the viewing DIRECTION, not the look-at point: when a target
  // swings across close to the camera, a point curve whips the view around in
  // a few frames; unit directions turn at an even rate instead.
  const look = new THREE.CatmullRomCurve3(
    keys.map((k) => v3(k.look).sub(v3(k.pos)).normalize()),
    false,
    'centripetal',
  )

  const stops = [0]
  for (let i = 0; i < n; i++) stops.push(stops[i] + keys[i].w)
  const total = stops[n]
  for (let i = 0; i <= n; i++) stops[i] /= total

  // Part linear, part smoothstep: slows near each key without a dead stop.
  const EASE = 0.5
  const ease = (x) => x * (1 - EASE) + smooth(x) * EASE

  const fovAt = (f) => {
    const i = Math.min(Math.floor(f), n - 1)
    return THREE.MathUtils.lerp(keys[i].fov, keys[i + 1].fov, smooth(clamp01(f - i)))
  }

  // Visual effort accumulated along f, in world units: distance travelled plus
  // turning plus zoom. Scripted flights run at an even pace in this measure.
  // Paced by scroll they would slow at every key and rush the long or sharply
  // turning segments, which reads as a jerk.
  const RES = 64
  const TURN = 48 // world units per radian of turn
  const ZOOM = 1.6 // world units per degree of fov
  const effort = new Float32Array(n * RES + 1)
  {
    const p = path.getPoint(0)
    const d = look.getPoint(0).normalize()
    const q = new THREE.Vector3()
    const e = new THREE.Vector3()
    let fov0 = fovAt(0)
    let x0 = extra ? extra(0) : 0
    for (let j = 1; j <= n * RES; j++) {
      const f = j / RES
      path.getPoint(f / n, q)
      look.getPoint(f / n, e).normalize()
      const fov = fovAt(f)
      const x = extra ? extra(f) : 0
      effort[j] = effort[j - 1] + q.distanceTo(p) + d.angleTo(e) * TURN + Math.abs(fov - fov0) * ZOOM + Math.abs(x - x0)
      p.copy(q)
      d.copy(e)
      fov0 = fov
      x0 = x
    }
  }
  const effortAt = (f) => {
    const x = Math.min(Math.max(f, 0), n) * RES
    const j = Math.min(Math.floor(x), n * RES - 1)
    return effort[j] + (effort[j + 1] - effort[j]) * (x - j)
  }
  const fAtEffort = (c) => {
    let lo = 0
    let hi = n * RES
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (effort[mid] < c) lo = mid
      else hi = mid
    }
    const span = effort[hi] - effort[lo]
    return (lo + (span > 0 ? clamp01((c - effort[lo]) / span) : 0)) / RES
  }

  const _pos = new THREE.Vector3()
  const _look = new THREE.Vector3()
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
  let prevYaw = null
  let roll = 0

  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1
  })

  return {
    totalScreens: total,
    effortAt,
    fAtEffort,
    fAt(scroll) {
      const s = clamp01(scroll)
      let i = 0
      while (i < n - 1 && s > stops[i + 1]) i++
      return i + ease(clamp01((s - stops[i]) / (stops[i + 1] - stops[i])))
    },
    // Inverse, for navigation jumps. Solved by bisection (ease is monotonic).
    scrollAt(f) {
      const ff = Math.min(Math.max(f, 0), n)
      const i = Math.min(Math.floor(ff), n - 1)
      const target = ff - i
      let lo = 0
      let hi = 1
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2
        if (ease(mid) < target) lo = mid
        else hi = mid
      }
      return stops[i] + ((lo + hi) / 2) * (stops[i + 1] - stops[i])
    },
    // After a cut: forget the previous heading so the jump is not read as a
    // violent turn (which would bank the camera).
    snap() {
      prevYaw = null
      roll = 0
    },
    update(f, camera, seconds) {
      const u = clamp01(f / n)
      path.getPoint(u, _pos)
      look.getPoint(u, _look).normalize()

      // Slow breathing drift so held shots are never frozen.
      _pos.x += Math.sin(seconds * 0.31) * 0.28
      _pos.y += Math.sin(seconds * 0.23 + 1.3) * 0.2
      camera.position.copy(_pos)
      camera.lookAt(_look.multiplyScalar(60).add(camera.position))

      const fov = fovAt(f)
      // Portrait screens need a wider lens to keep the subject in frame.
      const portrait = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.55 : 1
      const target = fov * portrait
      if (Math.abs(camera.fov - target) > 0.01) {
        camera.fov = target
        camera.updateProjectionMatrix()
      }

      // Bank into turns: roll follows the (smoothed) yaw rate.
      const yaw = camera.rotation.y
      if (prevYaw !== null) {
        let d = yaw - prevYaw
        if (d > Math.PI) d -= Math.PI * 2
        if (d < -Math.PI) d += Math.PI * 2
        const want = THREE.MathUtils.clamp(d * 9, -0.07, 0.07)
        roll += (want - roll) * 0.05
      }
      prevYaw = yaw

      // Pointer parallax: the view leans a little toward the cursor.
      pointer.sx += (pointer.x - pointer.sx) * 0.04
      pointer.sy += (pointer.y - pointer.sy) * 0.04
      camera.rotateY(-pointer.sx * 0.03)
      camera.rotateX(-pointer.sy * 0.018)
      camera.rotateZ(roll + Math.sin(seconds * 0.17) * 0.004)
    },
  }
}

// Atmosphere over the flight: interpolates the MOOD keys and writes the result
// into the shared env uniforms, the fog, the lights and two CSS variables.
export function createMood(keys, { fog, lights, tintClouds }) {
  const parsed = keys.map((k) => ({
    f: k.f,
    top: new THREE.Color(k.top),
    bottom: new THREE.Color(k.bottom),
    sun: new THREE.Color(k.sun),
    ink: new THREE.Color(k.ink),
    glow: k.glow,
    fog: k.fog,
  }))
  const ink = new THREE.Color()
  const tmp = new THREE.Color()
  let lastInk = ''

  return {
    update(f) {
      let a = parsed[0]
      let b = parsed[parsed.length - 1]
      for (let i = 0; i < parsed.length - 1; i++) {
        if (f >= parsed[i].f && f <= parsed[i + 1].f) {
          a = parsed[i]
          b = parsed[i + 1]
          break
        }
      }
      const k = b.f > a.f ? clamp01((f - a.f) / (b.f - a.f)) : 0
      env.uSkyTop.value.copy(a.top).lerp(b.top, k)
      env.uSkyBottom.value.copy(a.bottom).lerp(b.bottom, k)
      env.uSunColor.value.copy(a.sun).lerp(b.sun, k)
      env.uSunGlow.value = THREE.MathUtils.lerp(a.glow, b.glow, k)
      fog.density = THREE.MathUtils.lerp(a.fog, b.fog, k) * LIGHT.fog
      env.uHaze.value = fog.density

      lights.sun.color.copy(env.uSunColor.value)
      lights.hemi.color.copy(env.uSkyTop.value).lerp(tmp.set('#ffffff'), 0.45)
      lights.hemi.groundColor.copy(env.uSkyBottom.value)
      if (LIGHT.shade) lights.hemi.groundColor.lerp(tmp.set(LIGHT.shade), LIGHT.shadeMix)
      tintClouds(env.uSkyTop.value, env.uSkyBottom.value)

      ink.copy(a.ink).lerp(b.ink, k)
      const css = `#${ink.getHexString()}`
      if (css !== lastInk) {
        lastInk = css
        document.documentElement.style.setProperty('--ink', css)
      }
    },
  }
}
