# Tryb offline (PWA) i odświeżanie na żywo

## Odświeżanie na żywo (SSE)
- `GET /api/live?t=<id turnieju>` (do 5 turniejów) – strumień Server-Sent Events. Publiczny: anonim dostaje
  tylko zdarzenia turniejów, zalogowany także `notifications` (zmiana jego skrzynki powiadomień).
- Zdarzenia to **wyłącznie podpowiedzi** (`{"id","kind"}` albo `{}`), nigdy dane. Klient pobiera świeże dane
  zwykłym REST API, które sprawdza uprawnienia – strumień nie może ujawnić niczego ponad API.
- Źródła zdarzeń: `TournamentChangeInterceptor` (każda udana zmiana pod `/api/tournaments/{id}/**`, więc
  wyniki, rundy, zegar, drużyny, wezwania sędziego…) oraz `NotificationService.notify` (po commicie transakcji).
- Limity: 6 strumieni na użytkownika / adres IP, 5000 łącznie, strumień zamykany po 10 min (klient łączy się
  ponownie z odświeżeniem sesji), heartbeat co 15 s (proxy Next.js zrywa połączenie po 30 s ciszy).
  Nagłówek `Cache-Control: no-transform` wyłącza kompresję w proxy (inaczej zdarzenia by się buforowały).
- Rejestr połączeń jest w pamięci – przy kilku instancjach backendu trzeba go przenieść na brokera
  (np. Postgres LISTEN/NOTIFY albo Redis pub/sub).
- Frontend: `src/lib/live.ts` – jedno połączenie na kartę, `useLiveRefresh(tournamentId | null, fn)`,
  `useLiveConnected()`. Odpytywanie zostało tylko jako zapas, gdy strumień nie działa (dzwonek co 30 s,
  wezwania sędziego w panelu organizatora co 20 s).

## Offline
- Service worker `public/sw.js`, rejestrowany tylko w buildzie produkcyjnym (testuj przez
  `npm run build && npm run start`, nie `npm run dev`):
  - `/_next/static/*` i ikony – najpierw cache;
  - strony – najpierw sieć, bez sieci ostatnia zapisana wersja strony, a gdy jej nie ma – `/offline`;
  - wybrane `GET /api/*` (dane turnieju, gra, `/api/me`, treści gry) – najpierw sieć, bez sieci kopia z cache
    (nagłówek `X-WarBracket-Offline: 1`). Przy wylogowaniu strona prosi SW o usunięcie tych danych.
- Kolejka zmian (`src/lib/offline-queue.ts`, IndexedDB): punkty tur, zakończenie gry, zgłoszenie wyniku,
  potwierdzenie/zgłoszenie błędu i wynik ustawiany przez organizatora w widoku turnieju. Bez sieci zmiana
  trafia do kolejki, widok aktualizuje się od razu. Po powrocie sieci zmiany idą po kolei przez zwykły klient
  API (CSRF, odświeżenie sesji). Zmiana odrzucona przez serwer (np. runda już zamknięta) ląduje na liście
  „Nie zapisano” w pasku u góry; błąd sieci/401/5xx zatrzymuje wysyłanie do następnej próby.
- Nowsza zmiana tej samej rzeczy zastępuje starszą (np. ta sama tura tego samego gracza).
- Zmiany są przypisane do użytkownika – po zalogowaniu innej osoby na tym samym urządzeniu nie zostaną wysłane.
- Akcje wymagające serwera (losowanie scheme, zapisy, wezwanie sędziego) bez sieci pokazują błąd `OFFLINE`.

## Test ręczny (kryterium z planu)
1. `npm run build && npm run start`, zaloguj się jako gracz, otwórz ekran prowadzenia gry (runda w trakcie).
2. DevTools → Network → Offline (albo tryb samolotowy na telefonie).
3. Wpisz punkty kilku tur, kliknij „Zakończ grę” – pasek u góry pokazuje liczbę zmian czekających na wysłanie.
4. Odśwież stronę offline – punkty nadal widoczne (dane z cache + zmiany z kolejki).
5. Włącz sieć – pasek pokazuje wysyłanie, potem znika; wynik jest zgłoszony, przeciwnik widzi go od razu
   (na drugim urządzeniu bez odświeżania).
