// Ported from the game Eldfall Table (client/src/scene/glb.ts). Kept close to the original so that changes there can be
// carried over; WarBracket differences are marked `WarBracket`.
import * as THREE from 'three';
import { loadBegin, loadEnd, loadProgress } from './loading';

// A small reader for the figure files in client/models: binary glTF with triangle meshes (positions, normals, one
// set of texture coordinates), textured materials, a node tree, skeletons with skin weights and animation clips
// (as Blender exports them). Not read: cameras, lights, morph targets, sparse or interleaved data, extensions.

interface GltfNode {
  name?: string;
  mesh?: number;
  skin?: number;
  children?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}
interface Gltf {
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: GltfNode[];
  meshes: { primitives: { attributes: Record<string, number>; indices: number; material?: number }[] }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
  skins?: { joints: number[]; inverseBindMatrices: number }[];
  animations?: { name?: string; channels: { sampler: number; target: { node: number; path: string } }[]; samplers: { input: number; output: number; interpolation?: string }[] }[];
  materials?: { doubleSided?: boolean; pbrMetallicRoughness?: { baseColorTexture?: { index: number }; metallicRoughnessTexture?: { index: number }; metallicFactor?: number; roughnessFactor?: number }; normalTexture?: { index: number } }[];
  textures?: { source: number }[];
  images?: { bufferView: number; mimeType: string }[];
}

const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** One figure made from a file: its own bones (by name) and its own copy of the clips' targets. */
export interface GlbCopy {
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  clips: THREE.AnimationClip[];
}
/** A loaded figure file. Every figure on the table gets its own copy; the heavy parts are shared. */
export interface Glb {
  make(): GlbCopy;
}

/** WarBracket: the file, read piece by piece so the page can show how far it is (`loading.ts`). */
async function download(url: string): Promise<ArrayBuffer> {
  loadBegin(url);
  let ok = false;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body) {
      const all = await res.arrayBuffer();
      ok = true;
      return all;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      loadProgress(url, loaded, total);
    }
    const out = new Uint8Array(loaded);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    ok = true;
    return out.buffer;
  } finally {
    loadEnd(url, ok);
  }
}

export async function loadGlb(url: string): Promise<Glb> {
  const data = await download(url);
  const view = new DataView(data);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error(`${url} is not a .glb file`);
  const jsonLength = view.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength))) as Gltf;
  const bin = 20 + jsonLength + 8;

  const slice = (i: number): { offset: number; length: number } => {
    const bv = gltf.bufferViews[i]!;
    return { offset: bin + (bv.byteOffset ?? 0), length: bv.byteLength };
  };
  const accessor = (i: number): THREE.BufferAttribute => {
    const a = gltf.accessors[i]!;
    const n = SIZE[a.type] ?? 1;
    const at = slice(a.bufferView).offset + (a.byteOffset ?? 0);
    // Copied, so the big file can be let go of.
    const array =
      a.componentType === 5126
        ? new Float32Array(data.slice(at, at + a.count * n * 4))
        : a.componentType === 5125
          ? new Uint32Array(data.slice(at, at + a.count * n * 4))
          : a.componentType === 5121
            ? new Uint8Array(data.slice(at, at + a.count * n))
            : new Uint16Array(data.slice(at, at + a.count * n * 2));
    return new THREE.BufferAttribute(array, n);
  };
  const textures = new Map<number, Promise<THREE.Texture>>();
  const texture = (ref: { index: number } | undefined, colour: boolean): Promise<THREE.Texture | null> => {
    if (!ref) return Promise.resolve(null);
    let t = textures.get(ref.index);
    if (!t) {
      const image = gltf.images![gltf.textures![ref.index]!.source]!;
      const { offset, length } = slice(image.bufferView);
      t = createImageBitmap(new Blob([new Uint8Array(data, offset, length)], { type: image.mimeType })).then((bitmap) => {
        const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
        tex.flipY = false;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return tex;
      });
      textures.set(ref.index, t);
    }
    return t;
  };
  const materials = await Promise.all(
    (gltf.materials ?? []).map(async (m) => {
      const pbr = m.pbrMetallicRoughness ?? {};
      const [map, rough, normal] = await Promise.all([texture(pbr.baseColorTexture, true), texture(pbr.metallicRoughnessTexture, false), texture(m.normalTexture, false)]);
      return new THREE.MeshStandardMaterial({ map, roughnessMap: rough, metalnessMap: rough, normalMap: normal, roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 1, side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide });
    }),
  );

  // Read once, shared by every copy: geometry, bind matrices, clips.
  const geometry = gltf.meshes.map((mesh) =>
    mesh.primitives.map((p) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', accessor(p.attributes.POSITION!));
      if (p.attributes.NORMAL !== undefined) geo.setAttribute('normal', accessor(p.attributes.NORMAL));
      if (p.attributes.TEXCOORD_0 !== undefined) geo.setAttribute('uv', accessor(p.attributes.TEXCOORD_0));
      if (p.attributes.JOINTS_0 !== undefined && p.attributes.WEIGHTS_0 !== undefined) {
        geo.setAttribute('skinIndex', accessor(p.attributes.JOINTS_0));
        geo.setAttribute('skinWeight', accessor(p.attributes.WEIGHTS_0));
      }
      geo.setIndex(accessor(p.indices));
      geo.computeBoundingSphere();
      return { geo, material: materials[p.material ?? 0] ?? new THREE.MeshStandardMaterial() };
    }),
  );
  const inverses = (gltf.skins ?? []).map((skin) => {
    const m = accessor(skin.inverseBindMatrices).array as Float32Array;
    return skin.joints.map((_, i) => new THREE.Matrix4().fromArray(m, i * 16));
  });
  const joints = new Set((gltf.skins ?? []).flatMap((s) => s.joints));
  // Nodes are found by name when a clip is played: every node gets a name of its own.
  const names = gltf.nodes.map((n, i) => THREE.PropertyBinding.sanitizeNodeName(n.name ?? `node${i}`));
  names.forEach((n, i) => {
    if (names.indexOf(n) !== i) names[i] = `${n}_${i}`;
  });
  const PATHS: Record<string, string> = { translation: 'position', rotation: 'quaternion', scale: 'scale' };
  const clips = (gltf.animations ?? []).map((a, i) => {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const c of a.channels) {
      const path = PATHS[c.target.path];
      const s = a.samplers[c.sampler]!;
      if (!path) continue;
      const times = accessor(s.input).array as Float32Array;
      const values = accessor(s.output).array as Float32Array;
      const name = `${names[c.target.node]}.${path}`;
      const track = path === 'quaternion' ? new THREE.QuaternionKeyframeTrack(name, times, values) : new THREE.VectorKeyframeTrack(name, times, values);
      if (s.interpolation === 'STEP') track.setInterpolation(THREE.InterpolateDiscrete);
      tracks.push(track);
    }
    return new THREE.AnimationClip(a.name ?? `clip${i}`, -1, tracks);
  });

  return {
    make() {
      const root = new THREE.Group();
      const bones: Record<string, THREE.Bone> = {};
      const made = gltf.nodes.map((node, i) => {
        const o = joints.has(i) ? new THREE.Bone() : new THREE.Group();
        o.name = names[i]!;
        if (node.translation) o.position.fromArray(node.translation);
        if (node.rotation) o.quaternion.fromArray(node.rotation);
        if (node.scale) o.scale.fromArray(node.scale);
        if (joints.has(i)) bones[o.name] = o as THREE.Bone;
        return o;
      });
      gltf.nodes.forEach((node, i) => {
        for (const c of node.children ?? []) made[i]!.add(made[c]!);
      });
      for (const i of gltf.scenes[gltf.scene ?? 0]!.nodes) root.add(made[i]!);
      const identity = new THREE.Matrix4();
      gltf.nodes.forEach((node, i) => {
        if (node.mesh === undefined) return;
        for (const part of geometry[node.mesh]!) {
          const skin = node.skin !== undefined && part.geo.getAttribute('skinIndex') ? gltf.skins![node.skin]! : null;
          if (!skin) {
            const mesh = new THREE.Mesh(part.geo, part.material);
            mesh.name = `${names[i]}_mesh`;
            made[i]!.add(mesh);
            continue;
          }
          const mesh = new THREE.SkinnedMesh(part.geo, part.material);
          mesh.name = `${names[i]}_mesh`;
          made[i]!.add(mesh);
          mesh.bind(new THREE.Skeleton(skin.joints.map((j) => made[j] as THREE.Bone), inverses[node.skin!]!), identity);
          // The bones move the surface well outside the box it was measured in.
          mesh.frustumCulled = false;
        }
      });
      return { root, bones, clips };
    },
  };
}
