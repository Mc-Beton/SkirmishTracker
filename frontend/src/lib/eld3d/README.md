# 3D scene of the online table

Ported from the game Eldfall Table (`client/src/scene`): `glb.ts`, `materials.ts`, `relief.ts`, `sanctuary.ts`,
`world.ts` are the game's files with the imports pointed at `@/lib/eld`; `terrain.ts` also reads its models from
`ASSETS` (`assets.ts`); `figures.ts` has no sculpts and adds `buildHidden`; `scene.ts` is the game's `TableScene`
without sculpts, animation and Spell effects, with tokens, covered figures, switchable Deployment Zones (belts or
corners) and rules shapes, and a table that is rebuilt by content (WarBracket hands over a copy of the state after
every event). The game's `sculpts.ts` and `fx.ts` are not here on purpose.

Used only by `components/table/game/game-board-3d.tsx`, which is loaded with `next/dynamic` and `ssr: false`:
nothing here may be imported by a page that is rendered on the server. ESLint skips this folder.
