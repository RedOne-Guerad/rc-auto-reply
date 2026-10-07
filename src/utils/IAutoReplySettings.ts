import { IUser } from "@rocket.chat/apps-engine/definition/users";

export enum SchedulerType {
    Yearly = 'Yearly',
    Monthly = 'Monthly',
    Weekly = 'Weekly',
    Daily = 'Daily',
}

export interface ISchedulerSettings {
    enableTime?: string;
    disableTime?: string;
    weekdays?: string[];
    message?: string;
}

export interface IScheduler {
    id: string;
    settings: ISchedulerSettings;
    type: SchedulerType;
}

export type ReplyFrequency = 'every' | 'once' | 'cooldown';

export const DEFAULT_MESSAGE = 'Hey, I received your message and will get back to you as soon as possible.';
export const DEFAULT_COOLDOWN_HOURS = 24;

export interface IAutoReplySettings {
    on: boolean;
    message: string;
    /** Users excluded from receiving auto-replies (may contain stale/null entries from old versions). */
    users?: IUser[];
    schedulers?: IScheduler[];
    /** How often the auto-reply is sent per conversation. Default: 'every'. */
    frequency?: ReplyFrequency;
    /** Cooldown in hours when frequency is 'cooldown'. Default: 24. */
    cooldownHours?: number;
    /** Reply when mentioned in channels/private groups. Opt-in, default false. */
    replyToMentions?: boolean;
    /** User timezone offset in minutes east of UTC, used by schedulers. Default: 0. */
    timezoneOffsetMinutes?: number;
    /** Epoch ms of the moment auto-reply was last switched on ('once' frequency resets per enable period). */
    enabledAt?: number;
}
