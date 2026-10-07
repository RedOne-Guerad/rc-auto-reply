import { IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

import { IAutoReplySettings, IScheduler, SchedulerType } from './utils/IAutoReplySettings';
import { SCHEDULER_USERS_ASSOC_ID } from './utils/helpers';

/** Runs every 5 minutes; toggles auto-reply on/off per users' schedulers. */
export const SCHEDULER_TICK_PROCESSOR_ID = 'auto-reply-scheduler-tick';
export const SCHEDULER_TICK_INTERVAL = '*/5 * * * *';

const WEEKDAY_BY_INDEX: string[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutesOfDay(hhmm: string | undefined): number | undefined {
    if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return undefined;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
}

/** Local day-of-week/time window check for a scheduler, honoring the user's timezone. */
export function isSchedulerActive(scheduler: IScheduler, timezoneOffsetMinutes: number, now: Date): boolean {
    if (scheduler.type !== SchedulerType.Daily && scheduler.type !== SchedulerType.Weekly) {
        return false;
    }
    const start = minutesOfDay(scheduler.settings.enableTime);
    const end = minutesOfDay(scheduler.settings.disableTime);
    if (start === undefined || end === undefined || start === end) {
        return false;
    }

    const local = new Date(now.getTime() + timezoneOffsetMinutes * 60000);
    const current = local.getUTCHours() * 60 + local.getUTCMinutes();

    if (scheduler.type === SchedulerType.Weekly) {
        const weekdays = scheduler.settings.weekdays ?? [];
        if (weekdays.length === 0 || !weekdays.includes(WEEKDAY_BY_INDEX[local.getUTCDay()])) {
            return false;
        }
    }

    // Overnight windows (disable earlier than enable) wrap around midnight.
    return start < end
        ? current >= start && current < end
        : current >= start || current < end;
}

/**
 * Whether any of the settings' schedulers says auto-reply should be ON now.
 * Returns undefined when the user has no supported scheduler (leave `on` as is).
 */
export function desiredStateFromSchedulers(settings: IAutoReplySettings, now = new Date()): boolean | undefined {
    const supported = (settings.schedulers ?? []).filter((s) => s.type === SchedulerType.Daily || s.type === SchedulerType.Weekly);
    if (supported.length === 0) {
        return undefined;
    }
    const tz = settings.timezoneOffsetMinutes ?? 0;
    return supported.some((scheduler) => isSchedulerActive(scheduler, tz, now));
}

/** Registry of users that have schedulers, so the tick knows what to recompute. */
export async function getSchedulerUserIds(read: IRead): Promise<string[]> {
    const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, SCHEDULER_USERS_ASSOC_ID);
    const records = await read.getPersistenceReader().readByAssociation(assoc);
    return ((records[0] as { userIds?: string[] } | undefined)?.userIds ?? []);
}

export async function syncSchedulerRegistry(userId: string, settings: IAutoReplySettings, persistence: IPersistence, read: IRead): Promise<void> {
    const has = (settings.schedulers ?? []).some((s) => s.type === SchedulerType.Daily || s.type === SchedulerType.Weekly);
    const current = new Set(await getSchedulerUserIds(read));
    const before = current.size;
    if (has) {
        current.add(userId);
    } else {
        current.delete(userId);
    }
    if (current.size === before) {
        return; // registry already up to date
    }
    const assoc = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, SCHEDULER_USERS_ASSOC_ID);
    await persistence.updateByAssociation(assoc, { userIds: Array.from(current) }, true);
}
