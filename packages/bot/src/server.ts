import * as http from 'http';
import { logActivity, getPostById, exportAllData, updatePostViews } from '../../shared/src/utils/supabase';
import { renderShell, NavKey } from './dashboard/layout';
import {
  renderDashboardBody,
  renderContentBody,
  renderActivityBody,
  renderConnectionBody,
  renderSettingsBody,
  renderCommentsIndexBody,
  renderCommentsDetailBody,
  renderAnalyticsIndexBody,
  renderAnalyticsDetailBody,
  renderBackupBody,
} from './dashboard/pages';
import { isAutomationPaused, setAutomationPaused } from './dashboard/state';
import { getSettings, saveSettings } from './dashboard/settings';
import { scheduleJobs } from './scheduler';
import { CommentsAgent } from './agents/comments.agent';
import { AnalyticsAgent } from './agents/analytics.agent';

const commentsAgent = new CommentsAgent();
const analyticsAgent = new AnalyticsAgent();

const DASHBOARD_USER = process.env.DASHBOARD_USER;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

function checkAuth(req: http.IncomingMessage): boolean {
  if (!DASHBOARD_USER || !DASHBOARD_PASSWORD) return false;

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) return false;

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
  const separatorIndex = decoded.indexOf(':');
  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  return user === DASHBOARD_USER && pass === DASHBOARD_PASSWORD;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function parseTopicsField(raw: string): string[] {
  return raw
    .split('\n')
    .map(t => t.trim())
    .filter(Boolean);
}

const PAGES: Record<string, { nav: NavKey; title: string; subtitle: string; render: () => Promise<string> | string }> = {
  '/': {
    nav: 'dashboard',
    title: '안녕하세요. 오늘도 자동화 현황을 확인해보세요',
    subtitle: '콘텐츠 생성부터 게시까지의 전체 상태입니다.',
    render: () => renderDashboardBody(isAutomationPaused()),
  },
  '/content': {
    nav: 'content',
    title: '콘텐츠',
    subtitle: '최근 생성된 콘텐츠 50개입니다.',
    render: renderContentBody,
  },
  '/activity': {
    nav: 'activity',
    title: '작업 기록',
    subtitle: '봇이 수행한 주요 작업 로그입니다.',
    render: renderActivityBody,
  },
  '/connection': {
    nav: 'connection',
    title: 'Threads 연결',
    subtitle: '게시에 사용되는 Threads 세션 상태입니다.',
    render: renderConnectionBody,
  },
};

export function startDashboardServer() {
  if (!DASHBOARD_USER || !DASHBOARD_PASSWORD) {
    console.warn(
      '⚠️ DASHBOARD_USER / DASHBOARD_PASSWORD 환경변수가 없어서 대시보드 접근이 항상 차단됩니다. Railway Variables에 추가해주세요.'
    );
  }

  const port = Number(process.env.PORT) || 3000;

  const server = http.createServer(async (req, res) => {
    if (!checkAuth(req)) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="dashboard"',
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end('인증이 필요합니다');
      return;
    }

    const parsedUrl = new URL(req.url || '/', 'http://internal');
    const pathname = parsedUrl.pathname;

    if (req.method === 'POST' && (pathname === '/api/automation/pause' || pathname === '/api/automation/resume')) {
      const paused = pathname === '/api/automation/pause';
      setAutomationPaused(paused);
      await logActivity('1', paused ? 'automation_paused' : 'automation_resumed');
      res.writeHead(303, { Location: '/' });
      res.end();
      return;
    }

    if (pathname === '/settings') {
      try {
        if (req.method === 'POST') {
          const body = await readBody(req);
          const params = new URLSearchParams(body);
          await saveSettings({
            contentCronSchedule: params.get('contentCronSchedule') || getSettings().contentCronSchedule,
            reportCronSchedule: params.get('reportCronSchedule') || getSettings().reportCronSchedule,
            cronTimezone: params.get('cronTimezone') || getSettings().cronTimezone,
            topics: parseTopicsField(params.get('topics') || ''),
          });
          scheduleJobs();
          await logActivity('1', 'settings_updated');
          res.writeHead(303, { Location: '/settings?saved=1' });
          res.end();
          return;
        }

        const saved = parsedUrl.searchParams.get('saved') === '1';
        const body = renderSettingsBody(getSettings(), saved);
        const html = renderShell('settings', '설정', '자동화 스케줄과 주제 목록을 관리합니다.', body, isAutomationPaused());
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`설정 페이지 로딩 실패: ${error}`);
      }
      return;
    }

    if (pathname === '/comments') {
      try {
        const postId = parsedUrl.searchParams.get('postId');
        let body: string;

        if (postId) {
          const { data: post } = await getPostById(Number(postId));
          if (!post || !post.threads_post_id) {
            body = `<div class="card">해당 게시물을 찾을 수 없습니다. <a class="link" href="/comments">목록으로</a></div>`;
          } else {
            const result = await commentsAgent.fetchComments(post.threads_post_id);
            body = renderCommentsDetailBody(post as any, result);
          }
        } else {
          const { data: posts } = await (await import('../../shared/src/utils/supabase')).getPostedThreads(20);
          let postsWithCounts = posts || [];

          if (postsWithCounts.length > 0) {
            postsWithCounts = await Promise.all(
              postsWithCounts.map(async (post: any) => {
                const count = await commentsAgent.fetchCommentCount(post.threads_post_id).catch(() => null);
                return { ...post, commentCount: count };
              })
            );
          }

          body = await renderCommentsIndexBody(postsWithCounts);
        }

        const html = renderShell('comments', '댓글', '실제 게시물에 달린 댓글을 확인합니다 (읽기 전용).', body, isAutomationPaused());
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`댓글 페이지 로딩 실패: ${error}`);
      }
      return;
    }

    if (pathname === '/analytics') {
      try {
        const postId = parsedUrl.searchParams.get('postId');
        let body: string;

        if (postId) {
          const { data: post } = await getPostById(Number(postId));
          if (!post || !post.threads_post_id) {
            body = `<div class="card">해당 게시물을 찾을 수 없습니다. <a class="link" href="/analytics">목록으로</a></div>`;
          } else {
            const result = await analyticsAgent.fetchStats(post.threads_post_id);
            if (result.success && result.stats?.views !== null) {
              await updatePostViews(post.id, result.stats.views);
            }
            body = renderAnalyticsDetailBody(post as any, result);
          }
        } else {
          const { data: posts } = await (await import('../../shared/src/utils/supabase')).getPostedThreads(20);
          let postsWithStats = posts || [];

          if (postsWithStats.length > 0) {
            postsWithStats = await Promise.all(
              postsWithStats.map(async (post: any) => {
                const result = await analyticsAgent.fetchStats(post.threads_post_id).catch(() => ({ success: false, stats: { likes: null, replies: null, reposts: null, views: null } }));
                const stats = result.stats || { likes: null, replies: null, reposts: null, views: null };
                if (result.success && stats.views !== null) {
                  await updatePostViews(post.id, stats.views);
                }
                return { ...post, likes: stats.likes, replies: stats.replies, reposts: stats.reposts, views: stats.views };
              })
            );
          }

          body = await renderAnalyticsIndexBody(postsWithStats);
        }

        const html = renderShell('analytics', '성과 분석', '게시물의 좋아요/답글/리포스트 수를 확인합니다.', body, isAutomationPaused());
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`성과 분석 페이지 로딩 실패: ${error}`);
      }
      return;
    }

    if (pathname === '/backup/download') {
      try {
        const data = await exportAllData();
        const filename = `automation-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.end(JSON.stringify(data, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`백업 생성 실패: ${error}`);
      }
      return;
    }

    if (pathname === '/backup') {
      const html = renderShell('backup', '백업', '전체 데이터를 JSON으로 내보냅니다.', renderBackupBody(), isAutomationPaused());
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const page = PAGES[pathname];
    if (page) {
      try {
        const body = await page.render();
        const html = renderShell(page.nav, page.title, page.subtitle, body, isAutomationPaused());
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`페이지 로딩 실패: ${error}`);
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  server.listen(port, () => {
    console.log(`🌐 대시보드 서버 실행 중: 포트 ${port}`);
  });
}
