#!/usr/bin/env bash
# LOCAL DEV ONLY — patches the Rocket.Chat container so private apps can be
# installed, enabled and updated without an enterprise license:
#   1. RC 8.x Community defaults the privateApps license limit to 0
#      (blocks enabling locally deployed apps; real users install the
#      marketplace build, which is allowed up to 5).
#   2. Community (unlicensed) workspaces refuse to update private apps
#      ("Cannot_Update_Exempt_App"), breaking the rc-apps deploy loop.
#
# Usage: ./dev/allow-private-apps.sh   (restarts Rocket.Chat if a patch was applied)
set -euo pipefail

CONTAINER="${ROCKETCHAT_CONTAINER:-rc-auto-reply-rocketchat-1}"
LICENSE_FILE="/app/bundle/programs/server/npm/node_modules/@rocket.chat/license/dist/validation/validateDefaultLimits.js"
APPJS="/app/bundle/programs/server/app/app.js"

needs_restart=0

if docker exec "$CONTAINER" grep -q "max: 0," "$LICENSE_FILE" 2>/dev/null; then
    docker exec "$CONTAINER" sed -i "s/max: 0,/max: 42,/" "$LICENSE_FILE"
    echo "patched privateApps license limit (0 -> 42)"
    needs_restart=1
else
    echo "privateApps license limit already patched"
fi

if docker exec "$CONTAINER" grep -q "const isExemptApp = isPrivateAppUpload && isCommunityWorkspace;" "$APPJS" 2>/dev/null; then
    docker exec "$CONTAINER" sed -i "s/const isExemptApp = isPrivateAppUpload && isCommunityWorkspace;/const isExemptApp = false;/" "$APPJS"
    echo "patched private-app update block (Cannot_Update_Exempt_App)"
    needs_restart=1
else
    echo "private-app update block already patched"
fi

if [ "$needs_restart" = "0" ]; then
    exit 0
fi

docker restart "$CONTAINER" >/dev/null
echo "restarting Rocket.Chat..."
for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/ 2>/dev/null || echo 000)
    if [ "$code" = "200" ]; then echo "Rocket.Chat is up"; exit 0; fi
    sleep 5
done
echo "Rocket.Chat did not come back up" >&2
exit 1
