# Wdrożenie na serwer (warbracket.pl)

Stos: Caddy (HTTPS z Let's Encrypt) → frontend Next.js → backend Spring Boot → PostgreSQL 17,
plus codzienny backup bazy. Na zewnątrz otwarte są tylko porty 80 i 443.

## Pierwsze uruchomienie (raz)
Na serwerze (`ssh root@46.225.172.142`):
```bash
mkdir -p /opt/warbracket && cd /opt/warbracket
# Sekrety – plik tylko dla roota:
umask 077
cat > .env <<'ENV'
DOMAIN=warbracket.pl
ACME_EMAIL=twoj@email
DB_PASSWORD=<openssl rand -base64 32>
JWT_SECRET=<openssl rand -base64 48>
MAIL_HOST=...
MAIL_PORT=587
MAIL_USER=...
MAIL_PASSWORD=...
MAIL_FROM=no-reply@warbracket.pl
ENV
```
Pełna lista zmiennych: `deploy/.env.example`. DNS `warbracket.pl` i `www.warbracket.pl` musi wskazywać na serwer,
a porty 80/443 muszą być wolne (Caddy sam pobierze certyfikaty).

## Każde wdrożenie
Na swoim komputerze (Git Bash), z katalogu repo, po commicie:
```bash
./deploy/deploy.sh
```
Skrypt wysyła ostatni commit (`git archive`, bez `scans/` i sekretów) do `/opt/warbracket/app`
i przebudowuje kontenery. Migracje bazy (Flyway) uruchamiają się przy starcie backendu.

## Tereny 3D stołu online
Pliki z `frontend/public/terrain3d/` (około 370 MB, w repozytorium przez Git LFS) nie wchodzą do obrazu frontendu.
`deploy.sh` wysyła je do `/opt/warbracket/terrain3d`, a Caddy podaje pod `/terrain3d/*`. Wysyłka idzie tylko wtedy,
gdy zmienił się zestaw plików (nazwy i rozmiary), więc zwykłe wdrożenie kodu jej nie powtarza. Na komputerze, z którego
wdrażasz, pliki muszą być prawdziwe (`git lfs pull`), a nie wskaźniki – skrypt to sprawdza.

## Przydatne komendy (na serwerze)
```bash
cd /opt/warbracket
alias wb='docker compose --env-file /opt/warbracket/.env -f /opt/warbracket/app/deploy/docker-compose.yml'
wb ps                      # stan
wb logs -f backend         # logi backendu (też: frontend, caddy, db)
wb restart backend
wb exec backup ls -l /backups          # lista backupów
# Odtworzenie backupu:
wb exec backup sh -c 'pg_restore -h db -U warbracket -d warbracket --clean --if-exists /backups/<plik>.dump'
```
Kopie backupów warto regularnie ściągać poza serwer, np.
`scp root@46.225.172.142:/var/lib/docker/volumes/warbracket_backups/_data/* ./backupy/`.

## Usługa zasad gry (kontener `rules`)
Stoły standardowe gry online rozstrzyga silnik gry uruchomiony jako osobny kontener Node (`rules/`, port 8090,
dostępny tylko w sieci Dockera). Backend woła go pod `RULES_URL=http://rules:8090`; startuje dopiero, gdy `rules`
jest zdrowy. Usługa nie ma własnej bazy – dziennik zdarzeń trzyma backend (`table_events`), więc restart `rules`
niczego nie gubi.

- `RULES_KEY` (opcjonalnie, w `.env`): wspólny klucz backendu i usługi; pusty = bez klucza.
- `TABLE_ENGINE` (domyślnie `GAME`): `LEGACY` przywraca pierwszy panel dla nowo zakładanych stołów standardowych.
  Stoły już założone zostają przy swoim silniku (kolumna `game_tables.engine`, migracja V26).
- Diagnostyka: `wb logs -f rules`, `wb exec rules node -e "fetch('http://localhost:8090/health').then(r=>r.text()).then(console.log)"`.
  Błąd „Silnik zasad gry chwilowo nie odpowiada” (`TABLE_RULES_UNAVAILABLE`) = backend nie dosięga `rules`.
