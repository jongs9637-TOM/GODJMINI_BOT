export type NavKey =
  | 'dashboard'
  | 'content'
  | 'comments'
  | 'analytics'
  | 'activity'
  | 'settings'
  | 'backup'
  | 'connection';

const NAV_ITEMS: { key: NavKey; label: string; href: string }[] = [
  { key: 'dashboard', label: '대시보드', href: '/' },
  { key: 'content', label: '콘텐츠', href: '/content' },
  { key: 'comments', label: '댓글', href: '/comments' },
  { key: 'analytics', label: '성과 분석', href: '/analytics' },
  { key: 'activity', label: '작업 기록', href: '/activity' },
  { key: 'settings', label: '설정', href: '/settings' },
  { key: 'backup', label: '백업', href: '/backup' },
  { key: 'connection', label: 'Threads 연결', href: '/connection' },
];

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderShell(
  active: NavKey,
  headerTitle: string,
  headerSubtitle: string,
  bodyHtml: string,
  automationPaused: boolean
): string {
  const navHtml = NAV_ITEMS.map(item => {
    const isActive = item.key === active;
    return `<a class="nav-item${isActive ? ' active' : ''}" href="${item.href}">${item.label}</a>`;
  }).join('');

  const today = new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const toggleLabel = automationPaused ? '자동화 재개' : '모든 자동화 중지';
  const toggleAction = automationPaused ? 'resume' : 'pause';

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Threads 자동화 봇 · 운영실</title>
<style>
  :root {
    --bg: #f6f2ea;
    --sidebar-bg: #efe9da;
    --card-bg: #ffffff;
    --text: #2b2a26;
    --text-muted: #8a8577;
    --border: #e6e0d0;
    --green-dark: #1f3d2c;
    --green-light-bg: #dcefdc;
    --green-light-text: #1f6b3a;
    --orange: #e2924f;
    --warn-bg: #f6e6c3;
    --danger-bg: #f8dede;
    --danger-text: #a13c3c;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
    display: flex;
    min-height: 100vh;
  }
  .sidebar {
    width: 210px;
    flex-shrink: 0;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    padding: 20px 14px;
    display: flex;
    flex-direction: column;
  }
  .brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 20px; }
  .brand .logo {
    width: 34px; height: 34px; border-radius: 10px; background: var(--orange);
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: .95rem;
  }
  .brand .name { font-weight: 700; font-size: .9rem; line-height: 1.2; }
  .brand .sub { font-size: .68rem; color: var(--text-muted); }
  .nav-item {
    display: block; padding: 9px 12px; margin-bottom: 2px; border-radius: 8px;
    color: var(--text); text-decoration: none; font-size: .85rem;
  }
  .nav-item:hover { background: rgba(0,0,0,.04); }
  .nav-item.active { background: var(--card-bg); font-weight: 700; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  .sidebar-footer {
    margin-top: auto; background: var(--card-bg); border-radius: 10px; padding: 10px 12px;
    font-size: .72rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: ${automationPaused ? '#c98b3f' : '#3f9d5f'}; flex-shrink: 0; }
  .main { flex: 1; padding: 24px 28px; max-width: 1000px; }
  .top-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 12px; flex-wrap: wrap; }
  .top-row .eyebrow { font-size: .72rem; color: var(--text-muted); margin-bottom: 4px; }
  .top-row h1 { font-size: 1.35rem; margin: 0 0 4px; }
  .top-row .date { font-size: .75rem; color: var(--text-muted); }
  .btn {
    border: 1px solid var(--border); background: var(--card-bg); color: var(--text);
    padding: 9px 14px; border-radius: 999px; font-size: .78rem; font-weight: 600; cursor: pointer;
  }
  .btn.danger { background: #fff; color: var(--danger-text); border-color: #eecccc; }
  h2 { font-size: .95rem; margin: 24px 0 10px; }
  .card { background: var(--card-bg); border-radius: 14px; padding: 14px 16px; border: 1px solid var(--border); }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .grid .num { font-size: 1.6rem; font-weight: 700; margin: 2px 0; }
  .grid .label { font-size: .75rem; color: var(--text-muted); }
  .grid .sub { font-size: .68rem; color: var(--text-muted); }
  table { width: 100%; border-collapse: collapse; font-size: .82rem; }
  th { text-align: left; color: var(--text-muted); font-weight: 600; font-size: .72rem; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  td { padding: 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: .7rem; font-weight: 600; }
  .badge.posted { background: var(--green-light-bg); color: var(--green-light-text); }
  .badge.pending { background: var(--warn-bg); color: #8a6a1f; }
  .badge.failed { background: var(--danger-bg); color: var(--danger-text); }
  .empty { color: var(--text-muted); text-align: center; padding: 30px; font-size: .85rem; }
  .content-cell { max-width: 340px; white-space: pre-wrap; word-break: break-word; }
  .stub { padding: 40px 20px; text-align: center; }
  .stub .big { font-size: 2rem; margin-bottom: 8px; }
  .stub p { color: var(--text-muted); font-size: .85rem; max-width: 420px; margin: 6px auto 0; }
  form.inline { display: inline; }
  a.link { color: var(--green-light-text); }
</style>
</head>
<body>
  <div class="sidebar">
    <div class="brand">
      <div class="logo">봇</div>
      <div>
        <div class="name">Threads 자동화</div>
        <div class="sub">콘텐츠 운영실</div>
      </div>
    </div>
    ${navHtml}
    <div class="sidebar-footer">
      <div class="dot"></div>
      <div>자동화 상태<br>${automationPaused ? '일시정지됨' : '정상 작동 중'}</div>
    </div>
  </div>
  <div class="main">
    <div class="top-row">
      <div>
        <div class="eyebrow">오늘의 운영 현황</div>
        <h1>${escapeHtml(headerTitle)}</h1>
        <div class="date">${today} · Asia/Seoul</div>
      </div>
      <form class="inline" method="POST" action="/api/automation/${toggleAction}">
        <button class="btn${automationPaused ? '' : ' danger'}" type="submit">${toggleLabel}</button>
      </form>
    </div>
    <div style="color:var(--text-muted); font-size:.82rem; margin-bottom:10px;">${escapeHtml(headerSubtitle)}</div>
    ${bodyHtml}
  </div>
</body>
</html>`;
}

export function stubPage(icon: string, title: string, message: string): string {
  return `<div class="card stub">
    <div class="big">${icon}</div>
    <h2 style="margin-top:0;">${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
  </div>`;
}
