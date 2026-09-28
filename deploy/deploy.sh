#!/usr/bin/env bash
# Deploys the committed state of this repo to the server (run from Git Bash on your computer):
#   ./deploy/deploy.sh                  # root@46.225.172.142
#   ./deploy/deploy.sh user@host
# Code goes to /opt/warbracket/app, secrets stay in /opt/warbracket/.env (created once, see deploy/README.md).
set -euo pipefail

SERVER="${1:-root@46.225.172.142}"
DIR=/opt/warbracket

cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain)" ]; then
  echo "Masz niezacommitowane zmiany – wdrażany jest tylko ostatni commit. Zrób commit i spróbuj ponownie." >&2
  exit 1
fi
REV="$(git rev-parse --short HEAD)"
echo "Wdrażam $REV na $SERVER ..."

# Only tracked files are sent (never scans/, .env or node_modules).
git archive --format=tar HEAD | ssh "$SERVER" "set -e
  test -f $DIR/.env || { echo 'Brak $DIR/.env – utwórz go według deploy/README.md' >&2; exit 1; }
  rm -rf $DIR/app.new && mkdir -p $DIR/app.new && tar -x -C $DIR/app.new
  echo $REV > $DIR/app.new/REVISION"

ssh "$SERVER" "set -e
  cd $DIR
  rm -rf app.old
  if [ -d app ]; then mv app app.old; fi
  mv app.new app
  docker compose --env-file $DIR/.env -f app/deploy/docker-compose.yml up -d --build --remove-orphans
  docker image prune -f > /dev/null
  docker compose --env-file $DIR/.env -f app/deploy/docker-compose.yml ps"

echo "Gotowe: https://warbracket.pl (wersja $REV)"
