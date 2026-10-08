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
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { RoomType } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { StartupType } from '@rocket.chat/apps-engine/definition/scheduler';

import { IAutoReplySettings, IScheduler, ReplyFrequency, SchedulerType } from './src/utils/IAutoReplySettings';
import { AutoReplyCommand } from './src/AutoReplyCommand';
import { RoomTypeFilter, UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';
import { ButtonStyle, IUIKitResponse, UIKitActionButtonInteractionContext, UIKitBlockInteractionContext, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import {
    getAutoReplySettings,
    sendMessage,
    sendNotifyMessage,
    getLanguage,
    getChatTracking,
    updateChatTracking,
    shouldAutoReply,
    isUserExcluded,
    isRoomEncrypted,
    NOTIFY_THROTTLE_MS,
    newId,
} from './src/utils/helpers';
import { createContextualBarView, IContextualBarContext } from './src/modals/createContextualBarView';
import { createSchedulerModal } from './src/modals/createSchedulerModal';
import { SCHEDULER_TICK_PROCESSOR_ID, SCHEDULER_TICK_INTERVAL, desiredStateFromSchedulers, getSchedulerUserIds, syncSchedulerRegistry } from './src/scheduler';
import { AppLanguage, translate } from './src/i18n/translations';

const SETTINGS_BLOCK = 'autoReplySettings';

export class AutoReplyApp extends App implements IPostMessageSent {

    public async checkPostMessageSent(message: IMessage, read: IRead, http: IHttp): Promise<boolean> {
        const room = message.room;
        if (!room) {
            return false;
        }
        // Apps cannot send encrypted content; never reply in E2EE rooms (issue #8)
        if (isRoomEncrypted(room)) {
            return false;
        }
        if (room.type === RoomType.DIRECT_MESSAGE) {
            return true;
        }
        if (room.type === RoomType.CHANNEL || room.type === RoomType.PRIVATE_GROUP) {
            // only potentially interesting when someone is @mentioned
            return /(?:^|\s)@[a-z0-9._-]+/i.test(message.text ?? '');
        }
        return false;
    }

    /**
     * Executes after a message is sent and sends auto-replies when the
     * recipient (DM) or a mentioned user (channels) has auto-reply enabled.
     */
    public async executePostMessageSent(message: IMessage, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<void> {
        try {
            const botUser = await this.getAccessors().reader.getUserReader().getAppUser(this.getID());
            if (!botUser) {
                return;
            }
            // never react to our own messages (loop prevention)
            if (message.sender.id === botUser.id || message.sender.username === botUser.username) {
                return;
            }
            const room = message.room;
            // E2EE safety net: even if the room flag is not propagated to the
            // apps-engine room object, encrypted messages carry type 'e2e'
            // typed via cast: older engine typings lack IMessage.type
            if (!room || isRoomEncrypted(room) || (message as { type?: string }).type === 'e2e') {
                return;
            }

            if (room.type === RoomType.DIRECT_MESSAGE) {
                await this.handleDirectMessage(message, read, persistence, modify);
                return;
            }
            if (room.type === RoomType.CHANNEL || room.type === RoomType.PRIVATE_GROUP) {
                await this.handleChannelMention(message, read, persistence, modify, botUser);
                return;
            }
        } catch (error) {
            this.getLogger().error({ msg: 'executePostMessageSent failed', error: String(error) });
        }
    }

    private async handleDirectMessage(message: IMessage, read: IRead, persistence: IPersistence, modify: IModify): Promise<void> {
        const me = message.sender;
        const otherUserIds = (message.room.userIds ?? []).filter((u) => u !== me.id);
        if (otherUserIds.length !== 1) {
            return;
        }
        // the other user may have been deleted since the room was created
        const otherUser = await read.getUserReader().getById(otherUserIds[0]);
        if (!otherUser) {
            return;
        }

        const mySettings = await getAutoReplySettings(me.id, read);

        // If my auto-reply is on while I am typing, offer to disable it (throttled)
        if (mySettings.on && !isUserExcluded(mySettings, otherUser.id)) {
            const tracking = await getChatTracking(me.id, message.room.id, read);
            if (Date.now() - (tracking.lastNotifyAt ?? 0) >= NOTIFY_THROTTLE_MS) {
                const lang = await getLanguage(read);
                const block = modify.getCreator().getBlockBuilder();
                // UIKit buttons (not legacy msg_in_chat_window actions, which
                // Rocket.Chat >= 6.10 no longer executes — issue #13).
                // Notifications render blocks only, so the prompt must be a
                // section block rather than the message text.
                block.addSectionBlock({ text: block.newMarkdownTextObject(translate('notify_enabled_prompt', lang)) });
                block.addActionsBlock({
                    elements: [
                        block.newButtonElement({
                            text: block.newPlainTextObject(translate('notify_btn_yes', lang)),
                            value: 'disable',
                            style: ButtonStyle.DANGER,
                            actionId: 'NotifyDisable',
                        }),
                        block.newButtonElement({
                            text: block.newPlainTextObject(translate('notify_btn_disable_for_user', lang)),
                            value: otherUser.id,
                            actionId: 'NotifyDisableForUser',
                        }),
                        block.newButtonElement({
                            text: block.newPlainTextObject(translate('notify_btn_no', lang)),
                            actionId: 'NotifyDismiss',
                        }),
                    ],
                });
                await sendNotifyMessage(this, modify, message.room, me, translate('notify_enabled_prompt', lang), undefined, block);
                tracking.lastNotifyAt = Date.now();
                await updateChatTracking(me.id, message.room.id, tracking, persistence);
            }
        }

        // auto-reply from the other user, if enabled for me
        const otherSettings = await getAutoReplySettings(otherUser.id, read);
        if (!otherSettings.on || isUserExcluded(otherSettings, me.id)) {
            return;
        }
        const tracking = await getChatTracking(otherUser.id, message.room.id, read);
        if (!shouldAutoReply(otherSettings, tracking)) {
            return;
        }
        await sendMessage(this, modify, message.room, otherUser, otherSettings.message);
        tracking.lastReplyAt = Date.now();
        await updateChatTracking(otherUser.id, message.room.id, tracking, persistence);
    }

    private async handleChannelMention(message: IMessage, read: IRead, persistence: IPersistence, modify: IModify, botUser: IUser): Promise<void> {
        const sender = message.sender;
        const mentioned = parseMentionedUsernames(message.text ?? '');
        if (mentioned.length === 0) {
            return;
        }
        const lang = await getLanguage(read);
        for (const username of mentioned) {
            let mentionedUser: IUser | undefined;
            try {
                mentionedUser = await read.getUserReader().getByUsername(username) ?? undefined;
            } catch {
                continue;
            }
            if (!mentionedUser || mentionedUser.id === sender.id || mentionedUser.id === botUser.id) {
                continue;
            }
            const settings = await getAutoReplySettings(mentionedUser.id, read);
            if (!settings.on || !settings.replyToMentions || isUserExcluded(settings, sender.id)) {
                continue;
            }
            const tracking = await getChatTracking(mentionedUser.id, message.room.id, read);
            if (shouldAutoReply(settings, tracking)) {
                await sendMessage(this, modify, message.room, mentionedUser, settings.message);
                tracking.lastReplyAt = Date.now();
                await updateChatTracking(mentionedUser.id, message.room.id, tracking, persistence);
            }
            if (Date.now() - (tracking.lastNotifyAt ?? 0) >= NOTIFY_THROTTLE_MS) {
                const block = modify.getCreator().getBlockBuilder();
                block.addSectionBlock({ text: block.newMarkdownTextObject(translate('notify_enabled_prompt', lang)) });
                block.addActionsBlock({
                    elements: [
                        block.newButtonElement({
                            text: block.newPlainTextObject(translate('notify_btn_yes', lang)),
                            value: 'disable',
                            style: ButtonStyle.DANGER,
                            actionId: 'NotifyDisable',
                        }),
                        block.newButtonElement({
                            text: block.newPlainTextObject(translate('notify_btn_no', lang)),
                            actionId: 'NotifyDismiss',
                        }),
                    ],
                });
                await sendNotifyMessage(this, modify, message.room, mentionedUser, translate('notify_enabled_prompt', lang), undefined, block);
                tracking.lastNotifyAt = Date.now();
                await updateChatTracking(mentionedUser.id, message.room.id, tracking, persistence);
            }
        }
    }

    /**
     * Registers the UI room-action button, the slash command and the
     * scheduler tick processor.
     */
    protected async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
        configuration.ui.registerButton({
            actionId: 'auto-reply-room-action-id',
            labelI18n: 'auto-reply-room-action-name',
            context: UIActionButtonContext.ROOM_ACTION,
            when: {
                roomTypes: [
                    RoomTypeFilter.DIRECT,
                    RoomTypeFilter.PUBLIC_CHANNEL,
                    RoomTypeFilter.PRIVATE_CHANNEL,
                ],
            },
        });
        await configuration.slashCommands.provideSlashCommand(new AutoReplyCommand());

        await configuration.scheduler.registerProcessors([{
            id: SCHEDULER_TICK_PROCESSOR_ID,
            startupSetting: {
                type: StartupType.RECURRING,
                interval: SCHEDULER_TICK_INTERVAL,
                data: {},
            },
            processor: async (_jobContext, read, _modify, _http, persis) => {
                await this.runSchedulerTick(read, persis);
            },
        }]);
    }

    /** Recomputes on/off from every registered user's schedulers. */
    private async runSchedulerTick(read: IRead, persistence: IPersistence): Promise<void> {
        const userIds = await getSchedulerUserIds(read);
        for (const userId of userIds) {
            try {
                const settings = await getAutoReplySettings(userId, read);
                const desired = desiredStateFromSchedulers(settings);
                if (desired === undefined || desired === settings.on) {
                    continue;
                }
                settings.on = desired;
                settings.enabledAt = desired ? Date.now() : settings.enabledAt;
                const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, userId);
                await persistence.updateByAssociation(assoc, settings, true);
                this.getLogger().debug({ msg: 'scheduler toggled auto-reply', userId, on: desired });
            } catch (error) {
                this.getLogger().error({ msg: 'scheduler tick failed for user', userId, error: String(error) });
            }
        }
    }

    /** Opens the contextual bar from the room "Apps" action. */
    public async executeActionButtonHandler(context: UIKitActionButtonInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const { actionId, user, room } = context.getInteractionData();

        if (actionId === 'auto-reply-room-action-id') {
            const autoReplySettings = await getAutoReplySettings(user.id, read);
            const barContext = await this.buildBarContext(user, room, read);
            const modal = await createContextualBarView(undefined, read, http, persistence, modify, autoReplySettings, barContext);
            return context.getInteractionResponder().openContextualBarViewResponse(modal);
        }
        return context.getInteractionResponder().successResponse();
    }

    private async buildBarContext(user: IUser, room: { id: string; userIds?: Array<string> } | undefined, read: IRead): Promise<IContextualBarContext> {
        const language = await getLanguage(read);
        let dmPeer: IUser | undefined;
        if (room?.userIds) {
            const otherIds = room.userIds.filter((id) => id !== user.id);
            if (otherIds.length === 1) {
                dmPeer = await read.getUserReader().getById(otherIds[0]) ?? undefined;
            }
        }
        return { language, dmPeer };
    }

    /**
     * Handles view submits, routed by the shape of the view state:
     * settings bar, daily scheduler modal or weekly scheduler modal.
     */
    public async executeViewSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData();
        const state = (interactionData.view.state ?? {}) as Record<string, any>;

        try {
            if (state.autoReplySchedulerDaily) {
                return await this.executeAddSchedulerSubmitHandler(context, read, http, persistence, modify, SchedulerType.Daily);
            }
            if (state.autoReplyScheduler) {
                return await this.executeAddSchedulerSubmitHandler(context, read, http, persistence, modify, SchedulerType.Weekly);
            }
            if (state.autoReplySettings) {
                return await this.executeSettingsSubmitHandler(context, read, persistence, modify);
            }
            return context.getInteractionResponder().successResponse();
        } catch (error) {
            this.getLogger().error({ msg: 'view submit failed', error: String(error) });
            return context.getInteractionResponder().successResponse();
        }
    }

    private async executeSettingsSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData();
        const submitted = ((interactionData.view.state ?? {}) as Record<string, any>).autoReplySettings ?? {};
        const previous = await getAutoReplySettings(interactionData.user.id, read);

        const enabledClicked = submitted.EnableApp === 'Enable';
        const disabledClicked = submitted.DisableApp === 'Disable';
        const on = enabledClicked ? true : disabledClicked ? false : previous.on;
        const enabledAt = enabledClicked && !previous.on ? Date.now() : previous.enabledAt;

        const messageText = typeof submitted.AutoReplyMessage === 'string' ? submitted.AutoReplyMessage.trim() : '';
        const frequency = selectValue(submitted.Frequency) as ReplyFrequency | undefined;
        const cooldownRaw = Number(submitted.CooldownHours);
        const mentionsValue = selectValue(submitted.ReplyToMentions);
        const timezoneValue = Number(selectValue(submitted.TimezoneOffset));

        // Deleted users must not end up in the exclusion list again (issue #9)
        const excludedUsers: IUser[] = [];
        if (Array.isArray(submitted.ExcludeUsers)) {
            for (const id of submitted.ExcludeUsers) {
                const user = await read.getUserReader().getById(id);
                if (user) {
                    excludedUsers.push(user);
                }
            }
        }

        const settings: IAutoReplySettings = {
            on,
            enabledAt,
            message: messageText || previous.message,
            users: Array.isArray(submitted.ExcludeUsers) ? excludedUsers : previous.users,
            schedulers: previous.schedulers,
            frequency: frequency ?? previous.frequency,
            cooldownHours: Number.isFinite(cooldownRaw) && cooldownRaw > 0 ? Math.round(cooldownRaw) : previous.cooldownHours,
            replyToMentions: mentionsValue === 'on' ? true : mentionsValue === 'off' ? false : previous.replyToMentions,
            timezoneOffsetMinutes: Number.isFinite(timezoneValue) && timezoneValue >= -720 && timezoneValue <= 840 ? timezoneValue : previous.timezoneOffsetMinutes,
        };

        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
        await persistence.updateByAssociation(assoc, settings, true);
        await syncSchedulerRegistry(interactionData.user.id, settings, persistence, read);

        if (interactionData.room) {
            const lang = await getLanguage(read);
            const notifyMsg = on
                ? translate('notify_ar_enabled', lang) + settings.message
                : translate('notify_ar_disabled', lang);
            await sendNotifyMessage(this, modify, interactionData.room, interactionData.user, notifyMsg);
        }
        return context.getInteractionResponder().successResponse();
    }

    private async executeAddSchedulerSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify, type: SchedulerType): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData();
        const state = (interactionData.view.state ?? {}) as Record<string, any>;

        let enableTime: string | undefined;
        let disableTime: string | undefined;
        let weekdays: string[] | undefined;
        let message: string | undefined;

        if (type === SchedulerType.Daily) {
            const daily = state.autoReplySchedulerDaily ?? {};
            enableTime = selectValue(daily.EnableTime);
            disableTime = selectValue(daily.DisableTime);
            message = typeof daily.Message === 'string' && daily.Message.trim() ? daily.Message : undefined;
        } else {
            const weekly = state.autoReplyScheduler ?? {};
            enableTime = selectValue(weekly.StartSchedulerHour);
            disableTime = selectValue(weekly.EndSchedulerHour);
            weekdays = multiValue(weekly.SchedulerDays);
        }

        if (!enableTime || !disableTime) {
            return context.getInteractionResponder().successResponse();
        }

        const previous = await getAutoReplySettings(interactionData.user.id, read);
        const scheduler: IScheduler = {
            id: newId(),
            type,
            settings: { enableTime, disableTime, weekdays, message },
        };
        const settings: IAutoReplySettings = {
            ...previous,
            schedulers: [...(previous.schedulers ?? []), scheduler],
        };

        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
        await persistence.updateByAssociation(assoc, settings, true);
        await syncSchedulerRegistry(interactionData.user.id, settings, persistence, read);

        // refresh the contextual bar it was opened from, if still open
        try {
            const barContext = await this.buildBarContext(interactionData.user, undefined, read);
            const modal = await createContextualBarView(interactionData.view.submit?.value, read, http, persistence, modify, settings, barContext);
            return context.getInteractionResponder().updateContextualBarViewResponse(modal);
        } catch {
            return context.getInteractionResponder().successResponse();
        }
    }

    /**
     * Handles block actions: enable/disable toggles, scheduler add and remove,
     * and the notification quick actions (issue #13).
     */
    public async executeBlockActionHandler(context: UIKitBlockInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<any> {
        const data = context.getInteractionData();
        const settings = await getAutoReplySettings(data.user.id, read);
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, data.user.id);
        const barContext = await this.buildBarContext(data.user, data.room, read);

        if (data.actionId === 'NotifyDisable') {
            settings.on = false;
            await persistence.updateByAssociation(assoc, settings, true);
            return context.getInteractionResponder().successResponse();
        }
        if (data.actionId === 'NotifyDisableForUser') {
            if (data.value) {
                const user = await read.getUserReader().getById(data.value);
                if (user && !isUserExcluded(settings, user.id)) {
                    settings.users = [...(settings.users ?? []), user];
                    await persistence.updateByAssociation(assoc, settings, true);
                }
            }
            return context.getInteractionResponder().successResponse();
        }
        if (data.actionId === 'NotifyDismiss') {
            return context.getInteractionResponder().successResponse();
        }

        if (data.actionId === 'EnableApp') {
            settings.on = true;
            settings.enabledAt = Date.now();
            await persistence.updateByAssociation(assoc, settings, true);
            await syncSchedulerRegistry(data.user.id, settings, persistence, read);
            const modal = await createContextualBarView(data.container.id, read, http, persistence, modify, settings, barContext);
            return context.getInteractionResponder().updateContextualBarViewResponse(modal);
        }
        if (data.actionId === 'DisableApp') {
            settings.on = false;
            await persistence.updateByAssociation(assoc, settings, true);
            const modal = await createContextualBarView(data.container.id, read, http, persistence, modify, settings, barContext);
            return context.getInteractionResponder().updateContextualBarViewResponse(modal);
        }
        if (data.actionId === 'AddScheduler') {
            const schedulerType = SchedulerType.Daily === data.value ? SchedulerType.Daily
                : SchedulerType.Weekly === data.value ? SchedulerType.Weekly
                : SchedulerType.Daily;
            const modal = await createSchedulerModal(data.container.id, modify, schedulerType, settings, barContext.language);
            return context.getInteractionResponder().openModalViewResponse(modal);
        }
        if (data.actionId === 'RemoveScheduler') {
            const index = Number(data.value);
            if (Number.isInteger(index) && index >= 0 && index < (settings.schedulers ?? []).length) {
                settings.schedulers = (settings.schedulers ?? []).filter((_, i) => i !== index);
                await persistence.updateByAssociation(assoc, settings, true);
                await syncSchedulerRegistry(data.user.id, settings, persistence, read);
            }
            const modal = await createContextualBarView(data.container.id, read, http, persistence, modify, settings, barContext);
            return context.getInteractionResponder().updateContextualBarViewResponse(modal);
        }
        return context.getInteractionResponder().successResponse();
    }
}

/** UIKit state values may arrive as plain strings or wrapped option objects. */
function selectValue(state: any): string | undefined {
    if (state == null) return undefined;
    if (typeof state === 'string') return state;
    if (typeof state === 'object' && typeof state.value === 'string') return state.value;
    return undefined;
}

function multiValue(state: any): string[] | undefined {
    if (state == null) return undefined;
    if (Array.isArray(state)) return state.map((v) => selectValue(v)).filter((v): v is string => !!v);
    const single = selectValue(state);
    return single ? [single] : undefined;
}

function parseMentionedUsernames(text: string): string[] {
    const mentioned = new Set<string>();
    const pattern = /(?:^|\s)@([a-z0-9._-]+)/gi;
    let match: RegExpExecArray | null;
    // exec loop instead of matchAll: ES2017-safe for older build toolchains
    while ((match = pattern.exec(text)) !== null) {
        const username = match[1].toLowerCase();
        if (username !== 'all' && username !== 'here') {
            mentioned.add(username);
        }
    }
    return Array.from(mentioned);
}
