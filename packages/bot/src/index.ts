import * as dotenv from 'dotenv';
import { ContentAgent } from './agents/content.agent';
import { PublisherAgent } from './agents/publisher.agent';
import { TelegramService } from './services/telegram.service';
import {
  supabase,
  testConnection,
  savePost,
  updatePostStatus,
  logActivity,
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

async function generateAndSaveContent() {
  if (isAutomationPaused()) {
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
      await updatePostStatus(post.id, 'posted');
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
      process.env.TELEGRAM_CHAT_ID!
    );
    await telegram.notifyStart();
    await logActivity('1', 'bot_start');
    console.log('✅ Telegram Bot 준비 완료\n');

    console.log('4️⃣ ContentAgent 초기화...');
    contentAgent = new ContentAgent(process.env.CLAUDE_API_KEY!);
    publisher = new PublisherAgent();
    console.log('✅ ContentAgent 준비 완료\n');

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