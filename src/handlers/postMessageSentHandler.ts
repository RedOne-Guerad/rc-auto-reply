import { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IMessage, IMessageAttachment, MessageActionButtonsAlignment, MessageActionType } from "@rocket.chat/apps-engine/definition/messages";
import { AutoReplyApp } from "../../AutoReplyApp";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { getAutoReplySettings, sendMessage, sendNotifyMessage } from "../utils/helpers";
import { IAutoReplySettings, IReplyFrequency } from "../utils/IAutoReplySettings";
import { RocketChatAssociationModel, RocketChatAssociationRecord } from "@rocket.chat/apps-engine/definition/metadata";

export class PostMessageSentHandler{
    constructor(
        private readonly app: AutoReplyApp,
        private readonly message: IMessage, 
        private readonly read: IRead, 
        private readonly http: IHttp, 
        private readonly persistence: IPersistence, 
        private readonly modify: IModify
    ){}

    public async execute(): Promise<void> {
        const botUser = await this.getBotUser();
        if (this.isSentByBot(botUser)) return;
    
        const me = this.message.sender;
        const MyAutoReplySettings = await getAutoReplySettings(me.id, this.read);
    
        const otherUser = await this.getOtherUserInRoom();
        if (!otherUser) return;
    
        if (MyAutoReplySettings.on) {
            await this.handleMyAutoReply(MyAutoReplySettings, otherUser.id);
        }
    
        const OtherAutoReplySettings = await getAutoReplySettings(otherUser.id, this.read);
        if (OtherAutoReplySettings.on) {
            await this.handleOtherUserAutoReply(OtherAutoReplySettings, otherUser, me);
        }
    }
    
    private async getBotUser(): Promise<IUser> {
        return (await this.app.getAccessors().reader.getUserReader().getAppUser(this.app.getID())) as IUser;
    }
    
    private isSentByBot(botUser: IUser): boolean {
        return this.message.sender.username === botUser.username;
    }
    
    private async getOtherUserInRoom(): Promise<IUser | undefined> {
        const otherUserIds = this.message.room.userIds ?? [];
        if (otherUserIds == undefined || otherUserIds.length !== 2) return;
    
        const otherUserId = otherUserIds.find((u) => u !== this.message.sender.id);
        if (!otherUserId) return;
    
        return await this.read.getUserReader().getById(otherUserId);
    }
    
    private async handleMyAutoReply(MyAutoReplySettings: IAutoReplySettings, otherUserId: string): Promise<void> {
        if (MyAutoReplySettings.users?.some(user => user.id === otherUserId)) return;
    
        const text = '`auto reply` is enabled. Would you like to disable it?';
        const attachment = this.getMyAutoReplyAttachment(otherUserId);
        await sendNotifyMessage(this.app, this.modify, this.message.room, this.message.sender, text, [attachment]);
    }
    
    private getMyAutoReplyAttachment(otherUserId: string): IMessageAttachment {
        return {
            actionButtonsAlignment: MessageActionButtonsAlignment.HORIZONTAL,
            actions: [
                this.disableAutoReplyAction(),
                this.disableAutoReplyForUserAction(otherUserId),
                this.continueUsingAutoReplyAction(),
            ],
        } as IMessageAttachment;
    }
    
    private disableAutoReplyAction(): any {
        return {
            text: 'Yes',
            type: MessageActionType.BUTTON,
            msg_in_chat_window: true,
            msg: '/auto-reply disable',
        };
    }
    
    private disableAutoReplyForUserAction(userId: string): any {
        return {
            text: 'Disable for this user',
            type: MessageActionType.BUTTON,
            msg_in_chat_window: true,
            msg: `/auto-reply remove-user ${userId}`,
        };
    }
    
    private continueUsingAutoReplyAction(): any {
        return {
            text: 'No',
            type: MessageActionType.BUTTON,
            msg_in_chat_window: true,
            msg: '/auto-reply status',
        };
    }
    
    private async handleOtherUserAutoReply(OtherAutoReplySettings: IAutoReplySettings, otherUser: IUser, me: IUser): Promise<void> {
        if (OtherAutoReplySettings.users?.some(user => user.id === me.id)) return;
    
        const OtherreplyFrequency = OtherAutoReplySettings.replyFrequency;
        if (OtherreplyFrequency !== String(IReplyFrequency.OnEveryMessage) && OtherAutoReplySettings.usersLastReply) {
            const OtherLastReply = this.getOtherUserLastReply(OtherAutoReplySettings, me.id);
            if (this.shouldSkipAutoReply(OtherreplyFrequency, OtherLastReply)) return;
        }
    
        const threadId = this.message.threadId
        await sendMessage(this.app, this.modify, this.message.room, otherUser, OtherAutoReplySettings.message, threadId);
        await this.updateOtherUserLastReply(otherUser.id, me);
    }
    
    private getOtherUserLastReply(OtherAutoReplySettings: IAutoReplySettings, meId: string): Date | null {
        return OtherAutoReplySettings.usersLastReply?.find(userLastReply => userLastReply.user.id === meId)?.lastMessage || null;
    }
    
    private shouldSkipAutoReply(OtherreplyFrequency: string, OtherLastReply: Date | null): boolean {
        if (OtherLastReply == null) return false;
    
        const currentTime = new Date();
        const lastReplyTime = new Date(OtherLastReply);
        const timeDifference = currentTime.getTime() - lastReplyTime.getTime();
    
        switch (OtherreplyFrequency) {
            case String(IReplyFrequency.Once):
                return true;
            case String(IReplyFrequency.OncePerHour):
                return timeDifference < 1000 * 60 * 60;
            case String(IReplyFrequency.OncePerDay):
                return timeDifference < 1000 * 60 * 60 * 24;
            case String(IReplyFrequency.OncePerWeek):
                return timeDifference < 1000 * 60 * 60 * 24 * 7;
            case String(IReplyFrequency.OncePerMonth):
                return timeDifference < 1000 * 60 * 60 * 24 * 30;
            default:
                return false;
        }
    }
    
    private async updateOtherUserLastReply(otherUserId: string, me: IUser): Promise<void> {
        const previousSettings = await getAutoReplySettings(otherUserId, this.read);
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, otherUserId);
        const usersLastReply = previousSettings?.usersLastReply || [];
        const userLastReplyIndex = usersLastReply.findIndex(reply => reply.user.id === me.id);
    
        if (userLastReplyIndex !== -1) {
            usersLastReply[userLastReplyIndex].lastMessage = new Date();
        } else {
            usersLastReply.push({ user: me, lastMessage: new Date() });
        }
    
        const state: IAutoReplySettings = {
            ...previousSettings,
            usersLastReply,
        };
    
        await this.persistence.updateByAssociation(assocMe, state, true);
    }
    
}