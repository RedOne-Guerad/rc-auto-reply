# Rocket.Chat Auto-Reply App

A [Rocket.Chat](https://rocket.chat) app that automatically answers incoming **direct messages** (and **@mentions** in channels, if enabled) with your personal away message — so your contacts get a prompt reply even when you are not available.

## Features

- **Custom away message** per user, sent under your own name as a message alias.
- **Reply frequency** per conversation:
  - `every` — reply to every incoming message (default),
  - `once` — reply only once per conversation until you switch auto-reply off and on again,
  - `cooldown` — reply at most once every N hours (presets from 1 h to 1 week).
- **Exclusion list** — never auto-reply to selected users.
- **Mention replies** (opt-in) — also auto-reply when you are @mentioned in channels/private groups.
- **Timed auto-reply** (new in 2.2.0) — schedule a window (`until friday 17:00`) with an optional message just for that period; the timezone is picked in the schedule form (defaults to your profile timezone). Nothing is switched behind your back: the window is evaluated when a message arrives, and the panel always shows the current status ("ON until Tue 13 Oct, 00:00 — 3d 0h left").
- **Settings from the user menu** (new in 2.2.0) — a modal under your avatar → Apps, reachable from anywhere including encrypted rooms; after saving it confirms "✅ Saved" with the current status.
- **Timezone from your profile** (new in 2.2.0) — windows use your Rocket.Chat profile timezone (DST included); a manual fallback exists for profiles without one.
- **E2EE-safe** — in end-to-end encrypted rooms the app stays silent (see [limitations](#limitations)).
- Localized UI/notifications in **English, Russian and Lithuanian** (follows the server language).
- Gentler reminders: the "auto-reply is enabled, want to disable it?" prompt appears at most once per hour per conversation.

## How to use it

### From the room menu

From any direct-message contextual action menu, click the auto-reply button:

>![image](https://user-images.githubusercontent.com/29951360/220590790-fe8e20be-4ef4-9341-db014a46bc29.png)

Enable the app, customize your message, pick a reply frequency, add schedulers or exclude users, then submit:

>![image](https://user-images.githubusercontent.com/29951360/220591361-102a9950-6694-4baa-8875-2009a3474a39.png)

When someone sends you a message they will get your auto-reply:

>![image](https://user-images.githubusercontent.com/29951360/220594523-c54ac5d2-98d1-4732-975f-44fca6aa3815.png)

If you text a user while your auto-reply is enabled, you will get options to disable it (at most once per hour):

>![image](https://user-images.githubusercontent.com/29951360/220594822-f7820df6-5b4a-4123-9c3fee83fe3e.png)

### Slash commands

```
/auto-reply on [message]                 on until you turn it off (alias: enable)
/auto-reply off                          off; also ends any timed window (alias: disable)
/auto-reply until <when> [message]       on from now until <when> — e.g. until friday 17:00,
                                         until tomorrow, until 18:00, until 2026-10-12 09:00
/auto-reply from <when> until <when> [message]
                                         schedule a future window
/auto-reply status | list                show current settings
/auto-reply remove-user <id|username>    stop auto-replying to a user
/auto-reply include-user <id|username>   resume auto-replying to a user
/auto-reply frequency every|once|cooldown [hours]
/auto-reply mentions on|off              reply when mentioned in channels
/auto-reply timezone +2                  fallback timezone for schedules (e.g. -5)
```

## Limitations

- **End-to-end encrypted (E2EE) rooms**: apps run server-side and cannot read or produce encrypted content. To avoid leaking plaintext into encrypted conversations, Auto-Reply does not reply in E2EE rooms at all (issue #8). Use regular DMs/channels.
- The exclusion list in the room panel offers the users of the conversation you opened it from; use `remove-user`/`include-user` for anyone else. The user-menu modal works everywhere.
- 2.1 "schedulers" (daily/weekly recurring) were replaced in 2.2.0 by timed windows (`until`); if you created a schedule in 2.1, recreate it as a timed window. Old settings otherwise migrate automatically.

## Local development

A full local environment (Rocket.Chat 8.9 + MongoDB 7) is included:

```bash
docker compose up -d          # start Rocket.Chat on http://localhost:3000
./dev/bootstrap.sh            # first-run: creates dev admin + test users (alice/bob/carol),
                              # disables email 2FA, enables E2EE, applies dev license patches
npm install
npm run deploy                # build & deploy the app (rc-apps)
python3 dev/test-suite.py     # REST regression suite (users: alice/bob, password Devpassword123!)
```

Notes:

- The setup wizard cannot be completed headless/offline; log in once as `devadmin` (password `Devpassword123!`) if the browser redirects you to it and step through it, or keep using the API.
- `dev/allow-private-apps.sh` patches the local container so private apps can be enabled/updated without an enterprise license — Rocket.Chat 8.x Community otherwise blocks locally deployed apps (`privateApps` license limit is 0). **Local development only**; real users install the published marketplace build.
- `admin` is a reserved username in Rocket.Chat — the dev admin is `devadmin`.

## Contributing

You'll need the Rocket.Chat Apps dev environment; see https://developer.rocket.chat/apps-engine/getting-started. Adjust [.rcappsconfig](.rcappsconfig) to your server, then:

```bash
npm install
npm run deploy
```
