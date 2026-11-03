# Marketplace upload kit — everything the cloud.rocket.chat form asks for

Current version: **2.2.1** · Zip: `dist/auto-reply_2.2.1.zip` · Screenshots: `marketplace-screenshots/`

Fill once (app listing — persists after first approval):

## Short description (max 45)

```
Auto-reply to DMs with your away message
```

## Long description

```markdown
Never leave a colleague hanging while you're away. Auto-Reply answers incoming direct messages with your personal away message — sent under your own name, so it always looks like you.

**How it works**
Turn it on once from any direct message (room menu → Apps → Auto Reply), from your avatar menu (Apps), or with `/auto-reply on I'm out of office until Monday`. From that moment, everyone who writes to you gets your away message instantly — and you keep chatting normally on your side.

**You're in control**
- **Custom away message** — anything you like, per user.
- **Timed windows ("Schedule…")** — auto-reply ON until a date/time you pick ("until Friday 17:00"), with an optional message just for that period and your profile timezone (DST included). Nothing switches behind your back; the panel always shows the live status and countdown.
- **Reply frequency** — answer every message (default), only once per conversation, or at most once every few hours (presets from 1 h to 1 week). No spam.
- **Gentle reminders** — if you write while your auto-reply is on, a private one-click hint lets you turn it off or mute it for that person — with a visible confirmation.
- **Exclusion list** — never auto-reply to selected people.
- **Mention replies (optional)** — also answer when someone @mentions you in channels and private groups.

**Works everywhere you do**
- Settings in the room panel and from your avatar menu — reachable anywhere, including encrypted rooms.
- Slash commands: `/auto-reply on [message] | off | until <when> [message] | from <when> until <when> [message] | status | list | remove-user | include-user | frequency | mentions`
- Available in English, German, Russian and Lithuanian (server language).
- No administrator configuration required — each user manages their own auto-reply.

**Good to know**
- Auto-replies are skipped in end-to-end encrypted conversations by design, so nothing can ever leak as plaintext into an encrypted chat.
- Built for Rocket.Chat 6.x/7.x/8.x (Apps-Engine API ^1.36.0 and newer).
```

## Screenshots (4)

1. `marketplace-screenshots/1-auto-reply-in-action.png` — auto-reply delivered under the user's name
2. `marketplace-screenshots/2-one-click-disable-hint.png` — private one-click disable hint
3. `marketplace-screenshots/3-settings-panel.png` — settings panel with live status, frequency presets, exclusions
4. `marketplace-screenshots/4-schedule-modal.png` — the schedule form (timezone, from/until, per-window message)

## Suggested categories

productivity, automation

---

Re-entered on EVERY version submission:

## Internal changelog (current: 2.2.1)

```
2.2.1 (2026-11-03)
- Fix: once/cooldown now count per planned window; from-until accepted single-token
  start times; bare-time message keeps its first word; tz-aware confirmations;
  panel refresh after scheduling (ui.interact); mentions after punctuation; thread
  replies; 2.1-scheduler users start off after upgrade; legacy scheduler job
  cancelled (scheduler permission); translated view buttons (all by @ndo84bw, PRs
  #22/#23, live-verified on 8.9.0).
- New: German (de / de-IN) by @ndo84bw.

2.2.0 (2026-10-12)
- Redesign: recurring 2.1 schedulers (daily/weekly, background switching every
  5 minutes) are replaced by timed windows: mode off | on | on-until. The
  window is evaluated when a message arrives — nothing is switched in the
  background. 2.1 records migrate automatically; a one-time notice in the
  settings panel informs users with 2.1 schedules (issue #20 points 1 + 8).
- Timed windows: /auto-reply until <when> [message] and from <when> until
  <when> [message] with natural parsing (friday 17:00, tomorrow, 18:00, ISO
  dates); optional per-window message; wall-clock storage re-evaluated with
  the live profile timezone (DST-proof); status always visible in the panel
  with countdown; "Reschedule…" prefills the form; whole-day windows via the
  24:00 end option (issue #20 points 1, 2, 8).
- Settings from the user menu (avatar → Apps): modal reachable everywhere
  including E2EE rooms; stays open after saving and confirms "✅ Saved —
  <status>" (issue #20 point 4).
- Notification quick actions ("Yes, disable" / "Disable for this user") now
  confirm visibly after acting (issue #20 feedback).
- Cooldown presets (1 h…1 week) replace the free-text hours field; invalid
  input is no longer silently dropped (issue #20 point 6).
- Fixed: the app language now follows the server language — getLanguage read
  the app's own (empty) settings instead of server settings, so notifications
  were always English (found by @ndo84bw, issue #20; requires the new
  server-setting.read permission).
- Fixed: invalid dates like 2026-13-40 were accepted by the parser.
- Fixed: weekday without a time said on that weekday now means next week.
- Fixed: "UTCUTC+00:00" in /auto-reply list output (issue #20 point 7).
- UI: status line always visible (OFF / ON / ON until <date> with countdown /
  scheduled from–to); exclusion section no longer rendered empty in channels
  (issue #20 point 5); 24 h time display everywhere; removed the unused
  scheduler permission.
- Commands: on/off replace enable/disable (kept as aliases); off also ends a
  timed window; schedule is an alias for until; timezone command sets the
  fallback only (profile wins).
- Tooling: unit tests for the time helpers (npm run test:time), regression
  suite extended to 25 checks; compiles against apps-engine 1.36 and 1.67.

2.1.3 (2026-10-08)
- Build: compile against Apps-Engine 1.36 typings (typed cast for the e2e
  message check, ES2017-safe regex, @types/node ~14.17). No behavior change.

2.1.2 (2026-10-08)
- Fix: the "auto reply is enabled" hint shows its text again (notifications
  render blocks only; the prompt moved into a section block).

2.1.1 (2026-10-08)
- Fix: notification action buttons no longer send the slash command as a plain
  chat message (Rocket.Chat >= 6.10 stopped executing msg_in_chat_window
  commands; the hint now uses UIKit block buttons — issue #13).

2.1.0 (2026-10-07)
- Fix: deleted users in the exclusion list no longer break the app for that
  user; affected settings self-heal on first load (issue #9).
- Fix: E2EE-encrypted rooms are detected and skipped (issue #8).
- Fix: weekly scheduler modal crash; remove-user no longer force-enables.
- New: reply frequency per conversation (issue #6); schedulers; opt-in
  mention replies; commands include-user/list/frequency/mentions/timezone;
  en/ru/lt localization.
```

## Public changelog (current: 2.2.1)

```
Auto-Reply 2.2.1 — polish + German 🇩🇪

FIXED SINCE 2.2.0: once-per-conversation now also works inside planned
windows; @mentions are detected next to punctuation; replies to thread
messages land in the thread; the panel refreshes right after scheduling;
upgrade edge cases from 2.1 cleaned up.

NEW: the app is now also available in German.

— plus everything from 2.2.0:

Auto-Reply 2.2 — schedule it like an out-of-office 🎉

NEW
• Schedule…: turn auto-reply ON until a date and time you pick — "until
  Friday 17:00" — with its own message for that period. Your profile timezone
  is used (DST handled), and the panel always shows the live status and
  countdown. Nothing is switched behind your back anymore.
• Settings from your avatar menu (Apps): reachable everywhere, including
  encrypted rooms, and it confirms "✅ Saved" with the current status.
• /auto-reply until friday 17:00 — schedule from the command line, or
  /auto-reply from tomorrow until monday 09:00 for a future period.
• on / off are the new commands (enable/disable still work).

IMPROVED
• The one-click hint buttons now show a confirmation when you use them.
• Cooldown is a preset list (1 h to 1 week) instead of a free-text field.
• Notifications follow the server language now (English, Russian, Lithuanian).
• Status is always visible in the panel — even when off.

Note for users of 2.1 schedules: recurring daily/weekly schedules were
replaced by the new timed windows; the panel tells you once and you can
recreate them as a timed window in two clicks.
```
