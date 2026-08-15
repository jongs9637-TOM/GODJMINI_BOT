import { CronTime } from 'cron';
import { supabase } from '../../../shared/src/utils/supabase';
import { escapeHtml, stubPage } from './layout';
import { BotSettings } from './settings';

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

  const [{ count: todayCount }, { count: totalCount }, { count: postedToday }, { count: failedToday }, { data: recentPosts }] =
    await Promise.all([
      supabase.from('threads_posts').select('*', { count: 'exact', head: true }).gte('created_at', startOfDay.toISOString()),
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
      supabase.from('threads_posts').select('content, status, created_at').order('created_at', { ascending: false }).limit(10),
    ]);

  let nextRun = '알 수 없음';
  try {
    const schedule = process.env.CONTENT_CRON_SCHEDULE || '0 9,14,20 * * *';
    const tz = process.env.CRON_TIMEZONE || 'Asia/Seoul';
    nextRun = new CronTime(schedule, tz).sendAt().toFormat('MM/dd HH:mm');
  } catch {
    // 표시만 실패, 나머지 대시보드는 계속 렌더링
  }

  const hasSession = !!process.env.THREADS_SESSION_STATE;

  const statusHtml = automationPaused
    ? `<div class="card" style="background:var(--warn-bg); border:none;">
         <div style="font-size:.72rem; color:#8a6a1f;">가장 중요한 상태</div>
         <div style="font-weight:700; font-size:1.05rem; margin:2px 0 4px;">자동화 일시정지됨</div>
         <div style="font-size:.8rem; color:#8a6a1f;">사이드바 또는 상단 버튼으로 재개할 수 있습니다.</div>
       </div>`
    : `<div class="card" style="background:var(--green-dark); color:#fff; border:none;">
         <div style="font-size:.72rem; color:#cfe6d6;">가장 중요한 상태</div>
         <div style="font-weight:700; font-size:1.05rem; margin:2px 0 4px;">자동화 정상 작동 · ${hasSession ? 'Threads 세션 등록됨' : 'Threads 세션 미등록'}</div>
         <div style="font-size:.8rem; color:#cfe6d6;">다음 게시 예정: ${nextRun}</div>
       </div>`;

  const rows = (recentPosts || [])
    .map(
      (post: any) =>
        `<tr><td class="content-cell">${escapeHtml((post.content || '').slice(0, 80))}${(post.content || '').length > 80 ? '…' : ''}</td><td>${statusBadge(post.status)}</td><td>${formatTime(post.created_at)}</td></tr>`
    )
    .join('');

  return `
    ${statusHtml}
    <h2>오늘의 지표</h2>
    <div class="grid">
      <div class="card"><div class="label">오늘 만든 콘텐츠</div><div class="num">${todayCount ?? 0}</div><div class="sub">전체 ${totalCount ?? 0}개</div></div>
      <div class="card"><div class="label">오늘 게시 완료</div><div class="num">${postedToday ?? 0}</div><div class="sub">실패 ${failedToday ?? 0}개</div></div>
      <div class="card"><div class="label">다음 게시 예정</div><div class="num" style="font-size:1.1rem;">${nextRun}</div><div class="sub">${escapeHtml(process.env.CONTENT_CRON_SCHEDULE || '0 9,14,20 * * *')}</div></div>
    </div>
    <h2>최근 게시물</h2>
    <div class="card" style="padding:0; overflow:hidden;">
      ${
        rows
          ? `<table><thead><tr><th>내용</th><th>상태</th><th>시간</th></tr></thead><tbody>${rows}</tbody></table>`
          : '<div class="empty">아직 생성된 콘텐츠가 없습니다</div>'
      }
    </div>`;
}

export async function renderContentBody(): Promise<string> {
  const { data: posts } = await supabase
    .from('threads_posts')
    .select('id, content, status, created_at, error_message')
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (posts || [])
    .map(
      (post: any) => `<tr>
        <td class="content-cell">${escapeHtml(post.content || '')}</td>
        <td>${statusBadge(post.status)}${post.error_message ? `<div style="color:var(--danger-text); font-size:.68rem; margin-top:4px;">${escapeHtml(post.error_message.slice(0, 100))}</div>` : ''}</td>
        <td>${formatTime(post.created_at)}</td>
      </tr>`
    )
    .join('');

  return `<div class="card" style="padding:0; overflow:hidden;">
    ${
      rows
        ? `<table><thead><tr><th>내용</th><th>상태</th><th>생성 시각</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="empty">아직 생성된 콘텐츠가 없습니다</div>'
    }
  </div>`;
}

export async function renderActivityBody(): Promise<string> {
  const { data: logs } = await supabase
    .from('activity_logs')
    .select('action, status, target_id, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (logs || [])
    .map(
      (log: any) => `<tr>
        <td>${escapeHtml(log.action)}</td>
        <td>${log.status === 'failed' ? '<span class="badge failed">실패</span>' : '<span class="badge posted">성공</span>'}</td>
        <td class="content-cell">${log.error_message ? escapeHtml(log.error_message.slice(0, 120)) : '-'}</td>
        <td>${formatTime(log.created_at)}</td>
      </tr>`
    )
    .join('');

  return `<div class="card" style="padding:0; overflow:hidden;">
    ${
      rows
        ? `<table><thead><tr><th>작업</th><th>결과</th><th>비고</th><th>시각</th></tr></thead><tbody>${rows}</tbody></table>`
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

  return `<div class="card">
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
      <div class="dot" style="background:${hasSession ? '#3f9d5f' : '#c9433f'};"></div>
      <div style="font-weight:700;">${hasSession ? 'Threads 세션 등록됨' : 'Threads 세션 없음'}</div>
    </div>
    <div style="font-size:.8rem; color:var(--text-muted); line-height:1.8;">
      세션은 <code>npm run threads:login</code>으로 로컬에서 한 번 로그인해서 만들고,
      Railway 환경변수 <code>THREADS_SESSION_STATE</code>로 등록합니다. 세션이 만료되면 게시가 실패하고
      아래 "마지막 실패"에 사유가 표시됩니다.
    </div>
  </div>
  <h2>마지막 게시 성공</h2>
  <div class="card">${lastPosted ? formatTime(lastPosted.created_at) : '<span style="color:var(--text-muted)">아직 없음</span>'}</div>
  <h2>마지막 게시 실패</h2>
  <div class="card">${
    lastFailed
      ? `${formatTime(lastFailed.created_at)}<div style="color:var(--danger-text); font-size:.8rem; margin-top:4px;">${escapeHtml((lastFailed.error_message || '').slice(0, 200))}</div>`
      : '<span style="color:var(--text-muted)">아직 없음</span>'
  }</div>`;
}

export function commentsStub(): string {
  return stubPage('💬', '댓글 관리 (준비 중)', 'Threads 댓글을 가져오고 자동으로 답글을 다는 기능은 아직 구현되지 않았습니다.');
}

export function analyticsStub(): string {
  return stubPage(
    '📊',
    '성과 분석 (준비 중)',
    '조회수·좋아요 같은 실제 인사이트는 Meta의 공식 Threads API 연동이 필요해서 아직 붙어있지 않습니다.'
  );
}

export function renderSettingsBody(settings: BotSettings, saved: boolean): string {
  const field = (label: string, name: string, value: string, hint?: string) => `
    <div class="card" style="margin-bottom:14px;">
      <label style="font-size:.8rem; font-weight:600; display:block; margin-bottom:6px;">${escapeHtml(label)}</label>
      <input name="${name}" value="${escapeHtml(value)}" style="width:100%; padding:9px; border-radius:8px; border:1px solid var(--border); font-size:.85rem; font-family:inherit;">
      ${hint ? `<div style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(hint)}</div>` : ''}
    </div>`;

  return `
    ${
      saved
        ? `<div class="card" style="background:var(--green-light-bg); color:var(--green-light-text); margin-bottom:14px; font-weight:600;">✅ 저장되었습니다. 스케줄에 즉시 반영됩니다.</div>`
        : ''
    }
    <form method="POST" action="/settings">
      ${field('콘텐츠 생성/게시 주기 (cron 표현식)', 'contentCronSchedule', settings.contentCronSchedule, '예: 0 9,14,20 * * * (매일 9시/14시/20시)')}
      ${field('일일 리포트 시각 (cron 표현식)', 'reportCronSchedule', settings.reportCronSchedule, '예: 0 21 * * * (매일 21시)')}
      ${field('타임존', 'cronTimezone', settings.cronTimezone)}
      <div class="card" style="margin-bottom:14px;">
        <label style="font-size:.8rem; font-weight:600; display:block; margin-bottom:6px;">주제 목록 (한 줄에 하나씩)</label>
        <textarea name="topics" rows="6" style="width:100%; padding:9px; border-radius:8px; border:1px solid var(--border); font-size:.85rem; font-family:inherit;">${escapeHtml(settings.topics.join('\n'))}</textarea>
        <div style="font-size:.7rem; color:var(--text-muted); margin-top:4px;">매 실행마다 이 목록에서 무작위로 하나를 골라 콘텐츠를 생성합니다.</div>
      </div>
      <button class="btn" type="submit" style="background:var(--green-dark); color:#fff; border:none;">저장</button>
    </form>`;
}

export function backupStub(): string {
  return stubPage('🗄️', '백업 (준비 중)', '별도 백업 기능은 아직 없습니다. 데이터는 Supabase에 저장되어 있습니다.');
}
