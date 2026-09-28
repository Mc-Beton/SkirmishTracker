# WarBracket

PWA do prowadzenia turniejów, lig i własnych gier **Eldfall Chronicles**.
Stan projektu, decyzje i dalsze kroki: `HANDOFF.md`.

| Część | Technologia |
| --- | --- |
| `backend/` | Java 21, Spring Boot 3.5, Spring Security, PostgreSQL, Flyway, Gradle |
| `frontend/` | Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui, next-intl (PL/EN) |
| `docker-compose.yml` | PostgreSQL 17 + Mailpit (przechwytuje e-maile w dev) |

## Uruchomienie lokalne

Wymagania: **JDK 21**, **Node.js 22**, **Docker Desktop**.

```bash
# 1. Baza i poczta testowa
docker compose up -d

# 2. Backend  →  http://localhost:8080
cd backend
./gradlew bootRun          # Windows: gradlew.bat bootRun

# 3. Frontend →  http://localhost:3000
cd frontend
npm install
npm run dev
```

E-maile weryfikacyjne i resety hasła zobaczysz w Mailpit: http://localhost:8025

Testy backendu: `./gradlew test` (test integracyjny auth startuje PostgreSQL w Testcontainers — wymaga Dockera, bez niego jest pomijany).

## Logowanie przez Google i Discord (opcjonalnie)

1. Załóż aplikacje OAuth w Google Cloud Console i Discord Developer Portal.
2. Redirect URI: `http://localhost:3000/login/oauth2/code/google` oraz `.../discord`.
3. Uruchom backend z `SPRING_PROFILES_ACTIVE=oauth` i zmiennymi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` (patrz `.env.example`).

## Bezpieczeństwo (etap 0)

- Hasła: Argon2id, min. 12 znaków, odrzucanie oczywistych haseł i haseł z nickiem/e-mailem.
- Sesja: access token JWT (15 min) + rotowany refresh token (30 dni) w ciasteczkach **HttpOnly, SameSite=Lax, Secure na produkcji**. Ponowne użycie starego refresh tokenu unieważnia całą sesję.
- CSRF: double-submit cookie (`XSRF-TOKEN` → nagłówek `X-XSRF-TOKEN`).
- Brute force: blokada konta na 15 min po 5 błędnych hasłach + limit 20 żądań/min/IP na `/api/auth/*`.
- Brak enumeracji kont: rejestracja, reset hasła i ponowna weryfikacja zawsze odpowiadają tak samo.
- OAuth: łączenie kont tylko po zweryfikowanym e-mailu u dostawcy; ochrona przed „pre-hijackingiem”.
- Nagłówki: CSP, HSTS (prod), X-Frame-Options, Referrer-Policy, Permissions-Policy.
- Tokeny e-mail/reset jednorazowe, przechowywane jako SHA-256; wygasłe usuwane codziennie.

**Produkcja:** ustaw `JWT_SECRET` (≥ 32 bajty, losowy), `SECURE_COOKIES=true`, HTTPS, a backend wystaw tylko za reverse proxy / Next.js (nie publicznie), bo limit żądań ufa nagłówkowi `X-Forwarded-For`.

## Struktura

```
backend/src/main/java/com/skirmishchronicle/
  config/     Security, JWT, rate limiting, właściwości aplikacji
  common/     Obsługa błędów (problem+json z kodami), tokeny
  identity/   Konta, sesje, e-maile, OAuth (Google/Discord)
frontend/src/
  app/        Strony: logowanie, rejestracja, weryfikacja, reset hasła, konto
  components/ UI (shadcn), nagłówek, provider sesji
  lib/api.ts  Klient API: CSRF + automatyczne odświeżanie sesji
  messages/   Tłumaczenia PL/EN
docs/         Model danych gry (scenariusze, scheme, rozpiski)
content/      Dane gry do importu (scenariusze, scheme, koszty jednostek)
```

`scans/` (skany podręcznika) jest w `.gitignore` — to materiały chronione prawem autorskim.
