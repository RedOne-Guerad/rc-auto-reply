import {
    IConfigurationExtend,
    IConfigurationModify,
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

import { IAutoReplySettings, COOLDOWN_PRESETS_HOURS } from './src/utils/IAutoReplySettings';
import { AutoReplyCommand } from './src/AutoReplyCommand';
import { RoomTypeFilter, UIActionButtonContext } from '@rocket.chat/apps-engine/definition/ui';
import { ButtonStyle, IUIKitResponse, UIKitActionButtonInteractionContext, UIKitBlockInteractionContext, UIKitViewSubmitInteractionContext } from '@rocket.chat/apps-engine/definition/uikit';
import {
    windowBounds, epochToWall, wallToEpoch,
    getAutoReplySettings,
    sendMessage,
    sendNotifyMessage,
    getLanguage,
    getChatTracking,
    updateChatTracking,
    shouldAutoReply,
    isAutoReplyActive,
    messageFor,
    isUserExcluded,
    isRoomEncrypted,
    resolveTzMinutes,
    NOTIFY_THROTTLE_MS,
} from './src/utils/helpers';
import { buildSettingsBlocks, createContextualBarView, IBarContext, statusLine } from './src/modals/createContextualBarView';
import { createSettingsModal, USER_MODAL_PREFIX } from './src/modals/createSettingsModal';
import { createUntilModal, UNTIL_FORM_BLOCK } from './src/modals/createUntilModal';
import { translate } from './src/i18n/translations';

const SETTINGS_BLOCK = 'autoReplySettings';

/** The recurring job of 2.1, see onEnable */
const LEGACY_SCHEDULER_JOB = 'auto-reply-scheduler-tick';

/** An @mention after start, space or punctuation like "(", but not inside an e-mail address */
const MENTION = /(?:^|[^a-z0-9._@-])@([a-z0-9._-]+)/i;

export class AutoReplyApp extends App implements IPostMessageSent {

    /**
     * 2.1 ran a recurring scheduler job. 2.2 has no processor for it, so after
     * an upgrade it would stay and fail every 5 minutes; cancel it on start.
     */
    public async onEnable(environment: IEnvironmentRead, configurationModify: IConfigurationModify): Promise<boolean> {
        try {
            await configurationModify.scheduler.cancelJob(LEGACY_SCHEDULER_JOB);
        } catch (error) {
            this.getLogger().warn({ msg: 'could not cancel the 2.1 scheduler job', error: String(error) });
        }
        return true;
    }

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
            return MENTION.test(message.text ?? '');
        }
        return false;
    }

    /**
     * Executes after a message is sent; auto-replies when the recipient (DM)
     * or a mentioned user (channels) has auto-reply active — where "active"
     * means on, or inside the timed window (mode 'until'). Nothing is ever
     * switched in the background.
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
            // (typed via cast: older engine typings lack IMessage.type)
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

        const now = Date.now();
        const mySettings = await getAutoReplySettings(me.id, read);
        const myTz = resolveTzMinutes(me, mySettings);

        // If my auto-reply is active while I am typing, offer to disable it (throttled)
        if (isAutoReplyActive(mySettings, myTz, now) && !isUserExcluded(mySettings, otherUser.id)) {
            const tracking = await getChatTracking(me.id, message.room.id, read);
            if (now - (tracking.lastNotifyAt ?? 0) >= NOTIFY_THROTTLE_MS) {
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
                tracking.lastNotifyAt = now;
                await updateChatTracking(me.id, message.room.id, tracking, persistence);
            }
        }

        // auto-reply from the other user, if active for me
        const otherSettings = await getAutoReplySettings(otherUser.id, read);
        const otherTz = resolveTzMinutes(otherUser, otherSettings);
        if (!isAutoReplyActive(otherSettings, otherTz, now) || isUserExcluded(otherSettings, me.id)) {
            return;
        }
        const tracking = await getChatTracking(otherUser.id, message.room.id, read);
        if (!shouldAutoReply(otherSettings, tracking, otherTz, now)) {
            return;
        }
        await sendMessage(this, modify, message.room, otherUser, messageFor(otherSettings, otherTz, now), undefined, undefined, message.threadId);
        tracking.lastReplyAt = now;
        await updateChatTracking(otherUser.id, message.room.id, tracking, persistence);
    }

    private async handleChannelMention(message: IMessage, read: IRead, persistence: IPersistence, modify: IModify, botUser: IUser): Promise<void> {
        const sender = message.sender;
        const mentioned = parseMentionedUsernames(message.text ?? '');
        if (mentioned.length === 0) {
            return;
        }
        const now = Date.now();
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
            const mentionedTz = resolveTzMinutes(mentionedUser, settings);
            if (!isAutoReplyActive(settings, mentionedTz, now) || !settings.replyToMentions || isUserExcluded(settings, sender.id)) {
                continue;
            }
            const tracking = await getChatTracking(mentionedUser.id, message.room.id, read);
            if (shouldAutoReply(settings, tracking, mentionedTz, now)) {
                await sendMessage(this, modify, message.room, mentionedUser, messageFor(settings, mentionedTz, now), undefined, undefined, message.threadId);
                tracking.lastReplyAt = now;
                await updateChatTracking(mentionedUser.id, message.room.id, tracking, persistence);
            }
            if (now - (tracking.lastNotifyAt ?? 0) >= NOTIFY_THROTTLE_MS) {
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
                tracking.lastNotifyAt = now;
                await updateChatTracking(mentionedUser.id, message.room.id, tracking, persistence);
            }
        }
    }

    /**
     * Registers the UI buttons (room action + user menu) and the slash command.
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
        // reachable from anywhere, including E2EE rooms (issue #20 point 4)
        configuration.ui.registerButton({
            actionId: 'auto-reply-user-action-id',
            labelI18n: 'auto-reply-room-action-name',
            context: UIActionButtonContext.USER_DROPDOWN_ACTION,
        });
        await configuration.slashCommands.provideSlashCommand(new AutoReplyCommand());
    }

    /** Opens the contextual bar (room action) or the settings modal (user menu). */
    public async executeActionButtonHandler(context: UIKitActionButtonInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const { actionId, user, room } = context.getInteractionData();

        if (actionId === 'auto-reply-room-action-id') {
            const autoReplySettings = await getAutoReplySettings(user.id, read);
            const barContext = await this.buildBarContext(user, room, read);
            const view = createContextualBarView(undefined, buildSettingsBlocks(modify, autoReplySettings, barContext), barContext.language);
            return context.getInteractionResponder().openContextualBarViewResponse(view);
        }
        if (actionId === 'auto-reply-user-action-id') {
            const autoReplySettings = await getAutoReplySettings(user.id, read);
            const barContext = await this.buildBarContext(user, undefined, read);
            const modal = createSettingsModal(modify, autoReplySettings, barContext);
            return context.getInteractionResponder().openModalViewResponse(modal);
        }
        return context.getInteractionResponder().successResponse();
    }

    private async buildBarContext(user: IUser, room: { id: string; userIds?: Array<string> } | undefined, read: IRead): Promise<IBarContext> {
        const language = await getLanguage(read);
        let dmPeer: IUser | undefined;
        if (room?.userIds) {
            const otherIds = room.userIds.filter((id) => id !== user.id);
            if (otherIds.length === 1) {
                dmPeer = await read.getUserReader().getById(otherIds[0]) ?? undefined;
            }
        }
        return { language, dmPeer, user };
    }

    /**
     * Handles view submits, routed by the shape of the view state:
     * settings (bar or user modal) or the until form.
     */
    public async executeViewSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData();
        const state = (interactionData.view.state ?? {}) as Record<string, any>;

        try {
            if (state[UNTIL_FORM_BLOCK]) {
                return await this.executeUntilFormSubmitHandler(context, read, persistence, modify);
            }
            if (state[SETTINGS_BLOCK]) {
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
        const submitted = ((interactionData.view.state ?? {}) as Record<string, any>)[SETTINGS_BLOCK] ?? {};
        const previous = await getAutoReplySettings(interactionData.user.id, read);
        const isUserModal = typeof interactionData.view.id === 'string' && interactionData.view.id.startsWith(USER_MODAL_PREFIX);

        const messageText = typeof submitted.AutoReplyMessage === 'string' ? submitted.AutoReplyMessage.trim() : '';
        const frequencyRaw = selectValue(submitted.Frequency);
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

        let frequency = previous.frequency;
        let cooldownHours = previous.cooldownHours;
        if (frequencyRaw === 'every' || frequencyRaw === 'once') {
            frequency = frequencyRaw;
        } else if (typeof frequencyRaw === 'string' && frequencyRaw.startsWith('cooldown:')) {
            const h = Number(frequencyRaw.split(':')[1]);
            frequency = 'cooldown';
            cooldownHours = COOLDOWN_PRESETS_HOURS.includes(h) ? h : 24;
        }

        const settings: IAutoReplySettings = {
            ...previous,
            schedulers: [],
            message: messageText || previous.message,
            users: Array.isArray(submitted.ExcludeUsers) ? excludedUsers : previous.users,
            frequency,
            cooldownHours,
            replyToMentions: mentionsValue === 'on' ? true : mentionsValue === 'off' ? false : previous.replyToMentions,
            timezoneOffsetMinutes: Number.isFinite(timezoneValue) && timezoneValue >= -720 && timezoneValue <= 840 ? timezoneValue : previous.timezoneOffsetMinutes,
        };

        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
        await persistence.updateByAssociation(assoc, settings, true);

        const barContext = await this.buildBarContext(interactionData.user, interactionData.room, read);
        const status = statusLine(settings, interactionData.user, barContext.language);

        if (isUserModal) {
            // keep the modal open with the saved state (issue #20 point 4);
            // the updated view must reuse the submitted view's id or the
            // client drops the modal.update
            const modal = createSettingsModal(modify, settings, barContext, status, interactionData.view.id);
            return context.getInteractionResponder().updateModalViewResponse(modal);
        }
        return context.getInteractionResponder().successResponse();
    }

    /** Parses the until form and switches mode to 'until'. */
    private async executeUntilFormSubmitHandler(context: UIKitViewSubmitInteractionContext, read: IRead, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData();
        const form = ((interactionData.view.state ?? {}) as Record<string, any>)[UNTIL_FORM_BLOCK] ?? {};
        const user = interactionData.user;
        const previous = await getAutoReplySettings(user.id, read);
        const formTz = Number(selectValue(form.Timezone));
        const tz = Number.isFinite(formTz) && formTz >= -720 && formTz <= 840 ? formTz : resolveTzMinutes(user, previous);
        const now = Date.now();
        const local = new Date(now + tz * 60000);
        const lang = await getLanguage(read);

        const startMode = selectValue(form.StartMode) ?? 'now';
        let start = now;
        if (startMode === 'today' || startMode === 'tomorrow') {
            start = localToEpoch(local, startMode === 'tomorrow' ? 1 : 0, selectValue(form.StartHour) ?? '09:00', tz);
        } else if (startMode === 'custom') {
            const parsed = parseDate(selectValue(form.StartDate));
            if (!parsed) {
                return viewError(context, UNTIL_FORM_BLOCK, 'StartDate', translate('form_bad_date', lang));
            }
            start = Date.UTC(parsed.y, parsed.m - 1, parsed.d, hourOf(selectValue(form.StartHour) ?? '09:00'), minuteOf(selectValue(form.StartHour) ?? '09:00')) - tz * 60000;
        }

        const untilDay = selectValue(form.UntilDay) ?? 'tomorrow';
        let until: number;
        if (untilDay === 'custom') {
            const parsed = parseDate(selectValue(form.UntilDate));
            if (!parsed) {
                return viewError(context, UNTIL_FORM_BLOCK, 'UntilDate', translate('form_bad_date', lang));
            }
            const hh = selectValue(form.UntilHour) ?? '24:00';
            until = Date.UTC(parsed.y, parsed.m - 1, parsed.d, hourOf(hh), minuteOf(hh)) - tz * 60000;
        } else {
            const dayDelta = untilDay === 'today' ? 0 : untilDay === 'tomorrow' ? 1 : untilDay === '2days' ? 2 : untilDay === '3days' ? 3 : untilDay === '1week' ? 7 : 14;
            const hh = selectValue(form.UntilHour) ?? '24:00';
            until = localToEpoch(local, dayDelta, hh, tz);
        }
        if (until <= start) {
            return viewError(context, UNTIL_FORM_BLOCK, 'UntilDay', translate('form_bad_range', lang));
        }

        const windowMessage = typeof form.WindowMessage === 'string' && form.WindowMessage.trim() ? form.WindowMessage : undefined;
        const settings: IAutoReplySettings = {
            ...previous,
            schedulers: [],
            mode: 'until',
            until: {
                start,
                end: until,
                startWall: epochToWall(start, tz),
                endWall: epochToWall(until, tz),
                message: windowMessage,
            },
            // remember the chosen timezone as the fallback for next time
            timezoneOffsetMinutes: tz,
            // a planned window starts its own enable period (see AutoReplyCommand)
            enabledAt: start <= now ? now : start,
        };
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, user.id);
        await persistence.updateByAssociation(assoc, settings, true);

        // The room panel behind the form still shows the old state; its id is
        // the value of the form's submit button (see OpenUntilForm)
        const panelId = (interactionData.view as { submit?: { value?: string } }).submit?.value;
        if (panelId) {
            try {
                const barContext = await this.buildBarContext(user, interactionData.room, read);
                await modify.getUiController().updateContextualBarView(
                    createContextualBarView(panelId, buildSettingsBlocks(modify, settings, barContext), barContext.language),
                    { triggerId: interactionData.triggerId },
                    user,
                );
            } catch (error) {
                this.getLogger().error({ msg: 'room panel update failed', error: String(error) });
            }
        }

        // successResponse closes the modal — no duplicate submissions
        return context.getInteractionResponder().successResponse();
    }

    /** Small visible confirmation after a notification quick action. */
    private async notifyConfirmation(read: IRead, modify: IModify, data: { user: IUser; room?: { id: string } }, text: string): Promise<void> {
        try {
            const room = data.room ? await read.getRoomReader().getById(data.room.id) : undefined;
            if (room) {
                await sendNotifyMessage(this, modify, room, data.user, text);
            }
        } catch (error) {
            this.getLogger().error({ msg: 'confirmation notify failed', error: String(error) });
        }
    }

    /**
     * Handles block actions: turn on/off, the until form and the
     * notification quick actions (issue #13).
     */
    public async executeBlockActionHandler(context: UIKitBlockInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<any> {
        const data = context.getInteractionData();
        const settings = await getAutoReplySettings(data.user.id, read);
        const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, data.user.id);
        const barContext = await this.buildBarContext(data.user, data.room, read);

        if (data.actionId === 'NotifyDisable') {
            settings.mode = 'off';
            settings.until = undefined;
            await persistence.updateByAssociation(assoc, settings, true);
            await this.notifyConfirmation(read, modify, data, translate('notify_disabled_done', await getLanguage(read)));
            return context.getInteractionResponder().successResponse();
        }
        if (data.actionId === 'NotifyDisableForUser') {
            if (data.value) {
                const user = await read.getUserReader().getById(data.value);
                if (user && !isUserExcluded(settings, user.id)) {
                    settings.users = [...(settings.users ?? []), user];
                    await persistence.updateByAssociation(assoc, settings, true);
                    await this.notifyConfirmation(read, modify, data, translate('notify_disabled_for_done', await getLanguage(read), { username: user.username || user.id }));
                }
            }
            return context.getInteractionResponder().successResponse();
        }
        if (data.actionId === 'NotifyDismiss') {
            return context.getInteractionResponder().successResponse();
        }

        if (data.actionId === 'TurnOn') {
            settings.schedulers = [];
            settings.mode = 'always';
            settings.until = undefined;
            settings.enabledAt = Date.now();
            await persistence.updateByAssociation(assoc, settings, true);
            return context.getInteractionResponder().updateContextualBarViewResponse(
                createContextualBarView(data.container.id, buildSettingsBlocks(modify, settings, barContext), barContext.language),
            );
        }
        if (data.actionId === 'TurnOff') {
            settings.schedulers = [];
            settings.mode = 'off';
            settings.until = undefined;
            await persistence.updateByAssociation(assoc, settings, true);
            return context.getInteractionResponder().updateContextualBarViewResponse(
                createContextualBarView(data.container.id, buildSettingsBlocks(modify, settings, barContext), barContext.language),
            );
        }
        if (data.actionId === 'OpenUntilForm') {
            const tz = resolveTzMinutes(data.user, settings);
            const existing = settings.mode === 'until' ? settings.until : undefined;
            // the room panel's id travels with the form so its submit can refresh the panel
            const panelId = data.container.id.startsWith(USER_MODAL_PREFIX) ? undefined : data.container.id;
            const modal = await createUntilModal(panelId, modify, settings, barContext.language, tz, existing);
            return context.getInteractionResponder().openModalViewResponse(modal);
        }
        return context.getInteractionResponder().successResponse();
    }
}

function viewError(context: UIKitViewSubmitInteractionContext, blockId: string, actionId: string, message: string): IUIKitResponse {
    return context.getInteractionResponder().viewErrorResponse({
        viewId: context.getInteractionData().view.id,
        errors: { [blockId]: { [actionId]: message } },
    } as never);
}

/** UIKit state values may arrive as plain strings or wrapped option objects. */
function selectValue(state: any): string | undefined {
    if (state == null) return undefined;
    if (typeof state === 'string') return state;
    if (typeof state === 'object' && typeof state.value === 'string') return state.value;
    return undefined;
}

function hourOf(hhmm: string): number {
    return Number(hhmm.split(':')[0]) || 0;
}

function minuteOf(hhmm: string): number {
    return Number(hhmm.split(':')[1]) || 0;
}

/** Today + dayDelta at hh:mm, in the user's timezone. */
function localToEpoch(local: Date, dayDelta: number, hhmm: string, tzMinutes: number): number {
    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayDelta, hourOf(hhmm), minuteOf(hhmm)) - tzMinutes * 60000;
}

function parseMentionedUsernames(text: string): string[] {
    const mentioned = new Set<string>();
    const pattern = new RegExp(MENTION.source, 'gi');
    let match: RegExpExecArray | null;
    // exec loop instead of matchAll: ES2017-safe for older build toolchains
    while ((match = pattern.exec(text)) !== null) {
        // a dot right after the name ends the sentence ("ask @alice.")
        const username = match[1].replace(/\.+$/, '').toLowerCase();
        if (username !== 'all' && username !== 'here') {
            mentioned.add(username);
        }
    }
    return Array.from(mentioned);
}

/** "YYYY-MM-DD" -> {y, m, d} or null. */
function parseDate(text: string | undefined): { y: number; m: number; d: number } | null {
    if (!text) {
        return null;
    }
    const m = text.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) {
        return null;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) {
        return null;
    }
    return { y, m: mo, d };
}
