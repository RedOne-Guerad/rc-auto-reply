#!/usr/bin/env python3
"""Small helper for testing the rc-auto-reply app against a local Rocket.Chat.

Usage:
  python3 dev/rcapi.py <command> [args...]

Commands:
  login <user>                          -> prints "userId authToken"
  dm <user> <peer>                      -> prints DM roomId
  say <user> <roomId> <text...>         -> sends a message
  cmd <user> <roomId> <command> [params] -> runs a slash command
  history <user> <roomId> [count]       -> last messages (u: msg)
  user-info <admin> <username>          -> user id
  delete-user <admin> <username>        -> deletes a user
  channel-create <user> <name>          -> prints roomId
  channel-join <user> <roomId>
  setting <admin> <id> <value-json>     -> set a server setting
"""
import json
import sys
import urllib.request
import urllib.parse

BASE = "http://localhost:3000"
PASS = "Devpassword123!"
TOKENS = {}


def api(method, path, body=None, user=None):
    url = BASE + path
    data = None
    headers = {"Content-Type": "application/json"}
    if user:
        uid, tok = TOKENS[user]
        headers["X-User-Id"] = uid
        headers["X-Auth-Token"] = tok
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            return {"success": False, "error": f"HTTP {e.code}"}


def login(user):
    if user in TOKENS:
        return TOKENS[user]
    r = api("POST", "/api/v1/login", {"user": user, "password": PASS})
    if not r.get("success"):
        raise SystemExit(f"login failed for {user}: {r}")
    TOKENS[user] = (r["data"]["userId"], r["data"]["authToken"])
    return TOKENS[user]


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]

    if cmd == "login":
        uid, tok = login(sys.argv[2])
        print(uid, tok)

    elif cmd == "dm":
        user, peer = sys.argv[2], sys.argv[3]
        login(user)
        r = api("POST", "/api/v1/im.create", {"username": peer}, user)
        print(r.get("room", {}).get("_id", r))

    elif cmd == "say":
        user, room = sys.argv[2], sys.argv[3]
        text = " ".join(sys.argv[4:])
        login(user)
        r = api("POST", "/api/v1/chat.postMessage", {"roomId": room, "text": text}, user)
        if not r.get("success"):
            print(json.dumps(r))

    elif cmd == "cmd":
        user, room, command = sys.argv[2], sys.argv[3], sys.argv[4]
        params = " ".join(sys.argv[5:])
        login(user)
        r = api("POST", "/api/v1/chat.command", {"roomId": room, "command": command, "params": params}, user)
        if not r.get("success"):
            print(json.dumps(r))

    elif cmd == "history":
        user, room = sys.argv[2], sys.argv[3]
        count = sys.argv[4] if len(sys.argv) > 4 else "10"
        login(user)
        r = api("GET", f"/api/v1/im.history?roomId={room}&count={count}", None, user)
        for m in reversed(r.get("messages", [])):
            u = m.get("alias") or m.get("u", {}).get("username")
            print(f"{u}: {m.get('msg', '')[:100]}")

    elif cmd == "channel-history":
        user, room = sys.argv[2], sys.argv[3]
        count = sys.argv[4] if len(sys.argv) > 4 else "10"
        login(user)
        r = api("GET", f"/api/v1/channels.history?roomId={room}&count={count}", None, user)
        for m in reversed(r.get("messages", [])):
            u = m.get("alias") or m.get("u", {}).get("username")
            print(f"{u}: {m.get('msg', '')[:100]}")

    elif cmd == "user-info":
        admin, username = sys.argv[2], sys.argv[3]
        login(admin)
        r = api("GET", f"/api/v1/users.info?username={username}", None, admin)
        u = r.get("user", {})
        print(u.get("_id", json.dumps(r)))

    elif cmd == "delete-user":
        admin, username = sys.argv[2], sys.argv[3]
        login(admin)
        r = api("GET", f"/api/v1/users.info?username={username}", None, admin)
        uid = r.get("user", {}).get("_id")
        if not uid:
            print(json.dumps(r))
            return
        r = api("POST", "/api/v1/users.delete", {"userId": uid, "confirmRelinquish": True}, admin)
        print(json.dumps(r))

    elif cmd == "channel-create":
        user, name = sys.argv[2], sys.argv[3]
        login(user)
        r = api("POST", "/api/v1/channels.create", {"name": name}, user)
        print(r.get("channel", {}).get("_id", json.dumps(r)))

    elif cmd == "channel-join":
        user, room = sys.argv[2], sys.argv[3]
        login(user)
        r = api("POST", "/api/v1/channels.join", {"roomId": room, joinCode: ""}, user) if False else api(
            "POST", "/api/v1/channels.join", {"roomId": room}, user)
        print(json.dumps(r))

    elif cmd == "setting":
        admin, sid = sys.argv[2], sys.argv[3]
        value = json.loads(sys.argv[4])
        login(admin)
        r = api("POST", f"/api/v1/settings/{sid}", {"value": value}, admin)
        print(json.dumps(r))

    else:
        raise SystemExit(f"unknown command {cmd}")


if __name__ == "__main__":
    main()
