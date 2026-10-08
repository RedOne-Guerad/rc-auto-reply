# Marketplace upload kit — everything the cloud.rocket.chat form asks for

Current version: **2.1.3** · Zip: `dist/auto-reply_2.1.3.zip` · Screenshots: `marketplace-screenshots/`

Fill once (app listing — persists after first approval):

## Short description (max 45)

```
Auto-reply to DMs with your away message
```

## Long description

```markdown
Never leave a colleague hanging while you're away. Auto-Reply answers incoming direct messages with your personal away message — sent under your own name, so it always looks like you.

**How it works**
Enable it once from any direct message (room menu → Apps → Auto Reply) or with `/auto-reply enable I'm out of office until Monday`. From that moment, everyone who writes to you gets your away message instantly — and you keep chatting normally on your side.

**You're in control**
- **Custom away message** — anything you like, per user.
- **Reply frequency** — answer every message (default), only once per conversation, or at most once every N hours. No spam.
- **Gentle reminders** — if you write while your auto-reply is on, a private one-click hint lets you disable it or mute it for that person. Nobody else ever sees it.
- **Exclusion list** — never auto-reply to selected people (e.g. your team).
- **Mention replies (optional)** — also answer when someone @mentions you in channels and private groups.

**On your schedule**
Schedulers switch your auto-reply on and off automatically: every day or on selected weekdays, between times you choose, in your timezone. Perfect for "outside office hours" without lifting a finger.

**Works everywhere you do**
- Slash commands: `/auto-reply enable [message] | disable | status | list | remove-user | include-user | frequency every|once|cooldown [hours] | mentions on|off | timezone +2`
- Available in English, Russian and Lithuanian.
- No administrator configuration required — each user manages their own auto-reply.

**Good to know**
- Auto-replies are skipped in end-to-end encrypted conversations by design, so nothing can ever leak as plaintext into an encrypted chat.
- Built for Rocket.Chat 6.x/7.x/8.x (Apps-Engine API ^1.36.0 and newer).
```

## Screenshots (4)

1. `marketplace-screenshots/1-auto-reply-in-action.png` — auto-reply delivered under the user's name
2. `marketplace-screenshots/2-one-click-disable-hint.png` — private one-click disable hint
3. `marketplace-screenshots/3-settings-panel.png` — full settings panel (message, frequency, scheduler, exclusions)
4. `marketplace-screenshots/4-scheduler-modal.png` — daily scheduler setup

## Suggested categories

productivity, automation

---

Re-entered on EVERY version submission:

## Internal changelog (current: 2.1.3)

```
2.1.3 (2026-10-08)
- Build: compile against Apps-Engine 1.36 typings (typed cast for the e2e
  message check, ES2017-safe regex, @types/node ~14.17). No behavior change.

2.1.2 (2026-10-08)
- Fix: the "auto reply is enabled" hint shows its text again (notifications
  render blocks only; the prompt moved into a section block).

2.1.1 (2026-10-08)
- Fix: notification action buttons ("Yes, disable" / "Disable for this user") no longer
  send the slash command as a plain chat message. Rocket.Chat >= 6.10 stopped executing
  msg_in_chat_window commands from attachment buttons; the hint now uses UIKit block
  buttons handled directly by the app (issue #13).

2.1.0 (2026-10-07)
- Fix: deleted users in the exclusion list no longer break the app for that user;
  affected settings self-heal on first load (issue #9).
- Fix: E2EE-encrypted rooms are detected and skipped — apps cannot send encrypted
  content, and a plaintext reply would leak into the conversation (issue #8).
- Fix: weekly scheduler modal no longer crashes the settings panel submit handler.
- Fix: /auto-reply remove-user no longer silently enables auto-reply and validates
  the user id/username.
- Fix: exclusion multiselect in the panel now offers the current DM peer.
- Fix: "auto-reply is enabled" reminder throttled to once per hour per conversation.
- New: reply frequency per conversation — every message (default), once per
  conversation, or at most once every N hours (issue #6).
- New: schedulers — auto-enable/disable auto-reply daily or per weekdays, with a
  per-user timezone (recomputed every 5 minutes).
- New: opt-in auto-reply when mentioned in channels/private groups.
- New: commands include-user, list, frequency, mentions, timezone.
- New: en/ru/lt localization of UI and notifications.
- Built with Apps-Engine 1.67; requiredApiVersion stays ^1.36.0. Regression-tested
  on Rocket.Chat 8.9 (21 automated checks) and manually verified in the UI.
```

## Public changelog (current: 2.1.3)

```
Auto-Reply 2.1.1–2.1.3 — quieter, safer, and finally on a schedule 🎉

NEW IN THIS UPDATE
• Reply frequency: choose how often auto-reply answers each conversation —
  every message (default), once per conversation, or at most once every few
  hours. Set it from the app panel or /auto-reply frequency.
• Schedulers: auto-enable and auto-disable your auto-reply at set times —
  every day or on selected weekdays, in your timezone.
• Mentions (optional): auto-reply when someone @mentions you in channels.
• New commands: include-user, list, frequency, mentions, timezone.
• Now available in English, Russian and Lithuanian.

FIXED
• The "auto-reply is enabled" buttons work with a single click — and their
  hint always shows its question text.
• Deleting a user who was on your exclusion list no longer breaks auto-reply.
• Encrypted (E2EE) conversations are safely skipped: your away message can
  never leak as plaintext into an encrypted chat.
• The reminder prompt appears at most once per hour instead of on every
  message you send.
• Various stability fixes and marketplace build compatibility.
```
