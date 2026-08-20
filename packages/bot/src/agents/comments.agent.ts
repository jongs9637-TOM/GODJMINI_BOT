import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_SESSION_FILE = path.resolve(__dirname, '../../../../threads-session.json');

export interface FetchCommentsResult {
  success: boolean;
  comments?: string[];
  error?: string;
}

export interface ThreadsPost {
  url: string;
  timestamp: Date;
}

export class CommentsAgent {
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

  async fetchCommentCount(postUrl: string): Promise<number | null> {
    let browser: import('playwright').Browser | undefined;

    try {
      const storageState = this.getSessionState();
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();

      await page.goto(postUrl, { waitUntil: 'networkidle' });

      const loginPrompt = page.getByText('로그인 또는 가입하기');
      if (await loginPrompt.isVisible({ timeout: 5000 }).catch(() => false)) {
        return null;
      }

      const articles = page.locator('article');
      const count = await articles.count();
      return Math.max(0, count - 1);
    } catch (error) {
      return null;
    } finally {
      await browser?.close();
    }
  }

  async fetchPostsFromProfile(limit: number = 50): Promise<ThreadsPost[]> {
    let browser: import('playwright').Browser | undefined;

    try {
      const storageState = this.getSessionState();
      const username = process.env.THREADS_USERNAME;
      if (!username) return [];

      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();

      await page.goto(`https://www.threads.com/@${username}`, { waitUntil: 'networkidle' });

      const loginPrompt = page.getByText('로그인 또는 가입하기');
      if (await loginPrompt.isVisible({ timeout: 5000 }).catch(() => false)) {
        return [];
      }

      const posts: ThreadsPost[] = [];
      const links = page.locator('a[href*="/post/"]');
      const count = await links.count();

      for (let i = 0; i < Math.min(count, limit); i++) {
        try {
          const href = await links.nth(i).getAttribute('href').catch(() => null);
          if (!href) continue;

          const url = href.startsWith('http') ? href : `https://www.threads.com${href}`;
          posts.push({ url, timestamp: new Date() });
        } catch (e) {
          continue;
        }
      }

      return posts;
    } catch (error) {
      console.warn(`⚠️ 프로필 게시물 조회 실패: ${error}`);
      return [];
    } finally {
      await browser?.close();
    }
  }

  async fetchComments(postUrl: string): Promise<FetchCommentsResult> {
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

      // 원글(첫 번째 article) 다음에 나오는 article들이 댓글(답글)이라고 가정한다.
      const articles = page.locator('article');
      const count = await articles.count();

      const comments: string[] = [];
      for (let i = 1; i < Math.min(count, 21); i++) {
        const text = await articles.nth(i).innerText().catch(() => '');
        if (text.trim()) comments.push(text.trim());
      }

      return { success: true, comments };
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      await browser?.close();
    }
  }
}
