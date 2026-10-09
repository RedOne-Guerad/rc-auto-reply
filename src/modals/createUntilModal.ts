import { IModify } from "@rocket.chat/apps-engine/definition/accessors";
import { hoursOfDay, endOfDayHour, newId, timezoneOffsetOptions } from "../utils/helpers";
import { ButtonStyle } from "@rocket.chat/apps-engine/definition/uikit";
import { IUIKitModalViewParam } from "@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder";
import { IAutoReplySettings } from "../utils/IAutoReplySettings";
import { AppLanguage, translate } from "../i18n/translations";

export const UNTIL_FORM_BLOCK = 'arUntilForm';

export const START_MODES = ['now', 'today', 'tomorrow', 'custom'] as const;
export const UNTIL_DAYS = ['today', 'tomorrow', '2days', '3days', '1week', '2weeks', 'custom'] as const;

export async function createUntilModal(
    cxtViewID: string | undefined,
    modify: IModify,
    settings: IAutoReplySettings,
    language: AppLanguage = 'en',
    /** initial timezone (minutes) — the caller resolves profile vs fallback */
    tzMinutes: number = 0,
): Promise<IUIKitModalViewParam> {
    const block = modify.getCreator().getBlockBuilder();
    const hourOptions = hoursOfDay.map((h) => ({
        text: block.newPlainTextObject(h.text),
        value: h.value,
    }));
    const endHourOptions = [...hourOptions, {
        text: block.newPlainTextObject(endOfDayHour.text),
        value: endOfDayHour.value,
    }];

    block.addInputBlock({
        blockId: UNTIL_FORM_BLOCK,
        optional: false,
        element: block.newStaticSelectElement({
            actionId: 'Timezone',
            options: timezoneOffsetOptions().map((opt) => ({
                text: block.newPlainTextObject(opt.text),
                value: opt.value,
            })),
            initialValue: String(tzMinutes),
        }),
        label: block.newPlainTextObject(translate('modal_tz_label', language)),
    });
    block.addInputBlock({
        blockId: UNTIL_FORM_BLOCK,
        optional: false,
        element: block.newStaticSelectElement({
            actionId: 'StartMode',
            options: [
                { text: block.newPlainTextObject(translate('bar_start_now', language)), value: 'now' },
                { text: block.newPlainTextObject(translate('bar_start_today', language)), value: 'today' },
                { text: block.newPlainTextObject(translate('bar_start_tomorrow', language)), value: 'tomorrow' },
                { text: block.newPlainTextObject(translate('bar_start_date', language)), value: 'custom' },
            ],
            initialValue: 'now',
        }),
        label: block.newPlainTextObject(translate('bar_start_from', language)),
    });
    block.addInputBlock({
        blockId: UNTIL_FORM_BLOCK,
        optional: true,
        element: block.newPlainTextInputElement({
            actionId: 'StartDate',
            placeholder: block.newPlainTextObject('2026-10-12'),
        }),
        label: block.newPlainTextObject(translate('bar_start_date', language)),
    });
    block.addInputBlock({
        blockId: UNTIL_FORM_BLOCK,
        optional: true,
        element: block.newStaticSelectElement({
            actionId: 'StartHour',
            options: hourOptions,
            initialValue: '09:00',
        }),
        label: block.newPlainTextObject(translate('bar_until_time', language)),
    });

    block.addInputBlock({
        blockId: UNTIL_FORM_BLOCK,
        optional: false,
        element: block.newStaticSelectElement({
            actionId: 'UntilDay',
            options: [
                { text: block.newPlainTextObject(translate('bar_start_today', language).split(' ')[0]), value: 'today' },
                { text: block.newPlainTextObject(translate('bar_start_tomorrow', language).split(' ')[0]), value: 'tomorrow' },
                { text: block.newPlainTextObject('+2'), value: '2days' },
                { text: block.newPlainTextObject('+3'), value: '3days' },
                { text: block.newPlainTextObject('+7'), value: '1week' },
                { text: block.newPlainTextObject('+14'), value: '2weeks' },
                { text: block.newPlainTextObject(translate('bar_until_date', language)), value: 'custom' },
            ],
            initialValue: 'tomorrow',
        }),
        label: block.newPlainTextObject(translate('bar_window_until', language)),
    });
    block.addInputBlock({
        blockId: UNTIL_FORM_BLOCK,
        optional: true,
        element: block.newPlainTextInputElement({
            actionId: 'UntilDate',
            placeholder: block.newPlainTextObject('2026-10-15'),
        }),
        label: block.newPlainTextObject(translate('bar_until_date', language)),
    });
    block.addInputBlock({
        blockId: UNTIL_FORM_BLOCK,
        optional: false,
        element: block.newStaticSelectElement({
            actionId: 'UntilHour',
            options: endHourOptions,
            initialValue: endOfDayHour.value,
        }),
        label: block.newPlainTextObject(translate('bar_until_time', language)),
    });

    block.addInputBlock({
        blockId: UNTIL_FORM_BLOCK,
        optional: true,
        element: block.newPlainTextInputElement({
            actionId: 'WindowMessage',
            initialValue: settings.message,
            multiline: true,
        }),
        label: block.newPlainTextObject(translate('bar_window_custom_message', language)),
    });

    return {
        id: newId(),
        title: block.newPlainTextObject(translate('modal_until_title', language), false),
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
