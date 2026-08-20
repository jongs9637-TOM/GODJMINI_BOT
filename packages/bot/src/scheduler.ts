import { CronJob } from 'cron';
import { getSettings } from './dashboard/settings';
import { getAllPostedThreads, updatePostViews } from '../../shared/src/utils/supabase';
import { AnalyticsAgent } from './agents/analytics.agent';

let contentJob: CronJob | undefined;
let reportJob: CronJob | undefined;
let syncStatsJob: CronJob | undefined;
let onContentTick: () => void = () => {};
let onReportTick: () => void = () => {};

export function registerTickHandlers(onContent: () => void, onReport: () => void) {
  onContentTick = onContent;
  onReportTick = onReport;
}

async function syncPostStats() {
  try {
    console.log('🔄 게시물 조회수 동기화 시작...');
    const { data: posts } = await getAllPostedThreads(100);

    if (!posts || posts.length === 0) {
      console.log('📊 동기화할 게시물이 없습니다');
      return;
    }

    const analytics = new AnalyticsAgent();
    let updated = 0;

    for (const post of posts) {
      try {
        const result = await analytics.fetchStats(post.threads_post_id);
        if (result.success && result.stats?.views !== null) {
          await updatePostViews(post.id, result.stats.views);
          updated++;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`⚠️ [${post.id}] 조회수 조회 실패:`, error);
      }
    }

    console.log(`✅ 게시물 조회수 동기화 완료: ${updated}/${posts.length}개 업데이트`);
  } catch (error) {
    console.error('❌ 게시물 조회수 동기화 실패:', error);
  }
}

export function scheduleJobs() {
  const settings = getSettings();

  contentJob?.stop();
  reportJob?.stop();
  syncStatsJob?.stop();

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

  syncStatsJob = CronJob.from({
    cronTime: '0 */6 * * *',
    onTick: () => syncPostStats(),
    start: true,
    timeZone: settings.cronTimezone,
  });

  console.log(`✅ 콘텐츠 생성 스케줄: "${settings.contentCronSchedule}" (${settings.cronTimezone})`);
  console.log(`✅ 일일 리포트 스케줄: "${settings.reportCronSchedule}" (${settings.cronTimezone})`);
  console.log(`✅ 조회수 동기화 스케줄: "0 */6 * * *" 매 6시간마다 (${settings.cronTimezone})`);
}
