import { getAllSettings, setSetting } from '../../../shared/src/utils/supabase';

export interface BotSettings {
  contentCronSchedule: string;
  reportCronSchedule: string;
  cronTimezone: string;
  topics: string[];
}

const DEFAULTS: BotSettings = {
  contentCronSchedule: process.env.CONTENT_CRON_SCHEDULE || '0 9,14,20 * * *',
  reportCronSchedule: process.env.REPORT_CRON_SCHEDULE || '0 21 * * *',
  cronTimezone: process.env.CRON_TIMEZONE || 'Asia/Seoul',
  topics: ['Threads 자동화 봇', 'AI 시대의 효율성', '하루 100개 포스팅'],
};

let current: BotSettings = { ...DEFAULTS };

export function getSettings(): BotSettings {
  return current;
}

function parseTopics(raw: string): string[] {
  const list = raw
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULTS.topics;
}

export async function loadSettings(): Promise<BotSettings> {
  const raw = await getAllSettings();
  current = {
    contentCronSchedule: raw.content_cron_schedule || DEFAULTS.contentCronSchedule,
    reportCronSchedule: raw.report_cron_schedule || DEFAULTS.reportCronSchedule,
    cronTimezone: raw.cron_timezone || DEFAULTS.cronTimezone,
    topics: raw.topics ? parseTopics(raw.topics) : DEFAULTS.topics,
  };
  return current;
}

export async function saveSettings(next: BotSettings): Promise<BotSettings> {
  current = { ...next, topics: next.topics.length > 0 ? next.topics : DEFAULTS.topics };

  await Promise.all([
    setSetting('content_cron_schedule', current.contentCronSchedule),
    setSetting('report_cron_schedule', current.reportCronSchedule),
    setSetting('cron_timezone', current.cronTimezone),
    setSetting('topics', current.topics.join('\n')),
  ]);

  return current;
}
