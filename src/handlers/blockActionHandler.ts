import { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { UIKitBlockInteractionContext } from "@rocket.chat/apps-engine/definition/uikit";
import { getAutoReplySettings } from "../utils/helpers";
import { createContextualBarView } from "../modals/createContextualBarView";
import { createReplyPreferencesModal } from "../modals/createReplyPreferencesModal";

export class BlockActionHandler{
    constructor(
        private readonly context: UIKitBlockInteractionContext,
        private readonly read: IRead,
        private readonly http: IHttp,
        private readonly modify: IModify,
        private readonly persistence: IPersistence,
    ) { }
    public async execute(): Promise<any> {
        const data = this.context.getInteractionData();
        // get auto-reply settings for this user
        const autoReplySettings = await getAutoReplySettings(data.user.id, this.read);
        if (data.actionId === 'EnableApp') {
            autoReplySettings.on = true;
            const modal = await createContextualBarView(data.container.id, this.read, this.http, this.persistence, this.modify, autoReplySettings)
            return this.context.getInteractionResponder().updateContextualBarViewResponse(modal);
        }
        if (data.actionId === 'DisableApp') {
            autoReplySettings.on = false;
            const modal = await createContextualBarView(data.container.id, this.read, this.http, this.persistence, this.modify, autoReplySettings)
            return this.context.getInteractionResponder().updateContextualBarViewResponse(modal);
        }
        if (data.actionId === 'OpenReplyPreferences') {
            const modal = await createReplyPreferencesModal(data.container.id, this.modify, autoReplySettings)
            return  this.context.getInteractionResponder().openModalViewResponse(modal);
        }
        return {
            success: true,
        };
    }
}