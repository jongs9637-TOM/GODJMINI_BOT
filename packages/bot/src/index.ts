import * as dotenv from 'dotenv';
import { CronTime } from 'cron';
import { ContentAgent } from './agents/content.agent';
import { PublisherAgent } from './agents/publisher.agent';
import { CommentsAgent } from './agents/comments.agent';
import { TelegramService } from './services/telegram.service';
import { fetchMarketSummary } from './services/market.service';
import {
  supabase,
  testConnection,
  savePost,
  updatePostStatus,
  logActivity,
  updateMissingThreadsPostIds,
} from '../../shared/src/utils/supabase';
import { startDashboardServer } from './server';
import { isAutomationPaused } from './dashboard/state';
import { getSettings, loadSettings } from './dashboard/settings';
import { registerTickHandlers, scheduleJobs } from './scheduler';

dotenv.config({ path: '../../.env' });
dotenv.config({ path: '.env' });

let telegram: TelegramService;
let contentAgent: ContentAgent;
let publisher: PublisherAgent;

async function generateAndSaveContent(force = false) {
  if (!force && isAutomationPaused()) {
    console.log('\n⏸️ 자동화가 일시정지 상태라 이번 실행은 건너뜁니다.');
    return;
  }

  const topics = getSettings().topics;
  const topic = topics[Math.floor(Math.random() * topics.length)];
  console.log(`\n📝 주제: ${topic}`);

  try {
    const content = await contentAgent.generateContent(topic);

    console.log('생성된 콘텐츠:');
    console.log('---');
    console.log(content);
    console.log('---');

    const { data: post, error } = await savePost({
      account_id: 1,
      content: content,
      status: 'pending',
    });

    if (error) throw error;
    await logActivity('1', 'content_generated', String(post.id));

    console.log('✅ 저장 완료, Threads 게시 시도 중...');
    const result = await publisher.publish(content);

    if (result.success) {
      await updatePostStatus(post.id, 'posted', undefined, result.postUrl);
      await logActivity('1', 'threads_posted', String(post.id));
      console.log('✅ Threads 게시 완료');
      await telegram.notifySuccess(`Threads에 게시 완료: "${topic}"`);
    } else {
      await updatePostStatus(post.id, 'failed', result.error);
      await logActivity('1', 'threads_post_failed', String(post.id), result.error);
      console.error(`❌ Threads 게시 실패: ${result.error}`);
      await telegram.notifyError(`Threads 게시 실패: ${result.error}`);
    }
  } catch (error) {
    console.error(`❌ 실패: ${error}`);
    await telegram.notifyError(String(error));
  }
}

async function sendDailyReport() {
  console.log('\n📊 일일 리포트 생성 중...');

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { count: contentCount, error } = await supabase
      .from('threads_posts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString());

    if (error) throw error;

    await telegram.sendDailyReport({
      contentCount: contentCount || 0,
      status: '정상',
    });

    console.log('✅ 일일 리포트 전송 완료');
  } catch (error) {
    console.error('❌ 일일 리포트 실패:', error);
    await telegram.notifyError(`일일 리포트 생성 실패: ${error}`);
  }
}

async function handleMarketCommand() {
  await telegram.sendMessage('📊 시황 조회 중...');
  try {
    const summary = await fetchMarketSummary();
    await telegram.sendMessage(summary);
  } catch (error) {
    await telegram.notifyError(`시황 조회 실패: ${error}`);
  }
}

async function handleStatusCommand() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ count: todayCount }, { count: postedToday }] = await Promise.all([
    supabase
      .from('threads_posts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('threads_posts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'posted')
      .gte('created_at', startOfDay.toISOString()),
  ]);

  const settings = getSettings();
  let nextRun = '알 수 없음';
  try {
    nextRun = new CronTime(settings.contentCronSchedule, settings.cronTimezone)
      .sendAt()
      .toFormat('MM/dd HH:mm');
  } catch {
    // 표시만 실패, 나머지는 계속 보냄
  }

  const paused = isAutomationPaused();
  const lines = [
    `🤖 봇 상태: ${paused ? '⏸️ 일시정지됨' : '✅ 정상 작동 중'}`,
    `다음 게시 예정: ${paused ? '-' : nextRun}`,
    `오늘 생성: ${todayCount ?? 0}개 · 게시 완료: ${postedToday ?? 0}개`,
  ];
  await telegram.sendMessage(lines.join('\n'));
}

async function handleGenerateCommand() {
  await telegram.sendMessage('📝 지금 바로 콘텐츠 생성 & 게시를 시도합니다...');
  await generateAndSaveContent(true);
}

async function main() {
  console.log('🚀 Threads 자동화 Bot 시작...\n');

  try {
    console.log('1️⃣ 환경변수 확인 중...');
    const requiredEnvs = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'CLAUDE_API_KEY',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID',
    ];

    for (const env of requiredEnvs) {
      if (!process.env[env]) {
        throw new Error(`❌ 환경변수 없음: ${env}`);
      }
    }
    console.log('✅ 모든 환경변수 확인 완료\n');

    console.log('2️⃣ Supabase 연결 테스트...');
    const connected = await testConnection();
    if (!connected) {
      throw new Error('❌ Supabase 연결 실패');
    }
    console.log('✅ Supabase 연결 성공\n');

    console.log('3️⃣ Telegram Bot 초기화...');
    telegram = new TelegramService(
      process.env.TELEGRAM_BOT_TOKEN!,
      process.env.TELEGRAM_CHAT_ID!,
      true
    );
    await telegram.notifyStart();
    await logActivity('1', 'bot_start');
    console.log('✅ Telegram Bot 준비 완료\n');

    console.log('4️⃣ ContentAgent 초기화...');
    contentAgent = new ContentAgent(process.env.CLAUDE_API_KEY!);
    publisher = new PublisherAgent();
    console.log('✅ ContentAgent 준비 완료\n');

    console.log('4️⃣-1️⃣ 과거 게시물 threads_post_id 자동 업데이트...');
    try {
      const commentsAgent = new CommentsAgent();
      const posts = await commentsAgent.fetchPostsFromProfile(100);
      if (posts.length > 0) {
        await updateMissingThreadsPostIds(posts);
      } else {
        console.log('ℹ️ 프로필에서 게시물을 찾지 못했습니다.');
      }
    } catch (error) {
      console.warn(`⚠️ 과거 게시물 업데이트 실패: ${error}`);
    }
    console.log('');

    telegram.onCommand('시황', handleMarketCommand);
    telegram.onCommand('상태', handleStatusCommand);
    telegram.onCommand('생성', handleGenerateCommand);
    console.log('✅ 텔레그램 명령어 등록 완료 (/시황, /상태, /생성)\n');

    console.log('5️⃣ 설정 로드 및 스케줄러 등록 중...');
    await loadSettings();
    registerTickHandlers(generateAndSaveContent, sendDailyReport);
    scheduleJobs();
    console.log('');

    startDashboardServer();

    console.log('🎉 Bot이 정상적으로 작동 중입니다. (계속 실행됨)');
  } catch (error) {
    console.error('❌ 치명적 오류:', error);
    process.exit(1);
  }
}

main();