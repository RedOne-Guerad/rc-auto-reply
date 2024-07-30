import { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IAutoReplySettings, IScheduler, SchedulerType } from "../utils/IAutoReplySettings";
import { IUIKitModalViewParam } from "@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder";
import { uuid } from "../utils/helpers";
import { ButtonStyle, IBlock } from "@rocket.chat/apps-engine/definition/uikit";
import { IUser } from "@rocket.chat/apps-engine/definition/users";

export async function createContextualBarView(viewId: any, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify, autoReplySettings: IAutoReplySettings): Promise<IUIKitModalViewParam> {
    const {
        on,
        message,
        users,
        schedulers
    } = autoReplySettings;
    // get auto-reply data for this user
    // const viewId = data.container?.id || uuid();
    const block = modify.getCreator().getBlockBuilder();

    block.addSectionBlock({
        text: block.newMarkdownTextObject("*Auto-reply* allows you to automatically send customized messages in response to incoming texts.\nyou can set up personalized auto-responses to ensure that your contacts receive a prompt reply, even when you are not available to respond immediately."),
    });
    block.addDividerBlock()

    if (!on) {
        block.addActionsBlock({
            blockId: 'autoReplySettings',
            elements: [
                block.newButtonElement({
                    text: block.newPlainTextObject('Enable Auto-reply'),
                    value: 'Enable',
                    style: ButtonStyle.PRIMARY,
                    actionId: 'EnableApp',
                }),
            ]
        });

        return {
            id: viewId ?? uuid(),
            title: block.newPlainTextObject('Auto Reply', true),
            submit: block.newButtonElement({
                text: block.newPlainTextObject('Submit'),
                style: ButtonStyle.PRIMARY,
            }),
            close: block.newButtonElement({
                text: block.newPlainTextObject('Cancel'),
            }),
            blocks: block.getBlocks(),
        }
    }
    block.addActionsBlock({
        blockId: 'autoReplySettings',
        elements: [
            block.newButtonElement({
                text: block.newPlainTextObject('Disable Auto-reply'),
                value: 'Disable',
                style: ButtonStyle.DANGER,
                actionId: 'DisableApp',
            }),
        ]
    });

    block.addInputBlock({
        blockId: 'autoReplySettings',
        optional: false,
        element: block.newPlainTextInputElement({
            actionId: 'AutoReplyMessage',
            initialValue: message || 'Hey, I received your message and will get back to you as soon as possible.',
            multiline: true,
        }),
        label: block.newPlainTextObject('📝 Auto-reply Message:'),
    })

    // Scheduler
    // ToDo
    // block.addSectionBlock({
    //     blockId: 'autoReplySettings',
    //     text: block.newMarkdownTextObject('⏰ *Add a scheduler to enable and disable auto-reply* '),
    //     accessory: 
    //         block.newOverflowMenuElement({
    //             options:[
    //                 {
    //                     text: block.newPlainTextObject('⏰ Daily scheduler'),
    //                     value: String(SchedulerType.Daily)
    //                 },
    //                 {
    //                     text: block.newPlainTextObject('📆 Weekly scheduler'),
    //                     value: String(SchedulerType.Weekly)
    //                 },
    //                 {
    //                     text: block.newPlainTextObject('🗓️ Monthly scheduler'),
    //                     value: String(SchedulerType.Monthly)
    //                 },
    //                 {
    //                     text: block.newPlainTextObject('📅 Yearly scheduler'),
    //                     value: String(SchedulerType.Yearly)
    //                 },
    //             ],
    //         actionId: 'AddScheduler',
    //     }),
    // });


    schedulers?.forEach((scheduler: IScheduler, index: number) => {
        block.addSectionBlock({
            blockId: 'autoReplySettings',
            text: block.newMarkdownTextObject(`>*${index + 1}-* ${scheduler.type} Scheduler, Enable Everyday at *${scheduler.settings.enableTime}* and disable at *${scheduler.settings.disableTime}*`),
            accessory: 
                block.newOverflowMenuElement({
                    options:[
                        {
                            text: block.newPlainTextObject('📝 Edit scheduler'),
                            value: String(index)
                        },
                        {
                            text: block.newPlainTextObject('❌ Remove scheduler'),
                            value: String(index)
                        },
                    ],
                actionId: 'EditScheduler',
            }),
        });
    })

    if (users && users?.length > 0) {
        block.addSectionBlock({
            blockId: 'autoReplySettings',
            text: block.newMarkdownTextObject('*Excluded Users*\n>Auto-Reply is disabled for those users:'),
        })
        block.addActionsBlock({
            blockId: 'autoReplySettings',
            elements: [
                block.newMultiStaticElement({
                    placeholder: block.newPlainTextObject('username'),
                    actionId: 'ExcludeUsers',
                    options: users.map((user: IUser) => ({
                        text: block.newPlainTextObject(user.name),
                        value: user.id,
                    })),
                    initialValue: users.map((user: IUser) => user.id)
                }),
            ],
        });
    }

    return {
        id: viewId ?? uuid(),
        title: block.newPlainTextObject('Auto Reply', true),
        submit: block.newButtonElement({
            text: block.newPlainTextObject('Submit'),
            style: ButtonStyle.PRIMARY,
        }),
        close: block.newButtonElement({
            text: block.newPlainTextObject('Cancel'),
        }),

        blocks: block.getBlocks(),
    }
}