import { IUser } from "@rocket.chat/apps-engine/definition/users";
export enum SchedulerType {
    Yearly = 'Yearly',
    Monthly = 'Monthly',
    Weekly = 'Weekly',
    Daily = 'Daily',
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
export interface IAutoReplySettings {
    on: boolean;
    message: string;
    users?: IUser[],
    schedulers?: IScheduler[]
  };