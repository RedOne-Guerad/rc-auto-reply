import { IUser } from "@rocket.chat/apps-engine/definition/users";
export enum IReplyFrequency {
    OnEveryMessage = 'On Every Message',
    Once = 'Once',
    OncePerHour = 'Once Per Hour',
    OncePerDay = 'Once Per Day',
    OncePerWeek = 'Once Per Week',
    OncePerMonth = 'Once Per Month',
}
export interface IScheduler {
    enable?: {
        time: Date
    }
    disable?: {
        time: Date
    }
}
export interface IUsersLastReply {
    user: IUser,
    lastMessage: Date,
}
export interface IAutoReplySettings {
    on: boolean;
    message: string;
    users?: IUser[],
    schedulers?: IScheduler,
    usersLastReply?: IUsersLastReply[],
    replyFrequency: string,
  };