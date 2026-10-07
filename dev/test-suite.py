#!/usr/bin/env python3
"""Regression suite for the rc-auto-reply app against local Rocket.Chat.

Prep: docker compose up, dev/bootstrap.sh, dev/allow-private-apps.sh,
npm run deploy, users alice/bob/carol/dave exist.

Usage: python3 dev/test-suite.py [--keep-going]
"""
import json
import subprocess
import sys
import time

sys.path.insert(0, 'dev')
from rcapi import api, login, TOKENS  # noqa: E402

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


def history(user, room, count=30):
    r = api("GET", f"/api/v1/im.history?roomId={room}&count={count}", None, user)
    return [m for m in r.get("messages", [])]


def channel_history(user, room, count=30):
    r = api("GET", f"/api/v1/channels.history?roomId={room}&count={count}", None, user)
    return [m for m in r.get("messages", [])]


def alice_settings():
    """Read alice's persisted app settings directly from mongo."""
    out = subprocess.check_output([
        "docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval",
        "const p = db.rocketchat_apps_persistence.findOne({'associations.0.id': '8QgCm3XCGTGmd4NK4'}); print(p ? JSON.stringify(p.data) : 'null')",
        "rocketchat",
    ]).decode().strip()
    return json.loads(out) if out and out != 'null' else None


def auto_replies(msgs):
    return [m for m in msgs if (m.get("alias") or "") == "Alice"]


def main():
    global ROOM_DM
    for u in ["alice", "bob", "devadmin"]:
        login(u)
    r = api("POST", "/api/v1/im.create", {"username": "bob"}, "alice")
    ROOM_DM = r["room"]["_id"]
    print(f"DM room: {ROOM_DM}")

    # --- 1. DM happy path, frequency every ---
    print("\n[1] DM auto-reply, frequency=every")
    cmd("alice", "enable I am away rn")
    cmd("alice", "frequency every")
    say("bob", ROOM_DM, "test-1: every mode message A")
    say("bob", ROOM_DM, "test-1: every mode message B")
    time.sleep(4)
    replies = auto_replies(history("alice", ROOM_DM))
    check("every mode replies to both messages", len(replies) >= 2, f"got {len(replies)}")

    # --- 2. frequency once ---
    print("\n[2] frequency=once: one reply per enable period")
    cmd("alice", "frequency once")
    cmd("alice", "disable")
    cmd("alice", "enable I am away rn")  # resets enabledAt
    say("bob", ROOM_DM, "test-2: once mode message")
    time.sleep(3)
    replies = auto_replies(history("alice", ROOM_DM))
    check("once mode replies to first message", len(replies) >= 1)
    say("bob", ROOM_DM, "test-2: once mode second message")
    time.sleep(3)
    replies2 = auto_replies(history("alice", ROOM_DM))
    check("once mode stays silent on second message", len(replies2) == len(replies), f"{len(replies)} -> {len(replies2)}")

    # --- 3. cooldown ---
    print("\n[3] frequency=cooldown")
    cmd("alice", "frequency cooldown 24")
    cmd("alice", "disable")
    cmd("alice", "enable I am away rn")
    say("bob", ROOM_DM, "test-3: cooldown message")
    time.sleep(3)
    n1 = len(auto_replies(history("alice", ROOM_DM)))
    say("bob", ROOM_DM, "test-3: cooldown second message")
    time.sleep(3)
    n2 = len(auto_replies(history("alice", ROOM_DM)))
    check("cooldown blocks immediate second reply", n2 == n1, f"{n1} -> {n2}")
    # simulate expired cooldown by backdating lastReplyAt 25h via tracking record
    subprocess.run([
        "docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval",
        f"const p = db.rocketchat_apps_persistence.findOne({{associations: {{$all: [{{model:'user',id:'8QgCm3XCGTGmd4NK4'}},{{model:'room',id:'{ROOM_DM}'}}]}}}}); "
        f"if (p) {{ p.data.lastReplyAt = Date.now() - 25*3600*1000; db.rocketchat_apps_persistence.replaceOne({_id: p._id}, p); }}",
        "rocketchat",
    ], check=False, capture_output=True)
    say("bob", ROOM_DM, "test-3: cooldown expired message")
    time.sleep(3)
    n3 = len(auto_replies(history("alice", ROOM_DM)))
    check("cooldown replies again after interval passed", n3 > n2, f"{n2} -> {n3}")

    # --- 4. issue #9: deleted excluded user ---
    print("\n[4] issue #9: deleted user in exclusion list")
    r = api("GET", "/api/v1/users.info?username=carol", None, "devadmin")
    carol_id = r["user"]["_id"]
    cmd("alice", f"remove-user {carol_id}")
    s = alice_settings()
    check("remove-user adds carol to exclusions", any(u and u.get("id") == carol_id for u in (s or {}).get("users", [])))
    api("POST", "/api/v1/users.delete", {"userId": carol_id, "confirmRelinquish": True}, "devadmin")
    # the old bug: settings submit with a deleted excluded user saved users:[null] and bricked everything
    say("bob", ROOM_DM, "test-4: after carol deleted")
    time.sleep(3)
    s = alice_settings()
    check("settings readable after deleting excluded user", s is not None)
    check("exclusion list has no null entries after self-heal", all(u for u in (s or {}).get("users", [])), str((s or {}).get("users")))
    n4 = len(auto_replies(history("alice", ROOM_DM)))
    check("auto-reply still works after deleting excluded user", n4 >= 1)
    # recovery for users already affected: poison the record with null, then send a message
    subprocess.run([
        "docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval",
        "const p = db.rocketchat_apps_persistence.findOne({'associations.0.id': '8QgCm3XCGTGmd4NK4'}); p.data.users = [null]; db.rocketchat_apps_persistence.replaceOne({_id: p._id}, p);",
        "rocketchat",
    ], check=True, capture_output=True)
    cmd("alice", "list")  # used to throw on poisoned records
    s = alice_settings()
    check("poisoned exclusion list self-heals on read", s is not None and all(u for u in s.get("users", [])), str((s or {}).get("users")))
    cmd("alice", "enable I am away rn")
    say("bob", ROOM_DM, "test-4: after poison heal")
    time.sleep(3)
    n5 = len(auto_replies(history("alice", ROOM_DM)))
    check("auto-reply works after self-heal", n5 > n4, f"{n4} -> {n5}")

    # --- 5. exclusion works both ways ---
    print("\n[5] exclude/include bob")
    cmd("alice", "frequency every")
    cmd("alice", "remove-user bob")
    before = len(auto_replies(history("alice", ROOM_DM)))
    say("bob", ROOM_DM, "test-5: excluded message")
    time.sleep(3)
    after = len(auto_replies(history("alice", ROOM_DM)))
    check("no auto-reply for excluded user", after == before, f"{before} -> {after}")
    cmd("alice", "include-user bob")
    say("bob", ROOM_DM, "test-5: included again message")
    time.sleep(3)
    after2 = len(auto_replies(history("alice", ROOM_DM)))
    check("auto-reply resumes after include-user", after2 > after, f"{after} -> {after2}")

    # --- 6. remove-user no longer force-enables ---
    print("\n[6] remove-user keeps disabled state")
    cmd("alice", "disable")
    r = api("POST", "/api/v1/users.create", {"username": "dave", "email": "dave@example.com", "name": "Dave", "password": "Devpassword123!", "roles": ["user"], "verified": True}, "devadmin")
    cmd("alice", "remove-user dave")
    s = alice_settings()
    check("remove-user does not silently enable auto-reply", s is not None and s.get("on") is False, str(s and s.get("on")))
    r = api("POST", "/api/v1/commands.run", {"roomId": ROOM_DM, "command": "auto-reply", "params": "remove-user nonexistentuser"}, "alice")
    s2 = alice_settings()
    check("remove-user with bad id does not crash", s2 is not None)

    # --- 7. mentions in channels (opt-in) ---
    print("\n[7] mention replies in channels")
    cmd("alice", "enable I am away rn")
    r = api("POST", "/api/v1/channels.create", {"name": "ar-test-channel"}, "bob")
    ch = r["channel"]["_id"]
    api("POST", "/api/v1/channels.invite", {"roomId": ch, "username": "alice"}, "bob")
    say("bob", ch, "hello @alice without mentions enabled")
    time.sleep(3)
    ch_replies = [m for m in channel_history("bob", ch) if (m.get("alias") or "") == "Alice"]
    check("no mention reply when mentions disabled", len(ch_replies) == 0, str(len(ch_replies)))
    cmd("alice", "mentions on", room=ch)
    say("bob", ch, "hello @alice with mentions enabled")
    time.sleep(3)
    ch_replies = [m for m in channel_history("bob", ch) if (m.get("alias") or "") == "Alice"]
    check("mention reply when mentions enabled", len(ch_replies) == 1, str(len(ch_replies)))
    say("bob", ch, "again @alice second mention")
    time.sleep(3)
    ch_replies2 = [m for m in channel_history("bob", ch) if (m.get("alias") or "") == "Alice"]
    check("mention reply respects frequency=once per channel", len(ch_replies2) == 1, str(len(ch_replies2)))
    cmd("alice", "mentions off", room=ch)

    # --- 8. scheduler tick ---
    print("\n[8] scheduler toggles auto-reply on/off")
    cmd("alice", "disable")
    cmd("alice", "timezone 0")
    now = time.gmtime()
    active_enable = "00:00"
    active_disable = "23:59"
    # set a daily scheduler covering the whole day via persistence (UI path tested in browser)
    subprocess.run([
        "docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval",
        "const p = db.rocketchat_apps_persistence.findOne({'associations.0.id': '8QgCm3XCGTGmd4NK4'}); "
        "p.data.schedulers = [{id: 'test-daily', type: 'Daily', settings: {enableTime: '" + active_enable + "', disableTime: '" + active_disable + "'}}]; "
        "db.rocketchat_apps_persistence.replaceOne({_id: p._id}, p); "
        "const reg = db.rocketchat_apps_persistence.findOne({'associations': {$all: [{model:'misc',id:'auto-reply-scheduler-users'}]}}); "
        "print(JSON.stringify(reg ? reg.data : null))",
        "rocketchat",
    ], check=True, capture_output=True)
    # register alice in the scheduler registry the way the app does
    subprocess.run([
        "docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval",
        "const assoc = [{model:'misc',id:'auto-reply-scheduler-users'}]; "
        "let reg = db.rocketchat_apps_persistence.findOne({associations: {$all: assoc}}); "
        "if (!reg) { db.rocketchat_apps_persistence.insertOne({associations: assoc, appId: '821cd5c6-1fb5-4d9e-8e88-e6176463efb6', data: {userIds: ['8QgCm3XCGTGmd4NK4']}}); } "
        "else { reg.data.userIds = ['8QgCm3XCGTGmd4NK4']; db.rocketchat_apps_persistence.replaceOne({_id: reg._id}, reg); }",
        "rocketchat",
    ], check=True, capture_output=True)
    print("  waiting up to 6 min for the scheduler tick...")
    toggled_on = False
    for _ in range(13):
        time.sleep(30)
        s = alice_settings()
        if s and s.get("on") is True:
            toggled_on = True
            break
    check("scheduler enables auto-reply in active window", toggled_on)
    # now set an inactive window (already ended) and wait for a tick
    subprocess.run([
        "docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval",
        "const p = db.rocketchat_apps_persistence.findOne({'associations.0.id': '8QgCm3XCGTGmd4NK4'}); "
        "p.data.schedulers = [{id: 'test-daily', type: 'Daily', settings: {enableTime: '01:00', disableTime: '01:30'}}]; "
        "db.rocketchat_apps_persistence.replaceOne({_id: p._id}, p);",
        "rocketchat",
    ], check=True, capture_output=True)
    toggled_off = False
    for _ in range(13):
        time.sleep(30)
        s = alice_settings()
        if s and s.get("on") is False:
            toggled_off = True
            break
    check("scheduler disables auto-reply outside window", toggled_off)
    # cleanup: remove scheduler + registry entry
    subprocess.run([
        "docker", "exec", "rc-auto-reply-mongo-1", "mongosh", "--quiet", "--eval",
        "const p = db.rocketchat_apps_persistence.findOne({'associations.0.id': '8QgCm3XCGTGmd4NK4'}); p.data.schedulers = []; db.rocketchat_apps_persistence.replaceOne({_id: p._id}, p); "
        "db.rocketchat_apps_persistence.deleteOne({associations: {$all: [{model:'misc',id:'auto-reply-scheduler-users'}]}});",
        "rocketchat",
    ], check=True, capture_output=True)

    # --- summary ---
    print(f"\n=== {len(PASSES)} passed, {len(FAILURES)} failed ===")
    for f in FAILURES:
        print(f"  FAILED: {f}")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
