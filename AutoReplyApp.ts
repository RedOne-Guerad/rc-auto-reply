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

<<<<<<< HEAD
import { IAutoReplySettings } from './IAutoReplySettings';
import { AutoReplyCommand } from './AutoReplyCommand';
import { RoomTypeFilter, UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';
import { ButtonStyle, IUIKitResponse, UIKitActionButtonInteractionContext, UIKitBlockInteractionContext, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { IUIKitModalViewParam } from '@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder';
import { sendMessage, sendNotifyMessage, uuid } from './helpers';
=======
import { IAutoReplySettings, SchedulerType } from './src/utils/IAutoReplySettings';
import { AutoReplyCommand } from './src/AutoReplyCommand';
import { RoomTypeFilter, UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';
import { IUIKitResponse, UIKitActionButtonInteractionContext, UIKitBlockInteractionContext, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { getAutoReplySettings, sendMessage, sendNotifyMessage, uuid } from './src/utils/helpers';
import { createContextualBarView } from './src/modals/createContextualBarView';
import { createSchedulerModal } from './src/modals/createSchedulerModal';
>>>>>>> 42f13f0 (add ru)

export class AutoReplyApp extends App implements IPostMessageSent {

    public async checkPostMessageSent(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        // ToDo:
        // auto-respond to rooms beside direct messages
        // when user is tagged by someone
        this.getLogger().log(message.room.type, RoomType.DIRECT_MESSAGE);
        return message.room.type === RoomType.DIRECT_MESSAGE;
    }

    /**
<<<<<<< HEAD
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
=======
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
>>>>>>> 42f13f0 (add ru)

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
<<<<<<< HEAD
        if (AutoReplyMe.length > 0) {
            const MyAutoReplySettings = AutoReplyMe[0] as IAutoReplySettings
=======
        if (MyAutoReplySettings.on) {
>>>>>>> 42f13f0 (add ru)

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
<<<<<<< HEAD
        const otherUserAssoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, otherUserId);
        const OtherAutoReplySettingsAssoc = await read.getPersistenceReader().readByAssociation(otherUserAssoc);
        if (OtherAutoReplySettingsAssoc.length > 0) {
            const OtherAutoReplySettings = OtherAutoReplySettingsAssoc[0] as IAutoReplySettings;
=======
        const OtherAutoReplySettings = await getAutoReplySettings(otherUserId, read)
        console.log(OtherAutoReplySettings)
        if (OtherAutoReplySettings.on) {
>>>>>>> 42f13f0 (add ru)
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
<<<<<<< HEAD
    Extends the Rocket.Chat configuration with a new button in the UI and a new slash command
    @param configuration The Rocket.Chat configuration to extend
    @param environmentRead The environment reader
=======
    * Extends the Rocket.Chat configuration with a new button in the UI and a new slash command
    * @param configuration The Rocket.Chat configuration to extend
    * @param environmentRead The environment reader
>>>>>>> 42f13f0 (add ru)
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
<<<<<<< HEAD
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
=======

    }
    /**
    * Handles button clicks in a message's attachment or a sidebar item.
    * @param {UIKitActionButtonInteractionContext} context - The context of the block interaction
    * @param {IRead} read - Rocket.Chat's read instance
    * @param {IHttp} http - Rocket.Chat's http instance
    * @param {IPersistence} persistence - Rocket.Chat's persistence instance
    * @param {IModify} modify - Rocket.Chat's modify instance
    * @returns A response object to send to Rocket.Chat that specifies how to update the UI.
>>>>>>> 42f13f0 (add ru)
    */
    public async executeActionButtonHandler(context: UIKitActionButtonInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const {
            actionId,
            user,
            room,
        } = context.getInteractionData();
<<<<<<< HEAD
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

=======
        console.log(SchedulerType.Daily);
        const data = context.getInteractionData()
        if (actionId === 'auto-reply-room-action-id') {
            // get auto-reply settings for this user
            const autoReplySettings = await getAutoReplySettings(user.id, read)
            const modal = await createContextualBarView(undefined, read, http, persistence, modify, autoReplySettings);
            return context.getInteractionResponder().openContextualBarViewResponse(modal);
        }
>>>>>>> 42f13f0 (add ru)
        return context.getInteractionResponder().successResponse();
    }

    /**
<<<<<<< HEAD
    Implements the submit of a view
    @param {UIKitViewSubmitInteractionContext} context - The context of the block interaction
    @param {IRead} read - Rocket.Chat's read instance
    @param {IHttp} http - Rocket.Chat's http instance
    @param {IPersistence} persistence - Rocket.Chat's persistence instance
    @param {IModify} modify - Rocket.Chat's modify instance
    @returns An IUIKitResponse with the results of the interaction
=======
    * Implements the submit of a view
    * @param {UIKitViewSubmitInteractionContext} context - The context of the block interaction
    * @param {IRead} read - Rocket.Chat's read instance
    * @param {IHttp} http - Rocket.Chat's http instance
    * @param {IPersistence} persistence - Rocket.Chat's persistence instance
    * @param {IModify} modify - Rocket.Chat's modify instance
    * @returns An IUIKitResponse with the results of the interaction
>>>>>>> 42f13f0 (add ru)
    */
    public async executeViewSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData()
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
<<<<<<< HEAD
        const { autoReplyValues }: {
            autoReplyValues: {
=======
        const { autoReplySettings, autoReplySchedulerDaily }: {
            autoReplySettings: {
>>>>>>> 42f13f0 (add ru)
                EnableApp?: string,
                DisableApp?: string,
                ExcludeUsers?: Array<string>,
                AutoReplyMessage?: string,
            },
<<<<<<< HEAD
        } = interactionData.view.state as any;
        const action = () => {
            if (autoReplyValues.DisableApp && autoReplyValues.DisableApp === 'Disable') return false
            if (autoReplyValues.EnableApp && autoReplyValues.EnableApp === 'Enable') return true
            return undefined
        }
        // No changes do nothing
        const noChanges = action() === undefined && autoReplyValues.AutoReplyMessage === undefined && autoReplyValues.ExcludeUsers === undefined;
=======
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
>>>>>>> 42f13f0 (add ru)
        if (noChanges) {
            return { success: false };
        }

        // Get the previous auto-reply settings if they exist. 
<<<<<<< HEAD
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
=======
        const previousSettings = await getAutoReplySettings(interactionData.user.id, read);

        const excludeUsers = async (): Promise<IUser[]> => {
            const userPromises = (autoReplySettings.ExcludeUsers ?? previousSettings?.users?.map((user: IUser) => user.id) ?? []).map(id => read.getUserReader().getById(id));
            const users = await Promise.all(userPromises);
            return users.filter((user: IUser): user is IUser => user !== undefined);
>>>>>>> 42f13f0 (add ru)
        };

        // Get the new auto-reply settings. 
        const state: IAutoReplySettings = {
<<<<<<< HEAD
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
=======
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
>>>>>>> 42f13f0 (add ru)

        return {
            success: true,
        };
    }
<<<<<<< HEAD
    /**
    Handles the execution of a block action, such as clicking a button.
    @param {UIKitBlockInteractionContext} context - The context of the block interaction
    @param {IRead} read - Rocket.Chat's read instance
    @param {IHttp} http - Rocket.Chat's http instance
    @param {IPersistence} persistence - Rocket.Chat's persistence instance
    @param {IModify} modify - Rocket.Chat's modify instance
    @returns {Promise<any>} A promise that resolves with the result of the execution
=======

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
>>>>>>> 42f13f0 (add ru)
    */
    public async executeBlockActionHandler(context: UIKitBlockInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<any> {
        const data = context.getInteractionData();
        // get auto-reply settings for this user
<<<<<<< HEAD
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
=======
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
>>>>>>> 42f13f0 (add ru)
        }
        return {
            success: true,
        };
    }
<<<<<<< HEAD
    
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
=======

>>>>>>> 42f13f0 (add ru)
}
