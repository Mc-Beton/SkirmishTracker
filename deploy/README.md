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
