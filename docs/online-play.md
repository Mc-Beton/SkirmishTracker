# Gra online (stół WarBracket)

Partie Eldfall Chronicles (skirmish, **1 vs 1**) rozgrywane w przeglądarce; gracze rozmawiają obok (np. Discord).
Później: turnieje online w tym samym module.

Stan na 12.10.2026: **Etapy 0–2 gotowe w kodzie** (niezacommitowane, patrz §8).

## 1. Co poprawiamy względem wartable.online

| Problem w War Table | U nas |
| --- | --- |
| Rzut tylko jedną kością k20 | 1–20 kości naraz, sukces ≤ atrybut, 1 = Critical Hit (przy atrybucie > 20 także 20). Rzuca **serwer**; skróty „rzuć na OFF/DEF/…” biorą wartość efektywną modelu. |
| Ruch bez limitu | Walk = SPD, Run = 2×SPD (efektywne SPD po stanach), liczy się **cała trasa** w ramach aktywacji. |
| Ścieżka przez teren | Teren wyższy niż hitbox blokuje (trasa ucięta przy kontakcie podstawki), niższy – za darmo; Unscalable tylko z Climbing; Difficult / Mountainous / woda 2″ za 1″ (Survival, Flicker, Flying ignorują); wróg kończy ruch w kontakcie (Engaged obu), sojusznik przepuszcza, ale nie można na nim stanąć; podstawka zostaje na stole. |
| Brak linii wzroku | LoS 180° z wybranego modelu: obszar widzenia, wrogowie na czerwono, sojusznicy na zielono, reszta przygaszona z powodem; blokują teren, modele, 2 lasy; Vigilance / Flying / ruch = 360°; Dark = tylko Awareness (nie dla Coalition). |
| Stany bez skutków | Stany zmieniają statystyki od razu (karta pokazuje wartość efektywną, zmienione podświetlone). |
| Brak HP/AP | HP z ranami (0 → Incapacitated + Crouched, kolejna rana → Dead), AP = STA w fazie Upkeep, aktywacja i reakcja zużywają AP, koniec tury zeruje. |
| Brak cofania | Cofanie własnych działań **tylko w swojej turze** i **nigdy po rzucie kośćmi** (np. po reakcji przeciwnika z rzutem). |

## 2. Zasady w silniku (Core Rules v1.6 + errata IV 2026)

- Cale, plan z góry, (0,0) w lewym górnym rogu. Gracz 1 (A) rozstawia się przy dolnej krawędzi, gracz 2 (B) przy górnej.
- Hitbox = walec, podstawka × wysokość (mm): Small 25×25, Medium 32×45, Large 40×45, Huge 50×50, Gigantic 60×60,
  Colossal 80×80, Epic 100×100. Crouched / Dead: hitbox = podstawka.
- Odległość = między najbliższymi punktami hitboxów; ruch mierzony środkiem podstawki.
- Statystyki efektywne: najpierw modyfikatory stałe (wierzchowiec, Weakened –1 STA), potem połowienie / podwajanie
  z zaokrągleniem w górę po każdym kroku; połowa i podwojenie tej samej cechy się znoszą (errata).
  Crouched ½ SPD, ½ ARM · Confused ½ OFF/DEF/ACC/INT/AG/M · Crippled ½ SPD, ½ AG · Slowed ½ SPD · Weakened ½ T,
  –1 STA · Flying ×2 SPD · woda (bez Survival) ½ AG.
- Przebieg tury: faza strategiczna (Fatigued aktywnego gracza mija) → Upkeep (AP = STA dla wszystkich, poza
  Dead / Incapacitated / Fatigued) → aktywacje → koniec tury (wszystkie AP przepadają) → druga tura rundy.
- Automatycznie: Incapacitated przy 0 HP (+ Crouched), Dead przy ranie Incapacitated, Flying znika przy Crouched /
  Incapacitated / Dead / Immobilized, Engaged przy kontakcie w ruchu. Resztę (rzuty w fazie strategicznej, Panicked…)
  rozstrzygają gracze – karta stanu podpowiada skutki.

**Poza zakresem (na razie):** piętra i stawanie na terenie, wspinaczka i skoki z wysokościami (jest „ruch swobodny”,
widoczny w dzienniku), Cover, szablony AoE na mapie, ukrywanie informacji (Shrouded), wierzchowce poza Lupus Rex.

## 3. Mapy i teren

- **Tło mapy** (admin): obraz dekoracyjny, rozmiar w calach (domyślnie 36×36) i **obszary naturalne** narysowane
  na nim (płytka/głęboka woda, las, bagno…).
- **Biblioteka terenu** (admin, `/admin/table`): obraz elementu (ruina, dom, drzewo, rzeka), jego rzeczywisty
  rozmiar i kształty narysowane na obrazie:
  - **ściana** – łamana z grubością i wysokością (każdy odcinek to bryła),
  - **przeszkoda** – wielokąt z wysokością (skała, dom),
  - **obszar** – wielokąt ze środowiskami (las, woda…); wysokość tylko dla LoS (korony drzew).
- **Mapa** (`/maps`): tło + dowolna liczba elementów z biblioteki ustawionych, obróconych i przeskalowanych przez gracza.
  Edytor: przeciąganie, obrót uchwytem nad elementem / Q, E / kółkiem, skala narożnikami / +, − / Shift + kółko
  (Shift przy przeciąganiu: skok 15° / 5 %). Skala jest jednolita X/Y (`scale` w `Placement`, 0,25–4, brak = 1
  dla starszych map): rośnie obrys i **grubość ścian**, **wysokość** kształtów zostaje bez zmian.
  Gracz zapisuje własne mapy (prywatne lub publiczne), admin publikuje oficjalne. Wyszukiwanie: zakładki
  Oficjalne / Graczy / Moje + szukanie po nazwie lub nicku autora. Cudzą mapę można zapisać jako kopię.
- Gra kopiuje mapę w chwili utworzenia stołu (snapshot) – zmiany w bibliotece nie zmieniają rozgrywanych partii.
- Obrazy: tylko admin wgrywa; PNG / JPEG / WebP rozpoznawane po bajtach, do 8 MB i 40 MPx (bez dekodowania pikseli),
  serwowane publicznie z `Cache-Control: immutable`.

## 4. Architektura

- **Silnik** (`backend/.../table`): `geo` (geometria, teren), `rules` (profile, stany, statystyki efektywne),
  `engine` (komendy → zdarzenia, stan = złożenie zdarzeń), `library` (obrazy, tła, teren, mapy), `play` (stoły).
- **Przeglądarka** ma bliźniaczą geometrię (`frontend/src/lib/table/geometry.ts`, `terrain.ts`) do podglądu ruchu
  i LoS. **Parytet** pilnują wektory: `make-vectors.ts` generuje `backend/src/test/resources/table/vectors.json`
  (40 scenariuszy, 160 ruchów, 240 sprawdzeń LoS), a `GeometryParityTest` sprawdza Javę na tych samych danych.
  Po zmianie geometrii: `node src/lib/table/make-vectors.ts ../backend/src/test/resources/table/vectors.json`.
- **Na żywo:** bez WebSocketów – komendy przez `POST /api/tables/{id}/commands`, podpowiedzi przez SSE
  (`GET /api/tables/{id}/live`, ten sam `LiveEventService` co turnieje: limity połączeń, heartbeat, wysyłka po commit).
  Klient po podpowiedzi pobiera cały widok (`GET /api/tables/{id}`).
- **Zdarzenia** (`table_events`, tylko dopisywanie) niosą wyniki (przebyta trasa, wyrzucone kości), więc odtworzenie
  partii nie zależy od wersji geometrii ani od losowania. Cofnięcie dopisuje `UNDONE` z listą cofniętych numerów.
- Komendy jednego stołu są szeregowane blokadą wiersza `game_tables` (`SELECT … FOR UPDATE`).
- Profile modeli: `content/eldfall-profiles.json` (60 profili, przepisane z kart – tylko liczby i nazwy cech),
  generator `tools/make_profiles.py`. Wierzchowiec z rozpiski trafia pod pierwszego jeźdźca (klasa RIDER).

### API

| Metoda | Ścieżka | Kto |
| --- | --- | --- |
| POST | `/api/admin/table/images` (surowe body) | admin |
| POST/PUT/DELETE | `/api/admin/table/backgrounds[/{id}]`, `/api/admin/table/terrain[/{id}]` | admin (DELETE = wycofanie) |
| GET | `/api/table/images/{id}` | publicznie |
| GET | `/api/table/backgrounds`, `/api/table/terrain` | zalogowani |
| GET | `/api/table/maps?scope=OFFICIAL\|PUBLIC\|MINE&q=` , `/api/table/maps/{id}` | zalogowani (prywatne tylko autor/admin) |
| POST/PUT/DELETE | `/api/table/maps[/{id}]` | autor (oficjalne: admin) |
| POST | `/api/tables` `{mapId, listId, questCode?, measureMode?, judge?, observers?}` → `{id, invite, judgeInvite, watchInvite}` | zalogowani (max 10 otwartych) |
| POST | `/api/tables/judge` `{invite}`, `/api/tables/watch` `{invite}` | zalogowani (sędzia: link jednorazowy, nie gracz tej gry) |
| POST | `/api/tables/{id}/invites` `{kind: PLAYER\|JUDGE\|WATCH}`, `/api/tables/{id}/observers` `{allowed}` | założyciel stołu |
| POST | `/api/tables/join` `{invite, listId}` | zalogowani (zaproszenie jednorazowe, w bazie tylko hash) |
| POST/DELETE | `/api/tables/{id}/invite-user` `{userId}` | założyciel: zaproszenie gracza z listy (powiadomienie `TABLE_INVITATION`), wycofanie |
| GET | `/api/tables/invitations`, `/api/tables/{id}/invitation` | zaproszony gracz (inni: 404) |
| POST | `/api/tables/{id}/accept` `{listId}`, `/api/tables/{id}/decline` | zaproszony gracz |
| GET | `/api/tables/mine`, `/api/tables/{id}`, `/api/tables/{id}/live` | gracze, sędzia, obserwatorzy (gdy włączeni), admin |
| POST | `/api/tables/{id}/commands` | gracze i sędzia (obserwator/admin: 403 `TABLE_READ_ONLY`) |
| POST | `/api/tables/{id}/report` → gra własna | uczestnicy, raz, po zakończeniu za zgodą |

Komendy (`type`): `FIRST_PLAYER`, `DEPLOY`, `READY`, `ACTIVATE`, `MOVE`, `FREE_MOVE`, `ROTATE`, `REACT`, `ROLL`,
`HP`, `STATE`, `AP`, `END_ACTIVATION`, `END_TURN`, `UNDO`, `CONCEDE`, oraz (Etap 3) `DRAW_SCHEMES`, `KEEP_SCHEME`,
`TOKEN`, `MOVE_TOKEN`, `REMOVE_TOKEN`, `VP`, `TEMPLATE`, `REMOVE_TEMPLATE`, `END_GAME`. Błędy reguł: HTTP 409 z kodem `TABLE_*`.

### Etap 3: scenariusz, scheme, żetony, PZ, szablony

- **Scenariusz** wybierany przy zakładaniu stołu (opcjonalny); karta scenariusza w panelu gry.
- **Strefy rozstawienia** wg scenariusza (`deploymentType` w `eldfall-core.json`, kolumna `game_tables.deployment`, V19):
  *standardowe* – pasy przy dolnej (gracz 1) i górnej (gracz 2) krawędzi, głębokość z mapy (domyślnie 8″);
  *narożne* (Quarter War, Toxic Infestation) – ćwiartki koła 9″ w lewym dolnym (gracz 1) i prawym górnym (gracz 2)
  narożniku. Silnik sprawdza, czy cała podstawka mieści się w strefie. Bez scenariusza – standardowe.
  Na planszy strefy są delikatnie podświetlone (przycisk „Strefy rozstawienia” obok Awareness), przy zakładaniu
  stołu pod wyborem scenariusza jest szkic stref.
- **Scheme:** każdy gracz losuje karty kośćmi serwera (liczba kart z INT lidera, jak w zwykłej grze), jedną
  zatrzymuje. Scheme są **tajne** (jak w „Moich grach” i turniejach): przeciwnik i obserwatorzy widzą tylko, że
  karty wylosowano / scheme wybrano (`hidden`, `cardCount`, `chosen`), także w dzienniku. Właściciel ujawnia go
  komendą `REVEAL_SCHEME` (nie da się cofnąć, nie blokuje cofania innych kroków); po zakończeniu gry jawne są oba.
  Sędzia i gra solo widzą wszystko. Nowo wybrany scheme (gra swobodna) jest znów tajny.
  „Gotowy” wymaga zatrzymanego scheme (`TABLE_SCHEME_FIRST`, gdy frakcja ma tabelę); gracz, który go pominął
  w starszych stołach, może jeszcze losować w 1. rundzie.
- **Żetony** (Intrigue, Cache, Sigil, Cel, Skarb, własny znacznik z opisem): kładzenie, przesuwanie, zdejmowanie –
  może każdy z graczy (jak przy prawdziwym stole), max 60.
- **Punkty zwycięstwa:** tabela runda × gracz (scenariusz + scheme, 0–30 na rundę); wpisuje każdy z graczy.
- **Szablony AoE:** koło S/L (70/120 mm) i Spray S/L (213/260 mm). Przeglądarka pokazuje, kogo szablon obejmuje
  (w całości / częściowo) i czy jest linia wzroku (koło – ze środka, spray – od atakującego; użytkownik pomijany).
  **Założenie do sprawdzenia:** szeroki koniec spraya ma średnicę 40% długości (zmierzone z obrazka podręcznika).
- **Osłona** (p.54) przy celach w panelu LoS: lekka −2 / ciężka −4; **Awareness** (zasięg AG od podstawki) jako
  okrąg; **linijka** od krawędzi podstawki do punktu / innej podstawki.
- **Koniec gry za zgodą:** jeden proponuje, drugi akceptuje (proponujący może wycofać); zwycięzca z sumy PZ.
  Potem **„Zgłoś wynik jako grę własną”** – trafia do Moich gier (PZ, scenariusz, frakcje, rozpiski), przeciwnik
  potwierdza jak zwykłą grę własną, więc liczy się do ELO, lig i statystyk. Zgłoszenie tylko raz.
- Cofanie obejmuje też żetony, PZ, szablony i propozycję końca (w swojej turze, nie za rzutem kośćmi).

### Gra swobodna (sandbox)

- Drugi rodzaj stołu (`game_tables.mode = SANDBOX`, V21; `POST /api/tables/sandbox {questCode?, measureMode?, judge?,
  observers?, opponentId?}`): bez mapy i rozpisek. Stół startuje od razu w rozstawieniu.
- W trakcie gry (panel „Stół swobodny”): **mata** z biblioteki (`SET_BACKGROUND`, jej rozmiar staje się polem),
  **teren** z biblioteki (`PLACE_TERRAIN` / `MOVE_TERRAIN` z obrotem i skalą / `REMOVE_TERRAIN`, max 80) i **dowolne
  postacie** z profili (`ADD_MODEL` stawia od razu w klikniętym miejscu, `REMOVE_MODEL`, max 40; `GET /api/tables/profiles`).
  Zdarzenia niosą kopię danych z biblioteki, więc da się je cofać, a późniejsze zmiany w bibliotece nie psują partii.
- Scenariusz (`SET_QUEST`) i scheme (`PICK_SCHEME`, z listy, bez losowania) wybiera się z list; rundę można ustawić ręcznie
  (`SET_ROUND`). Strefy rozstawienia się wyświetlają, ale nie są wymuszane.
- **Solo:** dopóki nikt nie dołączył, założyciel gra za obie strony – każda komenda może mieć `asSide` (0/1), a silnik
  dalej pilnuje tur, AP i ruchu dla tej strony. Przeglądarka sama dobiera stronę (strona modelu, inaczej aktywny gracz).
  Cofanie w solo działa jak u sędziego (dowolny krok). „Rozpocznij grę” = pierwszy gracz + „Gotowe” za obie strony,
  „Zakończ grę” = koniec za zgodą obu stron.
- Przeciwnik może dołączyć w dowolnym momencie (link lub zaproszenie z listy), także **bez rozpiski** – przejmuje
  stronę B z modelami, które już na niej stoją. Z rozpiską jego modele dostają kolejne numery (b3, b4…).
- Gry swobodnej nie zgłasza się jako gry własnej (bez ELO i statystyk).

### Tryb mierzenia, sędzia, obserwatorzy

- **Tryb mierzenia** (podręcznik s.18) wybiera założyciel stołu: *Assisted* – wszystko; *Standard* – tylko w zasięgu
  Awareness własnych modeli i ruch aktywowanego modelu (w trakcie ruchu tylko ruch; szablonów się nie przymierza);
  *Realism* – bez przymierzania (linijka i okrąg Awareness wyłączone, trasa bez licznika cali). Ograniczenie dotyczy
  podglądu w przeglądarce (`lib/table/measuring.ts`); serwer i tak przycina zbyt długi ruch do zasięgu modelu.
  Sędzia i obserwatorzy widzą wszystkie odległości.
- **Sędzia** (link jednorazowy, nie może być graczem tej gry): przestawia i obraca dowolne modele, zmienia HP/AP/stany,
  rzuca kośćmi, żetony, szablony, PZ, kończy grę (zwycięzca z PZ) i cofa dowolną liczbę kroków – także po rzutach
  i z poprzednich tur (`UNDO` z `toSeq` = cofnij wszystko po tym kroku). Nie cofa przygotowania z rozpisek ani
  zgłoszonego wyniku. Gracze nie cofają poprawek sędziego (`TABLE_UNDO_AFTER_JUDGE`). Zdarzenia sędziego mają `side = 2`.
- **Obserwatorzy**: opcja założyciela; link wielokrotny (w bazie tylko hash), max 50 osób, tylko podgląd. Wyłączenie
  usuwa listę obserwatorów i link. Tabela `table_watchers`.
- **Ruch swobodny** (Climb, Jump, Dodge, odepchnięcia…) nie wymaga zgody przeciwnika – jest wyróżniony w dzienniku,
  a sędzia może go cofnąć.

## 5. Strony

- `/tables` – zaproszenia do gry, moje stoły, nowy stół (mapa + rozpiska + opcjonalnie przeciwnik z listy graczy →
  link z zaproszeniem i powiadomienie dla wybranego gracza), `/tables/join?invite=…` (link),
  `/tables/join?table=…` (zaproszenie z listy: szczegóły stołu, wybór rozpiski, „Dołącz” / „Odrzuć”).
  Wyszukiwanie gracza od 2 liter (`/api/players/search`). Jeden zaproszony gracz naraz (`game_tables.invited_user_id`, V20);
  link działa równolegle – kto pierwszy zajmie miejsce, ten gra.
- `/tables/{id}` – gra: plansza (tło, grafiki terenu, nakładka „teren według zasad”, strefy rozstawienia),
  karta modelu (statystyki z karty i efektywne, HP ±, AP ±, stany), aktywacja i ruch z podglądem trasy i licznikiem
  cali, reakcja, ruch swobodny, obrót (Q/E), linia wzroku (L), kości, dziennik, cofanie, poddanie.
- `/maps`, `/maps/new`, `/maps/{id}` – przeglądanie i edytor map.
- `/admin/table` – biblioteka terenu i teł (wgrywanie grafiki, rysowanie kształtów).

### Panel rozgrywki (PC first)

Strona `/tables/{id}` to pełnoekranowy panel od szerokości `lg` (1024 px); na węższych ekranach pokazuje komunikat
„Stół online działa na komputerze” (pozostałe strony bez zmian). Układ (`table-play.tsx`):

- **Górny pasek:** powrót do listy stołów, mapa · scenariusz, runda (w grze swobodnej z −/+), wynik PZ (klik otwiera
  „Misja i punkty”), czyja tura, Cofnij, Zaproś / linki, Poddaj.
- **Lewy panel:** „Oddziały” – modele obu stron z HP, AP, stanami i scheme (klik zaznacza model); w grze swobodnej
  druga zakładka „Stół i teren” (mata, teren, postacie).
- **Pasek narzędzi:** wybór i ruch, LoS, linijka, Awareness, żetony, szablony AoE, strefy, teren według zasad, blokada terenu.
- **Plansza** skaluje się do dostępnego miejsca z zachowaniem proporcji; pod nią podpowiedź i przyciski fazy
  (pierwszy gracz / Gotowe, Zakończ aktywację, Koniec tury).
- **Prawy panel:** zakładki Model (karta, akcje, LoS, opcje żetonów i szablonów), Misja i punkty, Dziennik, Linki;
  na dole stale kości (klik w cechę na karcie ustawia cel rzutu).

### Sterowanie na planszy

- **Teren (edytor map i gra swobodna):** element przeciąga się z biblioteki na planszę (mysz od razu, dotyk po
  przytrzymaniu ~0,3 s; klik + klik na planszy dalej działa). Na planszy: przeciąganie przesuwa, kółko obraca o 15°,
  Shift + kółko skaluje; ramka zaznaczenia ma narożniki do skalowania i wystający uchwyt do obrotu (Shift: skok 15° / 5 %),
  uchwyty mają co najmniej 16 px (palec). „Zablokuj teren” wyłącza chwytanie (w grze swobodnej domyślnie po starcie gry).
  W grze swobodnej zmiana jest widoczna od razu, a do serwera idzie jedna komenda po puszczeniu (kółko: po 0,45 s przerwy).
  Wspólny kod: `lib/table/handles.ts`, `components/table/use-board-drag.tsx`.
- **Najechanie na teren** pokazuje, co widzą zasady: przeszkoda / obszar, największa wysokość w tym miejscu i środowiska.
- **Ruch modelu:** po aktywacji klik w cel od razu wykonuje ruch – serwer skraca trasę do zasięgu (Walk/Run, teren, wrogowie);
  klik na wrogi model = ruch do kontaktu podstawek; Shift + klik dodaje punkt trasy; podgląd trasy i licznik cali idą za kursorem.
- **Obrót modelu:** kółko myszy nad modelem (lub tuż przy zaznaczonym) albo przeciągnięcie uchwytu na wektorze przodu;
  sam obrót, bez ruchu (komenda `ROTATE`).

## 6. Bezpieczeństwo

- Każdy endpoint sprawdza uczestnictwo / własność (stół widzi tylko gracz A, gracz B i admin; obcy dostaje 404).
- Zaproszenie: 256-bitowy token, w bazie tylko SHA-256, jednorazowe; własna gra sam ze sobą zablokowana.
- Komendy walidowane po stronie serwera (zakresy liczb, liczba punktów trasy ≤ 20, liczby skończone),
  wyniki rzutów z `SecureRandom`. Limity: 10 otwartych stołów, 40 map, 80 elementów na mapie, 40 kształtów na element.
- Upload: tylko admin, limit czytany strumieniowo (8 MB), typ z sygnatury, wymiary z nagłówka; SVG/GIF odrzucane.

## 7. Testy

- TS: `npm run test:table` (32 testy: geometria, teren, szablony, osłona, tryby mierzenia).
- Java: `GeometryParityTest`, `TerrainShapesTest`, `TableEngineTest` (25 scenariuszy zasad, w tym Etap 3 i sędzia), `EventJsonTest`,
  `ImageCheckTest` – przeszły w sandboxie. `TableIntegrationTest` (Testcontainers: biblioteka, mapy, gra od
  zaproszenia po cofanie, scheme, żetony, PZ, koniec gry, zgłoszenie wyniku, sędzia i obserwatorzy) – **do uruchomienia u Filipa** (`.\gradlew.bat build`).
- Nieuruchomione: `next build`, UI w przeglądarce, migracja V18 na Postgresie.

## 8. Plan

| Etap | Zakres | Stan |
| --- | --- | --- |
| 0 | Dane profili, geometria TS + Java z parytetem, prototyp | ✔ |
| 1 | Stoły, zaproszenia, komendy, SSE, rozstawienie, ruch, LoS, kości, dziennik | ✔ (kod) |
| 2 | Stany ze statystykami, HP/AP, cofanie, biblioteka terenu, tła, mapy graczy i oficjalne | ✔ (kod) |
| 3 | Scenariusz, scheme, żetony, tabela PZ, szablony AoE, osłona, Awareness, linijka, koniec za zgodą, zgłoszenie wyniku | ✔ (kod) |
| 3b | Tryby mierzenia, sędzia, obserwatorzy | ✔ (kod) |
| 3c | Testy z graczami, poprawki | następny |
| 3d | Stoły standardowe na silniku gry (pełna mechanika, okno kości) – §10 | ✔ (kod) |
| 4 | Turnieje online: runda tworzy stoły, limit czasu, wynik do meczu, narzędzia sędziego | |

## 9. Otwarte pytania

- Na razie brak – zgłaszajcie po testach z graczami.

## 10. Stoły standardowe na silniku gry (pełna mechanika)

Od migracji V26 stół **standardowy** (mapa + rozpiski) gra tym samym silnikiem co gra „Eldfall Table”; widok zostaje
2D. Gra swobodna i stoły założone wcześniej działają jak w §1–§9 (silnik Java). O silniku decyduje kolumna
`game_tables.engine` (`GAME` / `LEGACY`), dla nowych stołów zmienna `TABLE_ENGINE` (domyślnie `GAME`).

### Architektura
- **Silnik**: `frontend/src/lib/eld/` (TypeScript bez zależności; `decide(state, cmd, ctx) → zdarzenia`, `apply`).
  Jedno źródło: przeglądarka składa nim stan, usługa `rules/` nim rozstrzyga. Zmiany względem gry opisuje
  `frontend/src/lib/eld/README.md` (rozstawienie narożne, poddanie gry, żetony graczy).
- **Usługa zasad** `rules/` (Node ≥ 22.18, bez builda): `POST /create`, `/join`, `/command`, `GET /health`.
  Bezstanowa – trzyma tylko pamięć podręczną stanów; po restarcie odpowiada `409 NEED_LOG`, a backend dosyła dziennik.
  Kości rzuca serwer (`crypto.randomInt`).
- **Backend**: `TableGameController` (`GET /api/tables/{id}/engine`, `GET /{id}/game?after=N`,
  `POST /{id}/game/commands`), `TableGameService` (uprawnienia: komendy tylko gracze; obserwator czyta; obcy 404),
  `GameEngine` (zapis zdarzeń z kontrolą numeru, status stołu, karty Scheme tylko właścicielowi), `RulesClient`.
  Odmowa zasad wraca jako `409 TABLE_RULE` ze zdaniem silnika w polu `message`.
- **Frontend**: `TableSwitch` → `GameTable` (`components/table/game/`), stan z `useGame` (zdarzenia + SSE).

### Przebieg gry
1. **Rozstawienie**: figurki z rozpiski stoją na półce za krawędzią stołu (ciemna część półki jest ukryta przed
   przeciwnikiem); przeciągnij je do strefy (pas albo ćwiartka koła w narożniku). Losowanie i wybór Scheme w zakładce
   „Misja i punkty”. „Gotowe” obu graczy → rzut na inicjatywę.
2. **Tura**: Faza Strategiczna (Stratagemy lidera w lewym panelu) → „Aktywuj (1 AP)” → ruch przeciąganiem
   (Walk / Run, Climb, Jump; okręgi pokazują zasięg) → przeciwnik może **zareagować** (Atak, Dodge, inna reakcja,
   Attack of Opportunity) → **Akcja** na karcie (Atak z wyborem broni, celu, Combat Art, podziałem Strike, szablonem;
   Dodge; Nothing; zaklęcia, rytuały, wierzchowiec, żetony misji, Death Blow) → „Zakończ aktywację” / „Koniec tury”.
3. **Kości**: Akcja otwiera okno kości – liczba kości i próg (± do ustaleń graczy), „Rzuć” deklaruje Akcję; strona
   reagująca widzi swoje kości i też naciska „Rzuć”; serwer rzuca, kości toczą się u obu graczy, dopiero potem stół
   pokazuje skutki (rany, stany, dziennik). Opcja „Wszystkie rzuty naraz” albo krok po kroku (zapamiętana w przeglądarce).
   Pod kartą jest też zwykły rzut k20 i rzut na obrażenia.
4. **Koniec**: 5 rund; Scheme'y ujawnia i liczy gra. Misję Treasure Hunt gra prowadzi sama, w pozostałych punkty za
   misję wpisują gracze (± w zakładce „Misja i punkty”) i kładą własne żetony. „Zgłoś wynik” działa jak dotąd.

### Sterowanie
Kółko nad figurką albo Q / E – obrót; L – linia wzroku; M – linijka; W – Awareness; F – ruch swobodny (poprawki);
Esc – anuluj celowanie / narzędzie / wybór. „Cofnij ruch” działa do pierwszego rzutu lub reakcji.

### Czego jeszcze nie ma na tym silniku
Sędzia, tryby mierzenia, cofanie dowolnego kroku, koniec gry za zgodą, gra swobodna (zostają na pierwszym silniku).
Teksty silnika (dziennik, odmowy, karty, Stratagemy, Scheme'y) są po angielsku.

### Stoły 3D (19.11.2026, migracja V27)
Przy zakładaniu stołu standardowego wybiera się **2D** (mapa z biblioteki WarBracket) albo **3D** (gotowa mapa gry:
`MAPS` w `frontend/src/lib/eld/maps.ts` – Fallen sanctuary, Elven garden, Desert plaza, Frozen courtyard, Village
crossing); zapis w `game_tables.view_mode`, `game_map`. Stół 2D ma tylko widok 2D. **Stół 3D każdy ogląda po swojemu:**
przy pierwszym wejściu strona pyta o widok 3D albo 2D (wybór zapamiętany w przeglądarce dla tego stołu,
`wb.table.view.<id>`, zmieniany przyciskiem na pasku narzędzi). Widok 2D stołu 3D rysuje tę samą mapę z góry:
malowane podłoże, modele z `terrain3d/tops/*.webp` (rzuty z góry) i zwykłe bryły z ich kształtów – więc każda mapa
3D ma od razu swoją wersję 2D i służy też jako widok dla słabszych urządzeń.

- **Backend**: `POST /api/tables` przyjmuje `gameMap` zamiast `mapId` (`TABLE_MAP_REQUIRED`, `TABLE_UNKNOWN_MAP`,
  `TABLE_3D_UNAVAILABLE` przy `TABLE_ENGINE=LEGACY`); pole stołu 3D buduje usługa zasad (`create` z `gameMap` →
  `buildMap`), więc teren z modelami, podłoże i rzeźba terenu są w zdarzeniu `TABLE_CREATED`. Nieznana mapa: `409 TABLE_RULE`.
  `GameView.meta.viewMode` mówi stronie, którą planszę pokazać.
- **Frontend**: `components/table/game/game-board-3d.tsx` (ładowany przez `next/dynamic`, bez SSR – three.js tylko dla
  stołów 3D) dostaje te same właściwości co plansza 2D i steruje sceną `lib/eld3d/` – portem sceny gry
  (`client/src/scene`): teren z modeli `.glb`, malowane podłoże, niebo, pogoda, sanktuarium. Różnice wobec gry: figurki
  zastępcze bez rzeźb i animacji, bez efektów zaklęć, żetony graczy, zakryte figurki (Shrouded), strefy rozstawienia
  i kształty zasad włączane z paska narzędzi. Sterowanie: lewy przycisk – obrót kamery, prawy – przesuwanie, kółko –
  zbliżenie; trzymając figurkę kółkiem się ją obraca; przyciski „Z góry” i pogoda (zapamiętana w przeglądarce).
- **Zasoby**: `frontend/public/terrain3d/` – patrz `docs/terrain3d.md` (także startowa biblioteka 2D:
  `tools/seed/table_library.ts`).
- **Jakość grafiki** (20.11.2026): przy wejściu na stół 3D gracz wybiera widok i jakość – gotowe poziomy niska / średnia /
  wysoka albo ręcznie: modele lekkie / pełne (`terrain3d/models-light` / `models`), cienie (brak / zwykłe / dokładne),
  pełna rozdzielczość z wygładzaniem, otoczenie stołu, trawa (`SceneOptions` w `lib/eld3d/scene.ts`,
  `lib/table/view3d-settings.ts`). Pole „zapamiętaj” zapisuje to w przeglądarce (`wb.table3d.settings`); przycisk
  ustawień na stole otwiera wybór ponownie (scena budowana jest od nowa).
- **Pasek ładowania**: `lib/eld3d/loading.ts` liczy pobierane modele i podłoże (bajty, gdy serwer poda rozmiar, inaczej
  pliki); plansza 3D pokazuje postęp, a po 30 s pyta, czy przełączyć stół na widok 2D.
- **Jeszcze nie ma**: zaproszenie nie mówi jeszcze, że stół jest 3D.
- **Nieuruchomione**: wszystko poza `tsc`, `eslint` i testami `rules/` (82) – migracja V27, kompilacja Javy, `next build`
  i sam widok 3D w przeglądarce czekają na pierwsze uruchomienie.

### Mapy gry: pary 3D / 2D i kreator admina (20.11.2026, migracja V29)
- **Mapa gry** to podłoże (`BASES`) i elementy (`KITS`) z `lib/eld/maps.ts`. Każda jest parą: stół **3D** (każdy gracz
  wybiera u siebie widok 3D albo 2D) albo stół **2D** na tej samej mapie (tylko z góry: malowane podłoże i rzuty
  modeli). `POST /api/tables` z `gameMap` i `viewMode` („3D” domyślnie, „2D”); `meta.gameMap` mówi planszy 2D, że mapa
  jest w stanie gry, a nie w bibliotece.
- **Skąd mapy gry**: wbudowane (`MAPS`) i zrobione przez admina w kreatorze `/admin/maps3d` (tabela `game_maps`,
  `GET /api/table/game-maps` – opublikowane; `POST/PUT/DELETE /api/admin/table/game-maps` – tylko `ADMIN`). Zapis
  sprawdza usługa zasad (`POST /map` → `checkMap`: znane podłoże i elementy, rozmiary, na stole, najwyżej 30 elementów,
  w tym najwyżej **12 z modelem 3D**); przy zakładaniu stołu backend podaje mapę usłudze (`customMap`), która sprawdza
  ją ponownie. Szkic (nieopublikowany) widzi i może rozegrać tylko admin. Najwyżej 40 map.
- **Kreator** (`components/table/map3d-editor.tsx`): plan z góry – który jest zarazem wersją 2D mapy – z rzutami modeli
  i obrysami kształtów zasad; przeciąganie, kółko = obrót, Shift + kółko = rozmiar; „Podgląd 3D” ładuje scenę three.js
  dopiero na żądanie (`map3d-preview.tsx`). Nowe podłoża i nowe elementy dochodzą przez `lib/eld/maps.ts` (kod).
- **Gracze** nie mają kreatora map 3D. Mapy z kreatora 2D (`/maps`, biblioteka) służą tylko stołom 2D – bez zmian.

### Ukryte informacje (19.11.2026, migracja V28)
- **Karty Scheme**: jak dotąd – tylko u właściciela (`scheme_hands`), nigdy w zdarzeniach.
- **Figurki Shrouded** (rozstawione jako Shrouded: Stealth II, Concealed Approach): dopóki nic ich nie odkryje, są
  tajemnicą właściciela. Przeglądarki same składają stan ze zdarzeń, więc sekretu nie może być w tym, co dostaje
  przeciwnik: usługa zasad (`rules/service.ts`, `step`) dla każdego zdarzenia, które by go zdradziło, zwraca drugą
  postać (`views`: `a`, `b`, `o` – gracz A, gracz B, pozostali), w której figurka jest zwykłym żetonem „Shrouded”
  (bez profilu, nazwy, lidera, HP) i jej nazwa nie pada w tekstach. Backend zapisuje te postaci obok zdarzenia
  (`table_events.payload_a/_b/_public`) i `GET /api/tables/{id}/game` wybiera właściwą dla pytającego
  (`TableEventStore.Viewer`); usługa zasad dostaje zawsze pełny dziennik. Zdarzenie, które odkrywa figurkę, niesie ją
  w polu `unmask`, a strona (`lib/table/use-game.ts`) wstawia ją w miejsce żetonu. Dopóki drugie miejsce jest puste,
  założyciel widzi wszystko (gra obiema stronami).
- **Nazwy z właścicielem** (`ownerNames` w silniku): figurki Shrouded są pomijane, żeby dopisek przy własnej figurce
  nie zdradzał, co stoi pod żetonem przeciwnika.
- **Znane ograniczenia**: figurka, która w trakcie gry ponownie stała się Shrouded, jest zakrywana tylko w widoku
  (przeciwnik już ją widział); gdy ukryta figurka ma taką samą nazwę jak widoczna figurka, jej nazwa w tekście
  zdarzenia (np. trafienie szablonem) nie jest zamazywana; zakryta część półki przy rozstawieniu jest ukrywana tylko
  w widoku – rozpiski i tak są jawne, więc zdradza to najwyżej, które figurki jeszcze stoją na półce.

### Klasy, przedmioty i karty ulepszeń (20.11.2026)

Silnik (ten sam w Eldfall Table) stosuje sam:

- **Klasy:** Soldier (+1 OFF/DEF/ACC/INT/M za każdego innego Soldiera w Awareness, do +3 – także rzuty na
  Morale, Perceive, Charm, Taunt, Unconventional Tactics; premia widoczna na karcie), Ranger (ruch w End Phase:
  po zakończeniu ostatniej aktywacji przeciągnij figurkę; potem nie ma już aktywacji w tej turze), Mage
  (pole „Mag: przerzut za 1 AP”), Rogue (rzut na Knockdown raz na aktywację), Berserker (jeden rzut na
  wszystkie rany z jednej sekwencji – FAQ), Warrior (Defensive Stance tylko we własnej Strategic Phase,
  wygasa w następnej), Sorcerer także przy Sorcery rzucanych na figurkę, Marksman tylko do ACC, Druid także
  przy zaklęciach-atakach, Summonerzy dzielą pulę Many, Alchemist odzyskuje Consumables w Strategic Phase.
- **Przedmioty:** `Model.items` – ile sztuk zostało. Throwing: w liście broni pozycja „… (thrown)”
  (indeks `THROWN_INDEX + n`), Reach T, tyle Strike'ów, ile sztuk; rzucone znikają, a wracają po wejściu
  w Base Contact z figurką, którą rzut powalił (`Model.thrown`). Consumable: jedna sztuka na atak.
- **Ulepszenia:** First Aid (Recovery Check sam; stany – przycisk na karcie we własnej Strategic Phase),
  Lucky Charm (`Model.luck`, pole „Użyj Luck”), Smokescreen (Haze Bomb zostawia obszar „Haze”: ataki
  dystansowe nie przechodzą przez niego, z niego i do niego atrybut na pół, wręcz poza kontaktem −3),
  Fangs of Tiamat, Casting Amplifier (+4 RCH zaklęć), Hyperia's Providence, Double Time (+6 do inicjatywy),
  Surge Order (przycisk, potem przeciągnięcie do 3 figurek Helian League), Companion of Hairon, Conjured
  Retinue i Personal Guard (ukryte ulepszenia `san-retinue-soldier` / `san-guard-sentinel` na stworze).
  Wybór (Adept Shaper, Arcane Tome, Reduce Weight, Mana Catalyst, Elemental Lineage): lista na karcie figurki
  przed startem gry (`PICK_UPGRADE`, `Model.picks`).
- **Friendly Fire:** rzut 17–20 przy strzale w figurkę w kontakcie z sojusznikiem trafia sojusznika; każdy
  trafiony sojusznik rzuca na Morale albo jest Panicked do swojej następnej Strategic Phase.
- Nowe komendy: `USE_UPGRADE`, `PICK_UPGRADE`; nowe zdarzenia: `MODEL_KIT`, `SURGE_ORDERED`; pole `kit`
  w `ACTION_RESOLVED` / `EFFECT`. Serwis `rules` ukrywa `MODEL_KIT` figurek w stanie Shrouded.
- Bez zmian zostało: Pouch nie daje +2 Inventory (silnik nie liczy ekwipunku), stan Flying jest ręcznym
  znacznikiem, Devotion: Paimon obniża koszt ulepszeń tylko tej samej figurki (decyzja Filipa).

### Komunikaty i rzuty czekające na gracza (20.11.2026)

- **Start gry:** gdy obaj są gotowi, `READY` kończy się zdarzeniem `INITIATIVE_PENDING` (`state.initiative`).
  Na stole pojawia się napis „Rozpoczęcie rozgrywki” i okno kości z rzutem na inicjatywę; każdy gracz rzuca
  swoją kością (`ROLL_INITIATIVE`). Po obu rzutach: `GAME_STARTED`, wynik w oknie kości, komunikat kto zaczyna.
- **Strategic Phase:** `END_TURN` kończy turę, a jeśli następny gracz ma coś do rzucenia (Bleeding, Poisoned,
  Recovery Check, Unconventional Tactics), silnik czeka (`STRATEGIC_PENDING`, `state.pendingTurn`) na jego
  `ROLL_STRATEGIC`. Bez rzutów tura zaczyna się od razu.
- **Pozostałe rzuty** przechodzą przez okno kości po stronie klienta (`rollGate`): Morale figurki Panicked przy
  aktywacji i reakcji, INT przeciw Charm, Taunt, Stratagemy z rzutem celu, Fall Damage po skoku. Trample i
  Sigile rzucają od razu – wynik widać w oknie kości.
- **Koniec tury** z niewykorzystanymi AP pyta „tak / nie”. Początek każdej tury ogłasza napis na stole.

Kreator rozpisek: `content/items.xlsx` ma kolumnę „Limit”; `tools/import_units.py` przenosi ją do
`eldfall-armies.json`, backend odrzuca rozpiskę ponad limit (`ITEM_LIMIT`). First Aid 2 pkt, doszły
Smokescreen, Expedition Leader, Raid Leader.

### Testy
`cd rules; npm test` (85 testów zasad gry + 10 testów usługi). `TableGameIntegrationTest` (backend) uruchamia się tylko,
gdy usługa zasad odpowiada na `localhost:8090` (w CI startuje ją job backendu).
