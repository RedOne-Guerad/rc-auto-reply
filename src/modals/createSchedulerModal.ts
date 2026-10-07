import { IModify } from "@rocket.chat/apps-engine/definition/accessors";
import { daysOfWeek, hoursOfDay, newId } from "../utils/helpers";
import { ButtonStyle } from "@rocket.chat/apps-engine/definition/uikit";
import { IUIKitModalViewParam } from "@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder";
import { IAutoReplySettings, SchedulerType } from "../utils/IAutoReplySettings";
import { AppLanguage, translate } from "../i18n/translations";

export async function createSchedulerModal(
    cxtViewID: string,
    modify: IModify,
    schedulerType: SchedulerType,
    autoReplySettings: IAutoReplySettings,
    language: AppLanguage = 'en',
): Promise<IUIKitModalViewParam> {
    const block = modify.getCreator().getBlockBuilder();
    const hourOptions = hoursOfDay.map((hour) => ({
        text: block.newPlainTextObject(hour.text),
        value: hour.value,
    }));

    if (schedulerType === SchedulerType.Weekly) {
        block.addSectionBlock({
            text: block.newMarkdownTextObject(translate('modal_weekly_description', language)),
        });
        block.addInputBlock({
            blockId: 'autoReplyScheduler',
            optional: false,
            element: block.newMultiStaticElement({
                placeholder: block.newPlainTextObject(translate('modal_select_weekdays', language)),
                actionId: 'SchedulerDays',
                options: daysOfWeek.map((day) => ({
                    text: block.newPlainTextObject(day.text),
                    value: day.value,
                })),
            }),
            label: block.newPlainTextObject(translate('modal_select_weekdays', language)),
        });
        block.addInputBlock({
            blockId: 'autoReplyScheduler',
            optional: false,
            element: block.newStaticSelectElement({
                placeholder: block.newPlainTextObject(translate('modal_enable_at', language)),
                actionId: 'StartSchedulerHour',
                options: hourOptions,
            }),
            label: block.newPlainTextObject(translate('modal_enable_at', language)),
        });
        block.addInputBlock({
            blockId: 'autoReplyScheduler',
            optional: false,
            element: block.newStaticSelectElement({
                placeholder: block.newPlainTextObject(translate('modal_disable_at', language)),
                actionId: 'EndSchedulerHour',
                options: hourOptions,
            }),
            label: block.newPlainTextObject(translate('modal_disable_at', language)),
        });
    } else {
        // Daily
        block.addSectionBlock({
            text: block.newMarkdownTextObject(translate('modal_daily_description', language)),
        });
        block.addInputBlock({
            blockId: 'autoReplySchedulerDaily',
            optional: false,
            element: block.newStaticSelectElement({
                placeholder: block.newPlainTextObject(translate('modal_enable_at', language)),
                actionId: 'EnableTime',
                options: hourOptions,
            }),
            label: block.newPlainTextObject(translate('modal_enable_at', language)),
        });
        block.addInputBlock({
            blockId: 'autoReplySchedulerDaily',
            optional: false,
            element: block.newStaticSelectElement({
                placeholder: block.newPlainTextObject(translate('modal_disable_at', language)),
                actionId: 'DisableTime',
                options: hourOptions,
            }),
            label: block.newPlainTextObject(translate('modal_disable_at', language)),
        });
        block.addInputBlock({
            blockId: 'autoReplySchedulerDaily',
            optional: true,
            element: block.newPlainTextInputElement({
                actionId: 'Message',
                initialValue: autoReplySettings.message,
                multiline: true,
            }),
            label: block.newPlainTextObject(translate('modal_message_label', language)),
        });
    }

    return {
        id: newId(),
        title: block.newPlainTextObject(translate('modal_title', language), false),
        submit: block.newButtonElement({
            text: block.newPlainTextObject('Submit'),
            style: ButtonStyle.PRIMARY,
            value: cxtViewID,
        }),
        close: block.newButtonElement({
            text: block.newPlainTextObject('Cancel'),
        }),
        blocks: block.getBlocks(),
    };
}
