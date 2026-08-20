import { getAllPostedThreads, updatePostViews } from '../../../shared/src/utils/supabase';
import { AnalyticsAgent } from '../agents/analytics.agent';

const analytics = new AnalyticsAgent();

async function syncAllViews() {
  try {
    console.log('🚀 모든 게시물의 조회수 동기화 시작...\n');

    let offset = 0;
    const limit = 50;
    let totalProcessed = 0;
    let totalUpdated = 0;

    while (true) {
      const { data: posts } = await getAllPostedThreads(limit);

      if (!posts || posts.length === 0) {
        console.log('📊 모든 게시물 처리 완료!\n');
        break;
      }

      console.log(`📥 ${offset + 1}~${offset + posts.length}번 게시물 처리 중...\n`);

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        try {
          const result = await analytics.fetchStats(post.threads_post_id);

          if (result.success && result.stats?.views !== null) {
            await updatePostViews(post.id, result.stats.views);
            totalUpdated++;
            console.log(`  ✅ [${post.id}] 조회수: ${result.stats.views.toLocaleString()}`);
          } else {
            console.log(`  ⚠️  [${post.id}] 조회수 조회 실패 - ${result.error}`);
          }

          totalProcessed++;

          if (i < posts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        } catch (error) {
          console.error(`  ❌ [${post.id}] 오류:`, String(error).slice(0, 100));
          totalProcessed++;
        }
      }

      offset += posts.length;
      console.log(`\n진행률: ${totalProcessed}개 처리 (${totalUpdated}개 업데이트)\n`);

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n🎉 동기화 완료!`);
    console.log(`   총 처리: ${totalProcessed}개`);
    console.log(`   업데이트: ${totalUpdated}개`);
  } catch (error) {
    console.error('❌ 동기화 중 오류:', error);
    process.exit(1);
  }
}

syncAllViews().then(() => {
  console.log('\n✨ 프로세스 종료');
  process.exit(0);
});
