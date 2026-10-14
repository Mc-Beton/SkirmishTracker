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
| GET | `/api/tables/mine`, `/api/tables/{id}`, `/api/tables/{id}/live` | gracze, sędzia, obserwatorzy (gdy włączeni), admin |
| POST | `/api/tables/{id}/commands` | gracze i sędzia (obserwator/admin: 403 `TABLE_READ_ONLY`) |
| POST | `/api/tables/{id}/report` → gra własna | uczestnicy, raz, po zakończeniu za zgodą |

Komendy (`type`): `FIRST_PLAYER`, `DEPLOY`, `READY`, `ACTIVATE`, `MOVE`, `FREE_MOVE`, `ROTATE`, `REACT`, `ROLL`,
`HP`, `STATE`, `AP`, `END_ACTIVATION`, `END_TURN`, `UNDO`, `CONCEDE`, oraz (Etap 3) `DRAW_SCHEMES`, `KEEP_SCHEME`,
`TOKEN`, `MOVE_TOKEN`, `REMOVE_TOKEN`, `VP`, `TEMPLATE`, `REMOVE_TEMPLATE`, `END_GAME`. Błędy reguł: HTTP 409 z kodem `TABLE_*`.

### Etap 3: scenariusz, scheme, żetony, PZ, szablony

- **Scenariusz** wybierany przy zakładaniu stołu (opcjonalny); karta scenariusza w panelu gry.
- **Scheme:** każdy gracz losuje karty kośćmi serwera (liczba kart z INT lidera, jak w zwykłej grze), jedną
  zatrzymuje. Zgodnie z zasadami scheme są jawne – widzą je obaj gracze.
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

- `/tables` – moje stoły, nowy stół (mapa + rozpiska → link z zaproszeniem), `/tables/join?invite=…`.
- `/tables/{id}` – gra: plansza (tło, grafiki terenu, nakładka „teren według zasad”, strefy rozstawienia),
  karta modelu (statystyki z karty i efektywne, HP ±, AP ±, stany), aktywacja i ruch z podglądem trasy i licznikiem
  cali, reakcja, ruch swobodny, obrót (Q/E), linia wzroku (L), kości, dziennik, cofanie, poddanie.
- `/maps`, `/maps/new`, `/maps/{id}` – przeglądanie i edytor map.
- `/admin/table` – biblioteka terenu i teł (wgrywanie grafiki, rysowanie kształtów).

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
| 4 | Turnieje online: runda tworzy stoły, limit czasu, wynik do meczu, narzędzia sędziego | |

## 9. Otwarte pytania

- Na razie brak – zgłaszajcie po testach z graczami.
