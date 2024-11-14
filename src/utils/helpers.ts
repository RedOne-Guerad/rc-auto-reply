import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IMessageAttachment } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { BlockBuilder } from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { AutoReplyApp } from '../../AutoReplyApp';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IAutoReplySettings, IReplyFrequency } from './IAutoReplySettings';



export async function getAutoReplySettings(userId: string, read: IRead): Promise<IAutoReplySettings> {
    const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId);
    const autoReplySettingsAssoc = await read.getPersistenceReader().readByAssociation(assocMe);
    const autoReplySettings = autoReplySettingsAssoc[0] as IAutoReplySettings | undefined;
    return {
        on: autoReplySettings?.on ?? false,
        message: autoReplySettings?.message || 'Hey, I received your message and will get back to you as soon as possible.',
        users: autoReplySettings?.users ?? [],
        schedulers: autoReplySettings?.schedulers,
        usersLastReply: autoReplySettings?.usersLastReply ?? [],
        replyFrequency: autoReplySettings?.replyFrequency ?? String(IReplyFrequency.OnEveryMessage),
    };
}

/**
 * Copied from https://github.com/sampaiodiego/rocket.chat.app-poll/blob/4188fb6ba2b68b03d1b992735c46ee5f04fc18c8/src/lib/uuid.ts 
 */
export function uuid(): string {
    return "821cd5c6-1fb5-4d9e-8e88-e6176463efb6"
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
export async function sendMessage(app: AutoReplyApp, modify: IModify, room: IRoom, user: IUser, message: string, threadId?: string, attachments?: Array<IMessageAttachment>, blocks?: BlockBuilder): Promise<void> {
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
    if (threadId) {
        messageStructure.setThreadId(threadId)
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
    { text: '12am', value: '00' },
    { text: '1am', value: '01' },
    { text: '2am', value: '02' },
    { text: '3am', value: '03' },
    { text: '4am', value: '04' },
    { text: '5am', value: '05' },
    { text: '6am', value: '06' },
    { text: '7am', value: '07' },
    { text: '8am', value: '08' },
    { text: '9am', value: '09' },
    { text: '10am', value: '10' },
    { text: '11am', value: '11' },
    { text: '12pm', value: '12' },
    { text: '1pm', value: '13' },
    { text: '2pm', value: '14' },
    { text: '3pm', value: '15' },
    { text: '4pm', value: '16' },
    { text: '5pm', value: '17' },
    { text: '6pm', value: '18' },
    { text: '7pm', value: '19' },
    { text: '8pm', value: '20' },
    { text: '9pm', value: '21' },
    { text: '10pm', value: '22' },
    { text: '11pm', value: '23' },
];
export const minutesOfHour = Array.from({ length: 60 }, (_, i) => {
    const minute = i.toString().padStart(2, '0');
    return { text: minute, value: minute };
});
export function extractDate(date: Date | undefined): string | undefined {
    if (date instanceof Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return undefined;
  }
  
  
  export function extractHours(date: Date | undefined): string | undefined {
    if (date instanceof Date) {
      return String(date.getHours())
    }
    return undefined;
  }
  
  export function extractMinutes(date: Date | undefined): string | undefined {
    if (date instanceof Date) {
      return String(date.getMinutes())
    }
    return undefined;
  }
  
  export function stringDateTime(date?: Date): string | undefined {
    if (date instanceof Date) {
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      };
      return date.toLocaleString('en-US', options);
    }
    return undefined;
  }
  