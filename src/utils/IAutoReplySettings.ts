import { IUser } from "@rocket.chat/apps-engine/definition/users";
export enum SchedulerType {
    Yearly = 'Yearly',
    Monthly = 'Monthly',
    Weekly = 'Weekly',
    Daily = 'Daily',
}
export enum IReplyFrequency {
    OnEveryMessage = 'On Every Message',
    Once = 'Once',
    OncePerHour = 'Once Per Hour',
    OncePerDay = 'Once Per Day',
    OncePerWeek = 'Once Per Week',
    OncePerMonth = 'Once Per Month',
}
export interface ISchedulerSettings {
    enableTime?: string,
    disableTime?: string,
    weekdays?: string,
    monthdays?: string,
    yearmonths?: string,
    message?: string
}
export interface IScheduler {
    id: string,
    settings: ISchedulerSettings,
    type: SchedulerType
}
export interface IUsersLastReply {
    user: IUser,
    lastMessage: Date,
}
export interface IAutoReplySettings {
    on: boolean;
    message: string;
    users?: IUser[],
    schedulers?: IScheduler[],
    usersLastReply?: IUsersLastReply[],
    replyFrequency: string,
  };