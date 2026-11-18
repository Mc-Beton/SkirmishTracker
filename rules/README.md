# Rules service

The online table plays by the engine of the Eldfall Table game. The engine is TypeScript and lives in
`frontend/src/lib/eld` (the browser uses it for previews and to fold the event log); this service runs the same
files for the backend, which stays the keeper of accounts, tables, the event log and the Scheme cards.

- `service.ts` – `create`, `join`, `command`: events in, events out. Recent tables are kept folded in memory;
  with a missing or stale copy the service answers `409 NEED_LOG` and the backend sends the whole log.
- `mapping.ts` – a saved WarBracket list -> a party, a map's rules shapes -> terrain, quest codes.
- `server.ts` – the HTTP front (`POST /create`, `/join`, `/command`, `GET /health`).

Run in this folder (Node 22.18 or newer, no packages to install):

```
npm start     # port 8090, or PORT=...
npm test
```

`RULES_KEY`: when set, requests must carry it in `X-Rules-Key` (the backend sends `app.rules-key`).
The service must never be reachable from the internet: it trusts the side it is told a command comes from.
