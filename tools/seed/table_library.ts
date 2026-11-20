// Fills the 2D table library with a starting set: the four painted grounds as backgrounds, the 37 sculpted terrain
// elements as pictures from above with their rules shapes, and the maps of the game as official 2D maps.
// Everything comes from frontend/src/lib/eld/maps.ts (KITS, BASES, MAPS), so 2D and 3D tables share one description.
//
//   node --experimental-strip-types tools/seed/table_library.ts            # what would be created (no changes)
//   WB_ADMIN_EMAIL=… WB_ADMIN_PASSWORD=… node --experimental-strip-types tools/seed/table_library.ts --apply
//
// WB_URL: the backend (default http://localhost:8080). The account must have the ADMIN role. Run it again safely:
// backgrounds, elements and maps that already exist under the same name are left alone.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASES, KITS, MAPS, type Kit } from '../../frontend/src/lib/eld/maps.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const URL_BASE = (process.env.WB_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');
/** The pictures show 1.1 units of a model that is 1 unit across (a margin all round). */
const PICTURE = 1.1;
const round2 = (n: number): number => Math.round(n * 100) / 100;

type Vec = { x: number; y: number };
type Shape = { type: 'OBSTACLE' | 'AREA'; points: Vec[]; thickness: number; height: number; envs: string[] };
const ENV: Record<string, string> = { water: 'AQUATIC_SHALLOW', forest: 'FOREST' };
const CATEGORY: Record<string, string> = { building: 'BUILDING', ruin: 'RUIN', rock: 'ROCK', forest: 'FOREST', water: 'WATER', magic: 'OTHER' };

/** A kit at its usual size as a library element: the picture's real size and the shapes in inches around its centre. */
function element(kit: Kit): { name: string; category: string; widthIn: number; heightIn: number; shapes: Shape[] } {
  const size = kit.size[1];
  const shapes: Shape[] = [];
  for (const p of kit.parts) {
    const points = p.shape.map((q) => ({ x: round2(q.x * size), y: round2(q.y * size) }));
    if (p.kind === 'obstacle') shapes.push({ type: 'OBSTACLE', points, thickness: 0, height: round2(p.fixed ? p.height : p.height * size), envs: [] });
    else if (ENV[p.env]) shapes.push({ type: 'AREA', points, thickness: 0, height: round2(p.fixed ? p.height : p.height * size), envs: [ENV[p.env]!] });
  }
  const tree = /tree|pines|bamboo/i.test(kit.name);
  return { name: kit.name, category: tree ? 'TREE' : (CATEGORY[kit.parts[0]!.env] ?? 'OTHER'), widthIn: round2(size * PICTURE), heightIn: round2(size * PICTURE), shapes };
}

const sculpted = KITS.filter((k) => k.model);
const grounds = BASES.filter((b) => b.ground);

// ---- a very small HTTP client with a cookie jar (session cookies and the CSRF double-submit cookie)
const jar = new Map<string, string>();
async function call(method: string, path: string, body?: unknown, raw?: { bytes: Buffer; type: string }): Promise<unknown> {
  const headers: Record<string, string> = { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
  if (method !== 'GET') headers['X-XSRF-TOKEN'] = jar.get('XSRF-TOKEN') ?? '';
  if (raw) headers['Content-Type'] = raw.type;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(URL_BASE + path, { method, headers, body: raw ? new Uint8Array(raw.bytes) : body === undefined ? undefined : JSON.stringify(body) });
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';');
    const at = pair!.indexOf('=');
    if (at > 0) jar.set(pair!.slice(0, at).trim(), pair!.slice(at + 1).trim());
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main(): Promise<void> {
  console.log(`${grounds.length} backgrounds, ${sculpted.length} terrain elements, ${MAPS.filter((m) => !m.terrain).length} maps`);
  for (const kit of sculpted) {
    const e = element(kit);
    if (e.shapes.length === 0) throw new Error(`${kit.id}: no shapes`);
    readFileSync(join(root, 'frontend', 'public', 'terrain3d', 'tops', `${kit.id}.webp`)); // fails early when a picture is missing
    if (!APPLY) console.log(`  element  ${e.name} (${e.category}, ${e.widthIn}" across, ${e.shapes.length} shapes)`);
  }
  if (!APPLY) {
    for (const b of grounds) console.log(`  background  ${b.name} (${b.fixed.length} water areas)`);
    for (const m of MAPS.filter((x) => !x.terrain)) console.log(`  map  ${m.name} (${m.items.filter((i) => KITS.find((k) => k.id === i.kit)?.model).length} of ${m.items.length} elements have a picture)`);
    console.log('Nothing was changed. Add --apply (with WB_ADMIN_EMAIL and WB_ADMIN_PASSWORD) to create them.');
    return;
  }
  const email = process.env.WB_ADMIN_EMAIL;
  const password = process.env.WB_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set WB_ADMIN_EMAIL and WB_ADMIN_PASSWORD');
  await call('GET', '/api/auth/csrf');
  await call('POST', '/api/auth/login', { email, password });
  await call('GET', '/api/auth/csrf');

  const upload = async (file: string, type: string): Promise<string> => ((await call('POST', '/api/admin/table/images', undefined, { bytes: readFileSync(file), type })) as { id: string }).id;

  const haveBg = (await call('GET', '/api/table/backgrounds')) as { id: string; name: string }[];
  const bgId = new Map<string, string>();
  for (const b of grounds) {
    const old = haveBg.find((x) => x.name === b.name);
    if (old) {
      bgId.set(b.id, old.id);
      continue;
    }
    const imageId = await upload(join(root, 'frontend', 'public', 'terrain3d', 'grounds', b.ground!), 'image/jpeg');
    // A stream runs past the edge of the table in the game; a background's areas must stay on the picture.
    const onMat = (q: Vec): Vec => ({ x: Math.min(36, Math.max(0, q.x)), y: Math.min(36, Math.max(0, q.y)) });
    const areas = b.fixed.filter((t) => t.env === 'water').map((t) => ({ points: t.shape.map(onMat), height: 0, envs: ['AQUATIC_SHALLOW'] }));
    const made = (await call('POST', '/api/admin/table/backgrounds', { name: b.name, imageId, widthIn: 36, heightIn: 36, areas })) as { id: string };
    bgId.set(b.id, made.id);
    console.log(`background  ${b.name}`);
  }

  const haveTerrain = (await call('GET', '/api/table/terrain')) as { id: string; name: string }[];
  const assetId = new Map<string, string>();
  for (const kit of sculpted) {
    const e = element(kit);
    const old = haveTerrain.find((x) => x.name === e.name);
    if (old) {
      assetId.set(kit.id, old.id);
      continue;
    }
    const imageId = await upload(join(root, 'frontend', 'public', 'terrain3d', 'tops', `${kit.id}.webp`), 'image/webp');
    const made = (await call('POST', '/api/admin/table/terrain', { ...e, imageId })) as { id: string };
    assetId.set(kit.id, made.id);
    console.log(`element  ${e.name}`);
  }

  const haveMaps = (await call('GET', '/api/table/maps?scope=OFFICIAL')) as { name: string }[];
  for (const m of MAPS.filter((x) => !x.terrain)) {
    if (haveMaps.some((x) => x.name === m.name)) continue;
    const backgroundId = bgId.get(m.base);
    if (!backgroundId) continue;
    // Elements without a picture (plain walls and rocks of the game) are left out of the 2D map.
    const placements = m.items.flatMap((i) => {
      const kit = KITS.find((k) => k.id === i.kit);
      const id = assetId.get(i.kit);
      return kit && id ? [{ assetId: id, x: i.x, y: i.y, rotation: i.turn, scale: round2(i.size / kit.size[1]) }] : [];
    });
    await call('POST', '/api/table/maps', { name: m.name, backgroundId, placements, deploymentDepth: 8, isPublic: true, official: true });
    console.log(`map  ${m.name} (${placements.length} elements)`);
  }
  console.log('Done.');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
