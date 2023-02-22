import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

import { IAutoReplySettings } from './IAutoReplySettings';
import { sendNotifyMessage } from './helpers';

export class AutoReplyCommand implements ISlashCommand {
    public command = 'auto-reply';
    public i18nParamsExample = 'auto-reply-param-example';
    public i18nDescription = 'auto-reply-description';
    public providesPreview = false;

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {

        switch (context.getArguments().length) {
            case 0:
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), 'Invalid usage of the auto-reply command. ' +
                    'Please provide `enable` or `disable`, with the message optional if you are away.');
            case 1:
                return await this.handleStatusArgOnly(context, read, modify, persis);
            default:
                return await this.handleWithCustomMessage(context, read, modify, persis);
        }
    }

    private async handleStatusArgOnly(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, context.getSender().id);
        const data: IAutoReplySettings = {
            on: true,
            // tslint:disable-next-line:max-line-length
            message: 'Hey, I received your message and will get back to you as soon as possible.',
            users: undefined,
        };

        const existing = await read.getPersistenceReader().readByAssociation(assoc);
        const existingData = existing[0] as IAutoReplySettings

        switch (context.getArguments()[0].toLowerCase()) {
            case 'disable':
                if (existing.length > 0 && existingData.on) {
                    await persis.removeByAssociation(assoc);
                    const newData: IAutoReplySettings = {
                        on: false,
                        message: existingData.message,
                        users: existingData.users
                    }
                    await persis.createWithAssociation(newData, assoc);
                }
                // TODO: Maybe say something different
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is disabled, ' + context.getSender().username + ' !');
            case 'remove-user':
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), 'usage: `/auto-reply remove-user UserId`');
            case 'enable':
                await persis.createWithAssociation(data, assoc);
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is enabled, with the follwing message:\n>' + existingData.message);
            case 'status':
                if (existing.length > 0 && existingData.on) {
                    return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is enabled, with the follwing message:\n>' + existingData.message);
                } else {
                    return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), '`auto reply` is disabled.');
                }
            default:
                return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(),
                    'No idea what you are talking about. ' +
                    'Only `out`, `in` and `status` are accepted options for the first argument.');
        }
    }

    // tslint:disable-next-line:max-line-length
    private async handleWithCustomMessage(context: SlashCommandContext, read: IRead, modify: IModify, persis: IPersistence): Promise<void> {
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, context.getSender().id);
        const existing = await read.getPersistenceReader().readByAssociation(assoc);
        const existingData = existing[0] as IAutoReplySettings

        const action = context.getArguments()[0].toLowerCase();
        const args = Array.from(context.getArguments());
        args.splice(0, 1); // Removing the action

        if (action === 'disable' || action === 'status') {
            return await this.handleStatusArgOnly(context, read, modify, persis);
        }
        else if (action === 'remove-user') {
            const _user = await read.getUserReader().getById(args[0])
            if (existing.length > 0) {
                await persis.removeByAssociation(assoc);
            }
            // check if the user already excluded
            let users = existingData.users
            const userIndex = users?.findIndex(user => user.id === _user.id)
            if (userIndex === -1) existingData.users?.push(_user)

            const data: IAutoReplySettings = {
                on: true,
                message: existingData.message,
                users: existingData.users,
            };
            await persis.createWithAssociation(data, assoc);

            return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(),
                '`auto reply` is disabled for: @' + _user.username);
        }
        else if (action !== 'enable') {
            return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(),
                'No idea what you are talking about. ' +
                'Only `out`, `in` and `status` are accepted options for the first argument.');
        }

        const data: IAutoReplySettings = {
            on: true,
            message: args.join(' '),
            users: existingData.users,
        };

        if (existing.length > 0) {
            await persis.removeByAssociation(assoc);
        }

        await persis.createWithAssociation(data, assoc);

        return await sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(),
            '`auto reply` is enabled, with the follwing message:\n>' + data.message);
    }
}

