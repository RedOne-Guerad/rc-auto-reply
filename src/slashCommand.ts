import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

import { IAutoReplySettings } from './utils/IAutoReplySettings';
import { getAutoReplySettings, sendNotifyMessage } from './utils/helpers';

export class SlashCommand implements ISlashCommand {
    public command = 'auto-reply';
    public i18nParamsExample = 'auto-reply-param-example';
    public i18nDescription = 'auto-reply-description';
    public providesPreview = false;

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const args = context.getArguments();

        if (args.length === 0) {
            await this.handleInvalidUsage(context, modify);
        } else {
            const action = args[0].toLowerCase();
            switch (action) {
                case 'disable':
                case 'status':
                    await this.handleStatusAction(context, read, modify, persis);
                    break;
                case 'remove-user':
                    await this.handleRemoveUserAction(context, read, modify, persis);
                    break;
                case 'enable':
                    await this.handleEnableAction(context, read, modify, persis);
                    break;
                default:
                    await this.handleInvalidAction(context, modify);
            }
        }
    }

    private async handleInvalidUsage(context: SlashCommandContext, modify: IModify): Promise<void> {
        await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), 'Invalid usage of the auto-reply command. ' +
            'Please provide `enable`, `remove-user` or `disable`, with the message optional if you are away.');
    }

    private async handleStatusAction(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, context.getSender().id);
        const previousSettings = await getAutoReplySettings(context.getSender().id, read);

        if (context.getArguments()[0].toLowerCase() === 'disable') {
            const autoReplySettings: IAutoReplySettings = {
                ...previousSettings,
                on: false,
            };
            await persis.updateByAssociation(assoc, autoReplySettings, true);
            await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is disabled, ' + context.getSender().username + ' !');
        } else {
            if (previousSettings.on) {
                await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is enabled, with the following message:\n>' + previousSettings.message);
            } else {
                await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is disabled.');
            }
        }
    }

    private async handleRemoveUserAction(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const args = context.getArguments();
        if (args.length < 2) {
            await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), 'usage: `/auto-reply remove-user UserId`');
            return;
        }

        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, context.getSender().id);
        const previousSettings = await getAutoReplySettings(context.getSender().id, read);
        const user = await read.getUserReader().getById(args[1]);

        const userIndex = previousSettings.users?.findIndex(u => u.id === user.id);
        if (userIndex === -1) {
            previousSettings.users?.push(user);
        }

        const autoReplySettings: IAutoReplySettings = {
            ...previousSettings,
            on: true,
        };
        await persis.updateByAssociation(assoc, autoReplySettings, true);

        await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is disabled for: @' + user.username);
    }

    private async handleEnableAction(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, context.getSender().id);
        const previousSettings = await getAutoReplySettings(context.getSender().id, read);
        const args = context.getArguments();
        args.splice(0, 1); // Removing the action

        const autoReplySettings: IAutoReplySettings = {
            ...previousSettings,
            on: true,
            message: args.join(' '),
        };

        await persis.updateByAssociation(assoc, autoReplySettings, true);

        await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is enabled, with the following message:\n>' + autoReplySettings.message);
    }

    private async handleInvalidAction(context: SlashCommandContext, modify: IModify): Promise<void> {
        await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), 'No idea what you are talking about. ' +
            'Only `enable`, `disable`, `remove-user` and `status` are accepted options for the first argument.');
    }
}
