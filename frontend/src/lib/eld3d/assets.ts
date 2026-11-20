/** Where the models (`models/<file>.glb`) and the painted grounds (`grounds/<file>.jpg`) of 3D tables are served. */
export const ASSETS = '/terrain3d';

/** `full`: the models as prepared for the game; `light`: smaller textures and a coarser mesh (about a third of the size). */
export type ModelSet = 'light' | 'full';
let modelSet: ModelSet = 'full';

/** Which models the scenes built from now on load. */
export function setModelSet(set: ModelSet): void {
  modelSet = set;
}

export const modelUrl = (file: string): string => `${ASSETS}/${modelSet === 'light' ? 'models-light' : 'models'}/${file}`;
