import * as http from 'http';
import { supabase } from '../../shared/src/utils/supabase';

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function renderDashboard(): Promise<string> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count: todayCount } = await supabase
    .from('threads_posts')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfDay.toISOString());

  const { count: totalCount } = await supabase
    .from('threads_posts')
    .select('*', { count: 'exact', head: true });

  const { data: recentPosts } = await supabase
    .from('threads_posts')
    .select('content, status, created_at')
    .order('created_at', { ascending: false })
    .limit(15);

  const rows = (recentPosts || [])
    .map((post: any) => {
      const raw = post.content || '';
      const full = escapeHtml(raw);
      const time = new Date(post.created_at).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
      });
      const toggle =
        raw.length > 120
          ? `<button class="toggle" onclick="const w=this.parentElement;w.classList.toggle('expanded');this.textContent=w.classList.contains('expanded')?'접기':'더보기'">더보기</button>`
          : '';
      return `<li><div class="time">${time} · ${escapeHtml(post.status)}</div><div class="content-wrap"><div class="content">${full}</div>${toggle}</div></li>`;
    })
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Threads 자동화 Bot</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#0f1115; color:#eee; margin:0; padding:16px; }
  h1 { font-size:1.2rem; margin:0 0 16px; }
  h2 { font-size:1rem; color:#ccc; margin:20px 0 8px; }
  .stats { display:flex; gap:12px; }
  .stat { flex:1; background:#1b1e26; border-radius:12px; padding:14px; text-align:center; }
  .stat .num { font-size:1.8rem; font-weight:700; }
  .stat .label { font-size:.75rem; color:#999; margin-top:4px; }
  ul { list-style:none; padding:0; margin:0; }
  li { background:#1b1e26; border-radius:10px; padding:10px 12px; margin-bottom:8px; }
  .time { font-size:.7rem; color:#8ab4f8; margin-bottom:4px; }
  .content-wrap .content { font-size:.9rem; white-space:pre-wrap; word-break:break-word; max-height:4.8em; overflow:hidden; }
  .content-wrap.expanded .content { max-height:none; }
  .toggle { background:none; border:none; color:#8ab4f8; font-size:.8rem; padding:6px 0 0; margin:0; cursor:pointer; }
  .empty { color:#777; text-align:center; padding:20px; }
</style>
</head>
<body>
  <h1>🤖 Threads 자동화 Bot</h1>
  <div class="stats">
    <div class="stat"><div class="num">${todayCount ?? 0}</div><div class="label">오늘 생성</div></div>
    <div class="stat"><div class="num">${totalCount ?? 0}</div><div class="label">전체 누적</div></div>
  </div>
  <h2>최근 콘텐츠</h2>
  ${rows ? `<ul>${rows}</ul>` : '<div class="empty">아직 생성된 콘텐츠가 없습니다</div>'}
</body>
</html>`;
}

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

    if (req.url === '/' || req.url === '') {
      try {
        const html = await renderDashboard();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`대시보드 로딩 실패: ${error}`);
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
