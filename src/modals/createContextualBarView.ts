import { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IAutoReplySettings, IScheduler } from "../utils/IAutoReplySettings";
import { IUIKitModalViewParam } from "@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder";
import { stringDateTime, uuid } from "../utils/helpers";
import { ButtonStyle } from "@rocket.chat/apps-engine/definition/uikit";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { ActionsBlock, Button, DividerBlock, InputBlock, MultiStaticSelectElement, InputOption, PlainText, SectionBlock,  TextInput, UsersSelectInput } from "../utils/blockBuilder";

export async function createContextualBarView(
    viewId: any,
    read: IRead,
    http: IHttp,
    persistence: IPersistence,
    modify: IModify,
    autoReplySettings: IAutoReplySettings
): Promise<IUIKitModalViewParam> {
    const { on, message, users, schedulers } = autoReplySettings;
    const blocks: any[] = [];
    const blockID = "autoReplySettings"

    blocks.push(SectionBlock(
        "*Auto-reply* allows you to automatically send customized messages in response to incoming texts.\nyou can set up personalized auto-responses to ensure that your contacts receive a prompt reply, even when you are not available to respond immediately.", "mrkdwn")
    );
    blocks.push(DividerBlock());

    blocks.push(ActionsBlock(blockID, [
        Button(
            on ? "Disable Auto-reply" : "Enable Auto-reply",
            blockID,
            on ? "DisableApp" : "EnableApp",
            on ? "Disable" : "Enable",
            on ? ButtonStyle.DANGER : ButtonStyle.PRIMARY,
        ),
        ...(on
            ? [
                Button(
                    "Show Preferences",
                    blockID,
                    "OpenReplyPreferences",
                    "OpenReplyPreferences",
                    ButtonStyle.PRIMARY,
                ),
            ]
            : []),
    ]));

    if (on) {
        blocks.push(InputBlock(
            "📝 Auto-reply Message:",
            TextInput(
                "",
                blockID,
                "AutoReplyMessage",
                message || "Hey, I received your message and will get back to you as soon as possible.", true
            )
        ));

        if (users && users.length > 0) {
            blocks.push(SectionBlock("*Excluded Users*\n>Auto-Reply is disabled for those users:", "mrkdwn",
                MultiStaticSelectElement(
                    "username",
                    users.map((user: IUser) => InputOption(user.name, user.id)),
                    blockID,
                    "ExcludeUsers",
                    users.map((user: IUser) => user.id)
                )
            ));
        }

        if (autoReplySettings.replyFrequency) {
            blocks.push(SectionBlock(`>Reply Frequency: *${autoReplySettings.replyFrequency}*`, "mrkdwn"));
        }
    }
    if (schedulers){
        blocks.push(SectionBlock(
            `>Scheduler, Enable On *${stringDateTime(schedulers?.enable?.time)}*`,
            "mrkdwn"
        ));
        blocks.push(SectionBlock(
            `>Scheduler, Disable On *${stringDateTime(schedulers?.disable?.time)}*`,
            "mrkdwn"
        ));
    }

    return {
        id: viewId ?? uuid(),
        title: PlainText("Auto Reply", true),
        submit: Button("Submit", blockID, "submitSettings", "submit", ButtonStyle.PRIMARY),
        close: Button("Cancel", blockID, "cancelSettings"),
        blocks: blocks,
    };
}
