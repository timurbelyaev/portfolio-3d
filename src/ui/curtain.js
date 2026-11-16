// Cloud curtain (markup and styles live in index.html so the loader paints
// before the bundle). Two banks of cumulus close from the sides, the view is
// swapped while nothing shows, and they part again. Used once as the loader
// and then for every navigation jump instead of a long scripted scroll.

const CLOSE_MS = 1100
const OPEN_MS = 1500

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

export function createCurtain(root = document.getElementById('curtain')) {
  const title = root.querySelector('.curtain__title')
  const load = window.__curtainLoad
  let busy = false

  const setOpen = (open) => {
    root.classList.toggle('is-closed', !open)
    document.documentElement.classList.toggle('is-curtained', !open)
  }

  return {
    get busy() {
      return busy
    },

    progress(v) {
      load?.progress(v)
    },

    // Loader exit: let the gold fill the monogram, hold a beat, part the clouds.
    async reveal() {
      if (!root.classList.contains('is-loading')) return
      if (load) {
        load.finish()
        while (!load.full) await nextFrame()
      }
      await wait(380)
      root.classList.remove('is-titled')
      await wait(260)
      document.documentElement.classList.remove('is-booting')
      root.style.background = 'transparent'
      setOpen(true)
      await wait(OPEN_MS)
      root.classList.remove('is-loading')
      root.style.background = ''
    },

    // Close, run the swap (which may wait a few frames), open. Calls made
    // while a transition runs are dropped.
    async travel(label, swap) {
      if (busy || root.classList.contains('is-loading')) return
      busy = true
      title.textContent = label || ''
      root.classList.add('is-travel')
      root.classList.toggle('is-titled', Boolean(label))
      setOpen(false)
      await wait(CLOSE_MS)
      // Keep the chapter name up long enough to be read.
      await Promise.all([swap(), wait(label ? 450 : 0)])
      root.classList.remove('is-titled')
      setOpen(true)
      await wait(OPEN_MS)
      root.classList.remove('is-travel')
      busy = false
    },
  }
}
