import { IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

import { IAutoReplySettings, IUsersLastReply } from './IAutoReplySettings';

// Kept apart from the settings, so a reply never overwrites settings changed at the same time.
// Deliberately not associated with the user: getAutoReplySettings reads everything associated with the user.
const association = (userId: string) => new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, `last-replies:${userId}`);

export async function readLastReplies(userId: string, read: IRead): Promise<IUsersLastReply[]> {
    const [record] = await read.getPersistenceReader().readByAssociation(association(userId));
    return (record as { replies?: IUsersLastReply[] } | undefined)?.replies ?? [];
}

export async function saveLastReply(userId: string, senderId: string, read: IRead, persis: IPersistence): Promise<void> {
    const replies = (await readLastReplies(userId, read)).filter((reply) => reply.userId !== senderId);
    replies.push({ userId: senderId, lastMessage: new Date() });
    await persis.updateByAssociation(association(userId), { replies }, true);
}

/** The reply frequency counts from the moment auto-reply gets switched on, so everyone gets a reply again after it was off */
export async function resetLastRepliesOnSwitch(userId: string, previousSettings: IAutoReplySettings, on: boolean, persis: IPersistence): Promise<void> {
    if (on && !previousSettings.on) {
        await persis.removeByAssociation(association(userId));
    }
}
