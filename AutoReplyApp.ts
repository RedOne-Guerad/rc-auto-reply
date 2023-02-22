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

import { IAutoReplySettings } from './IAutoReplySettings';
import { AutoReplyCommand } from './AutoReplyCommand';
import { RoomTypeFilter, UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';
import { ButtonStyle, IUIKitResponse, UIKitActionButtonInteractionContext, UIKitBlockInteractionContext, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { sendMessage, sendNotifyMessage, uuid } from './helpers';

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
     *
     * @param {IMessage} message - Rocket.Chat's instance
     * @param {IRead} read - Rocket.Chat's read instance
     * @param {IHttp} http - Rocket.Chat's http instance
     * @param {IPersistence} persistence - Rocket.Chat's persistence instance
     * @param {IModify} modify - Rocket.Chat's modify instance
     */
    public async executePostMessageSent(message: IMessage, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void> {

        // if the message was sent from AutoReply
        if (message.sender.username === 'auto-reply.bot') return
        // If my AutoReply is enabled and I am typing, need to offer an option to disable it
        const me = message.sender;
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, me.id);
        const AutoReplyMe = await read.getPersistenceReader().readByAssociation(assocMe);

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
        if (AutoReplyMe.length > 0) {
            const MyAutoReplySettings = AutoReplyMe[0] as IAutoReplySettings

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
        const otherUserAssoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, otherUserId);
        const OtherAutoReplySettingsAssoc = await read.getPersistenceReader().readByAssociation(otherUserAssoc);
        if (OtherAutoReplySettingsAssoc.length > 0) {
            const OtherAutoReplySettings = OtherAutoReplySettingsAssoc[0] as IAutoReplySettings;
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
    Extends the Rocket.Chat configuration with a new button in the UI and a new slash command
    @param configuration The Rocket.Chat configuration to extend
    @param environmentRead The environment reader
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
     *
    @param {UIKitActionButtonInteractionContext} context - The context of the block interaction
    @param {IRead} read - Rocket.Chat's read instance
    @param {IHttp} http - Rocket.Chat's http instance
    @param {IPersistence} persistence - Rocket.Chat's persistence instance
    @param {IModify} modify - Rocket.Chat's modify instance
    @returns A response object to send to Rocket.Chat that specifies how to update the UI.
    */
    public async executeActionButtonHandler(context: UIKitActionButtonInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const {
            actionId,
            user,
            room,
        } = context.getInteractionData();
        const data = context.getInteractionData()
        if (actionId === 'auto-reply-room-action-id') {
            // get auto-reply data for this user
            const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, user.id);
            const autoReplySettingsAssoc = await read.getPersistenceReader().readByAssociation(assocMe);
            const autoReplySettings = autoReplySettingsAssoc[0] as IAutoReplySettings | undefined;

            console.log(autoReplySettings?.on);
            const modal = await this.createAppModal('', data, read, http, persistence, modify, autoReplySettings?.on || false, autoReplySettings?.users);
            return context.getInteractionResponder().openContextualBarViewResponse(modal);
        }

        return context.getInteractionResponder().successResponse();
    }

    /**
    Implements the submit of a view
    @param {UIKitViewSubmitInteractionContext} context - The context of the block interaction
    @param {IRead} read - Rocket.Chat's read instance
    @param {IHttp} http - Rocket.Chat's http instance
    @param {IPersistence} persistence - Rocket.Chat's persistence instance
    @param {IModify} modify - Rocket.Chat's modify instance
    @returns An IUIKitResponse with the results of the interaction
    */
    public async executeViewSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData()
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
        const { autoReplyValues }: {
            autoReplyValues: {
                EnableApp?: string,
                DisableApp?: string,
                ExcludeUsers?: Array<string>,
                AutoReplyMessage?: string,
            },
        } = interactionData.view.state as any;
        const action = () => {
            if (autoReplyValues.DisableApp && autoReplyValues.DisableApp === 'Disable') return false
            if (autoReplyValues.EnableApp && autoReplyValues.EnableApp === 'Enable') return true
            return undefined
        }
        // No changes do nothing
        const noChanges = action() === undefined && autoReplyValues.AutoReplyMessage === undefined && autoReplyValues.ExcludeUsers === undefined;
        if (noChanges) {
            return { success: false };
        }

        // Get the previous auto-reply settings if they exist. 
        let oldState: IAutoReplySettings | undefined = undefined
        const existing = await read.getPersistenceReader().readByAssociation(assocMe);
        if (existing.length > 0) {
            const previousSettings = existing[0] as IAutoReplySettings
            oldState = previousSettings
            console.log({ 'Previous auto-reply settings:': oldState });
            await persistence.removeByAssociation(assocMe);
        }

        const excludeUsers = async (): Promise<IUser[]> => {
            const userPromises = (autoReplyValues.ExcludeUsers ?? oldState?.users?.map((user) => user.id) ?? []).map(id => read.getUserReader().getById(id));
            console.log({'New: ': autoReplyValues.ExcludeUsers, 'Old: ': oldState?.users});
            const users = await Promise.all(userPromises);
            return users.filter((user): user is IUser => user !== undefined);
        };

        // Get the new auto-reply settings. 
        const state: IAutoReplySettings = {
            on: action() ?? oldState?.on ?? false,
            message: autoReplyValues.AutoReplyMessage || oldState?.message || 'Hey, I received your message and will get back to you as soon as possible.',
            users: await excludeUsers() ?? []
        }

        await persistence.createWithAssociation(state, assocMe);

        if (interactionData.room) {
            const notifyMsg = autoReplyValues.DisableApp ? '*Auto-Reply* is Disabled' : '*Auto-Reply* is Enabled, with the follwing message:\n' + state.message
            await sendNotifyMessage(this, modify, interactionData.room, interactionData.user, notifyMsg);
        }
        console.log({ 'newState:': state, 'room': interactionData.room });

        return {
            success: true,
        };
    }
    /**
    Handles the execution of a block action, such as clicking a button.
    @param {UIKitBlockInteractionContext} context - The context of the block interaction
    @param {IRead} read - Rocket.Chat's read instance
    @param {IHttp} http - Rocket.Chat's http instance
    @param {IPersistence} persistence - Rocket.Chat's persistence instance
    @param {IModify} modify - Rocket.Chat's modify instance
    @returns {Promise<any>} A promise that resolves with the result of the execution
    */
    public async executeBlockActionHandler(context: UIKitBlockInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<any> {
        const data = context.getInteractionData();
        // get auto-reply settings for this user
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, data.user.id);
        const autoReplySettingsAssoc = await read.getPersistenceReader().readByAssociation(assocMe)
        const autoReplySettings = autoReplySettingsAssoc[0] as IAutoReplySettings | undefined

        if (data.actionId === 'EnableApp') {
            console.log(data.value);
            const modal = await this.createAppModal(data.container.id, data, read, http, persistence, modify, true, autoReplySettings?.users)
            return context.getInteractionResponder().updateModalViewResponse(modal);
        }
        if (data.actionId === 'DisableApp') {
            console.log(data.value);
            const modal = await this.createAppModal(data.container.id, data, read, http, persistence, modify, false, autoReplySettings?.users)
            return context.getInteractionResponder().updateModalViewResponse(modal);
        }
        return {
            success: true,
        };
    }
    
    public async createAppModal(id: string = '', InteractionData: any, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify, enabled: boolean = false, users: Array<IUser> | undefined): Promise<IUIKitModalViewParam> {
        const {
            actionId,
            triggerId,
            user,
            room,
            message,
        } = InteractionData;
        // get auto-reply data for this user
        const viewId = id || uuid();
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, user.id);
        const autoReplydata = await read.getPersistenceReader().readByAssociation(assocMe)
        const AutoReplyStorage = autoReplydata[0] as IAutoReplySettings || null

        const block = modify.getCreator().getBlockBuilder();

        block.addSectionBlock({
            text: block.newMarkdownTextObject("*Auto-reply* allows you to automatically send customized messages in response to incoming texts.\nyou can set up personalized auto-responses to ensure that your contacts receive a prompt reply, even when you are not available to respond immediately."),
        });
        block.addDividerBlock()

        if (!enabled) {
            block.addActionsBlock({
                blockId: 'autoReplyValues',
                elements: [
                    block.newButtonElement({
                        text: block.newPlainTextObject('Enable Auto-reply'),
                        value: 'Enable',
                        style: ButtonStyle.PRIMARY,
                        actionId: 'EnableApp',
                    }),
                ]
            });

            return {
                id: viewId,
                title: block.newPlainTextObject('Auto Reply', true),
                submit: block.newButtonElement({
                    text: block.newPlainTextObject('Submit'),
                    style: ButtonStyle.PRIMARY,

                }),
                close: block.newButtonElement({
                    text: block.newPlainTextObject('Cancel'),
                }),

                blocks: block.getBlocks(),
            }
        }
        block.addActionsBlock({
            blockId: 'autoReplyValues',
            elements: [
                block.newButtonElement({
                    text: block.newPlainTextObject('Disable Auto-reply'),
                    value: 'Disable',
                    style: ButtonStyle.DANGER,
                    actionId: 'DisableApp',
                }),
            ]
        });
        // const users: IUser[] = await read.getUsers();
        if (users && users?.length > 0) {
            block.addSectionBlock({
                blockId: 'autoReplyValues',
                text: block.newMarkdownTextObject('Auto-Reply is disabled for those users:'),
                
            })
            block.addActionsBlock({
                blockId: 'autoReplyValues',
                elements: [
                    block.newMultiStaticElement({
                        placeholder: block.newPlainTextObject('username'),
                        actionId: 'ExcludeUsers',
                        options: users.map((user) => ({
                            text: block.newPlainTextObject(user.name),
                            value: user.id,

                        })),
                        initialValue: users.map((user) => user.id)
                    }),
                ],
            });
        }

        block.addInputBlock({
            blockId: 'autoReplyValues',
            optional: false,
            element: block.newPlainTextInputElement({
                actionId: 'AutoReplyMessage',
                initialValue: AutoReplyStorage?.message || 'Hey, I received your message and will get back to you as soon as possible.',
                multiline: true,
            }),
            label: block.newPlainTextObject('Auto-reply Message:'),
        })

        return {
            id: viewId,
            title: block.newPlainTextObject('Auto Reply', true),
            submit: block.newButtonElement({
                text: block.newPlainTextObject('Submit'),
                style: ButtonStyle.PRIMARY,

            }),
            close: block.newButtonElement({
                text: block.newPlainTextObject('Cancel'),
            }),

            blocks: block.getBlocks(),
        }
    }
}
