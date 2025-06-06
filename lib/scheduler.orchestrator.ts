import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { CronCallback, CronJob, CronJobParams } from 'cron';
import { v4 } from 'uuid';
import { CronOptions } from './decorators/cron.decorator';
import { SchedulerRegistry } from './scheduler.registry';
import * as Sentry from '@sentry/node';

type TargetHost = { target: Function };
type TimeoutHost = { timeout: number };
type RefHost<T> = { ref?: T };

type CronOptionsHost = {
  options: CronOptions & Record<'cronTime', CronJobParams['cronTime']>;
};

type IntervalOptions = TargetHost & TimeoutHost & RefHost<number>;
type TimeoutOptions = TargetHost & TimeoutHost & RefHost<number>;
type CronJobOptions = TargetHost & CronOptionsHost & RefHost<CronJob>;

@Injectable()
export class SchedulerOrchestrator
  implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly cronJobs: Record<string, CronJobOptions> = {};
  private readonly timeouts: Record<string, TimeoutOptions> = {};
  private readonly intervals: Record<string, IntervalOptions> = {};

  constructor(private readonly schedulerRegistry: SchedulerRegistry) { }

  onApplicationBootstrap() {
    this.mountTimeouts();
    this.mountIntervals();
    this.mountCron();
  }

  onApplicationShutdown() {
    this.clearTimeouts();
    this.clearIntervals();
    this.closeCronJobs();
  }

  mountIntervals() {
    const intervalKeys = Object.keys(this.intervals);
    intervalKeys.forEach((key) => {
      const options = this.intervals[key];
      const intervalRef = setInterval(options.target, options.timeout);

      options.ref = intervalRef;
      this.schedulerRegistry.addInterval(key, intervalRef);
    });
  }

  mountTimeouts() {
    const timeoutKeys = Object.keys(this.timeouts);
    timeoutKeys.forEach((key) => {
      const options = this.timeouts[key];
      const timeoutRef = setTimeout(options.target, options.timeout);

      options.ref = timeoutRef;
      this.schedulerRegistry.addTimeout(key, timeoutRef);
    });
  }

  mountCron() {
    const cronKeys = Object.keys(this.cronJobs);
    cronKeys.forEach((key) => {
      const { options, target } = this.cronJobs[key];
      const CronJobWithCheckIn = Sentry.cron.instrumentCron(CronJob as any, key);
      const cronJob = CronJobWithCheckIn.from({
        ...options,
        onTick: target as CronCallback<null, false>,
        start: !options.disabled
      });

      this.cronJobs[key].ref = cronJob;
      this.schedulerRegistry.addCronJob(key, cronJob);
    });
  }

  clearTimeouts() {
    this.schedulerRegistry.getTimeouts().forEach((key) =>
      this.schedulerRegistry.deleteTimeout(key),
    );
  }

  clearIntervals() {
    this.schedulerRegistry.getIntervals().forEach((key) =>
      this.schedulerRegistry.deleteInterval(key),
    );
  }

  closeCronJobs() {
    Array.from(this.schedulerRegistry.getCronJobs().keys()).forEach((key) =>
      this.schedulerRegistry.deleteCronJob(key),
    );
  }

  addTimeout(methodRef: Function, timeout: number, name: string = v4()) {
    this.timeouts[name] = {
      target: methodRef,
      timeout,
    };
  }

  addInterval(methodRef: Function, timeout: number, name: string = v4()) {
    this.intervals[name] = {
      target: methodRef,
      timeout,
    };
  }

  addCron(
    methodRef: Function,
    options: CronOptions & Record<'cronTime', CronJobParams['cronTime']>,
  ) {
    const name = options.name || v4();
    this.cronJobs[name] = {
      target: methodRef,
      options,
    };
  }
}
