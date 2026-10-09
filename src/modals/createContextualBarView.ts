import { IModify, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IAutoReplySettings, COOLDOWN_PRESETS_HOURS } from "../utils/IAutoReplySettings";
import { IUIKitModalViewParam } from "@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder";
import {
    newId, formatOffsetMinutes, formatInTz, formatDurationUntil,
    isAutoReplyActive, resolveTzMinutes,
} from "../utils/helpers";
import { ButtonStyle, BlockBuilder } from "@rocket.chat/apps-engine/definition/uikit";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { AppLanguage, translate } from "../i18n/translations";

const SETTINGS_BLOCK = 'autoReplySettings';

export interface IBarContext {
    /** The other user of the DM the bar was opened from, offered as an excludable option. */
    dmPeer?: IUser;
    language: AppLanguage;
    /** Whose settings these are (for timezone resolution from the profile). */
    user: IUser;
}

export function statusLine(settings: IAutoReplySettings, user: IUser, lang: AppLanguage, now = Date.now()): string {
    const tz = resolveTzMinutes(user, settings);
    if (settings.mode === 'always') {
        return translate('bar_status_on', lang);
    }
    if (settings.mode === 'until' && settings.until) {
        if (now < settings.until.start) {
            return translate('bar_status_scheduled', lang, {
                from: formatInTz(settings.until.start, tz),
                until: formatInTz(settings.until.end, tz),
            });
        }
        if (isAutoReplyActive(settings, now)) {
            return translate('bar_status_until', lang, {
                until: formatInTz(settings.until.end, tz),
                duration: formatDurationUntil(settings.until.end),
            });
        }
    }
    return translate('bar_status_off', lang);
}

/**
 * Builds the settings blocks shared by the room contextual bar and the
 * user-menu modal. An optional banner (e.g. "✅ Saved — …") goes on top.
 */
export function buildSettingsBlocks(
    modify: IModify,
    autoReplySettings: IAutoReplySettings,
    context: IBarContext,
    banner?: string,
): BlockBuilder {
    const { message, users, frequency, cooldownHours, replyToMentions } = autoReplySettings;
    const lang = context.language;
    const block = modify.getCreator().getBlockBuilder();
    const now = Date.now();

    if (banner) {
        block.addSectionBlock({
            blockId: SETTINGS_BLOCK,
            text: block.newMarkdownTextObject(banner),
        });
        block.addDividerBlock();
    }

    block.addSectionBlock({
        blockId: SETTINGS_BLOCK,
        text: block.newMarkdownTextObject(translate('bar_description', lang)),
    });
    block.addDividerBlock();

    // Status is always visible, whatever the state (nothing hides when off)
    block.addSectionBlock({
        blockId: SETTINGS_BLOCK,
        text: block.newMarkdownTextObject(statusLine(autoReplySettings, context.user, lang)),
    });

    const active = isAutoReplyActive(autoReplySettings, now);

    if (!active) {
        block.addActionsBlock({
            blockId: SETTINGS_BLOCK,
            elements: [
                block.newButtonElement({
                    text: block.newPlainTextObject(translate('bar_turn_on', lang)),
                    value: 'on',
                    style: ButtonStyle.PRIMARY,
                    actionId: 'TurnOn',
                }),
                block.newButtonElement({
                    text: block.newPlainTextObject(translate('bar_until_button', lang)),
                    actionId: 'OpenUntilForm',
                }),
            ],
        });
        return block;
    }

    // active (always or inside the window)
    const actions = [
        block.newButtonElement({
            text: block.newPlainTextObject(translate('bar_turn_off', lang)),
            value: 'off',
            style: ButtonStyle.DANGER,
            actionId: 'TurnOff',
        }),
    ];
    if (autoReplySettings.mode === 'until' && autoReplySettings.until) {
        actions.push(block.newButtonElement({
            text: block.newPlainTextObject(translate('bar_edit_window', lang)),
            actionId: 'OpenUntilForm',
        }));
    } else {
        actions.push(block.newButtonElement({
            text: block.newPlainTextObject(translate('bar_until_button', lang)),
            actionId: 'OpenUntilForm',
        }));
    }
    block.addActionsBlock({ blockId: SETTINGS_BLOCK, elements: actions });

    block.addInputBlock({
        blockId: SETTINGS_BLOCK,
        optional: true,
        element: block.newPlainTextInputElement({
            actionId: 'AutoReplyMessage',
            initialValue: message,
            multiline: true,
        }),
        label: block.newPlainTextObject(translate('bar_message_label', lang)),
    });

    // Reply frequency (issue #6): presets instead of free text
    const cooldown = cooldownHours ?? 24;
    const presetHours = COOLDOWN_PRESETS_HOURS.includes(cooldown) ? cooldown : 24;
    block.addInputBlock({
        blockId: SETTINGS_BLOCK,
        optional: true,
        element: block.newStaticSelectElement({
            actionId: 'Frequency',
            options: [
                { text: block.newPlainTextObject(translate('bar_frequency_every', lang)), value: 'every' },
                { text: block.newPlainTextObject(translate('bar_frequency_once', lang)), value: 'once' },
                ...COOLDOWN_PRESETS_HOURS.map((h) => ({
                    text: block.newPlainTextObject(translate('bar_cooldown_hours', lang, { hours: h })),
                    value: `cooldown:${h}`,
                })),
            ],
            initialValue: frequency === 'once' ? 'once'
                : frequency === 'cooldown' ? `cooldown:${presetHours}`
                : 'every',
        }),
        label: block.newPlainTextObject(translate('bar_frequency_label', lang)),
    });

    // Mentions in channels (opt-in)
    block.addInputBlock({
        blockId: SETTINGS_BLOCK,
        optional: true,
        element: block.newStaticSelectElement({
            actionId: 'ReplyToMentions',
            options: [
                { text: block.newPlainTextObject(translate('bar_off', lang)), value: 'off' },
                { text: block.newPlainTextObject(translate('bar_on', lang)), value: 'on' },
            ],
            initialValue: replyToMentions ? 'on' : 'off',
        }),
        label: block.newPlainTextObject(translate('bar_mentions_label', lang)),
    });

    // Excluded users: only meaningful with a DM peer to offer; existing
    // exclusions are always listed so they can be removed.
    const excluded = (users ?? []).filter(Boolean);
    const options = new Map<string, IUser>();
    for (const user of excluded) {
        options.set(user.id, user);
    }
    if (context.dmPeer) {
        options.set(context.dmPeer.id, context.dmPeer);
    }
    if (excluded.length > 0 || context.dmPeer) {
        block.addSectionBlock({
            blockId: SETTINGS_BLOCK,
            text: block.newMarkdownTextObject(excluded.length > 0 ? translate('bar_excluded_title', lang) : translate('bar_excluded_empty', lang)),
        });
        block.addActionsBlock({
            blockId: SETTINGS_BLOCK,
            elements: [
                block.newMultiStaticElement({
                    placeholder: block.newPlainTextObject(translate('bar_excluded_placeholder', lang)),
                    actionId: 'ExcludeUsers',
                    options: Array.from(options.values()).map((user: IUser) => ({
                        text: block.newPlainTextObject(user.username || user.name || user.id),
                        value: user.id,
                    })),
                    initialValue: excluded.map((user: IUser) => user.id),
                }),
            ],
        });
    }

    return block;
}

/** The room contextual bar wrapper. */
export function createContextualBarView(
    viewId: any,
    block: BlockBuilder,
): IUIKitModalViewParam {
    return finalize(viewId, block);
}

function finalize(viewId: any, block: BlockBuilder): IUIKitModalViewParam {
    return {
        id: viewId ?? newId(),
        title: block.newPlainTextObject('Auto Reply', true),
        submit: block.newButtonElement({
            text: block.newPlainTextObject('Submit'),
            style: ButtonStyle.PRIMARY,
        }),
        close: block.newButtonElement({
            text: block.newPlainTextObject('Cancel'),
        }),
        blocks: block.getBlocks(),
    };
}
