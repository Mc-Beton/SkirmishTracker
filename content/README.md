# Dane gry

Tu trafią pliki do importu (etap 2):

- `units.xlsx` — koszty postaci wg frakcji (od Filipa).
- `items.xlsx` — wzmocnienia/przedmioty: arkusz „Neutral Upgrades” + arkusze frakcyjne.
- Po zmianie któregoś pliku: `python3 tools/import_units.py` (generuje `backend/src/main/resources/content/eldfall-armies.json`).
- `scenarios/*.json` — scenariusze przepisane ze skanów wg modelu z `docs/game-content-model.md`.
- `schemes/*.json` — scheme i tabele k20 dla każdej frakcji.
- `maps/*.svg|png` — własne rysunki map.
