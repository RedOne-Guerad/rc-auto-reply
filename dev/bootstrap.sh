#!/usr/bin/env bash
# One-time bootstrap for the local Rocket.Chat dev server (docker compose).
# - waits for the server
# - registers the admin user on first run (skipped afterwards)
# - creates test users alice / bob / carol
# - enables the App Framework dev mode and E2EE so the app can be deployed/tested
#
# Usage: ./dev/bootstrap.sh
set -uo pipefail

URL="${RC_URL:-http://localhost:3000}"
ADMIN_USER="${RC_ADMIN_USER:-devadmin}"
ADMIN_PASS="${RC_ADMIN_PASS:-Devpassword123!}"
ADMIN_EMAIL="${RC_ADMIN_EMAIL:-devadmin@example.com}"
USERS_PASS="${RC_USERS_PASS:-Devpassword123!}"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAILED: %s\n' "$*" >&2; exit 1; }

# 1. Wait for the server to be up (first boot builds indexes, can take minutes)
say "Waiting for Rocket.Chat at $URL ..."
for _ in $(seq 1 120); do
    # any HTTP answer (even 401) means the API is serving; plain 404s mean still booting
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$URL/api/v1/settings/public" || echo 000)
    if [ "$code" != "000" ] && [ "$code" != "404" ]; then break; fi
    sleep 5
done

# 2. Create the first admin via the public registration endpoint (the first
# user registered on a fresh server automatically receives the admin role).
# Note: "admin" is a blocked username in Rocket.Chat, hence "devadmin".
say "Registering first admin user (ignored if it already exists) ..."
curl -s "$URL/api/v1/users.register" \
    -H 'Content-Type: application/json' \
    -d "{
        \"username\": \"$ADMIN_USER\",
        \"email\": \"$ADMIN_EMAIL\",
        \"pass\": \"$ADMIN_PASS\",
        \"name\": \"Dev Admin\"
    }" | head -c 300; echo

# 3. Login as admin
say "Logging in as $ADMIN_USER ..."
LOGIN=$(curl -s "$URL/api/v1/login" -d "user=$ADMIN_USER&password=$ADMIN_PASS")
STATUS=$(printf '%s' "$LOGIN" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status'))" 2>/dev/null)
if [ "$STATUS" != "success" ]; then
    fail "Admin login failed. If this is a fresh server, complete the setup wizard at $URL manually (admin: $ADMIN_USER / $ADMIN_PASS), then re-run this script."
fi
USER_ID=$(printf '%s' "$LOGIN" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['userId'])")
AUTH_TOKEN=$(printf '%s' "$LOGIN" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['authToken'])")
AUTH=(-H "X-User-Id: $USER_ID" -H "X-Auth-Token: $AUTH_TOKEN" -H 'Content-Type: application/json')
say "Logged in as admin ($USER_ID)"

# 4. Create test users
create_user() { # create_user <username> <name>
    curl -s "$URL/api/v1/users.create" "${AUTH[@]}" \
        -d "{\"username\": \"$1\", \"email\": \"$1@example.com\", \"name\": \"$2\", \"password\": \"$USERS_PASS\", \"roles\": [\"user\"], \"joinDefaultChannels\": false, \"verified\": true}" | head -c 200; echo
}
say "Creating test users (alice, bob, carol) ..."
create_user alice Alice
create_user bob Bob
create_user carol Carol

# 5. Server settings for a smooth dev/test experience
set_setting() { # set_setting <id> <value-json>
    curl -s "$URL/api/v1/settings/$1" "${AUTH[@]}" -d "{\"value\": $2}" | head -c 150; echo
}
say "Disabling email 2FA (blocks scripted logins), REST rate limiter (blocks test polling), marking setup complete, enabling E2EE ..."
set_setting "Accounts_TwoFactorAuthentication_Enabled" false
set_setting "API_Enable_Rate_Limiter" false
set_setting "API_Enable_Rate_Limiter_Dev" false
set_setting "Show_Setup_Wizard" '"completed"'
set_setting "E2E_Enable" true

# 6. Allow enabling private apps (dev-only license-limit patch, see script header)
if [ -x "$(dirname "$0")/allow-private-apps.sh" ]; then
    "$(dirname "$0")/allow-private-apps.sh" || fail "private-app license patch failed"
fi

say "Bootstrap done. Deploy the app with: npm run deploy"
