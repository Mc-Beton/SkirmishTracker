# Skirmish Chronicle — notes for AI assistants

- Monorepo: `backend/` (Spring Boot 3.5, Java 21, Gradle Kotlin DSL) and `frontend/` (Next.js 16 — read `frontend/AGENTS.md` before touching it).
- Game rules and content model: `docs/game-content-model.md`. Product plan lives in the "Skirmish Chronicle — plan działania" Claude Doc.
- Security is a hard requirement (OWASP ASVS L2): keep auth cookies HttpOnly, keep CSRF on, never log tokens or passwords, check resource ownership on every endpoint.
- API errors: throw `ApiException(status, "CODE")`; add the code to `frontend/messages/{pl,en}.json` under `errors`.
- DB changes only through new Flyway migrations (`V<n>__*.sql`); `ddl-auto=validate`.
- UI texts always in both `messages/pl.json` and `messages/en.json`.
- `scans/` holds copyrighted rulebook scans — never commit or publish them.
