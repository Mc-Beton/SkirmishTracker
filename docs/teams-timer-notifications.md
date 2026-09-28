# Drużyny, zegar rundy, powiadomienia, wezwanie sędziego (etap 5)

## Turnieje drużynowe
- Włączane w kreatorze: *Rodzaj turnieju* → drużynowy, 2–5 graczy (stała wielkość). Zmiana trybu/wielkości tylko, dopóki nikt się nie zapisał (`TEAM_SIZE_LOCKED`). `maxPlayers` oznacza wtedy limit drużyn.
- Opcja organizatora: **unikalne frakcje w drużynie** – zapis rozpiski z frakcją, którą gra już kolega z drużyny, kończy się `FACTION_TAKEN_IN_TEAM`.
- Zapisy: kapitan zakłada drużynę (zostaje członkiem nr 1), zaprasza graczy z kontem (wyszukiwarka), zaproszeni akceptują/odrzucają. Zaakceptowani stają się uczestnikami turnieju. Indywidualny zapis zwraca `TEAM_TOURNAMENT`.
- Organizator: dodaje gracza po nicku, usuwa członków/drużyny, w trakcie turnieju wycofuje drużynę (jej gracze są oznaczeni jako wycofani).
- Runda 1 wymaga, by każda niewycofana drużyna była pełna (`TEAM_INCOMPLETE`).
- Formaty: Swiss (plan rund: metoda parowania, kolejność stołów, scenariusz, czas), round robin, eliminacja oraz top cut – wszystko na poziomie drużyn. Rozstawienie RR/KO: losowo albo wg średniego ELO członków.
- Mecz drużynowy = gry plansza w planszę: plansza 1 vs plansza 1 itd.; stoły `(mecz − 1) × wielkość + plansza`. Drużyna z BYE dostaje BYE na każdej planszy.
- **Skład**: domyślnie kolejność z listy drużyny (kapitan ją ustawia strzałkami). Po sparowaniu rundy (status PAIRED) kapitan – albo organizator – zmienia ustawienie dla danego meczu (`PUT /team-matches/{id}/lineup`). Skład przeciwnika i gry pojedyncze są ukryte do startu rundy. Kapitanowie dostają powiadomienie `LINEUP_REQUIRED`.
- **Wynik meczu**: najpierw liczba wygranych gier, potem suma dużych punktów, potem suma małych; inaczej remis. W drabince remis → przechodzi wyżej rozstawiona drużyna.
- **Tabela drużynowa**: wygrane mecze → duże punkty (minus kary członków) → małe punkty. Obok zostaje tabela indywidualna (bez drabinki).
- API: `GET/POST /api/tournaments/{id}/teams`, `PUT/DELETE /teams/{teamId}`, `POST /teams/{teamId}/invite|accept|decline|drop|members`, `DELETE /teams/{teamId}/members/{userId}`, `PUT /teams/{teamId}/order`, `PUT /team-matches/{id}/lineup`, `GET /team-standings`. `GET /teams` i `/team-standings` są publiczne.

## Zegar rundy
- Czas rundy w planie rund (kolumna *Czas (min)*) albo ustawiany w panelu organizatora. Start rundy uruchamia zegar; organizator pauzuje/wznawia i dodaje/odejmuje po 5 min.
- Wszyscy widzą odliczanie (widok rund, prowadzenie gry); ostatnie 5 min na czerwono, potem „Czas minął”. Serwer co 15 s sprawdza zegary i wysyła `TIME_UP` graczom i organizatorowi.

## Wezwanie sędziego
- Gracz przy stole (runda w trakcie) klika „Wezwij sędziego” (opcjonalna notatka). Jedno otwarte wezwanie na stół. Organizator dostaje powiadomienie i listę wezwań w panelu (odświeżana co 20 s), oznacza je „Rozwiązane”.

## Powiadomienia w aplikacji
- Dzwonek w nagłówku: licznik nieprzeczytanych, lista, „Oznacz wszystkie”; odświeżanie co 30 s i po powrocie do karty. Bez e-maili. Powiadomienia starsze niż 60 dni są usuwane.
- Typy: ROUND_STARTED, TIME_UP, RESULT_TO_CONFIRM, RESULT_SET_BY_ORGANIZER, CHALLENGE_RECEIVED, LIST_STATUS_CHANGED, PROMOTED_FROM_WAITLIST, TEAM_INVITATION, LINEUP_REQUIRED, GAME_TO_CONFIRM, GAME_CONFIRMED, GAME_REJECTED, LEAGUE_SUBMISSION, LEAGUE_DECISION, NEW_REGISTRATION, RESULT_DISPUTED, WARBAND_SUBMITTED, JUDGE_CALL. Treść tłumaczy klient (`notifications.types.*`).

## Migracje
- `V10__notifications_timer_judge.sql`, `V11__teams.sql`.

## Testy
- `TeamsAndTablesIntegrationTest` (drużyny Swiss ze składami, KO drużyn z remisem, zegar, sędzia, powiadomienia), `TeamScoringTest` (reguły wyniku meczu i tabeli).
