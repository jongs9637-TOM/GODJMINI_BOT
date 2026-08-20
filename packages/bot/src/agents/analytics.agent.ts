import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_SESSION_FILE = path.resolve(__dirname, '../../../../threads-session.json');

export interface PostStats {
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  views: number | null;
}

export interface FetchStatsResult {
  success: boolean;
  stats?: PostStats;
  error?: string;
}

export class AnalyticsAgent {
  private getSessionState(): any {
    const encoded = process.env.THREADS_SESSION_STATE;
    if (encoded) {
      return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
    }

    if (fs.existsSync(LOCAL_SESSION_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_SESSION_FILE, 'utf-8'));
    }

    throw new Error(
      '❌ Threads 세션이 없습니다. `npm run threads:login`으로 먼저 로그인해주세요.'
    );
  }

  private parseCount(text: string | null): number | null {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  async fetchStats(postUrl: string): Promise<FetchStatsResult> {
    let browser: import('playwright').Browser | undefined;

    try {
      const storageState = this.getSessionState();
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();

      await page.goto(postUrl, { waitUntil: 'networkidle' });

      const loginPrompt = page.getByText('로그인 또는 가입하기');
      if (await loginPrompt.isVisible({ timeout: 5000 }).catch(() => false)) {
        return {
          success: false,
          error: 'SESSION_EXPIRED: 세션이 만료되었습니다. threads:login으로 다시 로그인해주세요.',
        };
      }

      const likeLabel = await page
        .getByRole('button', { name: /좋아요|Like/i })
        .first()
        .getAttribute('aria-label')
        .catch(() => null);
      const replyLabel = await page
        .getByRole('button', { name: /답글|Repl(y|ies)/i })
        .first()
        .getAttribute('aria-label')
        .catch(() => null);
      const repostLabel = await page
        .getByRole('button', { name: /리포스트|Repost/i })
        .first()
        .getAttribute('aria-label')
        .catch(() => null);

      const viewsText = await page
        .locator('text=/조회수|views/i')
        .first()
        .textContent()
        .catch(() => null);
      const views = viewsText ? this.parseCount(viewsText) : null;

      return {
        success: true,
        stats: {
          likes: this.parseCount(likeLabel),
          replies: this.parseCount(replyLabel),
          reposts: this.parseCount(repostLabel),
          views,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      await browser?.close();
    }
  }
}
