import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

import { IAutoReplySettings, ReplyFrequency, COOLDOWN_PRESETS_HOURS } from './utils/IAutoReplySettings';
import {
    getAutoReplySettings, sendNotifyMessage, getLanguage, isUserExcluded, formatOffsetMinutes,
    parseWhen, resolveTzMinutes, formatInTz, formatDurationUntil, isAutoReplyActive, messageFor, epochToWall, windowBounds,
} from './utils/helpers';
import { AppLanguage, translate } from './i18n/translations';

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
            return updated;
        };

        switch (action) {
            case 'on':
            case 'enable':
                return this.handleOn(settings, rest, lang, reply, persist);
            case 'off':
            case 'disable': {
                await persist({ ...settings, mode: 'off', until: undefined, schedulers: [] });
                return reply(translate('cmd_off', lang) + context.getSender().username + ' !');
            }
            case 'until':
            case 'schedule':
                return this.handleUntil(settings, rest, context.getSender(), read, lang, reply, persist);
            case 'from':
                return this.handleFromUntil(settings, rest, context.getSender(), read, lang, reply, persist);
            case 'status':
            case 'list':
                return reply(this.statusText(settings, context.getSender(), lang));
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

    private async handleOn(
        settings: IAutoReplySettings,
        rest: string[],
        lang: AppLanguage,
        reply: (t: string) => Promise<void>,
        persist: (s: IAutoReplySettings) => Promise<IAutoReplySettings>,
    ): Promise<void> {
        const updated: IAutoReplySettings = {
            ...settings,
            schedulers: [],
            mode: 'always',
            until: undefined,
            enabledAt: Date.now(),
            message: rest.length > 0 ? rest.join(' ') : settings.message,
        };
        await persist(updated);
        return reply(translate('cmd_on', lang) + updated.message);
    }

    /** /auto-reply until <when> [message] — on from now until <when>. */
    private async handleUntil(
        settings: IAutoReplySettings,
        rest: string[],
        sender: IUser,
        read: IRead,
        lang: AppLanguage,
        reply: (t: string) => Promise<void>,
        persist: (s: IAutoReplySettings) => Promise<IAutoReplySettings>,
    ): Promise<void> {
        if (rest.length === 0) {
            return reply(translate('cmd_until_usage', lang));
        }
        const tz = resolveTzMinutes(sender, settings);
        const twoToken = rest.length >= 2 ? parseWhen(rest.slice(0, 2).join(' '), tz) : null;
        const end = twoToken ?? parseWhen(rest[0], tz);
        const whenTokens = twoToken !== null ? 2 : 1;
        if (end === null) {
            return reply(translate('cmd_until_invalid', lang, { text: rest.slice(0, 2).join(' ') }));
        }
        const messageWords = rest.slice(whenTokens);
        const startNow = Date.now();
        const updated: IAutoReplySettings = {
            ...settings,
            schedulers: [],
            mode: 'until',
            until: {
                start: startNow,
                end,
                startWall: epochToWall(startNow, tz),
                endWall: epochToWall(end, tz),
                message: messageWords.length ? messageWords.join(' ') : undefined,
            },
            enabledAt: Date.now(),
        };
        await persist(updated);
        return reply(translate('cmd_until_set', lang, {
            until: formatInTz(end, tz),
            duration: formatDurationUntil(end),
        }) + messageFor(updated, tz, startNow));
    }

    /** /auto-reply from <when> until <when> [message] — a future window.
     * Each <when> is one or two tokens (e.g. "friday", "friday 17:00",
     * "2026-10-12 09:00"); the longest prefix that parses wins, the rest is
     * the message. */
    private async handleFromUntil(
        settings: IAutoReplySettings,
        rest: string[],
        sender: IUser,
        read: IRead,
        lang: AppLanguage,
        reply: (t: string) => Promise<void>,
        persist: (s: IAutoReplySettings) => Promise<IAutoReplySettings>,
    ): Promise<void> {
        const untilIdx = rest.findIndex((a) => a.toLowerCase() === 'until');
        if (untilIdx < 2 || untilIdx === rest.length - 1) {
            return reply(translate('cmd_invalid_usage', lang));
        }
        const tz = resolveTzMinutes(sender, settings);
        const left = rest.slice(0, untilIdx);
        const right = rest.slice(untilIdx + 1);
        const start = parseWhen(left.slice(0, 2).join(' '), tz) ?? parseWhen(left[0], tz);
        const end = parseWhen(right.slice(0, 2).join(' '), tz) ?? parseWhen(right[0], tz);
        if (start === null) {
            return reply(translate('cmd_until_invalid', lang, { text: left.join(' ') }));
        }
        if (end === null) {
            return reply(translate('cmd_until_invalid', lang, { text: right.slice(0, 2).join(' ') }));
        }
        if (end <= start) {
            return reply(translate('cmd_until_after_end', lang));
        }
        const messageTokens = right.slice(parseWhen(right.slice(0, 2).join(' '), tz) !== null ? 2 : 1);
        const message = messageTokens.join(' ');
        const updated: IAutoReplySettings = {
            ...settings,
            schedulers: [],
            mode: 'until',
            until: {
                start,
                end,
                startWall: epochToWall(start, tz),
                endWall: epochToWall(end, tz),
                message: message || undefined,
            },
            // a planned window starts its own enable period, so `once` and
            // the cooldown count from the window start
            enabledAt: start <= Date.now() ? Date.now() : start,
        };
        await persist(updated);
        // the message as sent inside the window, evaluated at its start
        return reply(translate('cmd_from_until_set', lang, {
            from: formatInTz(start, tz),
            until: formatInTz(end, tz),
        }) + messageFor(updated, tz, start));
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

    private statusText(settings: IAutoReplySettings, user: IUser, lang: AppLanguage): string {
        const tz = resolveTzMinutes(user, settings);
        const lines: string[] = [];
        const now = Date.now();
        if (settings.mode === 'always') {
            lines.push(translate('cmd_status_on', lang) + settings.message);
        } else if (settings.mode === 'until' && settings.until) {
            const bounds = windowBounds(settings.until, tz);
            if (now < bounds.start) {
                lines.push(translate('cmd_status_until_future', lang, {
                    from: formatInTz(bounds.start, tz),
                    until: formatInTz(bounds.end, tz),
                }) + messageFor(settings, tz, now));
            } else if (isAutoReplyActive(settings, tz, now)) {
                lines.push(translate('cmd_until_set', lang, {
                    until: formatInTz(bounds.end, tz),
                    duration: formatDurationUntil(bounds.end, now),
                }) + messageFor(settings, tz, now));
            } else {
                lines.push(translate('cmd_status_off', lang));
            }
        } else {
            lines.push(translate('cmd_status_off', lang));
        }
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
        const profileTz = Number((user as unknown as { utcOffset?: number | null }).utcOffset);
        const tzKey = Number.isFinite(profileTz) && (user as unknown as { utcOffset?: number | null }).utcOffset !== null
            ? 'cmd_list_timezone' : 'cmd_list_timezone_fallback';
        lines.push(translate(tzKey, lang, { offset: formatOffsetMinutes(tz) }));
        const excluded = (settings.users ?? []).filter(Boolean).map((u) => '@' + (u.username || u.id)).join(', ');
        lines.push(excluded ? translate('cmd_list_excluded', lang, { users: excluded }) : translate('cmd_list_excluded_empty', lang));
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
