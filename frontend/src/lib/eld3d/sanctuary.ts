// Ported from the game Eldfall Table (client/src/scene/sanctuary.ts). Kept close to the original so that changes there can be
// carried over; WarBracket differences are marked `WarBracket`.
import * as THREE from 'three';
import { lump, surface } from './materials';

// The land around the table: a fallen sanctuary in an old forest. Pale carved stone under moss, a great pointed
// arch, broken columns, steps up to a glowing crystal, giant trees, flowers, mist and shafts of light.
// All of it is built here from simple shapes (nothing is loaded) and none of it is part of the game: the rules
// only know the table.

const TEAL = 0x5ff0d0;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A soft round blot, for mist, light and glow. */
function softTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Sanctuary {
  readonly group = new THREE.Group();
  private readonly crystal = new THREE.Group();
  private readonly crystalLight = new THREE.PointLight(TEAL, 60, 60, 1.6);
  private readonly shafts: THREE.Mesh[] = [];
  private readonly canopies: THREE.Object3D[] = [];
  private readonly motes: THREE.Points;
  private readonly mist: THREE.Sprite[] = [];
  private bright = 1;

  /** `w` × `h`: the table, centred on the origin. `ground`: the height of the land. */
  constructor(w: number, h: number, ground: number) {
    const r = rng(20261117);
    // One stone for everything built: boxes get their texture coordinates stretched to their size (see `add`),
    // so the courses of masonry are the same height on a step and on a pier.
    const stone = surface('ashlar', [1, 1], 0xffffff, 1.4);
    const stoneDark = surface('ashlar', [1, 1], 0xcfc6b0, 1.4);
    const fluted = surface('flutes', [1, 1], 0xffffff, 1.5);
    const rockMat = surface('rock', [1, 1], 0xd8d8d0, 1.6);
    const moss = surface('leaves', [2, 2], 0x9fbf70, 1.6);
    const soft = softTexture();
    this.group.position.y = ground;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, into: THREE.Object3D = this.group): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.raycast = () => undefined;
      if (geo instanceof THREE.BoxGeometry && (mat === stone || mat === stoneDark)) {
        const { width, height, depth } = geo.parameters;
        const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
        const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          const across = Math.abs(nor.getX(i)) > 0.5 ? depth : width;
          const up = Math.abs(nor.getY(i)) > 0.5 ? depth : height;
          uv.setXY(i, (uv.getX(i) * across) / 6, (uv.getY(i) * up) / 6);
        }
      }
      into.add(m);
      return m;
    };
    /** A cushion of moss on top of something. */
    const mossCap = (x: number, y: number, z: number, size: number, into: THREE.Object3D = this.group) => {
      const m = add(lump(size, 0.3, Math.floor(r() * 1000), 2), moss, x, y, z, into);
      m.scale.y = 0.24;
    };

    // ---- columns ----
    const column = (x: number, z: number, height: number, radius: number, broken: boolean, into: THREE.Object3D = this.group): THREE.Group => {
      const col = new THREE.Group();
      col.position.set(x, 0, z);
      add(new THREE.BoxGeometry(radius * 3, radius * 0.7, radius * 3), stone, 0, radius * 0.35, 0, col);
      add(new THREE.CylinderGeometry(radius * 1.25, radius * 1.35, radius * 0.5, 16), stone, 0, radius * 0.95, 0, col);
      add(new THREE.CylinderGeometry(radius * 0.92, radius, height, 24, 1), fluted, 0, radius * 1.2 + height / 2, 0, col);
      if (broken) {
        // Snapped off at an angle, moss on the stump.
        const top = add(new THREE.CylinderGeometry(radius * 0.6, radius * 0.92, radius * 0.9, 7), stoneDark, radius * 0.1, radius * 1.2 + height + radius * 0.3, 0, col);
        top.rotation.z = 0.25;
        mossCap(0, radius * 1.2 + height + radius * 0.6, 0, radius * 0.9, col);
      } else {
        add(new THREE.CylinderGeometry(radius * 1.5, radius * 0.95, radius * 1.1, 16), stone, 0, radius * 1.2 + height + radius * 0.55, 0, col);
        add(new THREE.BoxGeometry(radius * 3.2, radius * 0.5, radius * 3.2), stone, 0, radius * 1.2 + height + radius * 1.35, 0, col);
      }
      col.rotation.y = r() * Math.PI;
      into.add(col);
      return col;
    };

    // ---- the great arch, beyond the far edge of the table ----
    const gateZ = -(h / 2 + 30);
    const gate = new THREE.Group();
    gate.position.set(0, 0, gateZ);
    this.group.add(gate);
    const span = 13; // half the opening
    const pierW = 6;
    const pierH = 22;
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(pierW, pierH, 5), stone, side * (span + pierW / 2), pierH / 2, 0, gate);
      // A carved leaf panel on the front of each pier.
      const leaf = new THREE.Shape();
      leaf.moveTo(0, 0);
      leaf.bezierCurveTo(1.6, 2.5, 1.6, 6, 0, 9);
      leaf.bezierCurveTo(-1.6, 6, -1.6, 2.5, 0, 0);
      const panel = add(new THREE.ExtrudeGeometry(leaf, { depth: 0.35, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 1 }), stoneDark, side * (span + pierW / 2), 6, 2.5, gate);
      panel.scale.set(0.9, 1, 1);
      add(new THREE.BoxGeometry(pierW + 1.2, 1.2, 6.2), stone, side * (span + pierW / 2), pierH + 0.6, 0, gate);
      add(new THREE.BoxGeometry(pierW + 1.6, 1.4, 6.6), stoneDark, side * (span + pierW / 2), 0.7, 0, gate);
      add(new THREE.ConeGeometry(1.6, 6, 4), stone, side * (span + pierW / 2), pierH + 4.2, 0, gate).rotation.y = Math.PI / 4;
      mossCap(side * (span + pierW / 2 - 1), pierH + 1.3, 1.5, 2.4, gate);
    }
    // The pointed arch: an outer and an inner ogee, extruded.
    const ogee = (half: number, rise: number, y0: number): THREE.Vector2[] => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        // from the left springing up to the point and down to the right
        const x = -half + 2 * half * t;
        const k = 1 - Math.abs(2 * t - 1);
        pts.push(new THREE.Vector2(x, y0 + rise * Math.pow(k, 0.62)));
      }
      return pts;
    };
    const outer = ogee(span + pierW, 17, pierH);
    const inner = ogee(span, 12, pierH);
    const archShape = new THREE.Shape([...outer, ...inner.reverse()]);
    // (Extruded shapes carry their own size as texture coordinates.)
    const carved = surface('ashlar', [1 / 6, 1 / 6], 0xffffff, 1.4);
    const arch = add(new THREE.ExtrudeGeometry(archShape, { depth: 4.4, bevelEnabled: false }), carved, 0, 0, -2.2, gate);
    arch.geometry.computeVertexNormals();
    // A flame-shaped finial on the point, and tracery inside the arch.
    const finial = new THREE.Shape();
    finial.moveTo(0, 0);
    finial.bezierCurveTo(3, 2, 2.2, 6, 0, 10);
    finial.bezierCurveTo(-2.2, 6, -3, 2, 0, 0);
    add(new THREE.ExtrudeGeometry(finial, { depth: 1.2, bevelEnabled: false }), carved, 0, pierH + 16, -0.6, gate);
    const ring = add(new THREE.TorusGeometry(3.2, 0.45, 6, 20), stoneDark, 0, pierH + 8.5, 0, gate);
    ring.scale.y = 1.5;
    mossCap(-6, pierH + 12.6, 1, 3, gate);
    mossCap(9, pierH + 9.8, 1, 2.4, gate);
    // The left pier has lost its top corner: rubble at its foot.
    for (let i = 0; i < 9; i++) {
      const s = 0.8 + r() * 1.8;
      const b = add(new THREE.BoxGeometry(s * 1.4, s, s * 1.1), i % 3 ? stone : stoneDark, -span - pierW - 2 - r() * 7, s * 0.4, 3 + r() * 8, gate);
      b.rotation.set(r(), r() * 3, r());
    }

    // ---- steps, the dais and the crystal behind the arch ----
    const shrine = new THREE.Group();
    shrine.position.set(0, 0, gateZ - 14);
    this.group.add(shrine);
    for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(22 - i * 1.6, 0.9, 16 - i * 2), i % 2 ? stone : stoneDark, 0, 0.45 + i * 0.9, -i, shrine);
    const daisY = 6.3;
    add(new THREE.CylinderGeometry(4.2, 4.8, 1.4, 8), stone, 0, daisY + 0.7, -7, shrine);
    for (const side of [-1, 1]) {
      // Two horns curving up around the crystal.
      const horn = add(new THREE.TorusGeometry(3.6, 0.5, 6, 14, Math.PI * 0.62), stone, side * 0.6, daisY + 4.6, -7, shrine);
      horn.rotation.z = side > 0 ? -0.25 : Math.PI - Math.PI * 0.62 + 0.25;
      column(side * 9, -9, 9, 0.9, side < 0, shrine);
      column(side * 9, -2, 9, 0.9, false, shrine);
    }
    this.crystal.position.set(0, daisY + 6.2, -7);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), new THREE.MeshStandardMaterial({ color: 0xbffff0, emissive: TEAL, emissiveIntensity: 2.2, roughness: 0.15, flatShading: true }));
    gem.scale.set(1, 2.4, 1);
    gem.raycast = () => undefined;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: TEAL, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.setScalar(22);
    this.crystal.add(gem, halo);
    shrine.add(this.crystal);
    this.crystalLight.position.set(0, daisY + 6.2, -7);
    shrine.add(this.crystalLight);
    // A temple front behind it: a row of slender columns under a swept roof.
    for (let i = -3; i <= 3; i++) column(i * 5.2, -17, 15, 0.7, false, shrine);
    const roof = add(new THREE.ConeGeometry(24, 7, 4), new THREE.MeshStandardMaterial({ color: 0x6f8f86, roughness: 0.9, flatShading: true }), 0, 22.5, -17, shrine);
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.45;
    add(new THREE.BoxGeometry(40, 1.2, 9), stone, 0, 18.6, -17, shrine);

    // ---- columns and wall stumps around the table ----
    const ring2 = Math.max(w, h) / 2;
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + (i - 6.5) * 0.36 + (r() - 0.5) * 0.12; // an arc around the far side and both flanks
      const d = ring2 + 13 + r() * 12;
      const x = Math.cos(a) * d * 1.15;
      const z = Math.sin(a) * d;
      if (Math.abs(x) < span + pierW + 3 && z < -h / 2 - 12) continue; // keep the way to the arch open
      const col = column(x, z, 6 + r() * 9, 0.8 + r() * 0.5, r() < 0.6);
      if (r() < 0.2) {
        // Fallen.
        col.rotation.z = Math.PI / 2 - 0.08;
        col.position.y = 1.2;
      }
    }
    for (let i = 0; i < 10; i++) {
      // Far side and flanks only: nothing tall between a low camera and the table.
      const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.25;
      const d = ring2 + 16 + r() * 26;
      const len = 4 + r() * 7;
      const wall = add(new THREE.BoxGeometry(len, 1.5 + r() * 3.5, 1.6), i % 2 ? stone : stoneDark, Math.cos(a) * d * 1.2, 0, Math.sin(a) * d);
      wall.position.y = (wall.geometry as THREE.BoxGeometry).parameters.height / 2 - 0.2;
      wall.rotation.y = r() * Math.PI;
      mossCap(wall.position.x, wall.position.y * 2 + 0.1, wall.position.z, len * 0.35);
    }
    // A paved way from the table to the arch.
    for (let i = 0; i < 26; i++) {
      const z = -h / 2 - 7 - (i / 26) * 22;
      const s = 1.6 + r() * 1.8;
      const slab = add(new THREE.BoxGeometry(s * 1.3, 0.25, s), i % 3 ? stoneDark : stone, (r() - 0.5) * 9, 0.1, z + (r() - 0.5) * 1.5);
      slab.rotation.y = (r() - 0.5) * 0.5;
    }

    // ---- the old forest ----
    const bark = surface('bark', [5, 3], 0xc9b49a, 1.6);
    const rootBark = surface('bark', [2, 2], 0xc9b49a, 1.6);
    const leafMats = [0xa9c98f, 0xc4dc92, 0x8fb98a, 0xd8e69a].map((c) => {
      const m = surface('leaves', [5, 3], c, 1.8);
      m.color.multiplyScalar(1.9); // crowns stand in their own shade: lift them
      return m;
    });
    const autumn = surface('leaves', [5, 3], 0xffffff, 1.8);
    autumn.color.setRGB(2.6, 0.5, 0.32);
    const giant = (x: number, z: number, height: number, red: boolean): void => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      const girth = height * 0.085;
      const trunk = add(new THREE.CylinderGeometry(girth * 0.55, girth, height * 0.62, 20, 10), bark, 0, height * 0.31, 0, tree);
      // Gnarled: push the rings of the trunk about.
      const p = trunk.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        p.setX(i, p.getX(i) + Math.sin(y * 0.5 + x) * girth * 0.25);
        p.setZ(i, p.getZ(i) + Math.cos(y * 0.4 + z) * girth * 0.25);
      }
      trunk.geometry.computeVertexNormals();
      // Roots spreading over the ground, mossy on top.
      const roots = 5 + Math.floor(r() * 3);
      for (let i = 0; i < roots; i++) {
        const a = (i / roots) * Math.PI * 2 + r() * 0.5;
        const len = girth * (2.2 + r() * 1.8);
        const root = add(new THREE.CylinderGeometry(girth * 0.12, girth * 0.42, len, 10), rootBark, Math.cos(a) * len * 0.42, girth * 0.35, Math.sin(a) * len * 0.42, tree);
        root.rotation.set(0, -a, Math.PI / 2 - 0.42, 'YXZ');
        mossCap(Math.cos(a) * len * 0.5, girth * 0.55, Math.sin(a) * len * 0.5, girth * 0.5, tree);
      }
      // Boughs and a wide crown of leaf masses.
      const crown = new THREE.Group();
      crown.position.y = height * 0.6;
      crown.userData.sway = r() * 6;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + r();
        const len = height * 0.3;
        const bough = add(new THREE.CylinderGeometry(girth * 0.14, girth * 0.3, len, 10), rootBark, Math.cos(a) * len * 0.36, len * 0.3, Math.sin(a) * len * 0.36, crown);
        bough.rotation.set(0, -a, -0.95, 'YXZ');
      }
      const blobs = 9 + Math.floor(r() * 5);
      for (let i = 0; i < blobs; i++) {
        const a = r() * Math.PI * 2;
        const d = height * (0.08 + r() * 0.3);
        const s = height * (0.13 + r() * 0.1);
        const blob = add(lump(s, 0.3, Math.floor(r() * 1000), 3, 1.8), red && i % 3 === 0 ? autumn : leafMats[Math.floor(r() * leafMats.length)]!, Math.cos(a) * d, height * (0.12 + r() * 0.28), Math.sin(a) * d, crown);
        blob.scale.y = 0.62;
      }
      tree.add(crown);
      this.canopies.push(crown);
      this.group.add(tree);
    };
    for (let i = 0; i < 15; i++) {
      // All round, but thin towards the near side so that the forest does not stand between the camera and the table.
      const a = -Math.PI / 2 + ((i + 0.5) / 15 - 0.5) * Math.PI * 1.75 + (r() - 0.5) * 0.15;
      const near = Math.sin(a) > 0.2;
      const d = ring2 + (near ? 62 : 34) + r() * 26;
      const x = Math.cos(a) * d * 1.2;
      const z = Math.sin(a) * d;
      if (Math.abs(x) < 26 && z < 0) continue; // not in front of the arch
      giant(x, z, 44 + r() * 26, i % 4 === 1);
    }
    for (const side of [-1, 1]) giant(side * 34, gateZ - 6, 60, side < 0);

    // ---- flowers, moss stones ----
    const flowers = (color: number, n: number, size: number): void => {
      const pts = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = ring2 + 7 + Math.pow(r(), 1.6) * 60;
        pts.set([Math.cos(a) * d * 1.15, 0.35 + r() * 0.5, Math.sin(a) * d], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const p = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: soft, transparent: true, alphaTest: 0.25, depthWrite: false }));
      p.raycast = () => undefined;
      this.group.add(p);
    };
    flowers(0xb48cff, 1100, 0.42);
    flowers(0xffffff, 800, 0.34);
    flowers(0xffd9f0, 400, 0.34);
    for (let i = 0; i < 40; i++) {
      // Not on the near side, where they would sit in front of a low camera.
      const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.3;
      const d = ring2 + 9 + r() * 55;
      const s = 0.8 + r() * 2.2;
      const rock = add(lump(s, 0.36, i * 7 + 3, 2), i % 3 ? rockMat : moss, Math.cos(a) * d * 1.15, s * 0.25, Math.sin(a) * d);
      rock.scale.y = 0.6;
      rock.rotation.set(r() * 3, r() * 3, r() * 3);
    }

    // ---- light: shafts through the leaves, motes in the air, mist over the ground ----
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfff0c2, map: soft, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 9; i++) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(9 + r() * 10, 110), shaftMat.clone());
      shaft.position.set(-70 + r() * 150, 46, gateZ + 10 + r() * 50);
      shaft.rotation.set(0, (r() - 0.5) * 0.5, -0.5 - r() * 0.12);
      shaft.userData.phase = r() * 6;
      shaft.raycast = () => undefined;
      this.shafts.push(shaft);
      this.group.add(shaft);
    }
    const n = 260;
    const mp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) mp.set([(r() - 0.5) * 150, 2 + r() * 26, (r() - 0.5) * 150], i * 3);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xfff3b0, size: 0.4, map: soft, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.raycast = () => undefined;
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = ring2 + 26 + r() * 50;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0xd6f3ec, transparent: true, opacity: 0.2, depthWrite: false }));
      s.position.set(Math.cos(a) * d * 1.2, 3 + r() * 3, Math.sin(a) * d);
      s.scale.set(60 + r() * 40, 12 + r() * 8, 1);
      s.userData.phase = r() * 6;
      this.mist.push(s);
      this.group.add(s);
    }
  }

  /** Sunny: full light shafts and motes. Rain and snow dim them; the crystal glows on. */
  setBright(v: number): void {
    this.bright = v;
    this.motes.visible = v > 0.5;
  }

  update(t: number, wind: number): void {
    this.crystal.rotation.y = t * 0.5;
    this.crystal.position.y += Math.sin(t * 1.3) * 0.004;
    this.crystalLight.intensity = 60 + Math.sin(t * 2.1) * 12;
    for (const s of this.shafts) (s.material as THREE.MeshBasicMaterial).opacity = this.bright * (0.11 + 0.06 * Math.sin(t * 0.4 + (s.userData.phase as number)));
    for (const c of this.canopies) {
      const ph = c.userData.sway as number;
      c.rotation.z = Math.sin(t * 0.7 + ph) * 0.012 * wind;
      c.rotation.x = Math.cos(t * 0.5 + ph * 1.7) * 0.01 * wind;
    }
    this.motes.rotation.y = t * 0.01;
    this.motes.position.y = Math.sin(t * 0.3) * 0.6;
    for (const m of this.mist) m.position.x += Math.sin(t * 0.1 + (m.userData.phase as number)) * 0.004 * wind;
  }
}
