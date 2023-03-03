import { IModify } from "@rocket.chat/apps-engine/definition/accessors";
import { daysOfWeek, hoursOfDay, uuid } from "../utils/helpers";
import { ButtonStyle } from "@rocket.chat/apps-engine/definition/uikit";
import { IUIKitModalViewParam } from "@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder";
import { IAutoReplySettings, IScheduler, SchedulerType } from "../utils/IAutoReplySettings";


export async function createSchedulerModal(cxtViewID: string, modify: IModify, schedulerType: SchedulerType, autoReplySettings: IAutoReplySettings): Promise<IUIKitModalViewParam> {

    const block = modify.getCreator().getBlockBuilder();

    switch (schedulerType) {
        case SchedulerType.Daily:
            block.addSectionBlock({
                // blockId: 'autoReplySettings',
                text: block.newMarkdownTextObject('A daily scheduler will enable auto-reply every day at the selected time and disable it at the chosen disable time'),
            });
            block.addActionsBlock({
                blockId: `autoReplySchedulerDaily`,
                elements: [
                    block.newStaticSelectElement({
                        placeholder: block.newPlainTextObject('Enable it at'),
                        actionId: 'EnableTime',
                        options: hoursOfDay.map((hour) => ({
                            text: block.newPlainTextObject(hour.text),
                            value: hour.value,
                        })),
                        initialValue: undefined,
                        
                    }),
                    block.newStaticSelectElement({
                        placeholder: block.newPlainTextObject('Disable it at'),
                        actionId: 'DisableTime',
                        options: hoursOfDay.map((hour) => ({
                            text: block.newPlainTextObject(hour.text),
                            value: hour.value,
                        })),
                        initialValue: undefined
                    }),
                    block.newPlainTextInputElement({
                        actionId: 'Message',
                        initialValue: autoReplySettings.message,
                        multiline: true,
                    }),
                ],
            });
            break;

            case SchedulerType.Weekly:
                block.addSectionBlock({
                    // blockId: 'autoReplySettings',
                    text: block.newMarkdownTextObject('A Weekly scheduler will enable auto-reply every chosen day(s) at the selected time and disable it at the chosen disable time'),
                });
                block.addActionsBlock({
                    blockId: `autoReplyScheduler`,
                    elements: [
                        block.newMultiStaticElement({
                            placeholder: block.newPlainTextObject('Select weekdays'),
                            actionId: 'SchedulerDays',
                            options: daysOfWeek.map((day) => ({
                                text: block.newPlainTextObject(day.text),
                                value: day.value,
    
                            })),
                            initialValue: []
                        }),
                    ],
                });
                block.addActionsBlock({
                    blockId: `autoReplyScheduler`,
                    elements: [
                        block.newStaticSelectElement({
                            placeholder: block.newPlainTextObject('Enable it at'),
                            actionId: 'StartSchedulerHour',
                            options: hoursOfDay.map((hour) => ({
                                text: block.newPlainTextObject(hour.text),
                                value: hour.value,
                            })),
                            initialValue: undefined
                        }),
                        block.newStaticSelectElement({
                            placeholder: block.newPlainTextObject('Disable it at'),
                            actionId: 'EndSchedulerHour',
                            options: hoursOfDay.map((hour) => ({
                                text: block.newPlainTextObject(hour.text),
                                value: hour.value,
                            })),
                            initialValue: undefined
                        }),
                    ],
                });
                break;

        default:
            break;
    }

    return {
        id: uuid(),
        title: block.newPlainTextObject('Add a scheduler', false),
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