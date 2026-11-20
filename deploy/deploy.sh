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

# 3D terrain (about 370 MB, Git LFS): not in the archive – the files go to $DIR/terrain3d, served by Caddy.
# They are sent only when the set of files (names and sizes) differs from what the server has.
TERRAIN=frontend/public/terrain3d
if [ -d "$TERRAIN" ]; then
  FIRST="$(find "$TERRAIN" -type f -name '*.glb' | head -n 1)"
  if [ -n "$FIRST" ] && head -c 200 "$FIRST" | grep -q 'git-lfs'; then
    echo "W $TERRAIN są tylko wskaźniki Git LFS – uruchom: git lfs pull" >&2
    exit 1
  fi
  SUM="$(cd "$TERRAIN" && find . -type f -printf '%P %s\n' | LC_ALL=C sort | sha1sum | cut -d' ' -f1)"
  HAVE="$(ssh "$SERVER" "cat $DIR/terrain3d/.sum 2>/dev/null || true")"
  if [ "$SUM" != "$HAVE" ]; then
    echo "Wysyłam tereny 3D ($(du -sh "$TERRAIN" | cut -f1)) – to potrwa kilka minut ..."
    tar -c -C "$TERRAIN" . | ssh "$SERVER" "set -e
      mkdir -p $DIR/terrain3d && tar -x -C $DIR/terrain3d
      chmod -R a+rX $DIR/terrain3d
      echo $SUM > $DIR/terrain3d/.sum"
  else
    echo "Tereny 3D bez zmian."
  fi
fi
ssh "$SERVER" "mkdir -p $DIR/terrain3d"

ssh "$SERVER" "set -e
  cd $DIR
  rm -rf app.old
  if [ -d app ]; then mv app app.old; fi
  mv app.new app
  docker compose --env-file $DIR/.env -f app/deploy/docker-compose.yml up -d --build --remove-orphans
  docker image prune -f > /dev/null
  docker compose --env-file $DIR/.env -f app/deploy/docker-compose.yml ps"

echo "Gotowe: https://warbracket.pl (wersja $REV)"
