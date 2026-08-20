import { CronTime } from 'cron';
import { supabase, getPostedThreads } from '../../../shared/src/utils/supabase';
import { escapeHtml, stubPage } from './layout';
import { BotSettings } from './settings';
import { FetchCommentsResult } from '../agents/comments.agent';
import { FetchStatsResult, AnalyticsAgent } from '../agents/analytics.agent';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function statusBadge(status: string): string {
  const known = ['posted', 'pending', 'failed'];
  const cls = known.includes(status) ? status : 'pending';
  const label: Record<string, string> = {
    posted: '게시 완료',
    pending: '대기 중',
    failed: '실패',
  };
  return `<span class="badge ${cls}">${label[cls] || escapeHtml(status)}</span>`;
}

export async function renderDashboardBody(automationPaused: boolean): Promise<string> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(startOfDay);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    { count: todayCount },
    { count: totalCount },
    { count: postedToday },
    { count: failedToday },
    { data: recentPosts },
    { data: recentStats },
    { data: activityLogs },
  ] = await Promise.all([
    supabase
      .from('threads_posts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString()),
    supabase.from('threads_posts').select('*', { count: 'exact', head: true }),
    supabase
      .from('threads_posts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'posted')
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('threads_posts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('threads_posts')
      .select('id, content, status, created_at, likes, replies, reposts, threads_post_id')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('threads_posts')
      .select('created_at, likes, replies, reposts')
      .eq('status', 'posted')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true }),
    supabase
      .from('activity_logs')
      .select('action, status, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  let nextRun = '알 수 없음';
  try {
    const schedule = process.env.CONTENT_CRON_SCHEDULE || '0 9,14,20 * * *';
    const tz = process.env.CRON_TIMEZONE || 'Asia/Seoul';
    nextRun = new CronTime(schedule, tz).sendAt().toFormat('MM/dd HH:mm');
  } catch {
    // fallback
  }

  const hasSession = !!process.env.THREADS_SESSION_STATE;

  // 실시간 성과 + 조회수 조회 (각 게시물)
  let postsWithStats = recentPosts || [];
  if (postsWithStats.length > 0 && hasSession) {
    const analytics = new AnalyticsAgent();
    const statsPromises = postsWithStats.map(async (post: any) => {
      if (!post.threads_post_id) return post;
      try {
        const result = await analytics.fetchStats(post.threads_post_id);
        return {
          ...post,
          likes: result.success && result.stats ? result.stats.likes : post.likes,
          replies: result.success && result.stats ? result.stats.replies : post.replies,
          reposts: result.success && result.stats ? result.stats.reposts : post.reposts,
          views: result.success && result.stats ? result.stats.views : null,
        };
      } catch {
        return post;
      }
    });
    postsWithStats = await Promise.all(statsPromises);
  }

  const statusHtml = automationPaused
    ? `<div class="card" style="background:var(--warn-bg); border:1px solid #e6d9a8; padding:18px;">
         <div style="font-size:.75rem; font-weight:700; color:#8a6a1f; text-transform:uppercase; letter-spacing:0.3px; margin-bottom:6px;">⚠️ 상태 알림</div>
         <div style="font-weight:700; font-size:1.1rem; margin:0 0 6px;">자동화가 일시정지되었습니다</div>
         <div style="font-size:.85rem; color:#8a6a1f; line-height:1.5;">상단의 [자동화 재개] 버튼을 클릭하면 다시 시작됩니다.</div>
       </div>`
    : `<div class="card" style="background:linear-gradient(135deg, var(--green-dark), #2d5a42); color:#fff; border:none; padding:18px;">
         <div style="font-size:.75rem; font-weight:700; color:#cfe6d6; text-transform:uppercase; letter-spacing:0.3px; margin-bottom:6px;">✨ 현재 상태</div>
         <div style="font-weight:700; font-size:1.15rem; margin:0 0 8px;">자동화 정상 작동 중</div>
         <div style="display:flex; gap:16px; font-size:.85rem; color:#cfe6d6; line-height:1.6;">
           <div>
             <div style="opacity:.7;">세션 상태</div>
             <div style="font-weight:600;">${hasSession ? '✓ 등록됨' : '✗ 미등록'}</div>
           </div>
           <div>
             <div style="opacity:.7;">다음 게시</div>
             <div style="font-weight:600;">${nextRun}</div>
           </div>
         </div>
       </div>`;

  const totalLikes = (recentStats || []).reduce((s, p: any) => s + (p.likes || 0), 0);
  const totalReplies = (recentStats || []).reduce((s, p: any) => s + (p.replies || 0), 0);
  const totalReposts = (recentStats || []).reduce((s, p: any) => s + (p.reposts || 0), 0);

  const formatNumber = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toString();

  const postRows = (postsWithStats || [])
    .map(
      (post: any) =>
        `<tr>
          <td class="content-cell">${escapeHtml((post.content || '').slice(0, 60))}${(post.content || '').length > 60 ? '…' : ''}</td>
          <td style="text-align:center; font-weight:600; color:var(--orange);">👁 ${formatNumber(post.views)}</td>
          <td style="text-align:center; font-weight:600; color:var(--orange);">⭐ ${formatNumber(post.likes)}</td>
          <td style="text-align:center; font-weight:600;">💬 ${formatNumber(post.replies)}</td>
          <td style="text-align:center; font-weight:600;">🔄 ${formatNumber(post.reposts)}</td>
          <td>${statusBadge(post.status)}</td>
          <td style="font-size:.8rem;">${new Date(post.created_at).toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}</td>
          <td><a class="link" href="/analytics?postId=${post.id}">상세</a></td>
        </tr>`
    )
    .join('');

  const activityHtml = (activityLogs || [])
    .map((log: any) => {
      const statusIcon = log.status === 'failed' ? '❌' : '✅';
      const action = log.action;
      const time = new Date(log.created_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
      const ago = Math.round((Date.now() - new Date(log.created_at).getTime()) / 60000);
      const timeLabel = ago < 1 ? '방금' : ago < 60 ? ago + '분 전' : Math.round(ago / 60) + '시간 전';

      return `<div style="display:flex; gap:12px; padding:12px 0; border-bottom:1px solid var(--border);">
        <div style="font-size:1.2rem; flex-shrink:0;">${statusIcon}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:.85rem; font-weight:600; margin-bottom:2px;">${escapeHtml(action)}</div>
          <div style="font-size:.75rem; color:var(--text-muted);">${timeLabel}</div>
          ${log.error_message ? `<div style="font-size:.75rem; color:var(--danger-text); margin-top:4px;">${escapeHtml(log.error_message.slice(0, 80))}</div>` : ''}
        </div>
      </div>`;
    })
    .join('');

  return `
    ${statusHtml}

    <h2>📊 핵심 지표</h2>
    <div class="grid">
      <div class="card">
        <div class="label">📝 오늘 생성</div>
        <div class="num">${todayCount ?? 0}</div>
        <div class="sub">누적 ${totalCount ?? 0}개</div>
      </div>
      <div class="card">
        <div class="label">✅ 게시 완료</div>
        <div class="num">${postedToday ?? 0}</div>
        <div class="sub">실패 ${failedToday ?? 0}개</div>
      </div>
      <div class="card">
        <div class="label">⭐ 7일 반응</div>
        <div class="num">${formatNumber(totalLikes)}</div>
        <div class="sub">좋아요 · ${formatNumber(totalReplies)} 댓글</div>
      </div>
    </div>

    <h2>🚀 최근 게시물 · 실시간 성과</h2>
    <div class="card" style="padding:0; overflow-x:auto;">
      ${
        postRows
          ? `<table><thead><tr><th>내용</th><th>👁 조회</th><th>⭐ 좋아요</th><th>💬 댓글</th><th>🔄 리포스트</th><th>상태</th><th>시간</th><th></th></tr></thead><tbody>${postRows}</tbody></table>`
          : '<div class="empty">아직 게시물이 없습니다</div>'
      }
    </div>

    <h2>📋 최근 작업 기록</h2>
    <div class="card" style="padding:16px;">
      ${activityHtml || '<div class="empty" style="padding:20px;">아직 기록이 없습니다</div>'}
    </div>

    <h2>⚡ 빠른 액션</h2>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:14px;">
      <div class="card" style="text-align:center; padding:18px; cursor:pointer; transition:all 200ms;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'" onclick="window.location='/content'">
        <div style="font-size:2rem; margin-bottom:8px;">📝</div>
        <div style="font-size:.85rem; font-weight:600;">콘텐츠 관리</div>
        <div style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">모든 게시물 보기</div>
      </div>
      <div class="card" style="text-align:center; padding:18px; cursor:pointer; transition:all 200ms;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'" onclick="window.location='/comments'">
        <div style="font-size:2rem; margin-bottom:8px;">💬</div>
        <div style="font-size:.85rem; font-weight:600;">댓글 분석</div>
        <div style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">반응 확인하기</div>
      </div>
      <div class="card" style="text-align:center; padding:18px; cursor:pointer; transition:all 200ms;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'" onclick="window.location='/analytics'">
        <div style="font-size:2rem; margin-bottom:8px;">📊</div>
        <div style="font-size:.85rem; font-weight:600;">상세 분석</div>
        <div style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">통계 보기</div>
      </div>
      <div class="card" style="text-align:center; padding:18px; cursor:pointer; transition:all 200ms;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'" onclick="window.location='/settings'">
        <div style="font-size:2rem; margin-bottom:8px;">⚙️</div>
        <div style="font-size:.85rem; font-weight:600;">스케줄 설정</div>
        <div style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">시간 변경</div>
      </div>
    </div>`;
}

export async function renderContentBody(): Promise<string> {
  const { data: posts } = await supabase
    .from('threads_posts')
    .select('id, content, status, created_at, error_message')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (posts || [])
    .map(
      (post: any) => `<tr>
        <td class="content-cell"><span style="font-weight:500;">${escapeHtml((post.content || '').slice(0, 100))}</span>${(post.content || '').length > 100 ? '…' : ''}</td>
        <td>${statusBadge(post.status)}</td>
        <td style="font-size:.8rem; color:var(--text-muted);">${formatTime(post.created_at)}</td>
        ${post.error_message ? `<td style="font-size:.75rem; color:var(--danger-text);">${escapeHtml(post.error_message.slice(0, 50))}</td>` : '<td></td>'}
      </tr>`
    )
    .join('');

  return `<div class="card" style="padding:0; overflow-x:auto;">
    ${
      rows
        ? `<table><thead><tr><th>내용</th><th>상태</th><th>생성 시각</th><th>오류</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="empty">아직 생성된 콘텐츠가 없습니다</div>'
    }
  </div>`;
}

export async function renderActivityBody(): Promise<string> {
  const { data: logs } = await supabase
    .from('activity_logs')
    .select('action, status, target_id, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (logs || [])
    .map(
      (log: any) => `<tr>
        <td style="font-weight:500;">${escapeHtml(log.action)}</td>
        <td>${log.status === 'failed' ? '<span class="badge failed">실패</span>' : '<span class="badge posted">성공</span>'}</td>
        <td class="content-cell" style="font-size:.8rem; color:var(--text-muted);">${log.error_message ? escapeHtml(log.error_message.slice(0, 100)) : '—'}</td>
        <td style="font-size:.8rem; color:var(--text-muted);">${formatTime(log.created_at)}</td>
      </tr>`
    )
    .join('');

  return `<div class="card" style="padding:0; overflow-x:auto;">
    ${
      rows
        ? `<table><thead><tr><th>작업</th><th>결과</th><th>상세</th><th>시각</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="empty">아직 기록된 작업이 없습니다</div>'
    }
  </div>`;
}

export async function renderConnectionBody(): Promise<string> {
  const hasSession = !!process.env.THREADS_SESSION_STATE;

  const { data: lastPosted } = await supabase
    .from('threads_posts')
    .select('created_at')
    .eq('status', 'posted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastFailed } = await supabase
    .from('threads_posts')
    .select('created_at, error_message')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return `<div class="card" style="background:${hasSession ? 'linear-gradient(135deg, var(--green-light-bg), rgba(31,107,58,0.1))' : 'linear-gradient(135deg, var(--danger-bg), rgba(241,128,128,0.1))}; border:1px solid ${hasSession ? 'var(--green-light-bg)' : 'var(--danger-bg)'}; padding:18px; margin-bottom:18px;">
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
      <div style="font-size:1.4rem;">${hasSession ? '🟢' : '🔴'}</div>
      <div>
        <div style="font-weight:700; font-size:.95rem; color:${hasSession ? 'var(--green-light-text)' : 'var(--danger-text)'};">${hasSession ? 'Threads 세션 연결됨' : 'Threads 세션 미연결'}</div>
        <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">${hasSession ? '자동 게시 준비 완료' : '세션이 필요합니다'}</div>
      </div>
    </div>
  </div>

  <div class="card" style="background:var(--sidebar-bg); padding:14px; margin-bottom:18px; border-radius:10px;">
    <div style="font-size:.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:8px;">📋 연결 방법</div>
    <div style="font-size:.8rem; line-height:1.8; color:var(--text); font-family:monospace;">
      <div style="margin-bottom:8px;">1️⃣ 로컬에서 로그인:</div>
      <div style="background:var(--card-bg); padding:8px 10px; border-radius:6px; margin-bottom:10px; overflow-x:auto;"><code>npm run threads:login</code></div>

      <div style="margin-bottom:8px;">2️⃣ 생성된 세션을 복사해서</div>
      <div style="background:var(--card-bg); padding:8px 10px; border-radius:6px; margin-bottom:10px; overflow-x:auto;"><code>THREADS_SESSION_STATE</code> 환경변수에 설정</div>

      <div style="margin-bottom:8px;">3️⃣ Railway 배포 후 자동 게시 시작</div>
    </div>
  </div>

  <h2 style="margin-top:0;">📊 연결 상태</h2>
  <div class="grid">
    <div class="card">
      <div class="label">✅ 마지막 성공</div>
      <div style="font-size:1rem; font-weight:600; color:var(--green-light-text); margin:6px 0;">${lastPosted ? new Date(lastPosted.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }) : '아직 없음'}</div>
    </div>
    <div class="card">
      <div class="label">❌ 마지막 실패</div>
      <div style="font-size:.85rem; color:var(--text); margin:6px 0;">
        ${
          lastFailed
            ? `
              <div style="font-weight:600; margin-bottom:4px;">${new Date(lastFailed.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })}</div>
              <div style="font-size:.75rem; color:var(--danger-text); line-height:1.4;">${escapeHtml((lastFailed.error_message || '').slice(0, 120))}</div>
            `
            : '없음'
        }
      </div>
    </div>
  </div>`;
}

export async function renderCommentsIndexBody(postsWithCounts?: Array<{id: number; content: string; created_at: string; commentCount?: number | null}>): Promise<string> {
  let posts = postsWithCounts;

  if (!posts) {
    const { data } = await getPostedThreads(30);
    posts = data || [];
  }

  if (!posts || posts.length === 0) {
    return stubPage(
      '💬',
      '아직 볼 수 있는 게시물이 없습니다',
      '실제로 게시된 글이 있어야 댓글을 가져올 수 있습니다. 첫 게시가 완료되면 여기 목록이 채워집니다.'
    );
  }

  const rows = posts
    .map(
      (post: any) => `<tr>
        <td class="content-cell"><span style="font-weight:500;">${escapeHtml((post.content || '').slice(0, 80))}</span>${(post.content || '').length > 80 ? '…' : ''}</td>
        <td style="text-align:center; font-weight:600; font-size:1rem;">💬 ${post.commentCount !== undefined ? post.commentCount : '?'}</td>
        <td style="font-size:.8rem; color:var(--text-muted);">${formatTime(post.created_at)}</td>
        <td><a class="link" href="/comments?postId=${post.id}">보기 →</a></td>
      </tr>`
    )
    .join('');

  return `<div class="card" style="padding:0; overflow-x:auto;">
    <table><thead><tr><th>내용</th><th>💬 댓글</th><th>게시 시각</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

export function renderCommentsDetailBody(
  post: { id: number; content: string; threads_post_id: string },
  result: FetchCommentsResult
): string {
  const back = `<a class="link" href="/comments">← 목록으로</a>`;

  if (!result.success) {
    return `<div style="margin-bottom:12px;">${back}</div>
      <div class="card" style="background:var(--danger-bg); color:var(--danger-text);">
        댓글을 가져오지 못했습니다.<br><span style="font-size:.8rem;">${escapeHtml(result.error || '알 수 없는 오류')}</span>
      </div>`;
  }

  const comments = result.comments || [];
  const list = comments
    .map(c => `<li class="card" style="margin-bottom:8px; white-space:pre-wrap; font-size:.85rem;">${escapeHtml(c)}</li>`)
    .join('');

  return `<div style="margin-bottom:12px;">${back}</div>
    <div class="card" style="margin-bottom:14px;">
      <div style="font-size:.72rem; color:var(--text-muted); margin-bottom:4px;">원글</div>
      <div style="white-space:pre-wrap; font-size:.85rem;">${escapeHtml(post.content)}</div>
    </div>
    <h2>댓글 ${comments.length}개</h2>
    ${comments.length > 0 ? `<ul style="list-style:none; padding:0; margin:0;">${list}</ul>` : '<div class="empty">댓글이 없습니다</div>'}`;
}

export async function renderAnalyticsIndexBody(postsWithStats?: Array<{id: number; content: string; created_at: string; likes?: number | null; replies?: number | null; reposts?: number | null}>): Promise<string> {
  let posts = postsWithStats;

  if (!posts) {
    const { data } = await getPostedThreads(30);
    posts = data || [];
  }

  if (!posts || posts.length === 0) {
    return stubPage(
      '📊',
      '아직 볼 수 있는 게시물이 없습니다',
      '실제로 게시된 글이 있어야 성과를 확인할 수 있습니다. 첫 게시가 완료되면 여기 목록이 채워집니다.'
    );
  }

  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '0' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n.toString());
  const totalLikes = posts.reduce((s: number, p: any) => s + (p.likes || 0), 0);
  const totalReplies = posts.reduce((s: number, p: any) => s + (p.replies || 0), 0);
  const totalReposts = posts.reduce((s: number, p: any) => s + (p.reposts || 0), 0);
  const avgLikes = posts.length > 0 ? Math.round(totalLikes / posts.length) : 0;

  const rows = posts
    .map(
      (post: any) => `<tr>
        <td class="content-cell"><span style="font-weight:500;">${escapeHtml((post.content || '').slice(0, 80))}</span>${(post.content || '').length > 80 ? '…' : ''}</td>
        <td style="text-align:center; font-weight:600; color:var(--orange);">⭐ ${fmt(post.likes)}</td>
        <td style="text-align:center; font-weight:600;">💬 ${fmt(post.replies)}</td>
        <td style="text-align:center; font-weight:600;">🔄 ${fmt(post.reposts)}</td>
        <td style="font-size:.8rem; color:var(--text-muted);">${formatTime(post.created_at)}</td>
        <td><a class="link" href="/analytics?postId=${post.id}">상세</a></td>
      </tr>`
    )
    .join('');

  return `
    <div class="card" style="background:var(--warn-bg); margin-bottom:16px; font-size:.8rem; color:#8a6a1f; padding:14px;">
      ⚠️ <strong>주의:</strong> Threads 공식 API 대신 화면 읽기 방식을 사용하므로 숫자가 정확하지 않을 수 있습니다.
    </div>

    <h2 style="margin-top:0;">📈 성과 요약</h2>
    <div class="grid">
      <div class="card">
        <div class="label">총 좋아요</div>
        <div class="num" style="color:var(--orange);">${fmt(totalLikes)}</div>
        <div class="sub">평균 ${avgLikes}개</div>
      </div>
      <div class="card">
        <div class="label">총 댓글</div>
        <div class="num">${fmt(totalReplies)}</div>
        <div class="sub">반응도</div>
      </div>
      <div class="card">
        <div class="label">총 리포스트</div>
        <div class="num">${fmt(totalReposts)}</div>
        <div class="sub">도달도</div>
      </div>
    </div>

    <h2>📊 게시물별 성과</h2>
    <div class="card" style="padding:0; overflow-x:auto;">
      <table><thead><tr><th>내용</th><th>⭐ 좋아요</th><th>💬 댓글</th><th>🔄 리포스트</th><th>게시 시각</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

export function renderAnalyticsDetailBody(
  post: { id: number; content: string; threads_post_id: string },
  result: FetchStatsResult
): string {
  const back = `<a class="link" href="/analytics">← 목록으로</a>`;

  if (!result.success) {
    return `<div style="margin-bottom:12px;">${back}</div>
      <div class="card" style="background:var(--danger-bg); color:var(--danger-text);">
        통계를 가져오지 못했습니다.<br><span style="font-size:.8rem;">${escapeHtml(result.error || '알 수 없는 오류')}</span>
      </div>`;
  }

  const stats = result.stats || { likes: null, replies: null, reposts: null };
  const fmt = (n: number | null) => (n === null ? '?' : n.toLocaleString('ko-KR'));

  return `<div style="margin-bottom:12px;">${back}</div>
    <div class="card" style="margin-bottom:14px;">
      <div style="font-size:.72rem; color:var(--text-muted); margin-bottom:4px;">원글</div>
      <div style="white-space:pre-wrap; font-size:.85rem;">${escapeHtml(post.content)}</div>
    </div>
    <div class="grid">
      <div class="card"><div class="label">좋아요</div><div class="num">${fmt(stats.likes)}</div></div>
      <div class="card"><div class="label">답글</div><div class="num">${fmt(stats.replies)}</div></div>
      <div class="card"><div class="label">리포스트</div><div class="num">${fmt(stats.reposts)}</div></div>
    </div>`;
}

export function renderSettingsBody(settings: BotSettings, saved: boolean): string {
  const field = (label: string, name: string, value: string, hint?: string) => `
    <div class="card" style="margin-bottom:16px;">
      <label style="font-size:.8rem; font-weight:700; display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted);">${escapeHtml(label)}</label>
      <input name="${name}" value="${escapeHtml(value)}" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border); font-size:.85rem; font-family:inherit; background:var(--card-bg); color:var(--text); transition:all 150ms;">
      ${hint ? `<div style="font-size:.75rem; color:var(--text-muted); margin-top:6px; line-height:1.5;">${escapeHtml(hint)}</div>` : ''}
    </div>`;

  return `
    ${
      saved
        ? `<div class="card" style="background:var(--green-light-bg); color:var(--green-light-text); margin-bottom:18px; font-weight:600; padding:14px;">✅ 저장되었습니다! 다음 스케줄부터 적용됩니다.</div>`
        : ''
    }
    <form method="POST" action="/settings">
      <h2 style="margin-top:0;">⏰ 게시 스케줄</h2>
      ${field('콘텐츠 생성/게시 주기', 'contentCronSchedule', settings.contentCronSchedule, '예: 0 9,14,20 * * * → 매일 9시/14시/20시 (cron 표현식 사용)')}
      ${field('일일 리포트 시각', 'reportCronSchedule', settings.reportCronSchedule, '예: 0 21 * * * → 매일 21시 (cron 표현식 사용)')}
      ${field('타임존', 'cronTimezone', settings.cronTimezone, '기본값: Asia/Seoul')}

      <h2>📝 콘텐츠 주제</h2>
      <div class="card" style="margin-bottom:14px;">
        <label style="font-size:.8rem; font-weight:700; display:block; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.3px; color:var(--text-muted);">주제 목록 (한 줄에 하나씩)</label>
        <textarea name="topics" rows="6" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border); font-size:.85rem; font-family:monospace; background:var(--card-bg); color:var(--text);">${escapeHtml(settings.topics.join('\n'))}</textarea>
        <div style="font-size:.75rem; color:var(--text-muted); margin-top:6px; line-height:1.5;">매번 콘텐츠 생성 시 이 목록에서 무작위로 선택됩니다. 다양한 주제를 추가하면 더 풍부한 콘텐츠가 생성됩니다.</div>
      </div>

      <button class="btn" type="submit" style="background:var(--green-dark); color:#fff; border:none; padding:12px 24px; font-size:.9rem; font-weight:700;">저장하기</button>
    </form>`;
}

export function renderBackupBody(): string {
  return `
    <div class="card" style="background:linear-gradient(135deg, var(--orange-light), rgba(226,146,79,0.1)); border:1px solid var(--orange); padding:18px; margin-bottom:18px;">
      <div style="font-size:.75rem; font-weight:700; color:var(--orange); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:6px;">💾 데이터 보호</div>
      <div style="font-weight:700; font-size:1.05rem; margin-bottom:8px;">언제든지 모든 데이터를 다운로드하세요</div>
      <div style="font-size:.85rem; color:var(--text); line-height:1.6; margin-bottom:14px;">
        콘텐츠, 작업 기록, 설정, 성과 통계를 하나의 JSON 파일로 받을 수 있습니다.
        Supabase 자체 백업과 독립적으로, 필요한 순간 스냅샷을 만들어 두세요.
      </div>
      <a class="btn" style="background:var(--orange); color:#fff; border:none; text-decoration:none; display:inline-block; padding:10px 18px; font-weight:700;" href="/backup/download">📥 지금 다운로드</a>
    </div>

    <div class="card">
      <div style="font-size:.75rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:8px;">📋 백업 정보</div>
      <div style="font-size:.85rem; color:var(--text-muted); line-height:1.7;">
        • 파일 형식: JSON (모든 프로그램에서 열 수 있음)<br>
        • 포함 내용: 게시물, 댓글, 통계, 작업 기록, 설정 전체<br>
        • 정기 백업: Supabase에서 자동 관리<br>
        • 수동 백업: 위 버튼으로 원할 때마다 다운로드 가능
      </div>
    </div>`;
}
