// Material looks: tonal families for the procedural models, picked with
// `?look=<id>` (default below). Each family lists sibling tones of one colour;
// `Kit.add` gives every part a tone from its material's family, so a white
// building reads as many slightly different stones instead of one flat fill.
// The first tone of a family is the material colour itself; the rest are
// stored per vertex as ratios to it, so standalone meshes still get tone 0.
//
// Tones were sampled from the reference painting (marble temple in rose
// clouds): its "white" is ivory in the light, peach and rose-grey on the
// mouldings, mauve in the shade, never neutral grey or pure white.
//
// `roles` keys those tones by architectural role, the way a painter keys the
// whites: lit fields lightest, mouldings a hair warmer, plinths a step darker,
// recesses darkest; close-up gilt brightest, trims a browner old gilt, heavy
// metal between gold and bronze. Parts tagged `{ tone: '<role>' }` in
// `Kit.add` take a tone from these lists regardless of their material, so the
// role, not the hash, decides which stone a capital or a cornice is.

export const LOOKS = {
  // The look before families existed: one tone per material.
  base: {
    marble: ['#f6efe6'],
    marbleShade: ['#ddd0c8'],
    gold: ['#f2c66a'],
    bronze: ['#8a6a4e'],
    rock: ['#ead6c8', '#c2a3a4', '#77607a'],
    lawn: ['#8f9a63', '#b0b67c', '#cdb99a'],
    patina: null,
    roles: {
      marble: { field: ['#f6efe6'], moulding: ['#f6efe6'], plinth: ['#ddd0c8'], recess: ['#ddd0c8'] },
      gold: { gilt: ['#f2c66a'], oldGilt: ['#f2c66a'], bronzeGold: ['#f2c66a'] },
    },
  },
  // Closest to the reference: ivory, peach and rose-grey whites, mauve shade,
  // antique (less saturated) gold, terracotta-rose rock over plum.
  pearl: {
    marble: ['#f5eae1', '#f0e2d7', '#ebdfd8', '#e7ddd5', '#f3e6d6'],
    marbleShade: ['#d9c6bd', '#cdbbb5', '#d5c1b3', '#c8b9b4'],
    gold: ['#dcae62', '#e5bf7a', '#cc9e56'],
    bronze: ['#8a6a5a'],
    rock: ['#efd8ca', '#c08e80', '#6e5866'],
    lawn: ['#959a76', '#adab8a', '#c9b9a0'],
    patina: ['#cdb5ae', 0.35],
    roles: {
      marble: {
        field: ['#f5eae1', '#f3e8de', '#f2e7e0'],
        moulding: ['#f3dfcb', '#f0dbc6', '#f4e1ce'],
        plinth: ['#dccac2', '#d6c4be', '#d9c5bb'],
        recess: ['#c9b1ab', '#c3aca9', '#c8afa6'],
      },
      gold: {
        gilt: ['#e3bb74', '#dfb46c'],
        oldGilt: ['#c9a066', '#c39b63'],
        bronzeGold: ['#b48955', '#ab8250'],
      },
    },
  },
  // Warm travertine: cream and sand whites, honey shade, warmer gold, ochre rock.
  travertine: {
    marble: ['#f5ecdc', '#efe3cd', '#e9ddc8', '#f2e8d9', '#e6ddd0'],
    marbleShade: ['#d8c8ae', '#cdbfa9', '#d3c0a7', '#c5b9a8'],
    gold: ['#e0aa4c', '#e8bb66', '#d09a45'],
    bronze: ['#8a6644'],
    rock: ['#efdcc3', '#c9977b', '#7a5e58'],
    lawn: ['#979a6c', '#b4ad80', '#d2bf98'],
    patina: ['#d2bd99', 0.35],
    roles: {
      marble: {
        field: ['#f5ecdc', '#f2e8d9', '#f0e6d6'],
        moulding: ['#f2e3c8', '#efdfc4', '#f3e6cd'],
        plinth: ['#d9c9b0', '#d2c3ab', '#d6c4a8'],
        recess: ['#c6b296', '#bfad95', '#c3ae92'],
      },
      gold: {
        gilt: ['#e6b65c', '#e2ae52'],
        oldGilt: ['#cc9e58', '#c49755'],
        bronzeGold: ['#b5874c', '#ab7f48'],
      },
    },
  },
  // Cool Carrara: silver whites, blue-grey shade, champagne gold, mauve-slate rock.
  carrara: {
    marble: ['#f4f1ec', '#ecebe8', '#e6e3e0', '#efebe4', '#e1dfde'],
    marbleShade: ['#cfccca', '#c4c3c6', '#d2cbc6', '#bdbcc2'],
    gold: ['#d9bb7c', '#e3c993', '#c9aa6c'],
    bronze: ['#7a6a60'],
    rock: ['#e6dcd6', '#b4a2a6', '#655c6e'],
    lawn: ['#8f9878', '#a9ad90', '#c5c0a8'],
    patina: ['#b7bac3', 0.45],
    roles: {
      marble: {
        field: ['#f4f1ec', '#f1efeb', '#efede9'],
        moulding: ['#f0ebe2', '#ede8df', '#f1ede5'],
        plinth: ['#d3d0cd', '#cccacb', '#d2cdc8'],
        recess: ['#bdbcc2', '#b7b6bd', '#bcb8bb'],
      },
      gold: {
        gilt: ['#e0c68e', '#dabe84'],
        oldGilt: ['#c4aa76', '#bda472'],
        bronzeGold: ['#a99070', '#a0886a'],
      },
    },
  },
  // Sunset: the most saturated of the set, still within the reference's range.
  dusk: {
    marble: ['#f7e7db', '#f2dccd', '#f5e3d1', '#ecd8cf', '#f0e1d7'],
    marbleShade: ['#dcbfb2', '#cfafa6', '#d8b9a6', '#c8aeaa'],
    gold: ['#e6b25a', '#eec274', '#d6a04e'],
    bronze: ['#8e6250'],
    rock: ['#f3d5c1', '#c07a64', '#5e4652'],
    lawn: ['#9e9866', '#bbab7e', '#d5b89a'],
    patina: ['#d6a596', 0.4],
    roles: {
      marble: {
        field: ['#f7e7db', '#f5e4d8', '#f3e2d6'],
        moulding: ['#f5ddc8', '#f2d9c3', '#f6e0cc'],
        plinth: ['#ddc1b4', '#d6b9ad', '#dabca9'],
        recess: ['#c9aaa5', '#c2a3a1', '#c7a69c'],
      },
      gold: {
        gilt: ['#ebbd6c', '#e6b562'],
        oldGilt: ['#cf9d58', '#c79654'],
        bronzeGold: ['#b68350', '#ac7b4b'],
      },
    },
  },
}

const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('look') : null
export const LOOK_ID = param && LOOKS[param] ? param : 'pearl'
export const LOOK = LOOKS[LOOK_ID]

// Light presets, picked with `?light=<id>`. `back` is the original low sun dead
// ahead (every facade toward the viewer in shade). `side` moves the sun to the
// upper left like the reference painting: lit faces ivory, shaded ones a warm
// mauve, so the stone families above actually read.
//   sun     visible sun direction (sky glow, cloud lighting, god rays)
//   shadow  direction the shadow-casting light comes from (higher than the disc)
//   env     scene.environmentIntensity (sky-baked ambient)
//   shade   hemisphere ground colour mixed into the sky bottom by `shadeMix`
//   fog     multiplier on the mood's fog density
export const LIGHTS = {
  back: { sun: [0.0, 0.11, -1], shadow: [0.14, 0.34, -1], env: 0.74, shade: null, shadeMix: 0, fog: 1 },
  side: { sun: [-0.62, 0.3, -0.72], shadow: [-0.6, 0.55, -0.58], env: 0.6, shade: '#a8898e', shadeMix: 0.55, fog: 0.8 },
  // `side` with deeper, warmer shade: closest to the reference's value range.
  painted: { sun: [-0.48, 0.2, -0.85], shadow: [-0.6, 0.55, -0.58], env: 0.44, shade: '#8a6e74', shadeMix: 0.7, fog: 0.75 },
}
const lightParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('light') : null
export const LIGHT_ID = lightParam && LIGHTS[lightParam] ? lightParam : 'painted'
export const LIGHT = LIGHTS[LIGHT_ID]
