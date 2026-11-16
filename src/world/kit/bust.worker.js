import { sculptBust } from './bust-sculpt.js'

// Sculpting takes a few hundred milliseconds: far too long for the main
// thread while the visitor is scrolling.
self.onmessage = (e) => {
  const mesh = sculptBust(e.data.cell)
  self.postMessage(mesh, [mesh.position.buffer, mesh.normal.buffer, mesh.index.buffer])
}
