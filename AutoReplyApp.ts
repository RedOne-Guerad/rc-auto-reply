import {
    IConfigurationExtend,
    IEnvironmentRead,
    IHttp,
    IPersistence,
    IRead,
    IModify,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';

import { SlashCommand } from './src/slashCommand';
import { RoomTypeFilter, UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';
import { IUIKitResponse, UIKitActionButtonInteractionContext, UIKitBlockInteractionContext, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import { getAutoReplySettings } from './src/utils/helpers';
import { createContextualBarView } from './src/modals/createContextualBarView';
import {BlockActionHandler} from './src/handler/blockActionHandler'
import { ViewSubmitHandler } from './src/handler/viewSubmitHandler';
import { PostMessageSentHandler } from './src/handler/postMessageSentHandler';
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
        const handle = new PostMessageSentHandler(this, message, read, http, persistence, modify)
        return await handle.execute()
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
        await configuration.slashCommands.provideSlashCommand(new SlashCommand());

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
    const handler = new ViewSubmitHandler(this, context, read, http, modify, persistence)
    return await handler.execute()
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
        const handler = new BlockActionHandler(context, read, http, modify, persistence)
        return await handler.execute()
    }
}
