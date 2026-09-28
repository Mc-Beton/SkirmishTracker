# Parowanie Swiss

Kod: `backend/src/main/java/com/skirmishchronicle/pairing/` (bez zależności od Springa, testy w `src/test/.../pairing`).

## Algorytm

Każda runda to **minimalne dopasowanie doskonałe** w grafie graczy (algorytm Blossom Edmondsa, port `mwmatching` J. van Rantwijka, O(n³)).

- **Zasady twarde** (brak krawędzi): brak powtórek, BYE maksymalnie raz na gracza.
- **Koszt pary** – poziomy leksykograficzne, każdy ważniejszy od sumy wszystkich niższych:
  1. różnica liczby wygranych (remis = porażka, BYE = wygrana),
  2. preferencje miękkie: klub > frakcja > miejscowość (włączane przez organizatora),
  3. odległość w tabeli (wygrane → duże punkty → małe punkty) – sąsiedzi grają ze sobą.
- Preferencja miękka może więc zmienić przeciwnika na innego **z tą samą liczbą wygranych**, nigdy z inną.
- **BYE** (nieparzysta liczba graczy): wirtualny wierzchołek, najtańszy dla najniżej sklasyfikowanego gracza z najmniejszą liczbą wygranych, który BYE jeszcze nie miał.
- **Patrzenie o rundę w przód**: jeśli po wybranym parowaniu następna runda byłaby niemożliwa, silnik szuka innego parowania (małe turnieje blisko limitu „każdy z każdym”).
- Gdy parowanie bez powtórek nie istnieje – błąd `NO_VALID_PAIRING`, organizator ustawia pary ręcznie.

## Runda 1

1. Pary stałe: przyjęte wyzwania + pary organizatora.
2. BYE: losowo (tryb losowy) albo losowo z dolnej połowy ELO (tryby ELO).
3. Reszta: losowo / ELO „silny z silnym” (1–2, 3–4) / ELO „górna połowa z dolną” (1–5, 2–6, 3–7, 4–8 przy 8 graczach).
4. Preferencje miękkie w rundzie 1 – opcja organizatora.

Tryby ELO są gotowe w silniku, ale dostępne dopiero dla turniejów ligowych (etap 4).

## Wyzwania (tylko runda 1, opcja organizatora)

- Tylko potwierdzeni gracze; jedno otwarte wyzwanie na gracza – kto ma oczekujące wyzwanie (wysłane lub otrzymane), musi je rozstrzygnąć, zanim wyzwie kogoś innego.
- Przyjęcie = para w 1. rundzie; inne oczekujące wyzwania obu graczy są anulowane.
- Wycofanie własnego wyzwania – tak. Widoczność przyjętych wyzwań przed startem – opcja organizatora.
- Organizator może ustawiać pary na 1. rundę niezależnie od tej opcji.

## Wyniki

Gracz wpisuje małe punkty → przeciwnik potwierdza (lub zgłasza błąd → decyduje organizator). Ten sam wynik wpisany przez obu = automatyczne potwierdzenie. Organizator może ustawić/poprawić każdy wynik (także SPLIT); wszystko trafia do historii zmian. Duże punkty są liczone z małych według ustawień turnieju, więc zmiana punktacji przelicza całą tabelę.
