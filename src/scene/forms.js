import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Procedural low-poly rock forms — no external models. A base polyhedron is
// roughed up by pushing every vertex along its normal by a random amount, so
// the smooth solid becomes a chipped, irregular stone.

// Displace each vertex along its normal. The geometry is welded first
// (Icosahedron/Dodecahedron are non-indexed — their per-face vertex copies
// would tear apart under independent random offsets and leave cracks); after
// welding, shared vertices move together and the surface stays closed.
function rough(geo, amount) {
  geo = mergeVertices(geo)
  geo.computeVertexNormals()
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    const d = (Math.random() - 0.5) * amount
    pos.setXYZ(
      i,
      pos.getX(i) + nor.getX(i) * d,
      pos.getY(i) + nor.getY(i) * d,
      pos.getZ(i) + nor.getZ(i) * d,
    )
  }
  pos.needsUpdate = true
  // Bake the faceted look into the geometry (non-indexed → each vertex carries
  // its face normal) instead of material.flatShading, which computes face
  // normals from screen-space derivatives — cheaper, and it renders under
  // software GL (the flatShading derivative path hangs swiftshader).
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  return geo
}

// Irregular chunk of rock — an icosahedron (detail 1) chipped along its normals.
export function createDebris(size, color = '#8b8f96') {
  const geo = rough(new THREE.IcosahedronGeometry(size, 1), 0.3 * size)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
  )
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// Floating island — a wide, vertically squashed rock body (reuses createDebris)
// with a chipped dodecahedron "soil cap" sitting on top and overlapping its
// crown. `color` tints the whole group one tone (per-block colour coding); the
// cap is nudged lighter so the two forms stay legible.
export function createIsland(size, color = '#7fa060') {
  const group = new THREE.Group()

  const rock = createDebris(size * 1.15, new THREE.Color(color).multiplyScalar(0.72).getStyle())
  rock.scale.y = 0.5 // flatten into a slab of rock
  group.add(rock)

  const capGeo = rough(new THREE.DodecahedronGeometry(size * 0.82, 0), 0.22 * size)
  const cap = new THREE.Mesh(
    capGeo,
    new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  )
  cap.scale.y = 0.6
  cap.position.y = size * 0.36 // overlaps the rock's top
  cap.castShadow = true
  cap.receiveShadow = true
  group.add(cap)

  return group
}
