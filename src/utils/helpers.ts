import { IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { BlockBuilder } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

import { AutoReplyApp } from '../../AutoReplyApp';
import { IAutoReplySettings, ReplyFrequency, DEFAULT_MESSAGE, DEFAULT_COOLDOWN_HOURS } from './IAutoReplySettings';
import { AppLanguage, normalizeLanguage } from '../i18n/translations';

export async function getAutoReplySettings(userId: string, read: IRead): Promise<IAutoReplySettings> {
    const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId);
    const records = await read.getPersistenceReader().readByAssociation(assocMe);
    const stored = records[0] as Partial<IAutoReplySettings> & { on?: boolean } | undefined;
    // migration: 2.1 stored a boolean `on`; 2.2 uses mode
    const mode: IAutoReplySettings['mode'] = stored?.mode ?? (stored?.on ? 'always' : 'off');
    return {
        mode,
        message: stored?.message || DEFAULT_MESSAGE,
        // Deleted users can linger as null entries in old records (issue #9);
        // dropping them here heals already-affected installations on first read.
        users: (stored?.users ?? []).filter(Boolean),
        schedulers: [],
        frequency: stored?.frequency ?? 'every',
        cooldownHours: stored?.cooldownHours ?? DEFAULT_COOLDOWN_HOURS,
        replyToMentions: stored?.replyToMentions ?? false,
        timezoneOffsetMinutes: stored?.timezoneOffsetMinutes ?? 0,
        // missing enabledAt may deserialize as null from old records
        enabledAt: stored?.enabledAt || undefined,
        until: stored?.until,
    };
}

/**
 * Per-conversation tracking record for the away user, stored under the pair of
 * associations (USER, awayUserId) + (ROOM, roomId) and shared by the reply
 * frequency logic and the notification throttle.
 */
export interface IChatTracking {
    lastReplyAt?: number;
    lastNotifyAt?: number;
}

export async function getChatTracking(awayUserId: string, roomId: string, read: IRead): Promise<IChatTracking> {
    const assocs = chatTrackingAssocs(awayUserId, roomId);
    const records = await read.getPersistenceReader().readByAssociations(assocs);
    return (records[0] as IChatTracking | undefined) ?? {};
}

export async function updateChatTracking(awayUserId: string, roomId: string, tracking: IChatTracking, persistence: IPersistence): Promise<void> {
    await persistence.updateByAssociations(chatTrackingAssocs(awayUserId, roomId), tracking as unknown as object, true);
}

function chatTrackingAssocs(awayUserId: string, roomId: string): Array<RocketChatAssociationRecord> {
    return [
        new RocketChatAssociationRecord(RocketChatAssociationModel.USER, awayUserId),
        new RocketChatAssociationRecord(RocketChatAssociationModel.ROOM, roomId),
    ];
}

/** Whether auto-reply is active for the settings right now (mode + timed window). */
export function isAutoReplyActive(settings: IAutoReplySettings, now = Date.now()): boolean {
    if (settings.mode === 'always') {
        return true;
    }
    if (settings.mode === 'until' && settings.until) {
        return settings.until.start <= now && now < settings.until.end;
    }
    return false;
}

/** The message to send: a per-window message wins while it is active. */
export function messageFor(settings: IAutoReplySettings, now = Date.now()): string {
    if (settings.mode === 'until' && settings.until?.message && settings.until.start <= now && now < settings.until.end) {
        return settings.until.message;
    }
    return settings.message;
}

/** Whether an auto-reply should be sent for this conversation right now. */
export function shouldAutoReply(settings: IAutoReplySettings, tracking: IChatTracking, now = Date.now()): boolean {
    if (!isAutoReplyActive(settings, now)) {
        return false;
    }
    const frequency: ReplyFrequency = settings.frequency ?? 'every';
    if (frequency === 'every') {
        return true;
    }
    const lastReplyAt = tracking.lastReplyAt ?? 0;
    if (frequency === 'once') {
        // one reply per conversation per enable period
        return !settings.enabledAt || lastReplyAt < settings.enabledAt;
    }
    // cooldown counts within the current enable period: a re-enable always
    // allows the next reply, then at most once per interval afterwards
    if (settings.enabledAt && lastReplyAt < settings.enabledAt) {
        return true;
    }
    const cooldownMs = Math.max(1, settings.cooldownHours ?? DEFAULT_COOLDOWN_HOURS) * 3600 * 1000;
    return now - lastReplyAt >= cooldownMs;
}

/** Notification throttle: remind the away user at most once per hour per room. */
export const NOTIFY_THROTTLE_MS = 3600 * 1000;

/**
 * E2EE rooms encrypt message content client-side; apps cannot read or send
 * encrypted content, so the app must stay silent there (issue #8). The room
 * document carries `encrypted: true` at runtime even though the apps-engine
 * type does not declare it.
 */
export function isRoomEncrypted(room: IRoom): boolean {
    return (room as unknown as { encrypted?: boolean }).encrypted === true;
}

/** Resolves the app language from the server's Language setting. */
export async function getLanguage(read: IRead): Promise<AppLanguage> {
    try {
        const language = await read.getEnvironmentReader().getSettings().getValueById('Language');
        return normalizeLanguage(language);
    } catch {
        return 'en';
    }
}

/**
 * Timezone used to interpret user-entered times: the user's live utcOffset
 * from their Rocket.Chat profile (kept current by the client, DST included),
 * falling back to the manually stored offset when the profile has none.
 */
export function resolveTzMinutes(user: IUser | undefined, settings: IAutoReplySettings): number {
    const profileOffset = Number((user as unknown as { utcOffset?: number | null } | undefined)?.utcOffset);
    if (Number.isFinite(profileOffset) && profileOffset !== 0) {
        return Math.round(profileOffset * 60);
    }
    if (Number.isFinite(profileOffset) && (user as unknown as { utcOffset?: number | null })?.utcOffset === 0) {
        return 0; // explicit UTC profile
    }
    return settings.timezoneOffsetMinutes ?? 0;
}

export function newId(): string {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('crypto').randomUUID();
    } catch {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}

/** Users excluded from auto-replies, keyed by id, safe against null entries. */
export function isUserExcluded(settings: IAutoReplySettings, userId: string): boolean {
    return (settings.users ?? []).some((user) => !!user && user.id === userId);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats epoch ms in the user's timezone, e.g. "Mon 12 Oct, 17:00". */
export function formatInTz(epochMs: number, tzMinutes: number): string {
    const d = new Date(epochMs + tzMinutes * 60000);
    const day = WEEKDAYS[d.getUTCDay()].slice(0, 3);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm}`;
}

/** "2d 3h" style compact duration from now (or a given base) until epoch ms. */
export function formatDurationUntil(epochMs: number, now = Date.now()): string {
    let s = Math.max(0, Math.round((epochMs - now) / 1000));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/**
 * Parses a user-entered point in time in the given timezone.
 * Accepted: "17:00", "friday", "friday 17:00", "tomorrow", "tomorrow 09:00",
 * "today", "2026-10-12", "2026-10-12 17:00". A bare time that already passed
 * today means tomorrow; a weekday name means the next occurrence (today only
 * if the time is still ahead). Returns epoch ms, or null when unparseable.
 */
export function parseWhen(text: string, tzMinutes: number, now = Date.now()): number | null {
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) {
        return null;
    }
    const local = new Date(now + tzMinutes * 60000);
    const todayY = local.getUTCFullYear();
    const todayM = local.getUTCMonth() + 1;
    const todayD = local.getUTCDate();

    const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (iso) {
        return utcToEpoch(Number(iso[1]), Number(iso[2]), Number(iso[3]), iso[4] ? Number(iso[4]) : 0, iso[5] ? Number(iso[5]) : 0, tzMinutes);
    }

    const words = trimmed.split(/\s+/);
    let dayDelta = 0;
    const first = words[0];
    if (first === 'today') {
        dayDelta = 0;
        words.shift();
    } else if (first === 'tomorrow') {
        dayDelta = 1;
        words.shift();
    } else {
        const target = WEEKDAYS.findIndex((w) => w.toLowerCase() === first);
        if (target >= 0) {
            dayDelta = (target - local.getUTCDay() + 7) % 7;
            words.shift();
        }
    }

    let h = 0;
    let m = 0;
    let hasTime = false;
    if (words.length > 0) {
        const t = words[0].match(/^(\d{1,2}):(\d{2})$/);
        if (!t) {
            return null;
        }
        h = Number(t[1]);
        m = Number(t[2]);
        hasTime = true;
    }

    const result = utcToEpoch(todayY, todayM, todayD + dayDelta, h, m, tzMinutes);
    if (result <= now) {
        if (!hasTime) {
            // "today"/"monday" with no time already passed -> next occurrence at 00:00? treat as next day 00:00
            return utcToEpoch(todayY, todayM, todayD + Math.max(dayDelta, 0) + 1, 0, 0, tzMinutes);
        }
        return result + 24 * 3600 * 1000;
    }
    return result;
}

/** Interprets y/m/d h:mi as wall-clock in tzMinutes and returns epoch ms. */
function utcToEpoch(y: number, mo: number, d: number, h: number, mi: number, tzMinutes: number): number {
    return Date.UTC(y, mo - 1, d, h, mi, 0, 0) - tzMinutes * 60000;
}

/**
 * Sends a message as the app bot, displayed under the away user's alias.
 */
export async function sendMessage(app: AutoReplyApp, modify: IModify, room: IRoom, user: IUser, message?: string, attachments?: Array<IMessageAttachment>, blocks?: BlockBuilder): Promise<void> {
    const botUser = await app.getAccessors().reader.getUserReader().getAppUser(app.getID());
    if (!botUser) {
        app.getLogger().warn('App user not found; cannot send auto-reply');
        return;
    }

    const messageStructure = modify.getCreator().startMessage()
        .setGroupable(false)
        .setSender(botUser)
        .setUsernameAlias(user.name || user.username)
        .setRoom(room);
    if (message && message.length > 0) {
        messageStructure.setText(message);
    }
    if (attachments && attachments.length > 0) {
        messageStructure.setAttachments(attachments);
    }
    if (blocks !== undefined) {
        messageStructure.setBlocks(blocks);
    }
    try {
        await modify.getCreator().finish(messageStructure);
    } catch (error) {
        app.getLogger().error({ msg: 'Failed to send auto-reply', error: String(error) });
    }
}

/**
 * Notifies a user in a room (visible only to them).
 */
export async function sendNotifyMessage(app: AutoReplyApp | undefined, modify: IModify, room: IRoom, user: IUser, message?: string, attachments?: Array<IMessageAttachment>, blocks?: BlockBuilder): Promise<void> {
    let botUser = user;
    if (app) {
        botUser = (await app.getAccessors().reader.getUserReader().getAppUser(app.getID())) ?? user;
    }

    const notifyMsgStructure = modify.getCreator().startMessage()
        .setUsernameAlias(botUser.name || botUser.username || 'auto-reply')
        .setEmojiAvatar('bell')
        .setSender(botUser)
        .setRoom(room);

    if (message && message.length > 0) {
        notifyMsgStructure.setText(message);
    }

    if (attachments && attachments.length > 0) {
        notifyMsgStructure.setAttachments(attachments);
    }

    if (blocks !== undefined) {
        notifyMsgStructure.setBlocks(blocks);
    }

    try {
        await modify.getNotifier().notifyUser(user, notifyMsgStructure.getMessage());
    } catch (error) {
        if (app) app.getLogger().error({ msg: 'Failed to notify user', error: String(error) });
    }
}

export const hoursOfDay = [
    { text: '00:00', value: '00:00' },
    { text: '01:00', value: '01:00' },
    { text: '02:00', value: '02:00' },
    { text: '03:00', value: '03:00' },
    { text: '04:00', value: '04:00' },
    { text: '05:00', value: '05:00' },
    { text: '06:00', value: '06:00' },
    { text: '07:00', value: '07:00' },
    { text: '08:00', value: '08:00' },
    { text: '09:00', value: '09:00' },
    { text: '10:00', value: '10:00' },
    { text: '11:00', value: '11:00' },
    { text: '12:00', value: '12:00' },
    { text: '13:00', value: '13:00' },
    { text: '14:00', value: '14:00' },
    { text: '15:00', value: '15:00' },
    { text: '16:00', value: '16:00' },
    { text: '17:00', value: '17:00' },
    { text: '18:00', value: '18:00' },
    { text: '19:00', value: '19:00' },
    { text: '20:00', value: '20:00' },
    { text: '21:00', value: '21:00' },
    { text: '22:00', value: '22:00' },
    { text: '23:00', value: '23:00' },
];

/** End-of-day option, only offered for the "until" time. */
export const endOfDayHour = { text: '24:00', value: '24:00' };

export function timezoneOffsetOptions(): Array<{ text: string; value: string }> {
    const options: Array<{ text: string; value: string }> = [];
    for (let offset = -12; offset <= 14; offset++) {
        const sign = offset >= 0 ? '+' : '-';
        const abs = Math.abs(offset);
        const label = `UTC${sign}${String(abs).padStart(2, '0')}:00`;
        options.push({ text: label, value: String(offset * 60) });
    }
    return options;
}

export function formatOffsetMinutes(minutes: number): string {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `UTC${sign}${String(h).padStart(2, '0')}:${m ? String(m).padStart(2, '0') : '00'}`;
}
