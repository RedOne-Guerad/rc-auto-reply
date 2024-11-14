import { ButtonStyle } from "@rocket.chat/apps-engine/definition/uikit";
import { ActionsBlock, ButtonElement, ContextBlock, DividerBlock, InputBlock, Option, PlainText, SectionBlock, StaticSelectElement, Markdown } from "@rocket.chat/ui-kit";
import { uuid } from "./helpers";

export function InputBlock(labelText: string, placeholderText: string, blockId: string, actionId: string, initialValue?: string, multiline?: boolean): InputBlock {
  return {
    type: "input",
    label: {
      type: "plain_text",
      text: labelText,
    },
    element: {
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
    },
  };
}

export function DateInputBlock(labelText: string, placeholderText: string, blockId: string, actionId: string, initialDate?: string): InputBlock {
  return {
    type: "input",
    label: {
      type: "plain_text",
      text: labelText,
    },
    element: {
      type: "datepicker",
      placeholder: {
        type: "plain_text",
        text: placeholderText,
      },
      appId: uuid(),
      blockId: blockId,
      actionId: actionId,
      initialDate: initialDate,
    },
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

export function SectionBlock(labelText: string, accessory?: any): SectionBlock {
  return {
    type: "section",
    text: {
      type: "plain_text",
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

export function Option(text: string, value: string): Option {
  return {
    text: { type: "plain_text", text: text },
    value: value,
  };
}

export function ActionsBlock(blockId: string, elements: Array<ButtonElement | StaticSelectElement>): ActionsBlock {
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