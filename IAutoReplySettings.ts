import { IUser } from "@rocket.chat/apps-engine/definition/users";

export interface IAutoReplySettings {
    on: boolean;
    message: string | 'Hey, I received your message and will get back to you as soon as possible.';
    users?: IUser[] | undefined;
  };