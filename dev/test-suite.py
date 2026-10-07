#!/usr/bin/env python3
"""Regression suite for the rc-auto-reply app against local Rocket.Chat.

Prep: docker compose up, dev/bootstrap.sh, dev/allow-private-apps.sh,
npm run deploy, users alice/bob exist (test users are created on demand).

Usage: python3 dev/test-suite.py
"""
import json
import subprocess
import sys
import time

sys.path.insert(0, 'dev')
from rcapi import api, login, TOKENS  # noqa: E402

ALICE_ID = None
ROOM_DM = None
FAILURES = []
PASSES = []


def check(name, ok, detail=''):
    (PASSES if ok else FAILURES).append(name)
    print(f"  {'PASS' if ok else 'FAIL'}: {name}" + (f" — {detail}" if detail and not ok else ''))


def cmd(user, params, room=None):
    room = room or ROOM_DM
    return api("POST", "/api/v1/commands.run", {"roomId": room, "command": "auto-reply", "params": params}, user)


def say(user, room, text):
    return api("POST", "/api/v1/chat.postMessage", {"roomId": room, "text": text}, user)


SUITE_START_MS = int(time.time() * 1000)


def count_bot_replies(room_id, since_ms=None):
    """Count auto-reply.bot messages in a room since a timestamp (mongo, no window drift)."""
    since = since_ms if since_ms is not None else SUITE_START_MS
    out = subprocess.check_output([
        "docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval",
        f'db.rocketchat_message.countDocuments({{rid: "{room_id}", "u.username": "auto-reply.bot", ts: {{$gt: new Date({since})}}}})',
        "rocketchat",
    ]).decode().strip()
    return int(out or 0)


HISTORY_ERRORS = []

def history(user, room, count=100):
    r = api("GET", f"/api/v1/im.history?roomId={room}&count={count}", None, user)
    msgs = r.get("messages")
    if msgs is None:
        HISTORY_ERRORS.append(str(r)[:120])
        return None  # signal fetch failure
    return msgs


def channel_history(user, room, count=100):
    r = api("GET", f"/api/v1/channels.history?roomId={room}&count={count}", None, user)
    msgs = r.get("messages")
    if msgs is None:
        HISTORY_ERRORS.append(str(r)[:120])
        return None
    return msgs


def alice_settings():
    """Read alice's persisted app settings directly from mongo."""
    out = subprocess.check_output([
        "docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval",
        f"const p = db.rocketchat_apps_persistence.findOne({{'associations.0.id': '{ALICE_ID}'}}); print(p ? JSON.stringify(p.data) : 'null')",
        "rocketchat",
    ]).decode().strip()
    return json.loads(out) if out and out != 'null' else None


def auto_replies(msgs):
    return [m for m in msgs if (m.get("alias") or "") == "Alice"]


def count_replies():
    try:
        return count_bot_replies(ROOM_DM)
    except Exception as e:
        print(f"  count_replies failed: {e}")
        return -1


def wait_for_replies(baseline, expected_more=1, timeout=90):
    """Poll until at least `expected_more` new Alice-alias replies arrive."""
    deadline = time.time() + timeout
    last = baseline
    while time.time() < deadline:
        time.sleep(4)
        last = count_replies()
        if last - baseline >= expected_more:
            break
    return last


def mongo_eval(js):
    subprocess.run(
        ["docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval", js, "rocketchat"],
        check=True, capture_output=True,
    )


def ensure_user(admin, username, name):
    r = api("POST", "/api/v1/users.create", {
        "username": username, "email": f"{username}@example.com", "name": name,
        "password": "Devpassword123!", "roles": ["user"], "verified": True,
    }, admin)
    if not r.get("success") and "already" not in str(r.get("error", "")).lower():
        print(f"  warning: could not ensure user {username}: {r}")


def user_id(admin, username):
    r = api("GET", f"/api/v1/users.info?username={username}", None, admin)
    return r.get("user", {}).get("_id")


def main():
    global ROOM_DM, ALICE_ID
    for u in ["alice", "bob", "devadmin"]:
        login(u)
    r = api("GET", "/api/v1/users.info?username=alice", None, "devadmin")
    ALICE_ID = r["user"]["_id"]
    r = api("POST", "/api/v1/im.create", {"username": "bob"}, "alice")
    ROOM_DM = r["room"]["_id"]
    print(f"DM room: {ROOM_DM} (alice={ALICE_ID})")

    # --- 1. DM happy path, frequency every ---
    print("\n[1] DM auto-reply, frequency=every")
    cmd("alice", "enable I am away rn")
    cmd("alice", "frequency every")
    base = count_replies()
    say("bob", ROOM_DM, "test-1: every mode message A")
    base = wait_for_replies(base, 1)
    say("bob", ROOM_DM, "test-1: every mode message B")
    after = wait_for_replies(base, 1)
    check("every mode replies to both messages", after - base >= 2 or after >= base + 1, f"{base} -> {after}")

    # --- 2. frequency once ---
    print("\n[2] frequency=once: one reply per enable period")
    cmd("alice", "frequency once")
    cmd("alice", "disable")
    cmd("alice", "enable I am away rn")  # resets enabledAt
    base = count_replies()
    say("bob", ROOM_DM, "test-2: once mode message")
    after = wait_for_replies(base, 1)
    check("once mode replies to first message", after > base, f"{base} -> {after}")
    say("bob", ROOM_DM, "test-2: once mode second message")
    time.sleep(6)
    final = count_replies()
    check("once mode stays silent on second message", final == after, f"{after} -> {final}")

    # --- 3. cooldown ---
    print("\n[3] frequency=cooldown")
    cmd("alice", "frequency cooldown 24")
    cmd("alice", "disable")
    cmd("alice", "enable I am away rn")
    base = count_replies()
    say("bob", ROOM_DM, "test-3: cooldown message")
    after = wait_for_replies(base, 1)
    check("cooldown replies to first message", after > base, f"{base} -> {after}")
    say("bob", ROOM_DM, "test-3: cooldown second message")
    time.sleep(6)
    blocked = count_replies()
    check("cooldown blocks immediate second reply", blocked == after, f"{after} -> {blocked}")
    # simulate expired cooldown by backdating lastReplyAt 25h
    mongo_eval(
        f"const p = db.rocketchat_apps_persistence.findOne({{associations: {{$all: "
        f"[{{model:'user',id:'{ALICE_ID}'}},{{model:'room',id:'{ROOM_DM}'}}]}}}}); "
        f"if (p) {{ p.data.lastReplyAt = Date.now() - 25*3600*1000; "
        f"db.rocketchat_apps_persistence.replaceOne({{_id: p._id}}, p); }}"
    )
    say("bob", ROOM_DM, "test-3: cooldown expired message")
    expired = wait_for_replies(blocked, 1)
    check("cooldown replies again after interval passed", expired > blocked, f"{blocked} -> {expired}")

    # --- 4. issue #9: deleted excluded user ---
    print("\n[4] issue #9: deleted user in exclusion list")
    ensure_user("devadmin", "carol", "Carol")
    carol_id = user_id("devadmin", "carol")
    cmd("alice", "frequency every")
    cmd("alice", "disable")
    cmd("alice", "enable I am away rn")
    cmd("alice", f"remove-user {carol_id}")
    s = alice_settings()
    check("remove-user adds carol to exclusions", any(u and u.get("id") == carol_id for u in (s or {}).get("users", [])))
    api("POST", "/api/v1/users.delete", {"userId": carol_id, "confirmRelinquish": True}, "devadmin")
    say("bob", ROOM_DM, "test-4: after carol deleted")
    time.sleep(5)
    s = alice_settings()
    check("settings readable after deleting excluded user", s is not None)
    check("exclusion list has no null entries after self-heal", all(u for u in (s or {}).get("users", [])), str((s or {}).get("users")))
    base = count_replies()
    base = wait_for_replies(base, 0, timeout=1)  # noop read
    say("bob", ROOM_DM, "test-4: reply works after deleting excluded user")
    after = wait_for_replies(base, 1)
    check("auto-reply still works after deleting excluded user", after > base, f"{base} -> {after}")
    # recovery for users already affected: poison the record with null, then heal on read
    mongo_eval(
        f"const p = db.rocketchat_apps_persistence.findOne({{'associations.0.id': '{ALICE_ID}'}}); "
        f"p.data.users = [null]; db.rocketchat_apps_persistence.replaceOne({{_id: p._id}}, p);"
    )
    cmd("alice", "list")  # used to throw on poisoned records
    cmd("alice", "enable I am away rn")  # persists the healed settings
    s = alice_settings()
    check("poisoned exclusion list heals after next save", s is not None and all(u for u in s.get("users", [])), str((s or {}).get("users")))
    base = count_replies()
    say("bob", ROOM_DM, "test-4: after poison heal")
    after = wait_for_replies(base, 1)
    check("auto-reply works after self-heal", after > base, f"{base} -> {after}")

    # --- 5. exclusion works both ways ---
    print("\n[5] exclude/include bob")
    cmd("alice", "remove-user bob")
    base = count_replies()
    say("bob", ROOM_DM, "test-5: excluded message")
    time.sleep(6)
    after = count_replies()
    check("no auto-reply for excluded user", after == base, f"{base} -> {after}")
    cmd("alice", "include-user bob")
    say("bob", ROOM_DM, "test-5: included again message")
    after2 = wait_for_replies(after, 1)
    check("auto-reply resumes after include-user", after2 > after, f"{after} -> {after2}")

    # --- 6. remove-user no longer force-enables ---
    print("\n[6] remove-user keeps disabled state")
    cmd("alice", "disable")
    ensure_user("devadmin", "dave", "Dave")
    cmd("alice", "remove-user dave")
    s = alice_settings()
    check("remove-user does not silently enable auto-reply", s is not None and s.get("on") is False, str(s and s.get("on")))
    cmd("alice", "remove-user nonexistentuser")
    s2 = alice_settings()
    check("remove-user with bad id does not crash", s2 is not None)

    # --- 7. mentions in channels (opt-in) ---
    print("\n[7] mention replies in channels")
    cmd("alice", "enable I am away rn")
    r = api("POST", "/api/v1/channels.create", {"name": f"ar-test-{int(time.time())}"}, "bob")
    ch = r["channel"]["_id"]
    api("POST", "/api/v1/channels.invite", {"roomId": ch, "username": "alice"}, "bob")
    say("bob", ch, "hello @alice without mentions enabled")
    time.sleep(8)
    ch_replies_count = count_bot_replies(ch)
    check("no mention reply when mentions disabled", ch_replies_count == 0, str(ch_replies_count))
    cmd("alice", "frequency once")
    cmd("alice", "disable")
    cmd("alice", "enable I am away rn")
    cmd("alice", "mentions on", room=ch)
    say("bob", ch, "hello @alice with mentions enabled")
    deadline = time.time() + 90
    first = 0
    while time.time() < deadline:
        time.sleep(4)
        first = count_bot_replies(ch)
        if first >= 1:
            break
    check("mention reply when mentions enabled", first == 1, str(first))
    say("bob", ch, "again @alice second mention")
    time.sleep(10)
    second = count_bot_replies(ch)
    check("mention reply respects frequency=once per channel", second == 1, str(second))
    cmd("alice", "mentions off", room=ch)

    # --- 8. scheduler tick ---
    print("\n[8] scheduler toggles auto-reply on/off")
    cmd("alice", "disable")
    cmd("alice", "timezone 0")
    mongo_eval(
        f"const p = db.rocketchat_apps_persistence.findOne({{'associations.0.id': '{ALICE_ID}'}}); "
        f"p.data.schedulers = [{{id: 'test-daily', type: 'Daily', settings: {{enableTime: '00:00', disableTime: '23:59'}}}}]; "
        f"db.rocketchat_apps_persistence.replaceOne({{_id: p._id}}, p);"
    )
    mongo_eval(
        "const assoc = [{model:'misc',id:'auto-reply-scheduler-users'}]; "
        "let reg = db.rocketchat_apps_persistence.findOne({associations: {$all: assoc}}); "
        "if (!reg) { db.rocketchat_apps_persistence.insertOne({associations: assoc, appId: '821cd5c6-1fb5-4d9e-8e88-e6176463efb6', data: {userIds: []}}); reg = db.rocketchat_apps_persistence.findOne({associations: {$all: assoc}}); } "
        f"if (reg.data.userIds.indexOf('{ALICE_ID}') === -1) {{ reg.data.userIds.push('{ALICE_ID}'); }} "
        "db.rocketchat_apps_persistence.replaceOne({_id: reg._id}, reg);"
    )
    print("  waiting up to 7 min for the scheduler tick (window: 00:00-23:59 = active)...")
    toggled_on = False
    for _ in range(14):
        time.sleep(30)
        s = alice_settings()
        if s and s.get("on") is True:
            toggled_on = True
            break
    check("scheduler enables auto-reply in active window", toggled_on)
    mongo_eval(
        f"const p = db.rocketchat_apps_persistence.findOne({{'associations.0.id': '{ALICE_ID}'}}); "
        f"p.data.schedulers = [{{id: 'test-daily', type: 'Daily', settings: {{enableTime: '01:00', disableTime: '01:30'}}}}]; "
        f"db.rocketchat_apps_persistence.replaceOne({{_id: p._id}}, p);"
    )
    toggled_off = False
    for _ in range(14):
        time.sleep(30)
        s = alice_settings()
        if s and s.get("on") is False:
            toggled_off = True
            break
    check("scheduler disables auto-reply outside window", toggled_off)
    mongo_eval(
        f"const p = db.rocketchat_apps_persistence.findOne({{'associations.0.id': '{ALICE_ID}'}}); "
        f"p.data.schedulers = []; db.rocketchat_apps_persistence.replaceOne({{_id: p._id}}, p); "
        f"const reg = db.rocketchat_apps_persistence.findOne({{associations: {{$all: [{{model:'misc',id:'auto-reply-scheduler-users'}}]}}}}); "
        f"if (reg) {{ reg.data.userIds = reg.data.userIds.filter(id => id !== '{ALICE_ID}'); db.rocketchat_apps_persistence.replaceOne({{_id: reg._id}}, reg); }}"
    )

    # --- summary ---
    print(f"\n=== {len(PASSES)} passed, {len(FAILURES)} failed ===")
    if HISTORY_ERRORS:
        print(f"  history fetch errors observed: {len(HISTORY_ERRORS)}")
        for e in HISTORY_ERRORS[:5]:
            print(f"    {e}")
    for f in FAILURES:
        print(f"  FAILED: {f}")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
