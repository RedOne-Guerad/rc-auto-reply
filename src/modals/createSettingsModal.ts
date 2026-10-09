import { IModify } from "@rocket.chat/apps-engine/definition/accessors";
import { ButtonStyle } from "@rocket.chat/apps-engine/definition/uikit";
import { IUIKitModalViewParam } from "@rocket.chat/apps-engine/definition/uikit/UIKitInteractionResponder";
import { newId } from "../utils/helpers";
import { IAutoReplySettings } from "../utils/IAutoReplySettings";
import { buildSettingsBlocks, IBarContext, statusLine } from "./createContextualBarView";
import { AppLanguage, translate } from "../i18n/translations";

/** View id prefix identifying the user-menu settings modal (its submit keeps
 * the modal open with a "Saved" banner instead of closing it). */
export const USER_MODAL_PREFIX = 'ar-user-modal';

/**
 * The shared settings form as a modal, reachable from the user menu —
 * including in E2EE rooms, where room actions are not available. When
 * savedStatus is given it renders as a "✅ Saved — <status>" banner on top.
 */
export function createSettingsModal(
    modify: IModify,
    settings: IAutoReplySettings,
    context: IBarContext,
    savedStatus?: string,
    /** reuse the submitted view's id so a modal.update re-renders it in place */
    viewId?: string,
): IUIKitModalViewParam {
    const banner = savedStatus ? translate('modal_saved', context.language, { status: savedStatus }) : undefined;
    const block = buildSettingsBlocks(modify, settings, context, banner);
    return {
        id: viewId ?? `${USER_MODAL_PREFIX}-${newId()}`,
        title: block.newPlainTextObject('Auto Reply', true),
        submit: block.newButtonElement({
            text: block.newPlainTextObject('Submit'),
            style: ButtonStyle.PRIMARY,
        }),
        close: block.newButtonElement({
            text: block.newPlainTextObject('Close'),
        }),
        blocks: block.getBlocks(),
    };
}

export { statusLine };
