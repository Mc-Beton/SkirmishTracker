# Formaty turniejów, ligi, ELO i profile (etap 3–4)

## Formaty
- **Swiss** – jak dotąd. Opcjonalny **top cut** (2/4/8/16/32): po zaplanowanych rundach Swiss najlepsi z tabeli (bez wycofanych) grają drabinkę pucharową. Top cut wymaga podania liczby rund Swiss.
- **Eliminacje (pojedyncze)** – drabinka od 1. rundy. Rozmiar = najbliższa potęga 2; brakujące miejsca to BYE dla najwyżej rozstawionych. Rozstawienie standardowe (1–8, 4–5, 2–7, 3–6), 1 i 2 mogą spotkać się dopiero w finale.
- **Round-robin** – każdy z każdym (metoda Bergera), przy nieparzystej liczbie graczy każdy ma raz BYE. Może kończyć się top cutem.
- Rozstawienie (eliminacje, round-robin): losowo albo wg globalnego ELO.
- Mecz pucharowy: więcej małych punktów wygrywa; przy remisie przechodzi wyżej rozstawiony. SPLIT w fazie pucharowej niedozwolony.
- Gracz wycofany po wygranej w drabince – przeciwnik przechodzi walkowerem (BYE). W round-robin mecze wycofanego gracza zamieniają się w BYE przeciwnika.
- Tabela: najpierw gracze drabinki (jeszcze grający wg rozstawienia, potem odpadli – przegrani rundy z m meczami dzielą miejsce m+1, np. dwóch trzecich), potem reszta wg tabeli Swiss/RR.
- Zamiana graczy przed startem rundy działa tylko w rundach Swiss (drabinka i RR wynikają z rozstawienia – można odrzucić rundę i wygenerować ponownie). Systemu nie da się zmienić po wygenerowaniu 1. rundy.

## Plan rund (kreator turnieju)
- Dla każdej rundy: scenariusz (ustawiany automatycznie przy generowaniu), metoda parowania (tylko Swiss: runda 1 – losowo / ELO silny–silny / ELO górna–dolna połowa; kolejne – Swiss wg wyników / losowo / ELO), kolejność stołów i preferencje miękkie.
- Każda metoda zachowuje twarde zasady: bez powtórek, BYE najwyżej raz. Metody losowe i ELO w dalszych rundach ignorują wyniki.
- Stoły: **wg punktów** – para z najwyżej sklasyfikowanym graczem (wygrane → duże → małe punkty; w 1. rundzie parowanej wg ELO – ELO) przy stole 1, kolejna przy 2…; **losowo** – pary rozłożone losowo, lista w kolejności stołów. BYE zawsze na końcu, bez stołu. Round-robin: plan ustala scenariusz i stoły; eliminacje: tylko scenariusz (stół = miejsce w drabince).
- Brak wiersza planu = zachowanie domyślne (1. runda wg ustawień turnieju, dalej Swiss, stoły wg punktów).
- Plan można edytować w panelu organizatora dla rund jeszcze niewygenerowanych; wygenerowane rundy są zablokowane (scenariusz zmienia się przy samej rundzie).

## ELO
- Globalne: start 1500, K=32, remis = 0,5. Liczone przez odtworzenie wszystkich potwierdzonych, rozegranych gier (turniejowe – kolejność wg startu rundy; własne gry – wg daty gry). BYE i SPLIT nie zmieniają ELO. Wynik jest cache'owany do czasu potwierdzenia/poprawy jakiejkolwiek gry.
- Tryby ELO pierwszej rundy Swiss (silny–silny, górna–dolna połowa) używają globalnego ELO.

## Własne gry
- Zgłasza jeden gracz, potwierdza lub odrzuca przeciwnik; zgłaszający może wycofać zgłoszenie przed decyzją. Liczą się dopiero po potwierdzeniu.
- Data: z ostatniego roku, nie z przyszłości. Maks. 20 niepotwierdzonych zgłoszeń na gracza.
- Opcjonalnie liga: tylko jeśli liga liczy własne gry, obaj gracze są członkami i data mieści się w sezonie.

## Ligi
- Zakłada każdy zalogowany (sezon z datami). Członkostwo: dołączenie samemu; właściciel może usuwać członków.
- Turnieje zgłasza organizator turnieju, akceptuje właściciel ligi (turnieje właściciela – od razu). Do tabeli liczą się **zakończone** zaakceptowane turnieje; w tabeli są wszyscy ich uczestnicy.
- Tryby tabeli:
  - **Punkty za miejsce** – tabela punktów (np. 10/8/6/5/4/3/2/1, dalsze miejsca: punkt za udział) × mnożnik rangi (lokal/master/międzynarodowy). Bez własnych gier.
  - **Duże punkty × mnożnik** – duże punkty z turnieju (po karach) × mnożnik rangi turnieju (lokal / master / międzynarodowy – ustawia właściciel ligi). Własne gry: punkty W/R/P ligi × mnożnik gier własnych. Remisy w tabeli rozstrzygają małe punkty.
  - **ELO ligowe** – osobny ranking od 1500 z gier turniejów ligi i własnych gier w lidze.

## Rozpiski w grach własnych
- Przy zgłaszaniu gry można dodać rozpiskę swoją i przeciwnika: frakcja, sojusznik, postacie, wzmocnienia (te same zasady dostępności co w turniejach), lider opcjonalny, bez limitu punktów. Rozpiska ustala frakcję gry.
- Rozpiski widzą tylko obaj gracze; publicznie widać wyłącznie zagregowane statystyki.

## Profile
- Publiczne: nick, klub, miasto, ELO i miejsce w rankingu, W/R/P, historia ELO, turnieje z miejscem, ligi z pozycją, ostatnie gry ze zmianą ELO, frakcje z rozpisek. Bez e-maila.
- Wyszukiwarka graczy (do zgłaszania gier) tylko dla zalogowanych.
- Statystyki gry (z gier ze znaną frakcją / rozpiską; turnieje – rozpiska turniejowa, gry własne – rozpiski z gry): top 5 postaci (wystawiane, z wygranymi), top 5 postaci przeciwnika przy porażkach, wykresy kołowe frakcji granych / wygranych / przegranych oraz frakcji przeciwników (grane / wygrane / przegrane przeciwko). Misje: wykres kołowy rozegranych misji oraz top 5 misji z wygranymi i z porażkami (misja gry turniejowej = scenariusz rundy ustawiony przez organizatora, gry własnej = scenariusz podany przy zgłoszeniu). Kolor frakcji/misji jest stały we wszystkich wykresach.

## Dane testowe (tylko lokalnie)
- `tools/seed/test1_games.sql` – 4 przeciwników (Aldric, Brena, Cador, Dara) i 18 potwierdzonych gier własnych z rozpiskami dla istniejącego konta **test1**. Można uruchamiać wielokrotnie (usuwa wcześniejsze gry oznaczone `[seed]`).
- Uruchomienie (po starcie backendu, żeby weszły migracje): `docker compose exec -T postgres psql -U skirmish -d skirmish < tools/seed/test1_games.sql`
- Generator: `python3 tools/seed/make_test1_games.py`.
