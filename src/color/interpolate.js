import * as THREE from 'three'

const c = (hex) => new THREE.Color(hex)

// Global color keyframes over scroll progress (0..1). One continuous drama:
// rose-peach dawn → lightening neutral-blue → warm golden temple.
export const PALETTE = [
  {
    t: 0.0,
    skyTop: c('#eaa6bf'), skyBottom: c('#f7cdb0'), fog: c('#f0b9c2'),
    sun: c('#ffd68a'), sunI: 2.4, hemiSky: c('#ffd0dc'), hemiGround: c('#e6b48f'), hemiI: 0.9,
  },
  {
    t: 0.5,
    skyTop: c('#a9c7e8'), skyBottom: c('#e7d9c9'), fog: c('#cdd8e2'),
    sun: c('#fff0cf'), sunI: 2.7, hemiSky: c('#cfe0f2'), hemiGround: c('#d9c3a3'), hemiI: 1.0,
  },
  {
    t: 1.0,
    skyTop: c('#dcb87f'), skyBottom: c('#ecd7a8'), fog: c('#e2c79a'),
    sun: c('#ffcf78'), sunI: 2.2, hemiSky: c('#f0dcb0'), hemiGround: c('#c8a76e'), hemiI: 0.95,
  },
]

export class ColorTrack {
  constructor(keys = PALETTE) {
    this.keys = keys
    this._skyTop = new THREE.Color()
    this._skyBottom = new THREE.Color()
    this._fog = new THREE.Color()
    this._sun = new THREE.Color()
    this._hemiSky = new THREE.Color()
    this._hemiGround = new THREE.Color()
  }

  update(t, { sky, lights, fog }) {
    const keys = this.keys
    const tt = THREE.MathUtils.clamp(t, 0, 1)

    // Find the surrounding keyframe pair.
    let a = keys[0]
    let b = keys[keys.length - 1]
    for (let i = 0; i < keys.length - 1; i++) {
      if (tt >= keys[i].t && tt <= keys[i + 1].t) {
        a = keys[i]
        b = keys[i + 1]
        break
      }
    }
    const span = b.t - a.t || 1
    const k = (tt - a.t) / span

    this._skyTop.copy(a.skyTop).lerp(b.skyTop, k)
    this._skyBottom.copy(a.skyBottom).lerp(b.skyBottom, k)
    this._fog.copy(a.fog).lerp(b.fog, k)
    this._sun.copy(a.sun).lerp(b.sun, k)
    this._hemiSky.copy(a.hemiSky).lerp(b.hemiSky, k)
    this._hemiGround.copy(a.hemiGround).lerp(b.hemiGround, k)

    sky.setColors(this._skyTop, this._skyBottom)
    if (fog) fog.color.copy(this._fog)

    lights.sun.color.copy(this._sun)
    lights.sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, k)
    lights.hemi.color.copy(this._hemiSky)
    lights.hemi.groundColor.copy(this._hemiGround)
    lights.hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, k)
  }
}
