# Model treści gry (etap 2)

Na podstawie skanów podręcznika (10 stron, 26.09.2026) i ustaleń z Filipem.

## Scenariusz (Quest)

Każdy scenariusz ma te same sekcje — aplikacja przechowuje je jako ustrukturyzowane pola (PL + EN), a gracz widzi je w trybie szczegółowym:

| Pole | Przykład (Treasure Hunt) |
| --- | --- |
| `name`, `flavor` | Treasure Hunt — krótki opis fabularny |
| `setup[]` | 2 Intrigue Tokens na środku, Cache Token pod każdym; Standard Deployment 8" |
| `results[]` — **za co są VP** | 1 VP za otwarcie Cache; 2 VP jeśli model ma Treasure na koniec gry; 3 VP jeśli model opuści stół z Treasure |
| `specialEndConditions[]` | Koniec, gdy oba Treasure opuszczą stół; Broken Morale na początku Strategic Phase |
| `important[]` | (np. Toxic Infestation: brak interakcji z markerami w rundzie 1) |
| `questRules[]` | Zasady specjalne: Treasure (Cache), Sigils (tabela k20 → czar) |
| `classBonus` | Rogue/Ranger/Alchemist +3 do AG przy interakcji z Cache |
| `map` | Własny rysunek Filipa: strefy rozstawienia, żetony, wymiary |

Każdy element `results[]` ma opis i opcjonalnie wartość VP oraz moment (`PER_ROUND`, `END_OF_GAME`, `ON_EVENT`), żeby liczydło w trybie szczegółowym mogło podpowiadać przyciski („+1 VP: otwarty Cache”).

## Scheme

- Liczba dobieranych kart zależy od **INT lidera** z rozpiski: INT ≤ 13 → 2 karty, 14–15 → 3, ≥ 16 → 4; gracz zatrzymuje 1.
  Dlatego rozpiska musi mieć oznaczonego lidera.
- Losowanie: rzut k20 na tabeli **frakcji** gracza (np. Helian League: 1 Opportunistic Manipulation, 2 Assassination Contract, 3–4 Virtuous Commander … 20 Peacekeeping Paragon). Są też scheme neutralne.
- Losowane przed grą, jawne dla przeciwnika.
- Pola scheme: `code`, `name`, `text`, `maxVp` (np. 3), `timing` (ujawnij w Strategic Phase / End Phase / koniec gry), `faction` lub `NEUTRAL`.
- Tabela frakcji: `faction`, `rollFrom`, `rollTo`, `schemeCode`.

## Rozpiska (warband)

- Źródło kosztów: plik Excel od Filipa — frakcje, koszty postaci, koszty przedmiotów; postacie neutralne dostępne dla każdej frakcji.
- Walidujemy **tylko sumę punktów** względem limitu ustalonego przez organizatora (bez legalności wyposażenia).
- Rozpiska: frakcja, lista postaci (+ przedmioty), **lider** (wymagany; jego INT steruje dobieraniem scheme), suma punktów.
- Organizator oznacza: sprawdzona, prawidłowa / do poprawy; rozpiski ukryte do terminu.

## Punktacja — przypomnienie

1. Małe punkty (VP): suma tur 1–5 = scenariusz (`results`) + scheme.
2. Duże punkty: W/R/P (np. 3/1/0; remis = równe VP) **albo** różnica — mnożnik (8:2 → 16:4) lub tabela progów; organizator wybiera jeden tryb.
3. BYE: max raz na gracza, punkty ustalane per runda. SPLIT: remis bez gry, punkty wg trybu.
4. Liga: stałe punkty za udział wg rangi (lokal/master/international) · przeliczone punkty z turnieju (× / ÷ + zaokrąglenie) · ELO (W/R/P, start 1500, K = 32).
5. Drużyny 2–5 graczy: suma dużych i małych punktów członków + W/R/P drużyny.


## Stan wdrożenia (2026-09-26)

- Treści: `backend/src/main/resources/content/eldfall-core.json` – 7 scenariuszy, 27 scheme, tabele k20: Coalition of Thenion, Empire of Soga, Helian League, Sand Kingdoms, Monster Factions (= Oni Clans i Goblin Wartribes), Adventurers' Guild. Teksty to **streszczenia własnymi słowami** (PL/EN), nie przedruk podręcznika.
- Oni Clans i Goblin Wartribes losują z tabeli „Monster Factions” (potwierdził Filip). Frakcja bez tabeli (`schemeTable: null`) ma zablokowane losowanie (błąd SCHEME_TABLE_MISSING). Undead nie gra samodzielnie – tylko jako sojusznik Oni.
- Mapy: pole na rysunek organizatora – do dodania.
- API: `GET /api/content` (publiczne). Tryb szczegółowy: `/api/tournaments/{id}/matches/{mid}/game`, losowanie scheme po stronie serwera (jedno na gracza i grę, reset tylko przez organizatora), punkty tur 1–5 (scenariusz + scheme), „Zakończ grę” zgłasza sumy jako wynik.
- Rozpiski (`/api/tournaments/{id}/warbands`): dane z `content/units.xlsx` + `content/items.xlsx` → `tools/import_units.py` → `eldfall-armies.json`.
  - Frakcje: każda grywalna samodzielnie; Thenion/Soga/Helian/Sand zawsze mają dostęp do Adventurers Guild; Oni mogą wziąć Undead jako sojusznika; Gobliny bez sojuszników; Adventurers Guild jako frakcja – tylko własna lista; Undead nie gra samodzielnie.
  - Postacie powtarzające się w AG i frakcjach głównych to jedna postać (jeden kod, te same punkty).
  - Wzmocnienia/przedmioty: neutralne dla wszystkich, frakcyjne tylko dla rozpiski tej frakcji (wg frakcji rozpiski, nie pochodzenia postaci). Bez limitów ilości – walidowana jest tylko suma postaci + wzmocnień (+ ewentualne „inne punkty”) względem limitu turnieju. Tańszy koszt warunkowy (Yari/Daikyuu) zaznacza gracz.
  - Dokładnie jeden lider z INT 1–30; losowanie scheme bierze frakcję i INT z rozpiski (ręczne pola tylko gdy rozpiski brak).
  - Edycja: gracz do terminu rozpisek i przed rundą 1 (każda zmiana → status „Wysłana”); organizator do końca turnieju. Widoczność: właściciel i organizator zawsze, pozostali po terminie lub od startu turnieju.
