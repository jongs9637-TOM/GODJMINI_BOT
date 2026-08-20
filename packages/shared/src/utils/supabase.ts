import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 없습니다!');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .limit(1);
    
    if (error) throw error;
    console.log('✅ Supabase 연결 성공!');
    return true;
  } catch (error) {
    console.error('❌ Supabase 연결 실패:', error);
    return false;
  }
}

export async function logActivity(
  accountId: string,
  action: string,
  targetId?: string,
  error?: string
) {
  try {
    await supabase.from('activity_logs').insert({
      account_id: accountId,
      action,
      target_id: targetId,
      status: error ? 'failed' : 'success',
      error_message: error,
    });
  } catch (err) {
    console.error('로그 저장 실패:', err);
  }
}

export async function savePost(data: any) {
  return await supabase.from('threads_posts').insert(data).select().single();
}

export async function updatePostStatus(
  id: number,
  status: string,
  errorMessage?: string,
  threadsPostId?: string
) {
  const update: Record<string, any> = { status, error_message: errorMessage };
  if (threadsPostId) update.threads_post_id = threadsPostId;

  return await supabase.from('threads_posts').update(update).eq('id', id);
}

export async function getPostedThreads(limit = 20) {
  return await supabase
    .from('threads_posts')
    .select('id, content, threads_post_id, created_at')
    .eq('status', 'posted')
    .not('threads_post_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function getPostById(id: number) {
  return await supabase.from('threads_posts').select('id, content, threads_post_id').eq('id', id).maybeSingle();
}

export async function updatePostViews(id: number, views: number | null) {
  return await supabase
    .from('threads_posts')
    .update({ views, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function getAllPostedThreads(limit = 100) {
  return await supabase
    .from('threads_posts')
    .select('id, content, threads_post_id, created_at, views')
    .eq('status', 'posted')
    .not('threads_post_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function saveAnalytics(data: any) {
  return await supabase.from('daily_analytics').upsert(data);
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('bot_settings').select('key, value');
  if (error || !data) return {};
  return Object.fromEntries(data.map((row: any) => [row.key, row.value ?? '']));
}

export async function setSetting(key: string, value: string) {
  return await supabase
    .from('bot_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
}

export async function updateMissingThreadsPostIds(postUrls: Array<{ url: string; timestamp?: Date }>) {
  if (postUrls.length === 0) return;

  const { data: missingPosts } = await supabase
    .from('threads_posts')
    .select('id, created_at')
    .eq('status', 'posted')
    .is('threads_post_id', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!missingPosts || missingPosts.length === 0) return;

  let updated = 0;
  for (let i = 0; i < Math.min(missingPosts.length, postUrls.length); i++) {
    const post = missingPosts[i];
    const url = postUrls[i].url;

    const { error } = await supabase
      .from('threads_posts')
      .update({ threads_post_id: url })
      .eq('id', post.id);

    if (!error) {
      updated++;
      console.log(`✅ [${post.id}] threads_post_id 업데이트됨: ${url}`);
    }
  }

  console.log(`📊 총 ${updated}개 게시물의 threads_post_id 업데이트 완료`);
}

export async function exportAllData() {
  const [posts, activity, settings, accounts] = await Promise.all([
    supabase.from('threads_posts').select('*').order('created_at', { ascending: false }),
    supabase.from('activity_logs').select('*').order('created_at', { ascending: false }),
    supabase.from('bot_settings').select('*'),
    supabase.from('accounts').select('*'),
  ]);

  return {
    exported_at: new Date().toISOString(),
    accounts: accounts.data || [],
    threads_posts: posts.data || [],
    activity_logs: activity.data || [],
    bot_settings: settings.data || [],
  };
}