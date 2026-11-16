import * as THREE from 'three'
import { createIsland, createDebris } from '../scene/forms.js'

// DRAFT scaffold for the descent below Hero — pure procedural rock forms, no
// external models and no text yet. Each content block is one solid colour so
// the blocks read apart at a glance; islands/debris are scattered across X and
// Y (staggered heights, not a straight corridor) so an overflight reads as
// distinct levels. Columns, stairs and the temple are added later by hand.
//
// item = [x, y, z, size]. First item of each block is its central object (the
// camera's focus target — see `focus` below).
const BLOCKS = [
  {
    id: 'services', // «Что делаю»
    color: '#7ba3c4',
    kind: 'island',
    items: [[0, 33, -150, 15], [20, 28, -126, 12], [-19, 41, -138, 11], [16, 24, -168, 12], [-17, 36, -180, 11]],
  },
  {
    id: 'stack', // «Стек»
    color: '#c99a6b',
    kind: 'debris',
    items: [[0, 26, -216, 11], [-14, 20, -198, 7], [13, 32, -208, 8], [-9, 15, -228, 6], [15, 29, -236, 7]],
  },
  {
    id: 'cases', // «Кейсы»
    color: '#8fbf87',
    kind: 'island',
    items: [[0, 16, -268, 17], [-22, 10, -250, 13], [22, 22, -262, 13], [-20, 8, -284, 12], [21, 18, -292, 12]],
  },
  {
    id: 'process', // «Как идёт работа»
    color: '#b48fc4',
    kind: 'island',
    items: [[0, 8, -315, 13], [-16, 4, -304, 9], [15, 12, -322, 9]],
  },
]

export default {
  id: 'scaffold',

  waypoints: [
    { pos: [-4, 49, -74], look: [0, 45, -112] },
    { pos: [-8, 40, -116], look: [0, 34, -150] },
    { pos: [6, 26, -180], look: [0, 20, -220] },
    { pos: [-4, 18, -240], look: [0, 13, -285] },
    { pos: [0, 13, -300], look: [0, 9, -338] },
    { pos: [0, 11, -324], look: [0, 8, -352] },
  ],

  panels: [],

  build({ scene }) {
    const group = new THREE.Group()
    group.name = 'scaffold-draft'

    for (const b of BLOCKS) {
      for (const [x, y, z, s] of b.items) {
        const obj = b.kind === 'island' ? createIsland(s, b.color) : createDebris(s, b.color)
        obj.position.set(x, y, z)
        obj.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3)
        group.add(obj)
      }
    }

    scene.add(group)
  },
}
