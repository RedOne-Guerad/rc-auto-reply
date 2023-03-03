import {
    IConfigurationExtend,
    IEnvironmentRead,
    IHttp,
    IPersistence,
    IRead,
    IModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IMessageAttachment, IPostMessageSent, MessageActionButtonsAlignment, MessageActionType } from '@rocket.chat/apps-engine/definition/messages';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { IAutoReplySettings, SchedulerType } from './src/utils/IAutoReplySettings';
import { AutoReplyCommand } from './src/AutoReplyCommand';
import { RoomTypeFilter, UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';
import { IUIKitResponse, UIKitActionButtonInteractionContext, UIKitBlockInteractionContext, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { getAutoReplySettings, sendMessage, sendNotifyMessage, uuid } from './src/utils/helpers';
import { createContextualBarView } from './src/modals/createContextualBarView';
import { createSchedulerModal } from './src/modals/createSchedulerModal';

export class AutoReplyApp extends App implements IPostMessageSent {

    public async checkPostMessageSent(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        // ToDo:
        // auto-respond to rooms beside direct messages
        // when user is tagged by someone
        this.getLogger().log(message.room.type, RoomType.DIRECT_MESSAGE);
        return message.room.type === RoomType.DIRECT_MESSAGE;
    }

    /**
    * Executes after a message is sent and checks if it's a match for auto-reply.
    * @param {IMessage} message - Rocket.Chat's instance
    * @param {IRead} read - Rocket.Chat's read instance
    * @param {IHttp} http - Rocket.Chat's http instance
    * @param {IPersistence} persistence - Rocket.Chat's persistence instance
    * @param {IModify} modify - Rocket.Chat's modify instance
    */
    public async executePostMessageSent(message: IMessage, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void> {
        const botUser = (await this.getAccessors()
        .reader.getUserReader()
        .getAppUser(this.getID())) as IUser;

        // if the message was sent from AutoReply
        if (message.sender.username === botUser.username) return
        // If my AutoReply is enabled and I am typing, need to offer an option to disable it
        const me = message.sender;
        const MyAutoReplySettings = await getAutoReplySettings(me.id, read)
        console.log(MyAutoReplySettings)

        const otherUserIds = message.room.userIds ?? [];
        if (otherUserIds == undefined) {
            // We don't care if there isn't one other person in the room
            return;
        }
        const otherUsers = otherUserIds.filter((u) => u !== message.sender.id);
        if (otherUsers.length !== 1) {
            // We don't care if there isn't one other person in the room
            return;
        }
        const otherUser = await read.getUserReader().getById(otherUsers[0]);
        const { id: otherUserId } = otherUser;
        if (MyAutoReplySettings.on) {

            // OtherUser is excluded?
            // dont notify me
            if (MyAutoReplySettings.users?.findIndex(user => user.id === otherUserId) !== -1) return

            // My auto-reply is enabled
            // Notify me with options to disable or cotinue using auto-reply
            if (MyAutoReplySettings.on) {

                const disableAutoReplyAction = () => ({
                    text: 'Yes',
                    type: MessageActionType.BUTTON,
                    msg_in_chat_window: true,
                    msg: '/auto-reply disable',
                });

                const disableAutoReplyForUserAction = (userId: string) => ({
                    text: 'Disable for this user',
                    type: MessageActionType.BUTTON,
                    msg_in_chat_window: true,
                    msg: `/auto-reply remove-user ${userId}`,
                });

                const continueUsingAutoReplyAction = () => ({
                    text: 'No',
                    type: MessageActionType.BUTTON,
                    msg_in_chat_window: true,
                    msg: '/auto-reply status',
                });

                const text = '`auto reply` is enabled. Would you like to disable it?';
                const attachment = {
                    actionButtonsAlignment: MessageActionButtonsAlignment.HORIZONTAL,
                    actions: [
                        disableAutoReplyAction(),
                        disableAutoReplyForUserAction(otherUserId),
                        continueUsingAutoReplyAction(),
                    ],
                } as IMessageAttachment;

                await sendNotifyMessage(this, modify, message.room, message.sender, text, [attachment]);
            }
        }
        // check if OtherUser enabled auto-reply
        const OtherAutoReplySettings = await getAutoReplySettings(otherUserId, read)
        console.log(OtherAutoReplySettings)
        if (OtherAutoReplySettings.on) {
            // OtherUser auto-reply not enabled
            if (!OtherAutoReplySettings.on) return
            // OtherUser excluded me?
            // dont send me auto-reply message
            if (OtherAutoReplySettings.users?.findIndex(user => user.id === me.id) !== -1) return
            // auto-reply enabled, send auto-reply message
            await sendMessage(this, modify, message.room, otherUser, OtherAutoReplySettings.message);
        }
        // The user is not marked as away
        return;

    }
    /**
    * Extends the Rocket.Chat configuration with a new button in the UI and a new slash command
    * @param configuration The Rocket.Chat configuration to extend
    * @param environmentRead The environment reader
    */
    protected async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {

        configuration.ui.registerButton({
            actionId: 'auto-reply-room-action-id',
            labelI18n: 'auto-reply-room-action-name',
            context: UIActionButtonContext.ROOM_ACTION, //.MESSAGE_ACTION, // in what context the action button will be displayed in the UI
            // If you want to choose `when` the button should be displayed
            when: {
                roomTypes: [
                    RoomTypeFilter.DIRECT,
                ],
                // hasOnePermission: ['create-d'],
                // hasAllRoles: ['admin', 'moderator'],
            }
        });
        await configuration.slashCommands.provideSlashCommand(new AutoReplyCommand());

    }
    /**
    * Handles button clicks in a message's attachment or a sidebar item.
    * @param {UIKitActionButtonInteractionContext} context - The context of the block interaction
    * @param {IRead} read - Rocket.Chat's read instance
    * @param {IHttp} http - Rocket.Chat's http instance
    * @param {IPersistence} persistence - Rocket.Chat's persistence instance
    * @param {IModify} modify - Rocket.Chat's modify instance
    * @returns A response object to send to Rocket.Chat that specifies how to update the UI.
    */
    public async executeActionButtonHandler(context: UIKitActionButtonInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const {
            actionId,
            user,
            room,
        } = context.getInteractionData();
        console.log(SchedulerType.Daily);
        const data = context.getInteractionData()
        if (actionId === 'auto-reply-room-action-id') {
            // get auto-reply settings for this user
            const autoReplySettings = await getAutoReplySettings(user.id, read)
            const modal = await createContextualBarView(undefined, read, http, persistence, modify, autoReplySettings);
            return context.getInteractionResponder().openContextualBarViewResponse(modal);
        }
        return context.getInteractionResponder().successResponse();
    }

    /**
    * Implements the submit of a view
    * @param {UIKitViewSubmitInteractionContext} context - The context of the block interaction
    * @param {IRead} read - Rocket.Chat's read instance
    * @param {IHttp} http - Rocket.Chat's http instance
    * @param {IPersistence} persistence - Rocket.Chat's persistence instance
    * @param {IModify} modify - Rocket.Chat's modify instance
    * @returns An IUIKitResponse with the results of the interaction
    */
    public async executeViewSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData()
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
        const { autoReplySettings, autoReplySchedulerDaily }: {
            autoReplySettings: {
                EnableApp?: string,
                DisableApp?: string,
                ExcludeUsers?: Array<string>,
                AutoReplyMessage?: string,
            },
            autoReplySchedulerDaily: {
                EnableTime?: string,
                DisableTime?: string
            }
        } = interactionData.view.state as any;

        if(autoReplySchedulerDaily) return await this.executeAddSchedulerSubmitHandler(context, read, http, persistence, modify)

        console.log({'submit': interactionData.view.state })
        const action = () => {
            if (autoReplySettings.EnableApp === undefined && autoReplySettings.DisableApp && autoReplySettings.DisableApp === 'Disable') return false
            if (autoReplySettings.DisableApp === undefined && autoReplySettings.EnableApp && autoReplySettings.EnableApp === 'Enable') return true
            return undefined
        }
        // No changes do nothing
        const noChanges = action() === undefined && autoReplySettings.AutoReplyMessage === undefined && autoReplySettings.ExcludeUsers === undefined;
        if (noChanges) {
            return { success: false };
        }

        // Get the previous auto-reply settings if they exist. 
        const previousSettings = await getAutoReplySettings(interactionData.user.id, read);

        const excludeUsers = async (): Promise<IUser[]> => {
            const userPromises = (autoReplySettings.ExcludeUsers ?? previousSettings?.users?.map((user: IUser) => user.id) ?? []).map(id => read.getUserReader().getById(id));
            const users = await Promise.all(userPromises);
            return users.filter((user: IUser): user is IUser => user !== undefined);
        };

        // Get the new auto-reply settings. 
        const state: IAutoReplySettings = {
            on: action() ?? previousSettings?.on ?? false,
            message: autoReplySettings.AutoReplyMessage || previousSettings?.message,
            users: await excludeUsers() ?? [],
            schedulers: previousSettings?.schedulers
        }

        await persistence.updateByAssociation(assocMe, state, true);

        if (interactionData.room) {
            const notifyMsg = autoReplySettings.DisableApp ? '*Auto-Reply* is Disabled' : '*Auto-Reply* is Enabled, with the follwing message:\n' + state.message
            await sendNotifyMessage(this, modify, interactionData.room, interactionData.user, notifyMsg);
        }

        return {
            success: true,
        };
    }

    public async executeAddSchedulerSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData()
        const { autoReplySchedulerDaily }: {
            autoReplySchedulerDaily: {
                EnableTime?: string,
                DisableTime?: string,
                Message?: string
            }
        } = interactionData.view.state as any;
        // Get the previous auto-reply settings if they exist. 
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
        const previousSettings = await getAutoReplySettings(interactionData.user.id, read);

        if(autoReplySchedulerDaily && autoReplySchedulerDaily.EnableTime && autoReplySchedulerDaily.DisableTime){
            previousSettings.schedulers?.push({
                id: uuid(),
                settings: {
                    enableTime: autoReplySchedulerDaily.EnableTime,
                    disableTime: autoReplySchedulerDaily.DisableTime,
                    message: autoReplySchedulerDaily.Message || previousSettings.message
                },
                type: SchedulerType.Daily
            })
            const modal = await createContextualBarView(interactionData.view.submit?.value, read, http, persistence, modify, previousSettings)
            if(context.getInteractionResponder().updateContextualBarViewResponse(modal).success)
                await persistence.updateByAssociation(assocMe, previousSettings, true);
        }
        return {
            success: true,
        };
    }

    /**
    * Handles the execution of a block action, such as clicking a button.
    * @param {UIKitBlockInteractionContext} context - The context of the block interaction
    * @param {IRead} read - Rocket.Chat's read instance
    * @param {IHttp} http - Rocket.Chat's http instance
    * @param {IPersistence} persistence - Rocket.Chat's persistence instance
    * @param {IModify} modify - Rocket.Chat's modify instance
    * @returns {Promise<any>} A promise that resolves with the result of the execution
    */
    public async executeBlockActionHandler(context: UIKitBlockInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<any> {
        const data = context.getInteractionData();
        // get auto-reply settings for this user
        const autoReplySettings = await getAutoReplySettings(data.user.id, read);
        if (data.actionId === 'EnableApp') {
            autoReplySettings.on = true;
            const modal = await createContextualBarView(data.container.id, read, http, persistence, modify, autoReplySettings)
            return context.getInteractionResponder().updateContextualBarViewResponse(modal);
        }
        if (data.actionId === 'DisableApp') {
            autoReplySettings.on = false;
            const modal = await createContextualBarView(data.container.id, read, http, persistence, modify, autoReplySettings)
            return context.getInteractionResponder().updateContextualBarViewResponse(modal);
        }
        if (data.actionId === 'AddScheduler') {
            const modal = await createSchedulerModal(data.container.id, modify, SchedulerType[data.value || 'Daily'], autoReplySettings)
            return  context.getInteractionResponder().openModalViewResponse(modal);
        }
        return {
            success: true,
        };
    }

}
