import { IUser } from "@rocket.chat/apps-engine/definition/users";

export type AutoReplyMode = 'off' | 'always' | 'until';

/**
 * A timed auto-reply window ("on until …"). Stored as epoch ms so runtime
 * comparisons are timezone-free; the user's utcOffset is applied when the
 * window is created (see parseWhen / resolveTzMinutes in helpers).
 */
export interface IUntilWindow {
    /** epoch ms — authoritative when the wall-clock fields are absent */
    start: number;
    end: number;
    /**
     * Wall-clock representation ("YYYY-MM-DDTHH:mm" in the user's timezone),
     * kept alongside the epochs so a window survives daylight-saving changes:
     * the epochs are recomputed from the wall clock with the user's live
     * timezone offset whenever the window is evaluated.
     */
    startWall?: string;
    endWall?: string;
    message?: string;
}

export type ReplyFrequency = 'every' | 'once' | 'cooldown';

export const DEFAULT_MESSAGE = 'Hey, I received your message and will get back to you as soon as possible.';
export const DEFAULT_COOLDOWN_HOURS = 24;
export const COOLDOWN_PRESETS_HOURS = [1, 6, 12, 24, 48, 72, 168];

export interface IAutoReplySettings {
    mode: AutoReplyMode;
    message: string;
    /** Users excluded from receiving auto-replies (may contain stale/null entries from old versions). */
    users?: IUser[];
    /** Legacy 2.1 schedulers — ignored since 2.2, kept in storage until the next save cleans them. */
    schedulers?: unknown[];
    /** How often the auto-reply is sent per conversation. Default: 'every'. */
    frequency?: ReplyFrequency;
    /** Cooldown in hours when frequency is 'cooldown'. Default: 24. */
    cooldownHours?: number;
    /** Reply when mentioned in channels/private groups. Opt-in, default false. */
    replyToMentions?: boolean;
    /** Fallback timezone offset in minutes east of UTC (used when the user profile has no utcOffset). */
    timezoneOffsetMinutes?: number;
    /** Epoch ms of the moment auto-reply was last switched on ('once' frequency resets per enable period). */
    enabledAt?: number;
    /** The timed window when mode is 'until'. */
    until?: IUntilWindow;
}
