// Ported from the game Eldfall Table (client/src/scene/materials.ts). Kept close to the original so that changes there can be
// carried over; WarBracket differences are marked `WarBracket`.
import * as THREE from 'three';

// Surfaces. Every material here is made from a height field worked out in the browser: its colours, its normal
// map (the small relief that catches the light) and its roughness all come from the same heights, so stone looks
// cut, wood has grain and bark has ridges without a single picture being loaded.

export type Surface = 'ashlar' | 'rock' | 'planks' | 'bark' | 'plaster' | 'ground' | 'leaves' | 'flutes';

const N = 512;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise that repeats every `cells` cells across the texture (so the texture tiles). u, v in 0..1. */
function noise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const w = (i: number) => ((i % cells) + cells) % cells;
  const a = hash(w(x0), w(y0), seed);
  const b = hash(w(x0 + 1), w(y0), seed);
  const c = hash(w(x0), w(y0 + 1), seed);
  const d = hash(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Several layers of noise, each finer and fainter. 0..1. */
function fbm(u: number, v: number, cells: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(u, v, cells << o, seed + o * 17) * amp;
    total += amp;
    amp *= 0.5;
  }
  return sum / total;
}

interface Texel {
  /** Height 0..1 (relief), colour 0..1 and roughness 0..1. */
  h: number;
  r: number;
  g: number;
  b: number;
  rough: number;
}

const mixc = (a: number[], b: number[], k: number): number[] => [a[0]! + (b[0]! - a[0]!) * k, a[1]! + (b[1]! - a[1]!) * k, a[2]! + (b[2]! - a[2]!) * k];
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const step = (x: number, from: number, to: number): number => clamp01((x - from) / (to - from));

const MOSS = [0.22, 0.36, 0.12];
const MOSS_LIGHT = [0.42, 0.55, 0.18];

const RECIPES: Record<Surface, { relief: number; at: (u: number, v: number) => Texel }> = {
  // Cut limestone blocks in courses: joints, worn edges, pits, moss in the joints and in patches.
  ashlar: {
    relief: 5,
    at: (u, v) => {
      const rows = 8;
      const row = Math.floor(v * rows);
      const perRow = 4;
      const shift = (row % 2) * 0.5 + hash(row, 0, 3) * 0.2;
      const bx = (u * perRow + shift) % perRow;
      const col = Math.floor(bx);
      const fx = bx - col;
      const fy = v * rows - row;
      const edge = Math.min(fx * (rows / perRow), (1 - fx) * (rows / perRow), fy, 1 - fy); // distance to the joint, in rows
      const joint = step(edge, 0.0, 0.07);
      const tint = 0.86 + hash(col, row, 5) * 0.2;
      const grain = fbm(u, v, 8, 5, 11);
      const pits = step(fbm(u, v, 48, 2, 23), 0.62, 0.8);
      const h = joint * (0.72 + grain * 0.28 + hash(col, row, 9) * 0.1) - pits * 0.12;
      const mossy = clamp01(step(fbm(u, v, 5, 4, 31), 0.52, 0.72) * 0.9 + (1 - joint) * 0.75);
      const stone = [0.83 * tint, 0.78 * tint, 0.66 * tint].map((c) => c * (0.78 + grain * 0.34) * (0.55 + joint * 0.45));
      const c = mixc(stone, mixc(MOSS, MOSS_LIGHT, fbm(u, v, 24, 2, 41)), mossy * 0.85);
      return { h, r: c[0]!, g: c[1]!, b: c[2]!, rough: 0.82 + mossy * 0.15 };
    },
  },
  // Weathered natural rock: ridges, cracks, lichen and moss.
  rock: {
    relief: 6,
    at: (u, v) => {
      const big = fbm(u, v, 4, 5, 51);
      const ridged = 1 - Math.abs(fbm(u, v, 6, 4, 61) * 2 - 1);
      // A few hairline cracks, only in places.
      const cracks = 1 - (1 - step(Math.abs(fbm(u, v, 7, 3, 71) - 0.5), 0.0, 0.01)) * step(fbm(u, v, 3, 2, 77), 0.5, 0.65);
      const h = (big * 0.6 + ridged * 0.4) * (0.8 + cracks * 0.2);
      const mossy = step(fbm(u, v, 5, 4, 81), 0.5, 0.68);
      const base = mixc([0.36, 0.36, 0.34], [0.62, 0.6, 0.54], big * 0.6 + ridged * 0.4).map((c) => c * (0.75 + cracks * 0.25));
      const c = mixc(base, mixc(MOSS, MOSS_LIGHT, fbm(u, v, 30, 2, 91)), mossy * 0.9);
      return { h, r: c[0]!, g: c[1]!, b: c[2]!, rough: 0.9 };
    },
  },
  // Sawn boards side by side: grain along the board, knots, gaps.
  planks: {
    relief: 3.5,
    at: (u, v) => {
      const boards = 6;
      const bi = Math.floor(u * boards);
      const fu = u * boards - bi;
      const gap = step(Math.min(fu, 1 - fu), 0, 0.045);
      const grain = fbm(u * 6 + hash(bi, 0, 7), v * 0.35 + hash(bi, 1, 7), 24, 4, 101 + bi);
      const rings = 0.5 + 0.5 * Math.sin((grain * 9 + fu * 2) * Math.PI * 2);
      const h = gap * (0.7 + rings * 0.18 + grain * 0.12);
      const tint = 0.8 + hash(bi, 2, 7) * 0.35;
      const c = mixc([0.3, 0.2, 0.12], [0.5, 0.36, 0.22], rings * 0.6 + grain * 0.4).map((x) => x * tint * (0.35 + gap * 0.65));
      return { h, r: c[0]!, g: c[1]!, b: c[2]!, rough: 0.72 + (1 - rings) * 0.15 };
    },
  },
  // Old bark: deep furrows running up the trunk, moss on one side.
  bark: {
    relief: 8,
    at: (u, v) => {
      const furrow = 1 - Math.abs(fbm(u, v * 0.22, 14, 4, 121) * 2 - 1);
      const fine = fbm(u, v, 40, 2, 131);
      const h = Math.pow(furrow, 1.6) * 0.85 + fine * 0.15;
      const mossy = step(fbm(u, v, 4, 3, 141), 0.55, 0.7) * step(h, 0.3, 0.7);
      const c = mixc(mixc([0.13, 0.09, 0.06], [0.42, 0.31, 0.21], h), MOSS, mossy * 0.8);
      return { h, r: c[0]!, g: c[1]!, b: c[2]!, rough: 0.95 };
    },
  },
  // Lime plaster on a wall: trowel marks, stains running down, a few cracks.
  plaster: {
    relief: 1.6,
    at: (u, v) => {
      const trowel = fbm(u, v, 7, 5, 151);
      const stain = fbm(u, v * 0.3, 9, 3, 161);
      const crack = 1 - (1 - step(Math.abs(fbm(u, v, 5, 4, 171) - 0.5), 0, 0.006)) * step(fbm(u, v, 3, 2, 177), 0.56, 0.7);
      const h = trowel * 0.7 + crack * 0.3;
      const c = [0.86, 0.8, 0.68].map((x) => x * (0.72 + trowel * 0.3) * (0.82 + stain * 0.22) * (0.75 + crack * 0.25));
      return { h, r: c[0]!, g: c[1]!, b: c[2]!, rough: 0.9 };
    },
  },
  // The battlefield itself: trodden earth, short grass and moss, small stones.
  ground: {
    relief: 4,
    at: (u, v) => {
      const patch = fbm(u, v, 3, 5, 181);
      const fine = fbm(u, v, 28, 3, 191);
      const blades = fbm(u, v, 90, 2, 201);
      const pebble = step(fbm(u, v, 36, 2, 211), 0.7, 0.76);
      const grassy = step(patch + fine * 0.25, 0.48, 0.62);
      const earth = mixc([0.24, 0.17, 0.1], [0.43, 0.33, 0.21], fine);
      const grass = mixc([0.11, 0.19, 0.06], [0.27, 0.36, 0.13], blades * 0.7 + patch * 0.3);
      let c = mixc(earth, grass, grassy);
      c = mixc(c, [0.55, 0.53, 0.48], pebble * (1 - grassy) * 0.9);
      const h = fine * 0.45 + blades * 0.3 * grassy + pebble * 0.5 * (1 - grassy) + patch * 0.2;
      return { h, r: c[0]!, g: c[1]!, b: c[2]!, rough: 0.95 - pebble * 0.2 };
    },
  },
  // A mass of foliage: clumps of leaves, lighter where the sun reaches.
  leaves: {
    relief: 7,
    at: (u, v) => {
      const clump = fbm(u, v, 10, 3, 221);
      const leaf = 1 - Math.abs(fbm(u, v, 34, 2, 231) * 2 - 1);
      const h = clump * 0.55 + leaf * 0.45;
      const c = mixc([0.05, 0.16, 0.05], [0.42, 0.62, 0.2], Math.pow(h, 1.4)).map((x) => x * (0.85 + fbm(u, v, 3, 2, 241) * 0.3));
      return { h, r: c[0]!, g: c[1]!, b: c[2]!, rough: 0.85 };
    },
  },
  // A column shaft: flutes running up it, worn and stained like the blocks.
  flutes: {
    relief: 6,
    at: (u, v) => {
      const flute = Math.abs(Math.sin(u * Math.PI * 16));
      const worn = fbm(u, v, 9, 4, 251);
      const drum = step(Math.abs(((v * 5) % 1) - 0.5), 0.47, 0.5); // joints between the drums
      const h = Math.pow(flute, 0.6) * 0.75 * (1 - drum * 0.6) + worn * 0.25;
      const mossy = step(fbm(u, v, 4, 4, 261) - v * 0.25, 0.42, 0.6);
      const stone = [0.84, 0.79, 0.67].map((x) => x * (0.62 + Math.pow(flute, 0.6) * 0.3 + worn * 0.16) * (1 - drum * 0.35));
      const c = mixc(stone, mixc(MOSS, MOSS_LIGHT, worn), mossy * 0.8);
      return { h, r: c[0]!, g: c[1]!, b: c[2]!, rough: 0.85 };
    },
  },
};

interface Maps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}
const made = new Map<Surface, Maps>();

function build(kind: Surface): Maps {
  const recipe = RECIPES[kind];
  const height = new Float32Array(N * N);
  const colour = new Uint8ClampedArray(N * N * 4);
  const rough = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = recipe.at(x / N, y / N);
      const i = y * N + x;
      height[i] = t.h;
      // Stored as sRGB: the colours above are meant as seen.
      colour.set([t.r * 255, t.g * 255, t.b * 255, 255], i * 4);
      const r = t.rough * 255;
      rough.set([r, r, r, 255], i * 4); // green = roughness
    }
  const normal = new Uint8ClampedArray(N * N * 4);
  const at = (x: number, y: number) => height[((y + N) % N) * N + ((x + N) % N)]!;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * recipe.relief;
      const dy = (at(x, y + 1) - at(x, y - 1)) * recipe.relief;
      const len = Math.hypot(dx, dy, 1);
      normal.set([(-dx / len) * 127.5 + 127.5, (dy / len) * 127.5 + 127.5, (1 / len) * 127.5 + 127.5, 255], (y * N + x) * 4);
    }
  const tex = (data: Uint8ClampedArray, srgb: boolean): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    c.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, N, N), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(colour, true), normalMap: tex(normal, false), roughnessMap: tex(rough, false) };
}

/**
 * A lit material with relief. `repeat`: how often the texture repeats over the surface's own texture coordinates
 * (boxes and cylinders run 0..1; extruded outlines run in inches). `tint` multiplies the colour.
 */
export function surface(kind: Surface, repeat: [number, number] = [1, 1], tint = 0xffffff, relief = 1): THREE.MeshStandardMaterial {
  let maps = made.get(kind);
  if (!maps) {
    maps = build(kind);
    made.set(kind, maps);
  }
  const own = (t: THREE.CanvasTexture): THREE.CanvasTexture => {
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  return new THREE.MeshStandardMaterial({ color: tint, map: own(maps.map), normalMap: own(maps.normalMap), normalScale: new THREE.Vector2(relief, relief), roughnessMap: own(maps.roughnessMap), roughness: 1, metalness: 0 });
}

/** Smooth noise in space, for pushing the points of a shape about. Roughly -1..1. */
export function noise3(x: number, y: number, z: number, seed = 1): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const fx = f(x - x0);
  const fy = f(y - y0);
  const fz = f(z - z0);
  const c = (i: number, j: number, k: number) => hash(x0 + i + (z0 + k) * 57, y0 + j + (z0 + k) * 131, seed);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy), lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy), fz) * 2 - 1;
}

/**
 * A lump: a ball whose surface is pushed in and out by noise – a boulder (`rough` about 0.35) or a mass of
 * leaves (about 0.25, `detail` 3). Smooth-shaded; the material's relief does the fine work.
 */
export function lump(radius: number, rough: number, seed: number, detail = 2, freq = 1.3): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise3(v.x * freq + seed, v.y * freq, v.z * freq, seed) * 0.65 + noise3(v.x * freq * 2.7, v.y * freq * 2.7 + seed, v.z * freq * 2.7, seed + 3) * 0.35;
    v.multiplyScalar(radius * (1 + n * rough));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // Points shared between faces must stay together: weld by position before working out the normals.
  geo.deleteAttribute('normal');
  const welded = mergeByPosition(geo);
  welded.computeVertexNormals();
  return welded;
}

function mergeByPosition(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const ids = new Map<string, number>();
  const pos: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      ids.set(key, id);
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (uv) uvs.push(uv.getX(i) * 3, uv.getY(i) * 2);
    }
    index.push(id);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(index);
  return out;
}
