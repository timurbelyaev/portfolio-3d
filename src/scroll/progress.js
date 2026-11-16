import Lenis from 'lenis'

// Lenis owns smooth scroll; we expose a normalized 0..1 page progress that
// drives the camera along the curve. Native smooth-scroll stays off (styles.css)
// so easing isn't applied twice.
export function createScroll() {
  const lenis = new Lenis({
    lerp: 0.09,
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.2,
  })

  const state = { progress: 0 }
  lenis.on('scroll', ({ scroll, limit }) => {
    state.progress = limit > 0 ? scroll / limit : 0
  })

  return {
    lenis,
    raf(time) {
      lenis.raf(time)
    },
    get progress() {
      return state.progress
    },
  }
}
