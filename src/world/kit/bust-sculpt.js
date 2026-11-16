// A heroic portrait bust, sculpted in code: the form is a signed distance
// field (smooth unions of ellipsoids and capsules for skull, a chiselled face,
// hair, neck and shoulders), turned into a mesh with surface nets. Organic
// shapes cannot be assembled from boxes and lathes the way the architecture is.
//
// Units: one head (chin y = 0, crown y ≈ 1), face toward +z. No three.js here:
// this module also runs inside a worker.

// --- distance field ----------------------------------------------------------------

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
const smax = (a, b, k) => -smin(-a, -b, k)
// Math.hypot is several times slower than this in V8, and the field is
// evaluated a few hundred thousand times.
const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z)

// Ellipsoid, first-order corrected distance (exact enough near the surface).
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = x - cx
  const py = y - cy
  const pz = z - cz
  const k0 = len(px / rx, py / ry, pz / rz)
  const k1 = len(px / (rx * rx), py / (ry * ry), pz / (rz * rz))
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz)
}

function cap(x, y, z, ax, ay, az, bx, by, bz, r) {
  const bax = bx - ax
  const bay = by - ay
  const baz = bz - az
  const pax = x - ax
  const pay = y - ay
  const paz = z - az
  const h = Math.min(Math.max((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0), 1)
  return len(pax - bax * h, pay - bay * h, paz - baz * h) - r
}

const sstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

function bustField(x, y, z) {
  // The face is symmetric; paired features are evaluated on the mirrored side.
  const ax = Math.abs(x)

  // Skull and the long plane of the face.
  let d = ell(x, y, z, 0, 0.6, -0.06, 0.37, 0.41, 0.46)
  d = smin(d, ell(x, y, z, 0, 0.34, 0.1, 0.275, 0.4, 0.3), 0.1)

  // The jaw is the portrait: one rounded block, wide at the angles under the
  // ears and still broad at the chin, its lower edge rising toward the back.
  // A block (not a chain of blobs) is what gives flat planes and a hard line.
  const fwd = sstep(-0.05, 0.3, z)
  const jx = ax - (0.23 - 0.12 * fwd)
  const jy = Math.abs(y - 0.12 - 0.09 * (1 - fwd)) - 0.095
  const jz = Math.abs(z - 0.115) - 0.155
  const jaw = len(Math.max(jx, 0), Math.max(jy, 0), Math.max(jz, 0)) + Math.min(Math.max(jx, jy, jz), 0) - 0.055
  d = smin(d, jaw, 0.07)
  d = smin(d, ell(x, y, z, 0, 0.035, 0.305, 0.115, 0.07, 0.07), 0.04)

  // High cheekbones over hollow cheeks.
  d = smin(d, ell(ax, y, z, 0.215, 0.405, 0.2, 0.085, 0.05, 0.11), 0.05)
  d = smax(d, -(len(ax - 0.215, y - 0.25, z - 0.33) - 0.085), 0.09)

  // Heavy straight brow, deep sockets, narrowed eyes.
  d = smin(d, cap(ax, y, z, 0.03, 0.545, 0.385, 0.235, 0.54, 0.3, 0.052), 0.04)
  d = smax(d, -(len(ax - 0.135, y - 0.465, z - 0.415) - 0.084), 0.045)
  d = smin(d, ell(ax, y, z, 0.135, 0.462, 0.332, 0.07, 0.03, 0.046), 0.02)

  // Straight strong nose.
  d = smin(d, cap(x, y, z, 0, 0.54, 0.39, 0, 0.35, 0.478, 0.042), 0.03)
  d = smin(d, len(x, y - 0.33, z - 0.478) - 0.056, 0.03)
  d = smin(d, len(ax - 0.05, y - 0.315, z - 0.435) - 0.04, 0.03)

  // Thin, level mouth; ears.
  d = smin(d, ell(x, y, z, 0, 0.205, 0.374, 0.1, 0.016, 0.032), 0.02)
  d = smin(d, ell(x, y, z, 0, 0.172, 0.368, 0.085, 0.02, 0.032), 0.02)
  d = smin(d, ell(ax, y, z, 0.372, 0.44, -0.04, 0.045, 0.11, 0.07), 0.03)

  // Short cropped beard: the lower face raised by a thin, finely stippled
  // layer that follows the jaw, bounded by a clean line from the sideburn to
  // the corner of the mouth. Thin on purpose: it must not hide the jawline.
  const stipple = Math.sin(x * 83 + y * 29) * Math.sin(y * 79 + z * 37) * Math.sin(z * 71 + x * 23)
  let beard = smax(d - 0.008 - 0.0022 * stipple, y - (0.235 + ax * 0.5), 0.02)
  beard = Math.max(smax(beard, -0.06 - y, 0.02), -0.03 - z)
  d = smin(d, beard, 0.008)

  // Hair: close on the sides, a combed-back volume rising over the forehead.
  // Strands run front to back on top and sweep back along the sides.
  let hair = ell(x, y, z, 0, 0.665, -0.07, 0.395, 0.435, 0.5)
  hair = smin(hair, ell(x, y, z, 0, 0.93, 0.1, 0.27, 0.13, 0.27), 0.09)
  const top = sstep(0.6, 0.85, y)
  const wave = Math.sin(z * 7) * 1.6
  hair -= 0.012 * (top * Math.sin(x * 40 + wave) + (1 - top) * Math.sin((y - z * 0.35) * 40 + wave))
  hair = smax(hair, z - (0.31 + (y - 0.64) * 1.25), 0.04)
  hair = smax(hair, 0.16 - y, 0.05)
  d = smin(d, hair, 0.02)

  // A neck as wide as the jaw, heavy trapezius, broad shoulders, a bare
  // athletic chest with collarbones.
  d = smin(d, cap(x, y, z, 0, 0.13, -0.06, 0, -0.3, -0.1, 0.235), 0.07)
  let torso = ell(x, y, z, 0, -0.64, -0.1, 0.84, 0.36, 0.34)
  torso = smin(torso, cap(ax, y, z, 0.05, -0.1, -0.16, 0.56, -0.36, -0.13, 0.155), 0.12)
  torso = smin(torso, len(ax - 0.66, y + 0.5, z + 0.08) - 0.2, 0.1)
  torso = smin(torso, ell(ax, y, z, 0.25, -0.67, 0.14, 0.25, 0.17, 0.13), 0.05)
  torso = smin(torso, cap(ax, y, z, 0.07, -0.415, 0.15, 0.5, -0.37, 0.02, 0.03), 0.05)
  // The classical termination: shoulders and chest cut by one rounded form.
  torso = smax(torso, ell(x, y, z, 0, -0.32, -0.05, 0.9, 0.68, 0.5), 0.03)
  return smin(d, torso, 0.13)
}

// --- surface nets ---------------------------------------------------------------------

const MIN = [-0.98, -1.06, -0.64]
const MAX = [0.98, 1.16, 0.62]
// The field is sampled in blocks: a block whose centre is farther from the
// surface than its own reach cannot contain it and is filled with one value.
const BLOCK = 4
// Extra reach for the displaced parts (curls, folds), which bend the metric.
const SLACK = 0.045

function sample(CELL) {
  const n = [0, 1, 2].map((a) => Math.ceil((MAX[a] - MIN[a]) / CELL / BLOCK) * BLOCK + 1)
  const [nx, ny, nz] = n
  const field = new Float32Array(nx * ny * nz)
  const reach = (BLOCK * CELL * Math.sqrt(3)) / 2 + SLACK
  for (let bz = 0; bz < nz - 1; bz += BLOCK) {
    for (let by = 0; by < ny - 1; by += BLOCK) {
      for (let bx = 0; bx < nx - 1; bx += BLOCK) {
        const h = BLOCK / 2
        const c = bustField(MIN[0] + (bx + h) * CELL, MIN[1] + (by + h) * CELL, MIN[2] + (bz + h) * CELL)
        const far = Math.abs(c) > reach
        for (let k = bz; k <= bz + BLOCK; k++) {
          for (let j = by; j <= by + BLOCK; j++) {
            for (let i = bx; i <= bx + BLOCK; i++) {
              const idx = (k * ny + j) * nx + i
              // Shared faces between blocks: a real sample always wins.
              if (far) {
                if (field[idx] === 0) field[idx] = c
              } else field[idx] = bustField(MIN[0] + i * CELL, MIN[1] + j * CELL, MIN[2] + k * CELL)
            }
          }
        }
      }
    }
  }
  return { field, nx, ny, nz }
}

// Returns plain typed arrays so the work can run in a worker.
export function sculptBust(CELL = 0.02) {
  const { field, nx, ny, nz } = sample(CELL)
  const at = (i, j, k) => field[(k * ny + j) * nx + i]
  const cells = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1)
  const cellAt = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i
  const pos = []
  const corner = new Float32Array(8)
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]

  // One vertex per cell the surface passes through, at the mean of the
  // crossings on the cell's edges.
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0
        for (let c = 0; c < 8; c++) {
          const v = at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))
          corner[c] = v
          if (v < 0) mask |= 1 << c
        }
        if (mask === 0 || mask === 255) continue
        let sx = 0
        let sy = 0
        let sz = 0
        let count = 0
        for (const [a, b] of EDGES) {
          if (corner[a] < 0 === corner[b] < 0) continue
          const t = corner[a] / (corner[a] - corner[b])
          sx += (a & 1) + ((b & 1) - (a & 1)) * t
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t
          count++
        }
        cells[cellAt(i, j, k)] = pos.length / 3
        pos.push(MIN[0] + (i + sx / count) * CELL, MIN[1] + (j + sy / count) * CELL, MIN[2] + (k + sz / count) * CELL)
      }
    }
  }

  // One quad per grid edge that crosses the surface, joining the four cells
  // around that edge.
  const index = []
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return
    if (flip) index.push(a, c, b, a, d, c)
    else index.push(a, b, c, a, c, d)
  }
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v = at(i, j, k) < 0
        if (v !== at(i + 1, j, k) < 0) {
          quad(cells[cellAt(i, j - 1, k - 1)], cells[cellAt(i, j, k - 1)], cells[cellAt(i, j, k)], cells[cellAt(i, j - 1, k)], !v)
        }
        if (v !== at(i, j + 1, k) < 0) {
          quad(cells[cellAt(i - 1, j, k - 1)], cells[cellAt(i - 1, j, k)], cells[cellAt(i, j, k)], cells[cellAt(i, j, k - 1)], !v)
        }
        if (v !== at(i, j, k + 1) < 0) {
          quad(cells[cellAt(i - 1, j - 1, k)], cells[cellAt(i, j - 1, k)], cells[cellAt(i, j, k)], cells[cellAt(i - 1, j, k)], !v)
        }
      }
    }
  }

  // Normals straight from the field's gradient: crisper than averaging faces.
  const normal = new Float32Array(pos.length)
  const e = CELL * 0.6
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]
    const y = pos[i + 1]
    const z = pos[i + 2]
    const gx = bustField(x + e, y, z) - bustField(x - e, y, z)
    const gy = bustField(x, y + e, z) - bustField(x, y - e, z)
    const gz = bustField(x, y, z + e) - bustField(x, y, z - e)
    const l = len(gx, gy, gz) || 1
    normal[i] = gx / l
    normal[i + 1] = gy / l
    normal[i + 2] = gz / l
  }

  return { position: new Float32Array(pos), normal, index: new Uint32Array(index) }
}
