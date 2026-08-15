import { CronJob } from 'cron';
import { getSettings } from './dashboard/settings';

let contentJob: CronJob | undefined;
let reportJob: CronJob | undefined;
let onContentTick: () => void = () => {};
let onReportTick: () => void = () => {};

export function registerTickHandlers(onContent: () => void, onReport: () => void) {
  onContentTick = onContent;
  onReportTick = onReport;
}

export function scheduleJobs() {
  const settings = getSettings();

  contentJob?.stop();
  reportJob?.stop();

  contentJob = CronJob.from({
    cronTime: settings.contentCronSchedule,
    onTick: () => onContentTick(),
    start: true,
    timeZone: settings.cronTimezone,
  });

  reportJob = CronJob.from({
    cronTime: settings.reportCronSchedule,
    onTick: () => onReportTick(),
    start: true,
    timeZone: settings.cronTimezone,
  });

  console.log(`✅ 콘텐츠 생성 스케줄: "${settings.contentCronSchedule}" (${settings.cronTimezone})`);
  console.log(`✅ 일일 리포트 스케줄: "${settings.reportCronSchedule}" (${settings.cronTimezone})`);
}
