import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { IAutoReplySettings, ReplyFrequency } from './utils/IAutoReplySettings';
import { getAutoReplySettings, sendNotifyMessage, getLanguage, isUserExcluded, formatOffsetMinutes } from './utils/helpers';
import { syncSchedulerRegistry } from './scheduler';
import { AppLanguage, translate } from './i18n/translations';

type Reply = (text: string) => Promise<void>;
type Persist = (settings: IAutoReplySettings) => Promise<IAutoReplySettings>;

export class AutoReplyCommand implements ISlashCommand {
    public command = 'auto-reply';
    public i18nParamsExample = 'auto-reply-param-example';
    public i18nDescription = 'auto-reply-description';
    public providesPreview = false;

    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
        const args = context.getArguments();
        const lang = await getLanguage(read);
        const reply = (text: string) => sendNotifyMessage(undefined, modify, context.getRoom(), context.getSender(), text);

        if (args.length === 0) {
            return reply(translate('cmd_invalid_usage', lang));
        }

        const action = args[0].toLowerCase();
        const rest = args.slice(1);
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, context.getSender().id);
        const settings = await getAutoReplySettings(context.getSender().id, read);

        const persist = async (updated: IAutoReplySettings) => {
            await persis.updateByAssociation(assoc, updated, true);
            await syncSchedulerRegistry(context.getSender().id, updated, persis, read);
            return updated;
        };

        switch (action) {
            case 'enable':
                return this.handleEnable(settings, rest, lang, reply, persist);
            case 'disable': {
                await persist({ ...settings, on: false });
                return reply(translate('cmd_disabled', lang) + context.getSender().username + ' !');
            }
            case 'status':
            case 'list':
                return reply(this.statusText(settings, lang));
            case 'remove-user':
                return this.handleRemoveUser(settings, rest, read, lang, reply, persist);
            case 'include-user':
                return this.handleIncludeUser(settings, rest, read, lang, reply, persist);
            case 'frequency':
                return this.handleFrequency(settings, rest, lang, reply, persist);
            case 'mentions':
                return this.handleMentions(settings, rest, lang, reply, persist);
            case 'timezone':
                return this.handleTimezone(settings, rest, lang, reply, persist);
            default:
                return reply(translate('cmd_unknown_option', lang));
        }
    }

    private async handleEnable(
        settings: IAutoReplySettings,
        rest: string[],
        lang: AppLanguage,
        reply: (t: string) => Promise<void>,
        persist: (s: IAutoReplySettings) => Promise<IAutoReplySettings>,
    ): Promise<void> {
        const updated: IAutoReplySettings = {
            ...settings,
            on: true,
            enabledAt: Date.now(),
            message: rest.length > 0 ? rest.join(' ') : settings.message,
        };
        await persist(updated);
        return reply(translate('cmd_enabled', lang) + updated.message);
    }

    private async handleRemoveUser(
        settings: IAutoReplySettings,
        rest: string[],
        read: IRead,
        lang: AppLanguage,
        reply: (t: string) => Promise<void>,
        persist: (s: IAutoReplySettings) => Promise<IAutoReplySettings>,
    ): Promise<void> {
        if (rest.length === 0) {
            return reply(translate('cmd_remove_user_usage', lang));
        }
        const user = await findUser(rest[0], read);
        if (!user) {
            return reply(translate('cmd_user_not_found', lang) + rest[0] + '`');
        }
        if (!isUserExcluded(settings, user.id)) {
            settings.users = [...(settings.users ?? []), user];
            await persist(settings);
        }
        return reply(translate('cmd_removed_for', lang) + user.username);
    }

    private async handleIncludeUser(
        settings: IAutoReplySettings,
        rest: string[],
        read: IRead,
        lang: AppLanguage,
        reply: (t: string) => Promise<void>,
        persist: (s: IAutoReplySettings) => Promise<IAutoReplySettings>,
    ): Promise<void> {
        if (rest.length === 0) {
            return reply(translate('cmd_include_user_usage', lang));
        }
        const user = await findUser(rest[0], read);
        if (!user) {
            return reply(translate('cmd_user_not_found', lang) + rest[0] + '`');
        }
        if (!isUserExcluded(settings, user.id)) {
            return reply(translate('cmd_not_excluded', lang) + user.username + translate('cmd_not_excluded_2', lang));
        }
        settings.users = (settings.users ?? []).filter((u) => !!u && u.id !== user.id);
        await persist(settings);
        return reply(translate('cmd_included_for', lang) + user.username);
    }

    private async handleFrequency(
        settings: IAutoReplySettings,
        rest: string[],
        lang: AppLanguage,
        reply: (t: string) => Promise<void>,
        persist: (s: IAutoReplySettings) => Promise<IAutoReplySettings>,
    ): Promise<void> {
        const allowed: ReplyFrequency[] = ['every', 'once', 'cooldown'];
        if (rest.length === 0 || !allowed.includes(rest[0] as ReplyFrequency)) {
            return reply(translate('cmd_frequency_usage', lang));
        }
        const frequency = rest[0] as ReplyFrequency;
        let cooldownHours = settings.cooldownHours ?? 24;
        if (rest.length > 1) {
            const parsed = Number(rest[1]);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                return reply(translate('cmd_frequency_invalid_hours', lang));
            }
            cooldownHours = Math.round(parsed);
        }
        await persist({ ...settings, frequency, cooldownHours });
        if (frequency === 'every') {
            return reply(translate('cmd_frequency_set_every', lang));
        }
        if (frequency === 'once') {
            return reply(translate('cmd_frequency_set_once', lang));
        }
        return reply(translate('cmd_frequency_set_cooldown', lang, { hours: cooldownHours }));
    }

    private async handleMentions(
        settings: IAutoReplySettings,
        rest: string[],
        lang: AppLanguage,
        reply: (t: string) => Promise<void>,
        persist: (s: IAutoReplySettings) => Promise<IAutoReplySettings>,
    ): Promise<void> {
        if (rest.length === 0 || !['on', 'off'].includes(rest[0])) {
            return reply(translate('cmd_mentions_usage', lang));
        }
        const replyToMentions = rest[0] === 'on';
        await persist({ ...settings, replyToMentions });
        return reply(replyToMentions ? translate('cmd_mentions_on', lang) : translate('cmd_mentions_off', lang));
    }

    private async handleTimezone(
        settings: IAutoReplySettings,
        rest: string[],
        lang: AppLanguage,
        reply: (t: string) => Promise<void>,
        persist: (s: IAutoReplySettings) => Promise<IAutoReplySettings>,
    ): Promise<void> {
        if (rest.length === 0) {
            return reply(translate('cmd_timezone_usage', lang));
        }
        const hours = Number(rest[0].replace(/^\+/, ''));
        if (!Number.isFinite(hours) || hours < -12 || hours > 14) {
            return reply(translate('cmd_timezone_invalid', lang));
        }
        const timezoneOffsetMinutes = Math.round(hours * 60);
        await persist({ ...settings, timezoneOffsetMinutes });
        return reply(translate('cmd_timezone_set', lang, { offset: formatOffsetMinutes(timezoneOffsetMinutes) }));
    }

    private statusText(settings: IAutoReplySettings, lang: AppLanguage): string {
        const lines: string[] = [];
        lines.push(settings.on
            ? translate('cmd_status_on', lang) + settings.message
            : translate('cmd_status_off', lang));
        switch (settings.frequency ?? 'every') {
            case 'once':
                lines.push(translate('cmd_list_frequency_once', lang));
                break;
            case 'cooldown':
                lines.push(translate('cmd_list_frequency_cooldown', lang, { hours: settings.cooldownHours ?? 24 }));
                break;
            default:
                lines.push(translate('cmd_list_frequency_every', lang));
        }
        lines.push(translate('cmd_list_mentions', lang, { value: settings.replyToMentions ? 'on' : 'off' }));
        lines.push(translate('cmd_list_timezone', lang, { offset: formatOffsetMinutes(settings.timezoneOffsetMinutes ?? 0) }));
        const excluded = (settings.users ?? []).filter(Boolean).map((u) => '@' + (u.username || u.id)).join(', ');
        lines.push(excluded ? translate('cmd_list_excluded', lang, { users: excluded }) : translate('cmd_list_excluded_empty', lang));
        lines.push(translate('cmd_list_schedulers', lang, { count: String((settings.schedulers ?? []).length) }));
        return lines.join('\n');
    }
}

/** Accepts a user id or a username. */
async function findUser(idOrUsername: string, read: IRead): Promise<IUser | undefined> {
    try {
        const byId = await read.getUserReader().getById(idOrUsername);
        if (byId) return byId;
    } catch {
        // not an id, try username below
    }
    try {
        return await read.getUserReader().getByUsername(idOrUsername) ?? undefined;
    } catch {
        return undefined;
    }
}
