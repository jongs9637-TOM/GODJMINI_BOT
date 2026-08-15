interface YahooQuote {
  price: number;
  prevClose: number;
}

async function fetchYahoo(symbol: string): Promise<YahooQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10d&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!res.ok) return null;

    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta || {};
    let price: number | null = meta.regularMarketPrice ?? null;

    const closes: number[] = (result.indicators?.quote?.[0]?.close || []).filter(
      (c: any) => c != null
    );

    if (price == null && closes.length) price = closes[closes.length - 1];
    if (price == null) return null;

    let prevClose: number | null = null;
    if (closes.length >= 2) {
      const last = closes[closes.length - 1];
      const isToday = Math.abs(last - price) <= Math.max(Math.abs(price) * 0.0001, 1e-9);
      prevClose = isToday ? closes[closes.length - 2] : last;
    } else if (closes.length) {
      prevClose = meta.chartPreviousClose ?? null;
    }

    if (!prevClose) return null;
    return { price, prevClose };
  } catch {
    return null;
  }
}

function arrow(changePercent: number): string {
  if (changePercent > 0.005) return '🔺';
  if (changePercent < -0.005) return '🔻';
  return '➖';
}

function line(label: string, quote: YahooQuote | null, decimals = 2, suffix = ''): string {
  if (!quote) return `${label} —  못 가져옴`;
  const changePercent = ((quote.price - quote.prevClose) / quote.prevClose) * 100;
  const priceStr = quote.price.toLocaleString('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${label} ${priceStr}${suffix}  ${arrow(changePercent)} ${Math.abs(changePercent).toFixed(2)}%`;
}

export async function fetchMarketSummary(): Promise<string> {
  const [kospi, kosdaq, usdKrw, sp500, nasdaq, btc] = await Promise.all([
    fetchYahoo('^KS11'),
    fetchYahoo('^KQ11'),
    fetchYahoo('KRW=X'),
    fetchYahoo('^GSPC'),
    fetchYahoo('^IXIC'),
    fetchYahoo('BTC-KRW'),
  ]);

  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  const lines = [
    `📊 오늘의 시황`,
    `${now} 기준`,
    '',
    '🇰🇷 국내',
    line('코스피', kospi),
    line('코스닥', kosdaq),
    '',
    '🌏 해외 · 환율 · 코인',
    line('S&P500', sp500),
    line('나스닥', nasdaq),
    line('원/달러', usdKrw, 2, '원'),
    btc ? `비트코인 ${(btc.price / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원  ${arrow(((btc.price - btc.prevClose) / btc.prevClose) * 100)} ${Math.abs(((btc.price - btc.prevClose) / btc.prevClose) * 100).toFixed(2)}%` : '비트코인 —  못 가져옴',
    '',
    '장이 열리기 전이면 어제 종가입니다. 지연 시세이며 투자 판단은 본인 책임입니다.',
  ];

  return lines.join('\n');
}
