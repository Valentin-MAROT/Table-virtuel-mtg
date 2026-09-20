#!/usr/bin/env bash
# Déploiement sur Serveur2, derrière le reverse proxy de Serveur.
#
#   ./scripts/deploy.sh
#
# Ce qui tourne où :
#   - Serveur2 (10.0.40.200) : les conteneurs, dans ~/mtg-vtt, publiés sur
#     10.0.40.200:3120 — l'IP du LAN seulement, jamais 0.0.0.0.
#   - Serveur  (10.0.40.199) : nginx, vhost magic.valentin-marot.fr, certificat
#     wildcard *.valentin-marot.fr déjà en place (aucun certbot à lancer).
#
# Le `.env` de production vit sur le serveur et n'est jamais transféré : il
# contient les secrets de session, de base et de SMTP.
set -euo pipefail

HOST="${DEPLOY_HOST:-Serveur2}"
DIR="${DEPLOY_DIR:-mtg-vtt}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ Vérifications locales"
npx tsc -b --pretty false
npx vitest run --silent >/dev/null

echo "→ Transfert du code vers $HOST:~/$DIR"
tar -czf - -C "$ROOT" \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=dist-types \
  --exclude='*.tsbuildinfo' \
  --exclude=.env \
  --exclude=playwright-report \
  --exclude=test-results \
  . | ssh "$HOST" "mkdir -p ~/$DIR && tar -xzf - -C ~/$DIR"

echo "→ Reconstruction et redémarrage"
ssh "$HOST" "cd ~/$DIR && docker compose up -d --build"

echo "→ Attente de la santé du service"
ssh "$HOST" '
  for i in $(seq 1 30); do
    out=$(curl -s -m 5 http://10.0.40.200:3120/api/health || true)
    if [ -n "$out" ]; then echo "$out"; exit 0; fi
    sleep 3
  done
  echo "le service ne répond pas" >&2; exit 1
'

echo "→ Vérification à travers le reverse proxy"
ssh Serveur '
  curl -s -k -m 10 --resolve magic.valentin-marot.fr:443:127.0.0.1 \
    https://magic.valentin-marot.fr/api/health
  echo
  # La montée en WebSocket doit répondre 101 : tout le jeu en dépend.
  # --http1.1 est indispensable, une requête HTTP/2 ne porte pas de Upgrade.
  #
  # Le timeout est ici le cas NOMINAL, et c’est tout le piège : quand la
  # montée réussit, le serveur bascule en WebSocket et garde la connexion
  # ouverte. curl n’a plus de réponse à terminer, tient jusqu’à son -m,
  # puis sort en 28. Le set -euo pipefail faisait alors échouer le script sur
  # un déploiement réussi — et un garde-fou qui crie au loup à chaque passage
  # n’en est plus un : le jour où le 101 ne viendrait pas, l’erreur aurait
  # exactement la même allure que d’habitude, et personne ne la lirait.
  #
  # On lit donc le code, et on n’échoue que s’il n’est pas 101. Les apostrophes
  # de ce bloc sont typographiques : le bloc est passé à ssh entre quotes simples.
  code=$(curl -s -k -m 10 -o /dev/null -w "%{http_code}" --http1.1 \
    --resolve magic.valentin-marot.fr:443:127.0.0.1 \
    -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    https://magic.valentin-marot.fr/ws/rooms/ABCDEF || true)
  echo "WebSocket : ${code:-aucune réponse}"
  if [ "$code" != "101" ]; then
    echo "le proxy ne relaie pas l’Upgrade : pas de 101" >&2
    exit 1
  fi
'

echo "✓ Déployé"
