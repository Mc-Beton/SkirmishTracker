# Game engine of the online table

The rules of Eldfall Table (the 3D game), used by the online table in two places:

- the **browser** folds the event log with `apply` and uses the same checks for previews
  (`checkMove`, `planAttack`, `sight`, …);
- the **rules service** (`/rules`) runs `decide` for the backend. It decides; the browser only draws.

The files are the game's `shared/` folder with three differences:

1. imports carry the `.ts` extension, and `RuleError` has no parameter properties – so Node runs the
   files directly (type stripping) and no build step is needed;
2. WarBracket additions, all marked `WarBracket` in the code: corner Deployment Zones (`deploy: 'corner'`),
   `CONCEDE`, and tokens the players place by hand (`ADD_MARKER`, `MOVE_MARKER`, `REMOVE_MARKER`) for
   Quests the engine does not run itself;
3. nothing else. When the game's rules change, copy its `shared/*.ts` over these files again and re-apply 1–2
   (the tests in `/rules/tests` are the game's own and must stay green).

ESLint skips this folder; TypeScript checks it with the rest of the frontend.
