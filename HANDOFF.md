# WarBracket – przekazanie projektu

Plik dla osoby (i dla Claude) przejmującej pracę na nowym urządzeniu. Stan na **28.09.2026 (wieczór)**.
Claude: przeczytaj najpierw ten plik, potem `CLAUDE.md`, `README.md` i dokumenty z `docs/`.

## 1. Czym jest projekt

**WarBracket** (dawniej Skirmish Chronicle) to aplikacja PWA (mobile first) do prowadzenia turniejów, lig i własnych gier
w bitewniaku **Eldfall Chronicles**. Autor i właściciel produktu: Filip. Interfejs po polsku i angielsku.

Najważniejsze możliwości (wszystko działa lokalnie u Filipa):

- konta (e-mail + hasło, opcjonalnie Google/Discord), profil, ranking ELO;
- turnieje indywidualne i drużynowe (2–5 graczy): **Swiss**, **eliminacje**, **round robin**, opcjonalny top cut;
- zapisy, lista rezerwowa, wyzwania na 1. rundę, pary organizatora;
- plan rund: scenariusz, metoda parowania, kolejność stołów (losowo / wg punktów), czas rundy;
- wyniki: gracz wpisuje, przeciwnik potwierdza **tylko jeśli ma to włączone w ustawieniach konta**
  (domyślnie wynik jest od razu ostateczny); organizator może ustawić każdy wynik;
- tryb szczegółowy gry: punkty tura po turze (oboje gracze mogą wpisywać obie strony), losowanie scheme;
- rozpiski (warbandy) z walidacją z `content/units.xlsx` i `content/items.xlsx`;
- kary, tabela, klasyfikacja końcowa (dla drużyn: drużyny + wyniki ich graczy), drabinka;
- zegar rundy, wezwanie sędziego, powiadomienia w aplikacji (dzwonek, bez e-maili);
- odświeżanie na żywo (SSE) i tryb offline: wyniki i punkty tur wpisane bez zasięgu wysyłają się po powrocie sieci;
- ligi (punkty z turniejów × mnożnik rangi, gry własne, ELO ligowe), gry własne z rozpiskami;
- statystyki w profilu (postacie, frakcje, misje – wykresy).

## 2. Technologia i struktura

| Część | Technologia |
| --- | --- |
| `backend/` | Java 21, Spring Boot 3.5, Spring Security (JWT w ciasteczkach HttpOnly + CSRF), JPA, PostgreSQL, Flyway, Gradle (Kotlin DSL) |
| `frontend/` | Next.js 16 (App Router, Turbopack), React 19, Tailwind 4, komponenty w stylu shadcn/ui, next-intl |
| `docker-compose.yml` | PostgreSQL 17 + Mailpit (poczta testowa, http://localhost:8025) |

```
backend/src/main/java/com/skirmishchronicle/
  identity/      konta, logowanie, sesje, ustawienia (MeController)
  tournament/    turnieje, rundy, drużyny, gry, rozpiski (domain / repo / service / web)
  pairing/       silniki parowań bez frameworka: SwissPairer (Blossom), KnockoutBracket, RoundRobinSchedule
  rating/        ELO (start 1500, K = 32)
  league/ friendly/ profile/ notification/ content/ audit/ config/ common/
backend/src/main/resources/db/migration/   V1 … V12 (Flyway)
backend/src/main/resources/content/        eldfall-core.json, eldfall-armies.json (z tools/import_units.py)
frontend/src/app/                          strony (tournaments, leagues, players, games, account, scenarios…)
frontend/src/components/                   komponenty (tournaments/, ui/, notifications/, warbands/…)
frontend/messages/pl.json, en.json         wszystkie teksty UI
tools/                                     import treści z Excela, skrypty z danymi testowymi (tools/seed)
docs/                                      opisy reguł (patrz sekcja 7)
content/                                   units.xlsx, items.xlsx – źródło rozpisek
scans/                                     skany podręcznika – NIE commitować, NIE publikować
```

## 3. Uruchomienie lokalne (Windows)

Wymagania: JDK 21, Node.js 22, Docker Desktop.

```powershell
docker compose up -d                     # baza + Mailpit
cd backend;  .\gradlew.bat bootRun       # http://localhost:8080 (migracje Flyway odpalają się same)
cd frontend; npm install; npm run dev    # http://localhost:3000
```

- Testy backendu: `.\gradlew.bat build` (testy integracyjne używają Testcontainers – potrzebny Docker).
- Frontend przed oddaniem: `npx tsc --noEmit`, `npx eslint src`, `npx next build`.
- Błąd `EBUSY … .next\dev\types\…` na Windows: zatrzymaj wszystkie `node.exe`, usuń `frontend\.next`,
  uruchom ponownie; pomaga wykluczenie `frontend\.next` w Windows Defender.

## 3a. Produkcja (https://warbracket.pl)

- Serwer Hetzner Cloud `46.225.172.142` (Ubuntu 24.04, 4 GB), logowanie `ssh root@46.225.172.142` kluczem Filipa.
- Stos w Dockerze: Caddy (HTTPS z Let's Encrypt, www → bez www) → frontend → backend → PostgreSQL 17
  + codzienny `pg_dump` (14 dni, wolumen `warbracket_backups`). Konfiguracja: `deploy/`, opis: `deploy/README.md`.
- Sekrety tylko na serwerze w `/opt/warbracket/.env` (hasło bazy, JWT, SMTP) – nigdy w repo.
- Wdrożenie: commit, potem `./deploy/deploy.sh` z Git Bash (wysyła ostatni commit, przebudowuje kontenery).
- Poczta: Brevo (SMTP `smtp-relay.brevo.com:587`, nadawca `no-reply@warbracket.pl`); DNS domeny w panelu
  hosting.domena.pl → Delegacje (rekordy Brevo: `brevo-code`, DKIM `brevo1/2._domainkey`, DMARC `p=none` –
  do zaostrzenia na `quarantine`/`reject`, gdy raporty będą czyste).
- `frontend/package-lock.json` generować w Linuksie, gdy Windows pominie zależności opcjonalne:
  `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/frontend:/app" -w /app node:22-bookworm-slim npm install --package-lock-only`.
- Stara aplikacja (repozytoria TourneyTracker, TourneyTracker-Front) usunięta z serwera 28.09.2026.

## 4. Zasady, których pilnujemy

- **Bezpieczeństwo (OWASP ASVS L2):** ciasteczka sesji HttpOnly, CSRF włączony, nigdy nie logujemy tokenów
  ani haseł, na każdym endpoincie sprawdzamy własność zasobu (IDOR). Backend nie ma być wystawiony publicznie
  (tylko za frontendem / reverse proxy).
- **Błędy API:** `throw new ApiException(status, "KOD")`, a kod dopisujemy do `errors` w `pl.json` i `en.json`.
- **Baza:** zmiany wyłącznie nowymi migracjami `V<n>__opis.sql` (Hibernate ma `ddl-auto=validate`).
  Następna wolna: **V13**.
- **Teksty UI:** zawsze w obu plikach `messages/pl.json` i `messages/en.json`.
- **Mobile first:** żaden widok nie może przewijać się na boki na telefonie (~390 px). Tabele na telefonie
  chowają kolumny (`hidden sm:table-cell`) i pokazują skrót pod nazwą.
- **Wygląd:** jeden ciemny motyw (granat + cyjan), tokeny w `frontend/src/app/globals.css`, `<html class="dark">`.
  Logo/ikony PWA: `frontend/public/icon-*.png`, `logo.png`, `src/app/icon.png`, `apple-icon.png`, `favicon.ico`.
- **Prawa autorskie:** nie przepisujemy tekstu podręcznika dosłownie; `scans/` nigdy do repo ani do sieci.
- W JPA: encję uzupełniamy **przed** `save()` (Hibernate wstawia stan z chwili `persist`).

## 5. Ustalone reguły gry i turnieju

- **Swiss:** jedna gra na rundę, bez rewanżów, BYE maks. raz (dla najsłabszego). Kolejność w tabeli: wygrane →
  duże punkty (minus kary) → małe punkty; remis liczy się jak porażka w liczbie wygranych, BYE jak wygrana.
  Parowanie to dopasowanie o minimalnym koszcie. Koszty są leksykograficzne, w kolejności ważności:
  różnica wygranych → preferencje miękkie (klub > frakcja > miasto) → kto spada do niższej grupy
  (najniżej sklasyfikowany) → kwadrat odległości w tabeli. Dwie ostatnie reguły działają do 64 uczestników,
  powyżej jest prostsze liczenie liniowe (ochrona przed przepełnieniem liczb).
- **Runda 1:** losowo / ELO silny z silnym / ELO górna połowa vs dolna. Plan rund może nadpisać metodę dowolnej rundy.
- **Eliminacje:** pojedyncze, rozstawienie potęgą dwójki z BYE dla najwyżej rozstawionych; remis → przechodzi wyżej rozstawiony.
- **Drużyny:** stała wielkość 2–5; kapitan zakłada drużynę i zaprasza, organizator może dodać/usunąć/wycofać.
  Mecz drużynowy to gry plansza w planszę; skład domyślnie z kolejności w drużynie, kapitan (lub organizator)
  zmienia go do startu rundy, a skład przeciwnika jest ukryty. Wynik meczu: liczba wygranych gier → suma
  dużych → suma małych → remis. Opcja organizatora: unikalne frakcje w drużynie.
- **Ligi:** każdy może założyć ligę, organizator zgłasza turniej, właściciel ligi akceptuje. Punkty z turnieju:
  tabela miejsc albo duże punkty × mnożnik rangi (Lokal / Master / International). Gry własne liczą się,
  gdy obaj gracze są w lidze (W/R/P × mnożnik).
- **Gry własne:** zawsze potwierdza przeciwnik (ustawienie potwierdzania z konta dotyczy na razie tylko turniejów).
- **Treści:** Undead tylko jako sojusznik Oni; Adventurers Guild dostępny dla 4 głównych frakcji i jako
  samodzielna rozpiska; Monster Factions = Oni i Gobliny. Wzmocnienia neutralne dla wszystkich, frakcyjne
  wg frakcji rozpiski; walidujemy tylko sumę punktów.

## 6. Dane testowe (tylko lokalnie)

- `tools/seed/test1_games.sql` – 18 gier własnych z rozpiskami dla konta **test1**.
- `tools/seed/stats_player.sql` – gotowe konto **Tester** (`seed-tester@example.invalid`, hasło `DruzynyTest2026`)
  z 20 zatwierdzonymi grami własnymi (rozpiski, misje) i 12 grami między jego przeciwnikami; nie wymaga
  wcześniej założonego konta. Generator: `tools/seed/make_stats_player.py`.
- `tools/seed/team_tournament.sql` – dopisuje 5 pełnych drużyn 3-osobowych do najnowszego otwartego
  turnieju drużynowego. Konta: e-mail `seed-<nick>@example.invalid`, hasło `DruzynyTest2026`
  (np. `seed-borvin@example.invalid`, kapitan Stalowej Straży).
- `tools/seed/round_results.sql` – wpisuje losowe zatwierdzone wyniki bieżącej rundy wskazanego turnieju
  (ID turnieju na górze pliku).
- Uruchamianie (PowerShell): `Get-Content tools/seed/<plik>.sql | docker compose exec -T postgres psql -U skirmish -d skirmish`.
  W Git Bash: `docker compose exec -T postgres psql -U skirmish -d skirmish < tools/seed/<plik>.sql`.
- `tools/seed/demo_meta.sql` – **dane DEMO do raportów wydawcy**: 48 graczy (PL/PT/ES/DE), 18 zakończonych
  turniejów i ~420 gier własnych (styczeń–wrzesień 2026) z ukrytymi efektami balansu do pokazania w panelu.
  Konto wydawcy: `demo-wydawca@example.invalid` / `DruzynyTest2026`. Wszystko oznaczone `[DEMO]`;
  usuwanie: `tools/seed/demo_meta_remove.sql`. Generator i opis efektów: `tools/seed/make_demo_meta.py`.

## 6a. Raporty dla wydawcy (/admin/reports)

- Dostęp: role `ADMIN` i `PUBLISHER` (tylko odczyt raportów, `GET /api/admin/reports/**`). Rolę nadaje się w bazie:
  `INSERT INTO user_roles (user_id, role) SELECT id, 'PUBLISHER' FROM users WHERE email = '…';` – potem ponowne logowanie.
- Backend: pakiet `analytics` – `AnalyticsService` buduje fakty (jedna strona jednej gry: frakcja, postacie,
  przedmioty, misja, ELO obu graczy sprzed gry), `MetaStats` liczy raport (czysta Java, testy `MetaStatsTest`).
- Metodologia: gry lustrzane poza wynikiem frakcji, 95% przedział Wilsona, wynik oczekiwany z ELO
  (`Elo.preGame`), wiersze z < 5 graczami ukryte (prywatność), < 20 gier = „za mało danych”.
- Przedmioty: popularność, wynik z/bez i ponad ELO, wykres koszt a efekt, „martwe” przedmioty (< 2% rozpisek),
  najczęstszy nosiciel (≥ 80% = efekt nieoddzielny od postaci), udział lidera i kosztu obniżonego; obciążenie
  sprzętem (lekki 0–1 / średni 2–3 / ciężki 4+ przedmiotów, udział punktów na przedmioty).
- Przebieg gry (tylko gry turniejowe w trybie szczegółowym): od której tury zwycięzca prowadzi do końca, comebacki
  (zwycięzca przegrywał po połowie gry), PZ ze scenariusza i schematów w turach i per frakcja; schematy:
  jak często wylosowane / zatrzymane, PZ ze schematów i wynik gier, w których je zatrzymano.
- Porównanie przed / po dacie (np. errata): dwa zapytania z tymi samymi filtrami, zmiana wyniku frakcji, postaci
  i przedmiotów z testem dwóch proporcji (95%) – liczone w przeglądarce (`components/reports/comparison.tsx`).
- Frontend: `app/admin/reports`, wykresy w `components/reports`, CSV generowany w przeglądarce (`lib/reports.ts`).

## 6b. Program oficjalny: sezony i oficjalne turnieje

- Wydawca (`PUBLISHER`) lub admin oznacza turnieje jako oficjalne (`/admin/seasons`, zapis w dzienniku zmian)
  i zakłada sezony (migracja V14: `tournaments.official*`, tabela `seasons`).
- Ranking sezonu (`/seasons`, publiczny): zakończone, oficjalne, indywidualne turnieje z okresu sezonu; punkty za
  miejsce = punkty za wygranie w danej randze × (gracze − miejsce + 1) / gracze; liczy się N najlepszych wyników
  (`SeasonScoring`, testy `SeasonScoringTest`). Do tego lista aktywnych organizatorów (Guildmasterzy).
- Plakietka „Oficjalny” na kartach i stronach turniejów. Menu poziome od szerokości `xl`, niżej menu rozwijane.

## 7. Dokumentacja w repo

- `docs/game-content-model.md` – model treści gry (frakcje, postacie, scheme, scenariusze).
- `docs/pairing.md` – algorytm Swiss.
- `docs/formats-leagues.md` – eliminacje, round robin, top cut, ligi, ELO, profile, gry własne.
- `docs/teams-timer-notifications.md` – drużyny, zegar rundy, powiadomienia, wezwanie sędziego.
- `docs/offline-live.md` – odświeżanie na żywo (SSE), service worker, kolejka zmian offline, test ręczny.
- Dawny „plan działania” był w Claude Docs na poprzednim koncie – na nowym koncie jest niedostępny;
  jego aktualna treść jest w tym pliku.

## 8. Co dalej (kolejność proponowana)

Zrobione 28.09: **porządki w repo** (repo `github.com/Mc-Beton/SkirmishTracker`, pliki z kropką, CI),
**testy turnieju drużynowego** (Filip), **zmiana nazwy na WarBracket** (pakiet Java `com.skirmishchronicle`
i baza `skirmish` bez zmian) oraz **PWA offline + odświeżanie na żywo** (`docs/offline-live.md`).
Do sprawdzenia u Filipa: `.\gradlew.bat build` z nowymi testami (`LiveEventServiceTest`,
`GameFlowIntegrationTest.liveStreamIsPublicAndStaysOpen`) i test ręczny offline z `docs/offline-live.md`.

1. **Wydruki:** karty parowań, karty wyników na stoły, tabela końcowa w PDF.
2. **Start publiczny:** wdrożenie (serwer, domena, HTTPS, backupy bazy, monitoring), polityka prywatności
   i regulamin (RODO, usuwanie konta), przegląd bezpieczeństwa / pentest. Przy kilku instancjach backendu
   rejestr połączeń SSE trzeba przenieść na brokera (patrz `docs/offline-live.md`).
3. **Konta:** 2FA (TOTP), sprawdzanie haseł w HIBP.
4. **Treści:** mapy scenariuszy, wzmocnienia Oni/Goblinów/AG (jeśli istnieją – brak w Excelu), INT postaci
   z danych zamiast ręcznego wpisywania.

## 9. Otwarte pytania do Filipa

- Czy ustawienie „potwierdzam wynik przeciwnika” ma obejmować też gry własne?
- Czy pasek statusu i box „Wezwania sędziego” w panelu organizatora też mają się zwijać
  (teraz celowo zostają rozwinięte)?
- Hosting produkcyjny: gdzie (VPS, chmura) i jaka domena?
