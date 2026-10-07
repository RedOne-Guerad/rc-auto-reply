import { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IAutoReplySettings, IScheduler, SchedulerType } from "../utils/IAutoReplySettings";
import { IUIKitModalViewParam } from "@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder";
import { newId, timezoneOffsetOptions } from "../utils/helpers";
import { ButtonStyle, BlockBuilder } from "@rocket.chat/apps-engine/definition/uikit";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { AppLanguage, translate } from "../i18n/translations";

const SETTINGS_BLOCK = 'autoReplySettings';

export interface IContextualBarContext {
    /** The other user of the DM the bar was opened from, offered as an excludable option. */
    dmPeer?: IUser;
    language: AppLanguage;
}

export async function createContextualBarView(
    viewId: any,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
    autoReplySettings: IAutoReplySettings,
    context?: IContextualBarContext,
): Promise<IUIKitModalViewParam> {
    const {
        on,
        message,
        users,
        schedulers,
        frequency,
        cooldownHours,
        replyToMentions,
        timezoneOffsetMinutes,
    } = autoReplySettings;
    const lang = context?.language ?? 'en';
    const block = modify.getCreator().getBlockBuilder();

    block.addSectionBlock({
        text: block.newMarkdownTextObject(translate('bar_description', lang)),
    });
    block.addDividerBlock();

    if (!on) {
        block.addActionsBlock({
            blockId: SETTINGS_BLOCK,
            elements: [
                block.newButtonElement({
                    text: block.newPlainTextObject(translate('bar_enable', lang)),
                    value: 'Enable',
                    style: ButtonStyle.PRIMARY,
                    actionId: 'EnableApp',
                }),
            ],
        });
        return finalize(viewId, block);
    }

    block.addActionsBlock({
        blockId: SETTINGS_BLOCK,
        elements: [
            block.newButtonElement({
                text: block.newPlainTextObject(translate('bar_disable', lang)),
                value: 'Disable',
                style: ButtonStyle.DANGER,
                actionId: 'DisableApp',
            }),
        ],
    });

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

    // Reply frequency (issue #6)
    block.addInputBlock({
        blockId: SETTINGS_BLOCK,
        optional: true,
        element: block.newStaticSelectElement({
            actionId: 'Frequency',
            options: [
                { text: block.newPlainTextObject(translate('bar_frequency_every', lang)), value: 'every' },
                { text: block.newPlainTextObject(translate('bar_frequency_once', lang)), value: 'once' },
                { text: block.newPlainTextObject(translate('bar_frequency_cooldown', lang)), value: 'cooldown' },
            ],
            initialValue: frequency ?? 'every',
        }),
        label: block.newPlainTextObject(translate('bar_frequency_label', lang)),
    });

    block.addInputBlock({
        blockId: SETTINGS_BLOCK,
        optional: true,
        element: block.newPlainTextInputElement({
            actionId: 'CooldownHours',
            initialValue: String(cooldownHours ?? 24),
        }),
        label: block.newPlainTextObject(translate('bar_cooldown_label', lang)),
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

    // Scheduler timezone
    block.addInputBlock({
        blockId: SETTINGS_BLOCK,
        optional: true,
        element: block.newStaticSelectElement({
            actionId: 'TimezoneOffset',
            options: timezoneOffsetOptions().map((opt) => ({
                text: block.newPlainTextObject(opt.text),
                value: opt.value,
            })),
            initialValue: String(timezoneOffsetMinutes ?? 0),
        }),
        label: block.newPlainTextObject(translate('bar_timezone_label', lang)),
    });

    // Schedulers
    block.addSectionBlock({
        blockId: SETTINGS_BLOCK,
        text: block.newMarkdownTextObject(translate('bar_scheduler_section', lang)),
        accessory:
            block.newOverflowMenuElement({
                options: [
                    { text: block.newPlainTextObject(translate('bar_scheduler_daily', lang)), value: String(SchedulerType.Daily) },
                    { text: block.newPlainTextObject(translate('bar_scheduler_weekly', lang)), value: String(SchedulerType.Weekly) },
                ],
                actionId: 'AddScheduler',
            }),
    });

    if (!schedulers || schedulers.length === 0) {
        block.addSectionBlock({
            blockId: SETTINGS_BLOCK,
            text: block.newMarkdownTextObject(translate('bar_scheduler_none', lang)),
        });
    } else {
        schedulers.forEach((scheduler: IScheduler, index: number) => {
            const start = scheduler.settings.enableTime ?? '--:--';
            const end = scheduler.settings.disableTime ?? '--:--';
            const itemText = scheduler.type === SchedulerType.Weekly
                ? translate('bar_scheduler_weekly_item', lang, { days: (scheduler.settings.weekdays ?? []).join(', ') || '-', start, end })
                : translate('bar_scheduler_daily_item', lang, { start, end });
            block.addSectionBlock({
                blockId: SETTINGS_BLOCK,
                text: block.newMarkdownTextObject(`>*${index + 1}-* ${itemText}`),
                accessory: block.newOverflowMenuElement({
                    options: [
                        { text: block.newPlainTextObject(translate('bar_remove_scheduler', lang)), value: String(index) },
                    ],
                    actionId: 'RemoveScheduler',
                }),
            });
        });
    }

    // Excluded users: options are the union of the DM peer and current
    // exclusions so new users can actually be excluded from the UI too.
    const excluded = (users ?? []).filter(Boolean);
    const options = new Map<string, IUser>();
    for (const user of excluded) {
        options.set(user.id, user);
    }
    if (context?.dmPeer) {
        options.set(context.dmPeer.id, context.dmPeer);
    }
    block.addSectionBlock({
        blockId: SETTINGS_BLOCK,
        text: block.newMarkdownTextObject(excluded.length > 0 ? translate('bar_excluded_title', lang) : translate('bar_excluded_empty', lang)),
    });
    if (options.size > 0) {
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
