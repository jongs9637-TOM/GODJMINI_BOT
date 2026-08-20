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
    --orange-light: #f5d4b8;
    --warn-bg: #f6e6c3;
    --danger-bg: #f8dede;
    --danger-text: #a13c3c;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1918;
      --sidebar-bg: #25231f;
      --card-bg: #2d2b27;
      --text: #e8e6e1;
      --text-muted: #a9a39a;
      --border: #403d37;
      --green-dark: #2d5a42;
      --green-light-bg: #1f3d2c;
      --green-light-text: #6fd986;
      --orange: #d98745;
      --orange-light: #4d3d2f;
      --warn-bg: #3d3426;
      --danger-bg: #3d2424;
      --danger-text: #f08080;
    }
  }

  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    background: var(--bg);
    color: var(--text);
    display: flex;
    min-height: 100vh;
    line-height: 1.5;
    letter-spacing: -0.3px;
  }

  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
  }

  .brand { display: flex; align-items: center; gap: 12px; padding: 4px 8px 24px; }
  .brand .logo {
    width: 40px; height: 40px; border-radius: 12px; background: var(--orange);
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 1.1rem; flex-shrink: 0;
  }
  .brand .name { font-weight: 700; font-size: .95rem; line-height: 1.3; }
  .brand .sub { font-size: .7rem; color: var(--text-muted); }

  .nav-section { margin-bottom: 24px; }
  .nav-section-label { font-size: .65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); padding: 8px 12px 8px; letter-spacing: 0.5px; }

  .nav-item {
    display: block; padding: 10px 12px; margin-bottom: 4px; border-radius: 8px;
    color: var(--text); text-decoration: none; font-size: .88rem; font-weight: 500;
    transition: all 150ms ease; cursor: pointer;
  }
  .nav-item:hover { background: rgba(0,0,0,.08); transform: translateX(2px); }
  .nav-item.active {
    background: var(--orange-light); color: var(--text); font-weight: 600;
    box-shadow: inset 0 0 0 1px rgba(226, 146, 79, 0.3);
  }

  .sidebar-footer {
    margin-top: auto; background: var(--card-bg); border-radius: 10px; padding: 12px;
    font-size: .75rem; color: var(--text-muted); display: flex; align-items: center; gap: 10px;
  }
  .dot {
    width: 8px; height: 8px; border-radius: 50%; background: ${automationPaused ? '#c98b3f' : '#3f9d5f'};
    flex-shrink: 0; box-shadow: 0 0 8px ${automationPaused ? 'rgba(201,139,63,0.4)' : 'rgba(63,157,95,0.4)'};
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .main {
    flex: 1; padding: 32px 40px; max-width: 1200px; overflow-y: auto;
  }

  .top-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; gap: 16px; flex-wrap: wrap; }
  .top-row .eyebrow { font-size: .75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .top-row h1 { font-size: 1.8rem; margin: 0 0 4px; font-weight: 700; letter-spacing: -0.5px; }
  .top-row .date { font-size: .8rem; color: var(--text-muted); }

  .btn {
    border: 1px solid var(--border); background: var(--card-bg); color: var(--text);
    padding: 10px 16px; border-radius: 8px; font-size: .8rem; font-weight: 600; cursor: pointer;
    transition: all 150ms ease;
  }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,.1); }
  .btn:active { transform: translateY(0); }
  .btn.danger { background: var(--card-bg); color: var(--danger-text); border-color: var(--danger-bg); }
  .btn.danger:hover { background: var(--danger-bg); }

  h2 { font-size: 1.05rem; font-weight: 700; margin: 32px 0 16px; letter-spacing: -0.3px; }
  h2:first-of-type { margin-top: 0; }

  .card {
    background: var(--card-bg); border-radius: 12px; padding: 16px 18px;
    border: 1px solid var(--border); transition: all 200ms ease;
  }
  .card:hover { border-color: var(--orange); box-shadow: 0 2px 8px rgba(226,146,79,.08); }

  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
  .grid .num { font-size: 2rem; font-weight: 700; margin: 4px 0; letter-spacing: -0.5px; }
  .grid .label { font-size: .8rem; color: var(--text-muted); font-weight: 600; }
  .grid .sub { font-size: .75rem; color: var(--text-muted); margin-top: 2px; }

  table { width: 100%; border-collapse: collapse; font-size: .85rem; }
  thead { background: var(--sidebar-bg); }
  th { text-align: left; color: var(--text-muted); font-weight: 600; font-size: .75rem; padding: 10px 12px; text-transform: uppercase; letter-spacing: 0.3px; }
  td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tbody tr:hover { background: var(--orange-light); }

  .badge {
    display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: .72rem; font-weight: 600;
  }
  .badge.posted { background: var(--green-light-bg); color: var(--green-light-text); }
  .badge.pending { background: var(--warn-bg); color: #8a6a1f; }
  .badge.failed { background: var(--danger-bg); color: var(--danger-text); }

  .empty { color: var(--text-muted); text-align: center; padding: 40px 20px; font-size: .9rem; }
  .content-cell { max-width: 380px; white-space: pre-wrap; word-break: break-word; }

  .stub { padding: 48px 20px; text-align: center; }
  .stub .big { font-size: 3rem; margin-bottom: 12px; }
  .stub p { color: var(--text-muted); font-size: .9rem; max-width: 480px; margin: 8px auto 0; line-height: 1.6; }

  form.inline { display: inline; }
  a.link { color: var(--green-light-text); text-decoration: none; font-weight: 500; transition: all 150ms ease; }
  a.link:hover { opacity: 0.8; text-decoration: underline; }

  @media (max-width: 768px) {
    body { flex-direction: column; }
    .sidebar { width: 100%; padding: 16px 12px; flex-direction: row; align-items: center; }
    .brand { padding: 0; }
    .nav-item, .nav-section-label { display: none; }
    .sidebar-footer { flex: 1; margin: 0 0 0 auto; }
    .main { padding: 20px 16px; max-width: 100%; }
    .top-row h1 { font-size: 1.4rem; }
    .grid { grid-template-columns: 1fr; }
    table { font-size: .75rem; }
    th, td { padding: 8px 10px; }
  }
</style>
</head>
<body>
  <div class="sidebar">
    <div class="brand">
      <div class="logo">🤖</div>
      <div>
        <div class="name">Threads Bot</div>
        <div class="sub">Dashboard</div>
      </div>
    </div>
    <div style="flex:1;"></div>
    <div class="nav-section" style="display:none;">
      <div class="nav-section-label">Main</div>
      ${navHtml}
    </div>
    <div class="sidebar-footer">
      <div class="dot"></div>
      <div>
        <div style="font-weight:600;">자동화</div>
        <div>${automationPaused ? '일시정지' : '정상'}</div>
      </div>
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
    <div style="color:var(--text-muted); font-size:.85rem; margin-bottom:16px;">${escapeHtml(headerSubtitle)}</div>
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
