import { IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { BlockBuilder } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

import { AutoReplyApp } from '../../AutoReplyApp';
import { IAutoReplySettings, ReplyFrequency, DEFAULT_MESSAGE, DEFAULT_COOLDOWN_HOURS } from './IAutoReplySettings';
import { AppLanguage, normalizeLanguage } from '../i18n/translations';

export const SCHEDULER_USERS_ASSOC_ID = 'auto-reply-scheduler-users';

export async function getAutoReplySettings(userId: string, read: IRead): Promise<IAutoReplySettings> {
    const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId);
    const records = await read.getPersistenceReader().readByAssociation(assocMe);
    const stored = records[0] as IAutoReplySettings | undefined;
    return {
        on: stored?.on ?? false,
        message: stored?.message || DEFAULT_MESSAGE,
        // Deleted users can linger as null entries in old records (issue #9);
        // dropping them here heals already-affected installations on first read.
        users: (stored?.users ?? []).filter(Boolean),
        schedulers: stored?.schedulers ?? [],
        frequency: stored?.frequency ?? 'every',
        cooldownHours: stored?.cooldownHours ?? DEFAULT_COOLDOWN_HOURS,
        replyToMentions: stored?.replyToMentions ?? false,
        timezoneOffsetMinutes: stored?.timezoneOffsetMinutes ?? 0,
        // missing enabledAt may deserialize as null from old records
        enabledAt: stored?.enabledAt || undefined,
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

/** Whether an auto-reply should be sent for this conversation right now. */
export function shouldAutoReply(settings: IAutoReplySettings, tracking: IChatTracking, now = Date.now()): boolean {
    const frequency: ReplyFrequency = settings.frequency ?? 'every';
    if (frequency === 'every') {
        return true;
    }
    const lastReplyAt = tracking.lastReplyAt ?? 0;
    if (frequency === 'once') {
        // one reply per conversation per enable period
        return !settings.enabledAt || lastReplyAt < settings.enabledAt;
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

export const daysOfWeek = [
    { text: 'Monday', value: 'Monday' },
    { text: 'Tuesday', value: 'Tuesday' },
    { text: 'Wednesday', value: 'Wednesday' },
    { text: 'Thursday', value: 'Thursday' },
    { text: 'Friday', value: 'Friday' },
    { text: 'Saturday', value: 'Saturday' },
    { text: 'Sunday', value: 'Sunday' },
];

export const hoursOfDay = [
    { text: '12:00am', value: '00:00' },
    { text: '1:00am', value: '01:00' },
    { text: '2:00am', value: '02:00' },
    { text: '3:00am', value: '03:00' },
    { text: '4:00am', value: '04:00' },
    { text: '5:00am', value: '05:00' },
    { text: '6:00am', value: '06:00' },
    { text: '7:00am', value: '07:00' },
    { text: '8:00am', value: '08:00' },
    { text: '9:00am', value: '09:00' },
    { text: '10:00am', value: '10:00' },
    { text: '11:00am', value: '11:00' },
    { text: '12:00pm', value: '12:00' },
    { text: '1:00pm', value: '13:00' },
    { text: '2:00pm', value: '14:00' },
    { text: '3:00pm', value: '15:00' },
    { text: '4:00pm', value: '16:00' },
    { text: '5:00pm', value: '17:00' },
    { text: '6:00pm', value: '18:00' },
    { text: '7:00pm', value: '19:00' },
    { text: '8:00pm', value: '20:00' },
    { text: '9:00pm', value: '21:00' },
    { text: '10:00pm', value: '22:00' },
    { text: '11:00pm', value: '23:00' },
];

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
