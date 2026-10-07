# Draft replies & release notes for v2.1.0 (NOT posted — review first)

## Reply to issue #9 (Deleted user in the excluded list breaks auto-reply completely)

Hi @ndo84bw — thank you for the excellent report and root-cause analysis! 🙏

This is fixed in **v2.1.0**:

- `excludeUsers()` now filters with `user != null`, so deleted users can't be saved into the exclusion list anymore.
- `getAutoReplySettings()` also drops any `null` entries on read, which means **installations already affected self-heal** as soon as the app loads the settings — no manual repair needed.
- Additionally, all user lookups are null-checked now, so a deleted DM peer no longer throws either.

Verified with your exact repro steps (exclude → delete user → open panel → submit) plus a poisoned-record recovery test against Rocket.Chat 8.9. The release is being published shortly — please upgrade and let me know if you hit anything else.

## Reply to issue #8 (auto-reply not working in e2ee enabled channels)

Hola @himpierre — you're right, and unfortunately this is an architectural limitation rather than a bug: apps run on the server, while E2EE message content is only ever decrypted client-side. An app can neither read encrypted messages nor produce a valid encrypted reply.

What v2.1.0 changes about it:

- The app now **detects encrypted rooms and stays silent** there. Previously it could attempt to answer, which at best looked broken and at worst would have pushed a plaintext message into an encrypted conversation (a privacy leak).
- The behavior is documented in the README under "Limitations".

So: E2EE DMs keep their guarantees, and regular DMs/channels work as before. Sorry it's not the answer you were hoping for — but it's the only correct behavior for E2EE.

## Reply to issue #6 (Only reply once or once every 24h only?)

Hi @LenzGr — sorry for the long wait! As promised, v2.1.0 makes this configurable per user. You can now choose between:

- **every message** (previous behavior, still the default),
- **once per conversation** — until you disable and re-enable auto-reply,
- **at most once every N hours** — N defaults to 24 and is configurable.

Set it from the Auto-Reply panel ("Send the auto-reply: …") or with:

```
/auto-reply frequency once
/auto-reply frequency cooldown 24
```

v2.1.0 also ships working schedulers (auto-enable/disable at set times, daily or weekly, with timezone), optional mention replies in channels, and a batch of bug fixes. Hope that tames the spam! 🙂

---

## Release notes — v2.1.0

### Fixes
- **Deleted user in the exclusion list no longer breaks auto-reply** — and already-affected installations recover automatically (#9)
- **E2EE rooms are now handled safely** — the app detects them and stays silent instead of attempting a plaintext reply (#8)
- Weekly scheduler modal no longer crashes the settings panel
- `/auto-reply remove-user` no longer silently enables auto-reply and no longer crashes on unknown users
- The exclusion multiselect in the panel actually lets you exclude the user you're talking to
- The "auto-reply is enabled, disable it?" reminder now appears at most once per hour per conversation instead of on every message
- General robustness: null-checked user lookups, removed dead code and per-message log spam

### New
- **Reply frequency** per conversation: every message (default), once per conversation, or at most once every N hours (#6)
- **Schedulers** finally work: enable/disable auto-reply automatically, daily or per weekdays, with a per-user timezone
- **Mention replies** (opt-in): auto-reply when you're @mentioned in channels/private groups
- New commands: `include-user`, `list`, `frequency`, `mentions`, `timezone`
- Localized UI and notifications: English, Russian, Lithuanian

### Notes for server admins
- Built with apps-engine 1.67; `requiredApiVersion` remains `^1.36.0`, so older supported servers can still install it.
- Scheduler state is recomputed every 5 minutes; while a scheduler exists it overrides the manual on/off toggle.
