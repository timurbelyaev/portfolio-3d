import * as THREE from 'three'
import { Kit, ball, rot } from './geo.js'
import { gridGeo } from './terrain.js'
import { palmette } from './classical.js'

// The opening shot: a dark gallery wall with one gilded frame. The "painting"
// is not a picture — it is a hole in the wall, and the real world is behind
// it. Scrolling flies the camera through the frame.

const T = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z)

// Moulding cross-section: [outward from the opening edge, toward the viewer].
const PROFILE = [[-0.06, -0.4], [0, 0.26], [0.13, 0.5], [0.33, 0.42], [0.44, 0.64], [0.62, 0.8], [0.98, 0.88], [1.16, 0.68], [1.3, 0.72], [1.47, 0.5], [1.53, -0.02]]
export const MOULDING = 1.53

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]]

// Opening size by screen shape. The headline is the hero, so the painting is
// kept to about a third of a wide screen and a third of a phone's height.
function opening(aspect) {
  if (aspect > 1.25) return [13.4, 9.6]
  if (aspect > 0.8) return [10.4, 8.4]
  return [6.8, 8.4]
}

const wallMaterial = new THREE.ShaderMaterial({
  fog: false,
  uniforms: { uCentre: { value: new THREE.Vector2() }, uHalf: { value: new THREE.Vector2(8.5, 5) } },
  vertexShader: /* glsl */ `
    varying vec2 vP;
    uniform vec2 uCentre;
    void main() {
      vP = position.xy - uCentre;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vP;
    uniform vec2 uHalf;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    void main() {
      // Pool of warm light from a picture lamp above the frame.
      vec2 q = (vP - vec2(0.0, 1.5)) / (uHalf + vec2(7.0, 6.0));
      float pool = exp(-dot(q, q) * 1.6);
      // Soft shadow the frame casts on the wall, strongest underneath.
      vec2 d = max(abs(vP + vec2(0.0, 0.5)) - uHalf - vec2(1.5), 0.0);
      float contact = 1.0 - 0.55 * exp(-length(d) * 1.4);
      float grain = noise(vP * 2.3) * 0.5 + noise(vP * 9.0) * 0.3 + noise(vP * 37.0) * 0.2;
      vec3 wall = vec3(0.118, 0.082, 0.112) * (0.5 + 1.25 * pool) + vec3(0.2, 0.11, 0.07) * pool * 0.5;
      wall *= contact * (0.86 + 0.28 * grain);
      // Authored in display space; the output pass re-encodes, so go linear.
      gl_FragColor = vec4(pow(wall, vec3(2.2)), 1.0);
    }
  `,
})

export function createGallery(scene, { z = 100, centre = [0, 74.6] } = {}) {
  const root = new THREE.Group()
  root.name = 'gallery'
  scene.add(root)
  let size = [0, 0]

  function build(aspect) {
    const [W, H] = opening(aspect)
    if (W === size[0]) return
    size = [W, H]
    for (const child of [...root.children]) {
      root.remove(child)
      child.traverse((o) => o.geometry && o.geometry.dispose())
    }

    const shape = new THREE.Shape()
    shape.moveTo(-320, -260)
    shape.lineTo(320, -260)
    shape.lineTo(320, 260)
    shape.lineTo(-320, 260)
    shape.closePath()
    const hole = new THREE.Path()
    hole.moveTo(-W / 2, -H / 2)
    hole.lineTo(-W / 2, H / 2)
    hole.lineTo(W / 2, H / 2)
    hole.lineTo(W / 2, -H / 2)
    hole.closePath()
    shape.holes.push(hole)
    const wall = new THREE.Mesh(new THREE.ShapeGeometry(shape).translate(centre[0], centre[1], z), wallMaterial)
    wallMaterial.uniforms.uCentre.value.set(centre[0], centre[1])
    wallMaterial.uniforms.uHalf.value.set(W / 2, H / 2)
    root.add(wall)

    const kit = new Kit()
    const B = T(centre[0], centre[1], z)
    // Mitred moulding swept around the opening.
    const sweep = (profile) => gridGeo(profile.length, 4, (i, j) => {
      const [o, d] = profile[i]
      return [CORNERS[j][0] * (W / 2 + o), CORNERS[j][1] * (H / 2 + o), d]
    }, { wrap: true })
    // The inner lip faces the sun behind the wall; gilded, it would mirror it
    // as a white-hot bar. A matte liner takes that light instead.
    kit.add('liner', sweep(PROFILE.slice(0, 2)), null, B)
    kit.add('goldFrame', sweep(PROFILE.slice(1)), null, B)
    // Bead course along the inner edge.
    const bead = (x, y) => kit.add('goldFrame', ball(0.085, 0), T(x, y, 0.52), B, { smooth: true })
    const nx = Math.round((W + 0.4) / 0.4)
    const ny = Math.round((H + 0.4) / 0.4)
    for (let i = 0; i <= nx; i++) for (const s of [-1, 1]) bead(-W / 2 - 0.2 + (i * (W + 0.4)) / nx, s * (H / 2 + 0.2))
    for (let i = 1; i < ny; i++) for (const s of [-1, 1]) bead(s * (W / 2 + 0.2), -H / 2 - 0.2 + (i * (H + 0.4)) / ny)
    // Corner bosses with leaves, and a crest on the top rail.
    for (const [cx, cy] of CORNERS) {
      const C = B.clone().multiply(T(cx * (W / 2 + 0.78), cy * (H / 2 + 0.78), 0.9))
      kit.add('goldFrame', ball(0.3, 2), null, C, { smooth: true })
      palmette(kit, C.clone().multiply(rot(0, 0, Math.atan2(-cx, cy))).multiply(T(0, 0.15, 0)), 0.85, 'goldFrame')
    }
    palmette(kit, B.clone().multiply(T(0, H / 2 + 1.25, 0.7)), 0.95, 'goldFrame')
    const frame = kit.build('frame', { shadows: false })
    frame.traverse((o) => (o.frustumCulled = false))
    root.add(frame)
  }

  build(window.innerWidth / window.innerHeight)

  return {
    root,
    // Outer corners of the frame (lower-left, upper-right), to lay out the
    // hero copy around it. The crest above the top rail is left out.
    get corners() {
      const m = MOULDING + 0.35
      return [
        new THREE.Vector3(centre[0] - size[0] / 2 - m, centre[1] - size[1] / 2 - m, z),
        new THREE.Vector3(centre[0] + size[0] / 2 + m, centre[1] + size[1] / 2 + m, z),
      ]
    },
    resize(aspect) {
      build(aspect)
    },
    update(f) {
      root.visible = f < 2.2
    },
  }
}
