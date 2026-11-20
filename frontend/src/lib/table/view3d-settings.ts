// How a player wants the 3D table drawn. Kept in the browser when the player asks for it.

import type { ModelSet } from "@/lib/eld3d/assets";
import type { SceneOptions } from "@/lib/eld3d/scene";

export type View3dSettings = SceneOptions & { models: ModelSet };
export type View3dPreset = "low" | "medium" | "high";

export const VIEW3D_PRESETS: Record<View3dPreset, View3dSettings> = {
  low: { models: "light", shadows: "off", sharp: false, surroundings: false, grass: false },
  medium: { models: "light", shadows: "low", sharp: true, surroundings: true, grass: false },
  high: { models: "full", shadows: "high", sharp: true, surroundings: true, grass: true },
};

const KEY = "wb.table3d.settings";
const same = (a: View3dSettings, b: View3dSettings): boolean =>
  a.models === b.models && a.shadows === b.shadows && a.sharp === b.sharp && a.surroundings === b.surroundings && a.grass === b.grass;

/** The preset these settings are, or null when the player changed something by hand. */
export const presetOf = (s: View3dSettings): View3dPreset | null => (["low", "medium", "high"] as const).find((p) => same(VIEW3D_PRESETS[p], s)) ?? null;

export function readView3dSettings(): View3dSettings | null {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<View3dSettings>;
    const d = VIEW3D_PRESETS.medium;
    return {
      models: s.models === "full" || s.models === "light" ? s.models : d.models,
      shadows: s.shadows === "off" || s.shadows === "low" || s.shadows === "high" ? s.shadows : d.shadows,
      sharp: typeof s.sharp === "boolean" ? s.sharp : d.sharp,
      surroundings: typeof s.surroundings === "boolean" ? s.surroundings : d.surroundings,
      grass: typeof s.grass === "boolean" ? s.grass : d.grass,
    };
  } catch {
    return null;
  }
}

/** `null` forgets them. */
export function keepView3dSettings(s: View3dSettings | null): void {
  try {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
    else window.localStorage.removeItem(KEY);
  } catch {
    // private mode: asked again next time
  }
}
