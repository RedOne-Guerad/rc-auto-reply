import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

import { IAutoReplySettings } from './utils/IAutoReplySettings';
import { getAutoReplySettings, sendNotifyMessage } from './utils/helpers';

export class AutoReplyCommand implements ISlashCommand {
    public command = 'auto-reply';
    public i18nParamsExample = 'auto-reply-param-example';
    public i18nDescription = 'auto-reply-description';
    public providesPreview = false;

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {

        switch (context.getArguments().length) {
            case 0:
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), 'Invalid usage of the auto-reply command. ' +
                    'Please provide `enable`, `remove-user` or `disable`, with the message optional if you are away.');
            case 1:
                return await this.handleStatusArgOnly(context, read, modify, persis);
            default:
                return await this.handleWithCustomMessage(context, read, modify, persis);
        }
    }

    private async handleStatusArgOnly(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, context.getSender().id);
        const previousSettings = await getAutoReplySettings(context.getSender().id, read);

        switch (context.getArguments()[0].toLowerCase()) {
            case 'disable':
                const autoReplySettings: IAutoReplySettings = {
                    on: false,
                    message: previousSettings.message,
                    users: previousSettings.users,
                    schedulers: previousSettings.schedulers
                }
                await persis.updateByAssociation(assoc, autoReplySettings, true);
                // TODO: Maybe say something different
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is disabled, ' + context.getSender().username + ' !');
            case 'remove-user':
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), 'usage: `/auto-reply remove-user UserId`');
            case 'enable':
                previousSettings.on = true
                await persis.updateByAssociation(assoc, previousSettings, true);
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is enabled, with the following message:\n>' + previousSettings.message);
            case 'status':
                if (previousSettings.on) {
                    return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is enabled, with the following message:\n>' + previousSettings.message);
                } else {
                    return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is disabled.');
                }
            default:
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(),
                    'No idea what you are talking about. ' +
                    'Only `enable`, `disable`, `remove-user` and `status` are accepted options for the first argument.');
        }
    }

    // tslint:disable-next-line:max-line-length
    private async handleWithCustomMessage(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, context.getSender().id);
        // const existing = await read.getPersistenceReader().readByAssociation(assoc);
        const previousSettings = await getAutoReplySettings(context.getSender().id, read);

        const action = context.getArguments()[0].toLowerCase();
        const args = Array.from(context.getArguments());
        args.splice(0, 1); // Removing the action

        if (action === 'disable' || action === 'status') {
            return await this.handleStatusArgOnly(context, read, modify, persis);
        }
        else if (action === 'remove-user') {
            const _user = await read.getUserReader().getById(args[0])
            // check if the user already excluded
            let users = previousSettings.users
            const userIndex = users?.findIndex(user => user.id === _user.id)
            if (userIndex === -1) previousSettings.users?.push(_user)

            const autoReplySettings: IAutoReplySettings = {
                on: true,
                message: previousSettings.message,
                users: previousSettings.users,
                schedulers: previousSettings.schedulers
            };
            await persis.updateByAssociation(assoc, autoReplySettings, true);

            return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(),
                '`auto reply` is disabled for: @' + _user.username);
        }
        else if (action !== 'enable') {
            return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(),
                'No idea what you are talking about. ' +
                'Only `enable`, `disable`, `remove-user` and `status` are accepted options for the first argument.');
        }

        const autoReplySettings: IAutoReplySettings = {
            on: true,
            message: args.join(' '),
            users: previousSettings.users,
            schedulers: previousSettings.schedulers
        };

        await persis.updateByAssociation(assoc, autoReplySettings, true);

        return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(),
            '`auto reply` is enabled, with the follwing message:\n>' + autoReplySettings.message);
    }
}

