// Ported from the game Eldfall Table (client/src/scene/figures.ts). Kept close to the original so that changes there can be
// carried over; WarBracket differences are marked `WarBracket`.
import * as THREE from 'three';
import { factionColor, SIDE_COLORS } from '@/lib/eld/content.ts';
import { baseHeight, baseRadius } from '@/lib/eld/geometry.ts';
import type { Model } from '@/lib/eld/types.ts';

// Placeholder figures built from simple shapes. One unit = one inch; the front of a figure is -z.
// WarBracket: placeholder figures only – no sculpts and no animation.

const BASE_T = 0.12;

const mat = (color: number, roughness = 0.75): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });

function part(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Everything that changes how a figure looks. When this string changes the figure is rebuilt. */
export const figureKey = (m: Model, hidden = false): string => (hidden ? ['hidden', m.size, m.side].join('|') : [m.kind, m.size, m.side, m.faction, m.leader ? 'L' : '', isDown(m) ? 'down' : 'up'].join('|'));

export const isDown = (m: Model): boolean => m.hp === 0 || m.states.includes('Dead') || m.states.includes('Incapacitated');

export function buildFigure(model: Model): THREE.Group {
  const r = baseRadius(model.size);
  const h = Math.max(baseHeight(model.size) - BASE_T, 0.5);
  const group = new THREE.Group();
  group.userData.modelId = model.id;

  const side = mat(SIDE_COLORS[model.side], 0.5);
  const dark = mat(0x1d1f24, 0.9);
  const body = mat(factionColor(model.faction));
  const skin = mat(0xe2c4a0);
  const steel = mat(0xc9ced6, 0.35);
  const wood = mat(0x6b4a2b);

  // Base: coloured rim = which side the figure belongs to.
  group.add(part(new THREE.CylinderGeometry(r, r, BASE_T, 32), side, 0, BASE_T / 2, 0));
  group.add(part(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.02, 32), dark, 0, BASE_T + 0.01, 0));
  // Front marker.
  const arrow = part(new THREE.ConeGeometry(r * 0.16, r * 0.3, 3), mat(0xffffff, 0.4), 0, BASE_T + 0.03, -r * 0.68);
  arrow.rotation.x = -Math.PI / 2;
  arrow.scale.z = 0.3;
  group.add(arrow);

  const fig = new THREE.Group();
  fig.position.y = BASE_T;
  group.add(fig);

  if (model.kind === 'beast') {
    const rad = Math.min(r * 0.42, h * 0.3);
    const len = r * 0.9;
    const cy = h * 0.58;
    const torso = part(new THREE.CapsuleGeometry(rad, len, 4, 12), body, 0, cy, 0);
    torso.rotation.x = Math.PI / 2;
    fig.add(torso);
    fig.add(part(new THREE.SphereGeometry(rad * 0.8, 14, 10), body, 0, cy + rad * 0.5, -(len / 2 + rad * 0.9)));
    fig.add(part(new THREE.ConeGeometry(rad * 0.25, rad * 0.7, 6), steel, rad * 0.4, cy + rad * 1.4, -(len / 2 + rad * 0.9)));
    fig.add(part(new THREE.ConeGeometry(rad * 0.25, rad * 0.7, 6), steel, -rad * 0.4, cy + rad * 1.4, -(len / 2 + rad * 0.9)));
    const legH = cy - rad * 0.4;
    for (const [lx, lz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      fig.add(part(new THREE.CylinderGeometry(rad * 0.28, rad * 0.22, legH, 8), body, lx * rad * 0.6, legH / 2, lz * len * 0.45));
    }
    if (model.leader) {
      fig.add(part(new THREE.CylinderGeometry(0.03, 0.03, h * 0.8, 6), wood, 0, cy + rad + h * 0.4, len * 0.3));
      fig.add(part(new THREE.BoxGeometry(r * 0.7, h * 0.3, 0.03), side, r * 0.35, cy + rad + h * 0.65, len * 0.3));
    }
  } else {
    const bh = h * 0.62;
    const hr = h * 0.15;
    const br = Math.min(r * 0.5, h * 0.2);
    const headY = bh + hr * 0.85;

    if (model.kind === 'mage') {
      fig.add(part(new THREE.ConeGeometry(br * 1.35, bh, 14), body, 0, bh / 2, 0));
      fig.add(part(new THREE.ConeGeometry(hr * 1.1, hr * 2.2, 10), body, 0, headY + hr * 1.6, 0));
      fig.add(part(new THREE.CylinderGeometry(0.03, 0.03, h * 1.05, 6), wood, br * 1.5, h * 0.52, -br * 0.3));
      const orb = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x3fb6ff, emissiveIntensity: 0.9 });
      fig.add(part(new THREE.SphereGeometry(0.09, 10, 8), orb, br * 1.5, h * 1.08, -br * 0.3));
    } else {
      const slim = model.kind === 'rogue' || model.kind === 'archer' ? 0.82 : 1;
      fig.add(part(new THREE.CylinderGeometry(br * 0.85 * slim, br * slim, bh, 12), body, 0, bh / 2, 0));
    }
    fig.add(part(new THREE.SphereGeometry(hr, 14, 10), skin, 0, headY, 0));

    if (model.kind === 'warrior') {
      fig.add(part(new THREE.BoxGeometry(0.05, bh * 0.95, 0.05), steel, br * 1.35, bh * 0.8, -br * 0.4));
      const shield = part(new THREE.CylinderGeometry(br * 0.85, br * 0.85, 0.05, 14), side, -br * 1.15, bh * 0.55, -br * 0.6);
      shield.rotation.x = Math.PI / 2;
      fig.add(shield);
    }
    if (model.leader) {
      // The Leader carries a banner in the side's colour (and a crown when no hat is in the way).
      const gold = mat(0xe8c14a, 0.3);
      if (model.kind !== 'mage' && model.kind !== 'rogue') fig.add(part(new THREE.CylinderGeometry(hr * 0.95, hr * 0.95, hr * 0.5, 10), gold, 0, headY + hr * 0.8, 0));
      fig.add(part(new THREE.CylinderGeometry(0.03, 0.03, h * 1.5, 6), wood, 0, h * 0.75, br * 1.3));
      fig.add(part(new THREE.BoxGeometry(r * 0.9, h * 0.35, 0.03), side, r * 0.45, h * 1.3, br * 1.3));
    }
    if (model.kind === 'archer') {
      const bow = part(new THREE.TorusGeometry(bh * 0.45, 0.025, 6, 14, Math.PI), wood, -br * 1.3, bh * 0.6, -br * 0.5);
      bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
      fig.add(bow);
      fig.add(part(new THREE.BoxGeometry(br * 0.5, bh * 0.5, br * 0.35), wood, 0, bh * 0.7, br * 1.05));
    }
    if (model.kind === 'rogue') {
      fig.add(part(new THREE.ConeGeometry(hr * 1.25, hr * 1.5, 10), dark, 0, headY + hr * 0.7, hr * 0.15));
      fig.add(part(new THREE.BoxGeometry(0.04, bh * 0.4, 0.04), steel, br * 1.25, bh * 0.45, -br * 0.5));
      fig.add(part(new THREE.BoxGeometry(0.04, bh * 0.4, 0.04), steel, -br * 1.25, bh * 0.45, -br * 0.5));
    }
  }

  if (isDown(model)) {
    // Out of action: the figure lies on its base.
    fig.rotation.z = Math.PI / 2;
    fig.position.set(h / 2, BASE_T + Math.min(r * 0.5, h * 0.25), 0);
  }
  return group;
}

/** A flat ring on the table (radius 1; scale it): selection marker, movement range, Awareness. */
export function buildRing(color = 0xffd84a, inner = 1.1, outer = 1.32, opacity = 0.95): THREE.Mesh {
  const geo = new THREE.RingGeometry(inner, outer, 72);
  geo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  ring.position.y = 0.03;
  ring.visible = false;
  return ring;
}

/** WarBracket: a figure the viewer may not see (Shrouded): its base and a grey shape, nothing that tells what it is. */
export function buildHidden(model: Model): THREE.Group {
  const r = baseRadius(model.size);
  const group = new THREE.Group();
  group.userData.modelId = model.id;
  group.add(part(new THREE.CylinderGeometry(r, r, BASE_T, 32), mat(SIDE_COLORS[model.side], 0.5), 0, BASE_T / 2, 0));
  const veil = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9, transparent: true, opacity: 0.75 });
  group.add(part(new THREE.ConeGeometry(r * 0.7, 1.2, 12), veil, 0, BASE_T + 0.6, 0));
  return group;
}
