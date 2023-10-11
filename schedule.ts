import { ISchedulerExtend, ISchedulerModify } from '@rocket.chat/apps-engine/definition/accessors';
import { StartupType } from '@rocket.chat/apps-engine/definition/scheduler';

function registerJob(scheduler: ISchedulerExtend, userId: string) {
  const interval = '0 * * * *'; // run every hour
  const jobData = { userId };
  scheduler.registerProcessors([{
    id: 'myJob',
    startupSetting: {
      type: StartupType.RECURRING,
      interval,
      data: jobData,
    },
    processor: async (jobContext, read, modify) => {
      // your job logic here
      console.log(`Running job for user ${jobData.userId}`);
    },
  }]);
}

function unregisterJob(scheduler: ISchedulerModify, jobId: string) {
    // unregister all jobs for the user
    scheduler.cancelJob(jobId);
  }