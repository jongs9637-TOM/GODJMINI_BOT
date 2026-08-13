import * as dotenv from 'dotenv';
import { ContentAgent } from './agents/content.agent';
import { TelegramService } from './services/telegram.service';
import { supabase, testConnection, savePost } from '../../shared/src/utils/supabase';

dotenv.config({ path: '../../.env' });
dotenv.config({ path: '.env' });

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
    const telegram = new TelegramService(
      process.env.TELEGRAM_BOT_TOKEN!,
      process.env.TELEGRAM_CHAT_ID!
    );
    await telegram.notifyStart();
    console.log('✅ Telegram Bot 준비 완료\n');

    console.log('4️⃣ ContentAgent 초기화...');
    const contentAgent = new ContentAgent(process.env.CLAUDE_API_KEY!);
    console.log('✅ ContentAgent 준비 완료\n');

    console.log('5️⃣ 콘텐츠 생성 테스트...');
    const testTopics = [
      'Threads 자동화 봇',
      'AI 시대의 효율성',
      '하루 100개 포스팅',
    ];

    for (const topic of testTopics) {
      console.log(`\n📝 주제: ${topic}`);
      
      try {
        const content = await contentAgent.generateContent(topic);
        
        console.log('생성된 콘텐츠:');
        console.log('---');
        console.log(content);
        console.log('---');

        const { error } = await savePost({
          account_id: 1,
          content: content,
          status: 'pending',
        });

        if (error) throw error;

        console.log('✅ 저장 완료');

        await telegram.notifySuccess(`콘텐츠 생성 완료: "${topic}"`);

        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ 실패: ${error}`);
        await telegram.notifyError(String(error));
      }
    }

    console.log('\n✅ 모든 테스트 완료!');
    console.log('🎉 Bot이 정상적으로 작동합니다!');

  } catch (error) {
    console.error('❌ 치명적 오류:', error);
    process.exit(1);
  }
}

main();