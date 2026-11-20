// Ported from the game Eldfall Table (client/src/scene/terrain.ts). Kept close to the original so that changes there can be
// carried over; WarBracket differences are marked `WarBracket`.
import * as THREE from 'three';
import { pointInPolygon } from '@/lib/eld/geometry.ts';
import type { Pt, TerrainPiece } from '@/lib/eld/types.ts';
import { modelUrl } from './assets';
import { loadGlb, type Glb } from './glb';
import { lump, noise3, surface } from './materials';

// Terrain is drawn straight from its rules shape (footprint + height), so what you see is what the rules use.

const COLORS: Record<TerrainPiece['env'], number> = {
  building: 0x9c8468,
  ruin: 0xd4cab0,
  rock: 0x6f7479,
  forest: 0x2f5d34,
  water: 0x2f6f9e,
  magic: 0xb48ad6,
};

/** Footprint as a flat shape. After rotateX(-90°) table (x, y) lands on world (x, z). */
function footprint(points: Pt[], w: number, h: number): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach((p, i) => {
    const x = p.x - w / 2;
    const y = -(p.y - h / 2);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

/** Small repeatable random generator so trees stand in the same place for both players. */
function seeded(seed: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i++) s = Math.imul(s ^ seed.charCodeAt(i), 16777619);
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

let barkMat: THREE.MeshStandardMaterial | null = null;
const needleMats: THREE.MeshStandardMaterial[] = [];

/** A fir: a tapering trunk and tiers of drooping boughs, each tier a ragged skirt of needles. */
function tree(height: number, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  barkMat ??= surface('bark', [2, 1], 0xb09a80);
  if (needleMats.length === 0) for (const tint of [0x6f9a62, 0x86b06a, 0x5c8a5c]) needleMats.push(surface('leaves', [4, 2], tint, 1.3));
  const total = Math.max(1.6, height) * (0.8 + rnd() * 0.35);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.11, total * 0.9, 8), barkMat);
  trunk.position.y = total * 0.45;
  trunk.castShadow = true;
  g.add(trunk);
  const tiers = 5;
  const mat = needleMats[Math.floor(rnd() * needleMats.length)]!;
  const seed = rnd() * 100;
  for (let k = 0; k < tiers; k++) {
    const f = k / (tiers - 1);
    const r = (0.62 - f * 0.46) * (0.9 + rnd() * 0.25);
    const tall = total * 0.3;
    const geo = new THREE.ConeGeometry(r, tall, 14, 4, true);
    // Ragged: the skirt's hem dips and rises, and bulges between the boughs.
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const low = 0.5 - y / tall; // 1 at the hem
      const n = noise3(p.getX(i) * 5 + seed, k * 3.1, p.getZ(i) * 5, 7);
      const push = 1 + n * 0.3 * low;
      p.setXYZ(i, p.getX(i) * push, y - Math.max(0, n) * 0.12 * low * tall, p.getZ(i) * push);
    }
    geo.computeVertexNormals();
    const skirt = new THREE.Mesh(geo, mat);
    skirt.material.side = THREE.DoubleSide;
    skirt.position.y = total * (0.3 + f * 0.6);
    skirt.rotation.y = rnd() * 6;
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    g.add(skirt);
  }
  return g;
}

const ripples: THREE.Texture[] = [];
/** Moves the water. Called once a frame with the time in seconds. */
export function animateWater(t: number): void {
  for (const r of ripples) r.offset.set(t * 0.012, t * 0.02);
}

/** Looks only – the rules shape stays the plain block underneath: roof edge, door and windows, rubble, boulders, moss. */
function dress(group: THREE.Group, piece: TerrainPiece, w: number, h: number): void {
  const rnd = seeded(piece.id + 'dress');
  const pts = piece.shape;
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  const at = (p: Pt, y: number) => new THREE.Vector3(p.x - w / 2, y, p.y - h / 2);
  const add = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    m.raycast = () => undefined;
    group.add(m);
  };
  if (piece.env === 'building') {
    const timber = surface('planks', [1, 0.35], 0x7a5a40);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.6 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffd48a, emissive: 0xffb347, emissiveIntensity: 0.5, roughness: 0.4 });
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const turn = -Math.atan2(b.y - a.y, b.x - a.x);
      // A low parapet round the flat roof and a beam at the foot of each wall.
      for (const [y, tall, thick] of [[piece.height + 0.09, 0.18, 0.16], [0.12, 0.24, 0.1]] as const) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(len + 0.12, tall, thick), timber);
        beam.position.copy(at(mid, y));
        beam.rotation.y = turn;
        add(beam);
      }
      // Corner posts.
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, piece.height, 0.18), timber);
      post.position.copy(at(a, piece.height / 2));
      post.rotation.y = turn;
      add(post);
      // Windows on every wall, a door on the first long one.
      const out = new THREE.Vector2(mid.x - cx, mid.y - cy).normalize().multiplyScalar(0.03);
      const face = (along: number, y: number, ww: number, hh: number, mat: THREE.Material) => {
        const q = { x: a.x + (b.x - a.x) * along + out.x, y: a.y + (b.y - a.y) * along + out.y };
        const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.05), mat);
        m.position.copy(at(q, y));
        m.rotation.y = turn;
        add(m);
      };
      const floors = Math.max(1, Math.floor(piece.height / 2.2));
      for (let f = 0; f < floors; f++) {
        const y = 1.25 + f * 2.1;
        if (y + 0.5 > piece.height) break;
        const n = Math.max(1, Math.floor(len / 2));
        for (let k = 0; k < n; k++) {
          if (f === 0 && i === 0 && k === 0 && len > 2.5) continue;
          face((k + 0.5) / n, y, 0.5, 0.65, rnd() < 0.6 ? glow : dark);
        }
      }
      if (i === 0 && len > 2.5) face(0.5 / Math.max(1, Math.floor(len / 2)), 0.7, 0.7, 1.4, dark);
    }
  }
  if (piece.env === 'ruin' || piece.env === 'rock') {
    // Loose stones at the foot, and boulders that break the straight outline.
    const rockMat = piece.env === 'rock' ? surface('rock', [1, 1], 0xd8d8d0, 1.5) : surface('rock', [1, 1], 0xfff2d6, 1.2);
    const n = piece.env === 'rock' ? 11 : 9;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.floor(rnd() * pts.length)]!;
      const b = pts[(pts.indexOf(a) + 1) % pts.length]!;
      const f = rnd();
      const edge = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      const inward = piece.env === 'rock' ? 0.1 + rnd() * 0.5 : -0.1 - rnd() * 0.25;
      const p = { x: edge.x + (cx - edge.x) * inward, y: edge.y + (cy - edge.y) * inward };
      const size = piece.env === 'rock' ? 0.4 + rnd() * 0.5 : 0.12 + rnd() * 0.22;
      const stoneMesh = new THREE.Mesh(lump(size, piece.env === 'rock' ? 0.38 : 0.3, Math.floor(rnd() * 1000), 2), rockMat);
      stoneMesh.position.copy(at(p, Math.min(size * 0.55, piece.height)));
      stoneMesh.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      stoneMesh.scale.y = 0.72;
      add(stoneMesh);
    }
    // Moss on top.
    const moss = surface('leaves', [2, 2], 0x9fbf70, 1.6);
    for (let i = 0; i < 6; i++) {
      const p = { x: cx + (pts[Math.floor(rnd() * pts.length)]!.x - cx) * rnd() * 0.8, y: cy + (pts[Math.floor(rnd() * pts.length)]!.y - cy) * rnd() * 0.8 };
      if (!pointInPolygon(p, pts)) continue;
      const patch = new THREE.Mesh(lump(0.22 + rnd() * 0.25, 0.3, Math.floor(rnd() * 1000), 2), moss);
      patch.scale.y = 0.16;
      patch.position.copy(at(p, piece.height + 0.01));
      add(patch);
    }
  }
}

const sculpted = new Map<string, Promise<Glb>>();

/** `lift`: how high the ground is where a sculpted piece stands. */
export function buildTerrain(piece: TerrainPiece, w: number, h: number, lift = 0): THREE.Object3D {
  const group = new THREE.Group();
  group.userData.terrainId = piece.id;
  if (piece.model) {
    // Sculpted scenery: the file is 1 unit across, standing on y = 0.
    const { file, x, y, size, turn } = piece.model;
    // WarBracket: the light and the full set of models are different files of the same name.
    const url = modelUrl(file);
    let glb = sculpted.get(url);
    if (!glb) {
      glb = loadGlb(url);
      sculpted.set(url, glb);
    }
    const holder = new THREE.Group();
    holder.position.set(x - w / 2, lift - 0.02, y - h / 2);
    holder.rotation.y = (-turn * Math.PI) / 180;
    holder.scale.setScalar(size);
    group.add(holder);
    glb.then(
      (g) => {
        const { root } = g.make();
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.raycast = () => undefined;
          // The scene asks these meshes how high they are under a figure (it stands on them, not in them).
          mesh.userData.sculpt = true;
          const m = mesh.material as THREE.MeshStandardMaterial;
          m.metalness = Math.min(m.metalness, 0.2);
          m.side = THREE.DoubleSide;
        });
        holder.add(root);
      },
      () => {
        // No file: show the plain shapes after all.
        group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && mesh.userData.terrain) (mesh.material as THREE.Material).visible = true;
        });
      },
    );
  }
  const shape = footprint(piece.shape, w, h);

  if (piece.kind === 'obstacle') {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: piece.height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    // Extruded outlines carry inches as texture coordinates: a quarter of the texture per inch.
    const q: [number, number] = [0.25, 0.25];
    const skin: THREE.Material | THREE.Material[] =
      piece.env === 'building'
        ? [surface('planks', q, 0x9a7a5a), surface('plaster', q)] // roof boards, plastered walls
        : piece.env === 'rock'
          ? surface('rock', [0.2, 0.2], 0xd8d8d0, 1.6)
          : piece.env === 'ruin'
            ? [surface('rock', q, 0xfff2d6), surface('ashlar', q, 0xffffff, 1.3)] // broken top, coursed faces
            : new THREE.MeshStandardMaterial({ color: COLORS[piece.env], roughness: 0.95 });
    const mesh = new THREE.Mesh(geo, piece.unseen ? new THREE.MeshStandardMaterial({ color: COLORS[piece.env], visible: false }) : skin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Its top is a surface figures can stand on: the scene picks it with the mouse.
    mesh.userData.terrain = true;
    group.add(mesh);
    if (!piece.unseen) dress(group, piece, w, h);
    // Ladders: two rails and rungs against the wall, leaning out a little.
    const cx = piece.shape.reduce((sum, p) => sum + p.x, 0) / piece.shape.length;
    const cy = piece.shape.reduce((sum, p) => sum + p.y, 0) / piece.shape.length;
    const wood = surface('planks', [0.3, 1], 0xe0b878);
    for (const l of piece.ladders ?? []) {
      const out = new THREE.Vector2(l.x - cx, l.y - cy).normalize();
      const ladder = new THREE.Group();
      const len = piece.height + 0.3;
      for (const side of [-0.22, 0.22]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.06), wood);
        rail.position.set(side, len / 2, 0);
        ladder.add(rail);
      }
      for (let y = 0.3; y < len; y += 0.35) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.05), wood);
        rung.position.set(0, y, 0);
        ladder.add(rung);
      }
      ladder.position.set(l.x - w / 2 + out.x * 0.12, 0, l.y - h / 2 + out.y * 0.12);
      ladder.rotation.y = Math.atan2(out.x, out.y);
      ladder.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      group.add(ladder);
    }
    return group;
  }

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const water = piece.env === 'water';
  let skin: THREE.MeshStandardMaterial;
  if (water) {
    // Still, dark water that mirrors the sky; the ripples are relief only, drifting slowly.
    skin = surface('rock', [0.09, 0.09], 0xffffff, 0.35);
    skin.map = null;
    skin.roughnessMap = null;
    skin.color.setHex(0x1f4d57);
    skin.roughness = 0.06;
    skin.envMapIntensity = 2.2;
    skin.transparent = true;
    skin.opacity = 0.9;
    skin.depthWrite = false;
    if (skin.normalMap) ripples.push(skin.normalMap);
  } else skin = new THREE.MeshStandardMaterial({ color: COLORS[piece.env], roughness: 1, transparent: true, opacity: piece.env === 'forest' ? 0.35 : 0.6, depthWrite: false });
  const ground = new THREE.Mesh(geo, skin);
  ground.position.y = piece.painted ? -0.07 : 0.02;
  if (piece.painted) skin.opacity = 0.4; // the picture underneath already shows the water
  ground.receiveShadow = true;
  group.add(ground);

  if (piece.env === 'forest') {
    const rnd = seeded(piece.id + piece.shape.length);
    const xs = piece.shape.map((p) => p.x);
    const ys = piece.shape.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX;
    const spanY = Math.max(...ys) - minY;
    const placed: Pt[] = [];
    for (let i = 0; i < 80 && placed.length < 12; i++) {
      const p = { x: minX + rnd() * spanX, y: minY + rnd() * spanY };
      if (!pointInPolygon(p, piece.shape)) continue;
      if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1.1)) continue;
      placed.push(p);
      const t = tree(piece.height, rnd);
      t.position.set(p.x - w / 2, 0, p.y - h / 2);
      // Sways in the wind.
      t.userData.sway = rnd() * 6.28;
      group.add(t);
    }
  }
  return group;
}
