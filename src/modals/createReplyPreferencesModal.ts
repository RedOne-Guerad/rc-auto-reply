import { IModify, IUIKitSurfaceViewParam } from "@rocket.chat/apps-engine/definition/accessors";
import { extractDate, extractHours, extractMinutes, hoursOfDay, minutesOfHour, uuid } from "../utils/helpers";
import { ButtonStyle, UIKitSurfaceType } from "@rocket.chat/apps-engine/definition/uikit";
import { IAutoReplySettings, IReplyFrequency } from "../utils/IAutoReplySettings";
import { ActionsBlock, Button, ContextBlock, DateInput, DividerBlock, InputOption, PlainText, SectionBlock, StaticSelectElement, TextInput, TimeInput } from "../utils/blockBuilder";
import { Option } from "@rocket.chat/ui-kit";


export async function createReplyPreferencesModal(cxtViewID: string, modify: IModify, autoReplySettings: IAutoReplySettings): Promise<IUIKitSurfaceViewParam> {

    const blocks: any[] = []
    const blockID = 'autoReplyPreferences'
    blocks.push(ContextBlock('Customize your auto-reply settings to control how and when you want to respond to incoming messages.'));
    blocks.push(DividerBlock());
    blocks.push(SectionBlock('Choose how often you want to send auto-replies:'));
    const replyFrequencySelectEle = StaticSelectElement(
        'Reply Frequency',
        [
            InputOption('Send auto-reply On Every Message', String(IReplyFrequency.OnEveryMessage)),
            InputOption('Send auto-reply Once Per Hour', String(IReplyFrequency.OncePerHour)),
            InputOption('Send auto-reply Once Per Day', String(IReplyFrequency.OncePerDay)),
            InputOption('Send auto-reply Once Per Week', String(IReplyFrequency.OncePerWeek)),
            InputOption('Send auto-reply Once Per Month', String(IReplyFrequency.OncePerMonth)),
        ],
        blockID,
        'replyPreferencesFrequency',
        autoReplySettings.replyFrequency || String(IReplyFrequency.OnEveryMessage)
    )
    blocks.push(ActionsBlock(
        blockID,
        [
            replyFrequencySelectEle
        ]
    ))

    // scheduler
    blocks.push(DividerBlock())
    blocks.push(ContextBlock('Set up a scheduler to automatically enable and disable auto-reply based on your preferred time and dates.'));
    blocks.push(SectionBlock('Select the date and time when you want the auto-reply feature to be enabled:'));
    const housInpute: Option[] = []
    hoursOfDay.forEach(hour => housInpute.push(InputOption(hour.text, hour.value)));
    const minutesInpute: Option[] = []
    minutesOfHour.forEach(minute => minutesInpute.push(InputOption(minute.text, minute.value)));
    blocks.push(ActionsBlock(
        blockID,
        [
            DateInput(
                "Enable Date",
                blockID,
                "schedulerEnableDate",
                extractDate(autoReplySettings.schedulers?.enable?.time)
            )
        ])
    )
    blocks.push(ActionsBlock(
        blockID,
        [
            StaticSelectElement(
                "Enable time",
                housInpute,
                blockID,
                "schedulerEnableTimeHour",
                extractHours(autoReplySettings.schedulers?.enable?.time)
            ),
            StaticSelectElement(
                "Enable time",
                minutesInpute,
                blockID,
                "schedulerEnableTimeMinute",
                extractMinutes(autoReplySettings.schedulers?.enable?.time)
            ),
        ])
    )
    blocks.push(SectionBlock('Select the date and time when you want the auto-reply feature to be disabled:'));
    blocks.push(ActionsBlock(
        blockID,
        [
            DateInput(
                "Disable Date",
                blockID,
                "schedulerDisableDate",
                extractDate(autoReplySettings.schedulers?.disable?.time)
            )
        ])
    )
    blocks.push(ActionsBlock(
        blockID,
        [
            StaticSelectElement(
                "Disable time",
                housInpute,
                blockID,
                "schedulerDisableTimeHour",
                extractHours(autoReplySettings.schedulers?.disable?.time)
            ),
            StaticSelectElement(
                "Disable time",
                minutesInpute,
                blockID,
                "schedulerDisableTimeMinute",
                extractMinutes(autoReplySettings.schedulers?.disable?.time)
            ),
        ])
    )

    return {
        id: uuid(),
        type: UIKitSurfaceType.MODAL,
        title: PlainText('Auto-Reply Preferences', false),
        submit: Button('Save', blockID, 'autoReplyPreferencesCancel', cxtViewID, ButtonStyle.PRIMARY),
        close: Button('Cancel', blockID, 'autoReplyPreferencesCancel'),
        blocks: blocks,
    }

}
