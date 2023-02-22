# Rocket.Chat Auto-reply App


## Features

- Automatically send customized messages in response to incoming texts.
- Users can set up personalized auto-responses to ensure that their contacts receive a prompt reply.
- Can exclude users from getting the auto-reply message 


## How to use it

From any direct-message contextual action menu, click auto-reply button:
>![image](https://user-images.githubusercontent.com/29951360/220590790-fe8e20be-4ef4-4903-9341-db014a46bc09.png) 

Enable the app:
>![image](https://user-images.githubusercontent.com/29951360/220591129-e3d5bad5-aec8-4878-9e9b-38f4ba4afb1e.png)

Customize your message and submit:
>![image](https://user-images.githubusercontent.com/29951360/220591361-102a9950-6694-4baa-8875-2009a3474a39.png)

When someone send you a message he will get an auto-reply:
>![image](https://user-images.githubusercontent.com/29951360/220594523-c54ac5d2-98d1-4732-975f-44fca6aa3815.png)

if you texted a user when your auto-reply is enabled, you will get options to disable auto-reply:
>![image](https://user-images.githubusercontent.com/29951360/220594822-f7720df6-5b9b-4473-9b4a-1c3fee83fe3e.png)


## Contributing

You'll need to set up the Rocket.Chat Apps dev environment, please see https://developer.rocket.chat/apps-engine/getting-started

To install the using the command line, you have to turn on the setting `Enable development mode` on the Rocket.Chat server under `Admin > General > Apps`.

Change the values from [.rcappsconfig](.rcappsconfig) to reflect your dev environment.

Then you can clone this repo and then:

```bash
npm install
rc-apps deploy
```

Follow the instructions and when you're done, the app will be installed on your Rocket.Chat server.
