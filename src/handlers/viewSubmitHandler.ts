import { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IUIKitResponse, UIKitViewSubmitInteractionContext } from "@rocket.chat/apps-engine/definition/uikit";
import { getAutoReplySettings, sendNotifyMessage, uuid } from "../utils/helpers";
import { IAutoReplySettings, IReplyFrequency, SchedulerType } from "../utils/IAutoReplySettings";
import { createContextualBarView } from "../modals/createContextualBarView";
import { RocketChatAssociationModel, RocketChatAssociationRecord } from "@rocket.chat/apps-engine/definition/metadata";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { AutoReplyApp } from "../../AutoReplyApp";

export class ViewSubmitHandler {
    constructor(
        private readonly app: AutoReplyApp,
        private readonly context: UIKitViewSubmitInteractionContext,
        private readonly read: IRead,
        private readonly http: IHttp,
        private readonly modify: IModify,
        private readonly persistence: IPersistence,
    ) { }

    public async execute(): Promise<IUIKitResponse> {
        const interactionData = this.context.getInteractionData();
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
        const { autoReplySettings, autoReplyPreferences, autoReplySchedulerDaily } = interactionData.view.state as any;

        if (autoReplyPreferences) {
            return await this.executeReplyPreferencesFrequencySubmitHandler();
        }
        if (autoReplySchedulerDaily) {
            return await this.executeAddSchedulerSubmitHandler();
        }

        const action = this.getAction(autoReplySettings);
        const noChanges = this.hasNoChanges(action, autoReplySettings);
        if (noChanges) {
            return { success: false };
        }

        const previousSettings = await getAutoReplySettings(interactionData.user.id, this.read);
        const excludedUsers = await this.getExcludedUsers(autoReplySettings, previousSettings);

        const state: IAutoReplySettings = {
            on: action ?? previousSettings?.on ?? false,
            message: autoReplySettings.AutoReplyMessage || previousSettings?.message,
            users: excludedUsers ?? [],
            schedulers: previousSettings?.schedulers,
            usersLastReply: previousSettings?.usersLastReply,
            replyFrequency: previousSettings.replyFrequency || String(IReplyFrequency.OnEveryMessage),
        };

        await this.persistence.updateByAssociation(assocMe, state, true);

        if (interactionData.room) {
            const notifyMsg = autoReplySettings.DisableApp ? '*Auto-Reply* is Disabled' : '*Auto-Reply* is Enabled, with the following message:\n' + state.message;
            await sendNotifyMessage(this.app, this.modify, interactionData.room, interactionData.user, notifyMsg);
        }

        return { success: true };
    }

    private getAction(autoReplySettings: any): boolean | undefined {
        if (autoReplySettings.EnableApp === undefined && autoReplySettings.DisableApp && autoReplySettings.DisableApp === 'Disable') {
            return false;
        }
        if (autoReplySettings.DisableApp === undefined && autoReplySettings.EnableApp && autoReplySettings.EnableApp === 'Enable') {
            return true;
        }
        return undefined;
    }

    private hasNoChanges(action: boolean | undefined, autoReplySettings: any): boolean {
        return action === undefined && autoReplySettings.AutoReplyMessage === undefined && autoReplySettings.ExcludeUsers === undefined;
    }

    private async getExcludedUsers(autoReplySettings: any, previousSettings: IAutoReplySettings | undefined): Promise<IUser[]> {
        const userIds = autoReplySettings.ExcludeUsers ?? previousSettings?.users?.map((user: IUser) => user.id) ?? [];
        const userPromises = userIds.map(id => this.read.getUserReader().getById(id));
        const users = await Promise.all(userPromises);
        return users.filter((user: IUser): user is IUser => user !== undefined);
    }

    private async executeAddSchedulerSubmitHandler(): Promise<IUIKitResponse> {
        const interactionData = this.context.getInteractionData();
        const { autoReplySchedulerDaily } = interactionData.view.state as any;
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
        const previousSettings = await getAutoReplySettings(interactionData.user.id, this.read);

        if (autoReplySchedulerDaily && autoReplySchedulerDaily.EnableTime && autoReplySchedulerDaily.DisableTime) {
            previousSettings.schedulers?.push({
                id: uuid(),
                settings: {
                    enableTime: autoReplySchedulerDaily.EnableTime,
                    disableTime: autoReplySchedulerDaily.DisableTime,
                    message: autoReplySchedulerDaily.Message || previousSettings.message
                },
                type: SchedulerType.Daily
            });
            const modal = await createContextualBarView(interactionData.view.submit?.value, this.read, this.http, this.persistence, this.modify, previousSettings);
            if (this.context.getInteractionResponder().updateContextualBarViewResponse(modal).success) {
                await this.persistence.updateByAssociation(assocMe, previousSettings, true);
            }
        }
        return { success: true };
    }

    private async executeReplyPreferencesFrequencySubmitHandler(): Promise<IUIKitResponse> {
        const interactionData = this.context.getInteractionData();
        const { autoReplyPreferences } = interactionData.view.state as any;
        const assocMe = new RocketChatAssociationRecord(RocketChatAssociationModel.USER, interactionData.user.id);
        const previousSettings = await getAutoReplySettings(interactionData.user.id, this.read);

        if (autoReplyPreferences && autoReplyPreferences.replyPreferencesFrequency) {
            previousSettings.replyFrequency = autoReplyPreferences.replyPreferencesFrequency;
            const modal = await createContextualBarView(interactionData.view.submit?.value, this.read, this.http, this.persistence, this.modify, previousSettings);
            if (this.context.getInteractionResponder().updateContextualBarViewResponse(modal).success) {
                await this.persistence.updateByAssociation(assocMe, previousSettings, true);
            }
        }
        return { success: true };
    }
}
