// Mounts (Advanced Rules v1.5): a Rider whose card names a Mount may ride it; the two cards form one model.
// Mount Attributes with + / − modify the Rider's, flat numbers replace them; the Rider gains the Mount's
// Traits, Skills and Inventory, takes its Size, and its bonus HP is lost first.

import type { BaseSize } from './types.ts';
import type { Profile, Weapon } from './profiles.ts';

type Key = 'sta' | 'spd' | 'arm' | 'off' | 'def' | 'acc' | 'int' | 'ag' | 't' | 'm';

export interface Mount {
  id: string;
  name: string;
  size: BaseSize;
  cost: number;
  limit: number;
  /** '+3' / '-2' modify the Rider's Attribute, '9' replaces it. */
  mods: Partial<Record<Key, string>>;
  /** Bonus HP, lost first. */
  hp: number;
  traits: string[];
  skills: string[];
  weapons: Weapon[];
}

export const MOUNTS: Mount[] = [
  {
    id: 'lupus-rex',
    name: 'Lupus Rex',
    size: 'huge',
    cost: 5,
    limit: 2,
    mods: { spd: '9', arm: '-2', def: '+3', t: '+2' },
    hp: 1,
    traits: ['Acute Senses', 'Vigilance'],
    skills: ['Hit and Retreat'],
    weapons: [{ name: 'Bite & Claws', pw: '13', rch: '0', stk: '2', type: 'Melee, Natural' }],
  },
];

export const mountById = (id: string | undefined): Mount | undefined => MOUNTS.find((m) => m.id === id);

/** The Rider's card while it rides the Mount. */
export function mounted(p: Profile, mount: Mount): Profile {
  const out: Profile = { ...p, size: mount.size, traits: [...p.traits], skills: [...p.skills], weapons: [...p.weapons, ...mount.weapons] };
  for (const [key, v] of Object.entries(mount.mods) as [Key, string][]) {
    out[key] = /^[+-]/.test(v) ? Math.max(0, p[key] + Number(v)) : Number(v);
  }
  for (const t of mount.traits) if (!out.traits.includes(t)) out.traits.push(t);
  for (const s of mount.skills) if (!out.skills.includes(s)) out.skills.push(s);
  return out;
}
