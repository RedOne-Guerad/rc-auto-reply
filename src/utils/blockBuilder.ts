import { ButtonStyle } from "@rocket.chat/apps-engine/definition/uikit";
import { ActionsBlock, BlockElement, ButtonElement, ChannelsSelectElement, CheckboxElement, ContextBlock, ConversationsSelectElement, DatePickerElement, DividerBlock, InputBlock, LinearScaleElement, Markdown, MultiChannelsSelectElement, MultiConversationsSelectElement, MultiStaticSelectElement, MultiUsersSelectElement, Option, PlainText, PlainTextInputElement, RadioButtonElement, SectionBlock, StaticSelectElement, TimePickerElement, ToggleSwitchElement, UsersSelectElement } from "@rocket.chat/ui-kit";
import { uuid } from "./helpers";

export type inputElement = ChannelsSelectElement | ConversationsSelectElement | DatePickerElement | LinearScaleElement | MultiChannelsSelectElement | MultiConversationsSelectElement | MultiStaticSelectElement | MultiUsersSelectElement | PlainTextInputElement | StaticSelectElement | UsersSelectElement | CheckboxElement | RadioButtonElement | TimePickerElement | ToggleSwitchElement;

export function InputBlock(labelText: string, inputElement: inputElement): InputBlock {
    return {
        type: "input",
        label: {
            type: "plain_text",
            text: labelText,
        },
        element: inputElement,
    };
}
export function TextInput(placeholderText: string, blockId: string, actionId: string, initialValue?: string, multiline?: boolean): PlainTextInputElement {
    return {
            type: "plain_text_input",
            placeholder: {
                type: "plain_text",
                text: placeholderText,
            },
            appId: uuid(),
            blockId: blockId,
            actionId: actionId,
            initialValue: initialValue,
            multiline: multiline,
    };
}

export function DateInput(placeholderText: string, blockId: string, actionId: string, initialDate?: string): DatePickerElement {
    return {
            type: "datepicker",
            placeholder: {
                type: "plain_text",
                text: placeholderText,
            },
            appId: uuid(),
            blockId: blockId,
            actionId: actionId,
            initialDate: initialDate,
    };
}
export function TimeInput(placeholderText: string, blockId: string, actionId: string, initialTime?: string): TimePickerElement {
    return {
            type: "time_picker",
            placeholder: {
                type: "plain_text",
                text: placeholderText,
            },
            appId: uuid(),
            blockId: blockId,
            actionId: actionId,
            initialTime: initialTime,
    };
}

export function Button(labelText: string, blockId: string, actionId: string, value?: string, style?: ButtonStyle.PRIMARY | ButtonStyle.DANGER, url?: string): ButtonElement {
    return {
        type: "button",
        text: {
            type: "plain_text",
            text: labelText,
        },
        appId: uuid(),
        blockId: blockId,
        actionId: actionId,
        url: url,
        value: value,
        style: style,
    };
}

export function SectionBlock(labelText: string, textType: "plain_text" | "mrkdwn" = "plain_text", accessory?: any): SectionBlock {
    return {
        type: "section",
        text: {
            type: textType,
            text: labelText,
        },
        accessory: accessory,
    };
}

export function DividerBlock(): DividerBlock {
    return {
        type: "divider",
    };
}

export function ContextBlock(elementText: string): ContextBlock {
    return {
        type: "context",
        elements: [
            {
                type: "plain_text",
                text: elementText,
            },
        ],
    };
}

export function StaticSelectElement(placeholderText: string, options: Array<Option>, blockId: string, actionId: string, initialValue?: Option["value"]): StaticSelectElement {
    return {
        type: "static_select",
        placeholder: {
            type: "plain_text",
            text: placeholderText,
        },
        options: options,
        appId: uuid(),
        blockId: blockId,
        actionId: actionId,
        initialValue: initialValue,
    };
}
export function MultiStaticSelectElement(placeholderText: string, options: Array<Option>, blockId: string, actionId: string, initialValue?: Option["value"][]): MultiStaticSelectElement {
    return {
        type: "multi_static_select",
        placeholder: {
            type: "plain_text",
            text: placeholderText,
        },
        options: options,
        appId: uuid(),
        blockId: blockId,
        actionId: actionId,
        initialValue: initialValue,
    };
}

export function InputOption(text: string, value: string): Option {
    return {
        text: { type: "plain_text", text: text },
        value: value,
    };
}

export function ActionsBlock(blockId: string, elements: Array<any>): ActionsBlock {
    return {
        type: "actions",
        blockId: blockId,
        elements: elements,
    };
}
export function PlainText(text: string, emoji?: boolean): PlainText {
    return {
        type: "plain_text",
        text: text,
        emoji: emoji
    };
}
export function MarkdownText(text: string, verbatim?: boolean): Markdown {
    return {
        type: "mrkdwn",
        text: text,
        verbatim: verbatim
    }
}

export function ToggleSwitchButton(options: Option[], initialOption: Option[], blockId: string, actionId: string,): ToggleSwitchElement {
    return {
        type: "toggle_switch",
        options: options,
        appId: uuid(),
        blockId: blockId,
        actionId: actionId,
        initialOptions: initialOption,
    }
}