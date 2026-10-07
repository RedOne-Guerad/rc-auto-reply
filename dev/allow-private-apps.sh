#!/usr/bin/env bash
# LOCAL DEV ONLY — patches the Rocket.Chat container so private apps can be
# enabled without an enterprise license (RC 8.x Community defaults to
# privateApps max = 0, which blocks locally deployed apps; real users install
# the marketplace build, which is allowed up to 5).
#
# Usage: ./dev/allow-private-apps.sh   (then it restarts Rocket.Chat)
set -euo pipefail

CONTAINER="${ROCKETCHAT_CONTAINER:-rc-auto-reply-rocketchat-1}"
FILE="/app/bundle/programs/server/npm/node_modules/@rocket.chat/license/dist/validation/validateDefaultLimits.js"

if docker exec "$CONTAINER" grep -q "max: 42" "$FILE" 2>/dev/null; then
    echo "private-app limit already patched"
    exit 0
fi

docker exec "$CONTAINER" sed -i "s/max: 0,/max: 42,/" "$FILE"
docker exec "$CONTAINER" grep -A3 privateApps "$FILE"
docker restart "$CONTAINER" >/dev/null
echo "patched and restarting Rocket.Chat..."
for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/ 2>/dev/null || echo 000)
    if [ "$code" = "200" ]; then echo "Rocket.Chat is up"; exit 0; fi
    sleep 5
done
echo "Rocket.Chat did not come back up" >&2
exit 1
