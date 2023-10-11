import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { BlockBuilder } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { AutoReplyApp } from '../../AutoReplyApp';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IAutoReplySettings } from './IAutoReplySettings';



export async function getAutoReplySettings(userId: string, read: IRead): Promise<IAutoReplySettings> {
    const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId);
    const autoReplySettingsAssoc = await read.getPersistenceReader().readByAssociation(assocMe);
    const autoReplySettings = autoReplySettingsAssoc[0] as IAutoReplySettings | undefined;
    return {
        on: autoReplySettings?.on ?? false,
        message: autoReplySettings?.message || 'Hey, I received your message and will get back to you as soon as possible.',
        users: autoReplySettings?.users ?? [],
        schedulers: autoReplySettings?.schedulers ?? [],
    };
}

/**
 * Copied from https://github.com/sampaiodiego/rocket.chat.app-poll/blob/4188fb6ba2b68b03d1b992735c46ee5f04fc18c8/src/lib/uuid.ts 
 */
export function uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
/**
 * Sends a message using bot
 *
 * @param app
 * @param modify
 * @param room Where to send message to
 * @param user who sending the message
 * @param message What to send
 * @param attachments (optional) Message attachments (such as action buttons)
 */
export async function sendMessage(app: AutoReplyApp, modify: IModify, room: IRoom, user: IUser, message?: string, attachments?: Array<IMessageAttachment>, blocks?: BlockBuilder): Promise<void> {
    const botUser = (await app.getAccessors()
        .reader.getUserReader()
        .getAppUser(app.getID())) as IUser;

    const messageStructure = modify.getCreator().startMessage()
        .setGroupable(false)
        .setSender(botUser)
        .setUsernameAlias(user.name)
        // .setEmojiAvatar(app.kokoEmojiAvatar)
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
        app.getLogger().log(error);
    }
}
/**
 * Notifies user using bot
 *
 * @param app
 * @param modify
 * @param user Who to notify
 * @param message What to send
 * @param attachments (optional) Message attachments (such as action buttons)
 */
export async function sendNotifyMessage(app: AutoReplyApp | undefined, modify: IModify, room: IRoom, user: IUser, message?: string, attachments?: Array<IMessageAttachment>, blocks?: BlockBuilder): Promise<void> {
    let botUser = user;
    if (app) {
        botUser = (await app.getAccessors()
            .reader.getUserReader()
            .getAppUser(app.getID())) as IUser;
    }

    const notifyMsgStructure = modify.getCreator().startMessage()
        .setUsernameAlias(botUser.name).setEmojiAvatar('bell')
        .setSender(botUser)
        .setRoom(room)

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
        if (app) app.getLogger().log(error);
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