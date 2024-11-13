import { IModify } from "@rocket.chat/apps-engine/definition/accessors";
import { uuid } from "../utils/helpers";
import { ButtonStyle } from "@rocket.chat/apps-engine/definition/uikit";
import { IUIKitModalViewParam } from "@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder";
import { IAutoReplySettings, IReplyFrequency, IScheduler, SchedulerType } from "../utils/IAutoReplySettings";


export async function createReplyPreferencesModal(cxtViewID: string, modify: IModify, autoReplySettings: IAutoReplySettings): Promise<IUIKitModalViewParam> {

    const block = modify.getCreator().getBlockBuilder();

    block.addSectionBlock({
        text: block.newMarkdownTextObject('Here you can set Auto-reply settings on how you want to reply when someone texts you'),
    });
    block.addActionsBlock({
        blockId: `autoReplyPreferences`,
        elements: [
            block.newStaticSelectElement({
                placeholder: block.newPlainTextObject('Reply Frequency'),
                actionId: 'replyPreferencesFrequency',
                options: [
                    { text: block.newPlainTextObject('Send auto-reply On Every Message'), value: String(IReplyFrequency.OnEveryMessage) },
                    { text: block.newPlainTextObject('Send auto-reply Once Per Hour'), value: String(IReplyFrequency.OncePerHour) },
                    { text: block.newPlainTextObject('Send auto-reply Once Per Day'), value: String(IReplyFrequency.OncePerDay) },
                    { text: block.newPlainTextObject('Send auto-reply Once Per Week'), value: String(IReplyFrequency.OncePerWeek) },
                    { text: block.newPlainTextObject('Send auto-reply Once Per Month'), value: String(IReplyFrequency.OncePerMonth) },
                ],
                initialValue: autoReplySettings.replyFrequency || String(IReplyFrequency.OnEveryMessage),
            }),
        ],
    });

    return {
        id: uuid(),
        title: block.newPlainTextObject('Auto-Reply Preferences', false),
        submit: block.newButtonElement({
            text: block.newPlainTextObject('Submit'),
            style: ButtonStyle.PRIMARY,
            value: cxtViewID

        }),
        close: block.newButtonElement({
            text: block.newPlainTextObject('Cancel'),
        }),

        blocks: block.getBlocks(),
    }

}
