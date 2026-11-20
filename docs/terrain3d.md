# Zasoby stołu 3D i startowa biblioteka 2D

## Pliki

- `frontend/public/terrain3d/models/<id>.glb` – 37 modeli terenu: 5 z pierwszego zestawu (altar, arch, boulders, corner,
  tree) i 32 z drugiego (19.11.2026: ogród, las, mróz). Przygotowane z plików Meshy w repozytorium gry:
  `python tools/figure_reduce.py in.glb out.glb 110 2048 wide` (80–340 MB → 5–11 MB). Model ma 1 jednostkę szerokości,
  stoi na y = 0.
- `frontend/public/terrain3d/models-light/<id>.glb` – te same 37 modeli w wersji lekkiej (`… 55 1024 wide`: rzadsza siatka,
  tekstury 1024; 2–7 MB, razem 98 MB zamiast 268 MB). Którą wersję ładuje stół, wybiera gracz (jakość grafiki).
- `frontend/public/terrain3d/grounds/<id>.jpg` – malowane podłoża map 36″×36″: `stream`, `garden`, `desert`, `frozen`.
- `frontend/public/terrain3d/tops/<id>.webp` – te same modele widziane z góry (512 px, przezroczyste tło, obraz obejmuje
  1,1 szerokości modelu): widok 2D stołu 3D i obrazy elementów startowej biblioteki 2D.
- Zestawy (kształty zasad, rozmiary), podłoża i mapy: `frontend/src/lib/eld/maps.ts` (`KITS`, `BASES`, `MAPS`) – wspólne
  z grą; jedno źródło dla stołu 3D, usługi `rules/` i skryptu biblioteki 2D.

Serwowane pod `/terrain3d/…` (stała `ASSETS` w `frontend/src/lib/eld3d/assets.ts`); service worker ich nie zapisuje.

**Modele i podłoża (ok. 370 MB z zestawem lekkim) są w repozytorium przez Git LFS, ale nie w obrazie frontendu.**
`deploy/deploy.sh` wysyła kod przez `git archive` (katalog ma `export-ignore`, bo archiwum zawierałoby same wskaźniki
LFS), a pliki terenu osobno do `/opt/warbracket/terrain3d`; Caddy podaje je pod `/terrain3d/*`. Szczegóły: sekcja
„Git LFS” niżej i `deploy/README.md`.

## Startowa biblioteka 2D

`tools/seed/table_library.ts` tworzy przez API (konto z rolą `ADMIN`): 4 tła (strumienie jako Shallow Water),
37 elementów terenu z kształtami zasad i mapy gry jako oficjalne mapy 2D (elementy bez obrazu – zwykłe mury i skały
gry – są pomijane).

```powershell
cd D:\Apps\WarBracket2
node --experimental-strip-types tools/seed/table_library.ts            # podgląd, nic nie zmienia
$env:WB_ADMIN_EMAIL="…"; $env:WB_ADMIN_PASSWORD="…"
node --experimental-strip-types tools/seed/table_library.ts --apply    # WB_URL domyślnie http://localhost:8080
```

Można uruchamiać ponownie: to, co już istnieje pod tą samą nazwą, zostaje. **Wysyłanie przez API nie było uruchomione**
(sprawdzony jest tylko podgląd) – przy pierwszym uruchomieniu może wyjść odmowa walidacji do poprawienia.

## Git LFS (decyzja 20.11.2026)

Pliki z `frontend/public/terrain3d/` idą do repozytorium przez Git LFS (reguła w `.gitattributes`).

- Raz na komputerze: `git lfs install`. Potem zwykłe `git add frontend/public/terrain3d` i commit.
- Wdrożenie: `./deploy/deploy.sh` wysyła pliki z katalogu roboczego (muszą być prawdziwe, nie wskaźniki –
  po świeżym klonie `git lfs pull`). Serwer nie potrzebuje Git LFS.
- Całość ma około 370 MB. Każde pełne pobranie repozytorium zużywa tyle transferu LFS, więc warto sprawdzić
  limit miejsca i transferu LFS na koncie GitHub.
