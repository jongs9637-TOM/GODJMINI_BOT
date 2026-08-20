import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_SESSION_FILE = path.resolve(__dirname, '../../../../threads-session.json');

export interface PublishResult {
  success: boolean;
  postUrl?: string;
  error?: string;
}

export class PublisherAgent {
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

  async publish(content: string): Promise<PublishResult> {
    let browser: import('playwright').Browser | undefined;

    try {
      const storageState = this.getSessionState();
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();

      await page.goto('https://www.threads.com/', { waitUntil: 'networkidle' });

      const loginPrompt = page.getByText('로그인 또는 가입하기');
      if (await loginPrompt.isVisible({ timeout: 5000 }).catch(() => false)) {
        return {
          success: false,
          error: 'SESSION_EXPIRED: 세션이 만료되었습니다. threads:login으로 다시 로그인해주세요.',
        };
      }

      const composeButton = page
        .getByRole('button', { name: /새로운 스레드|New thread/i })
        .first();
      await composeButton.click({ timeout: 10000 });

      const textbox = page.getByRole('textbox').first();
      await textbox.fill(content);

      const postButton = page.getByRole('button', { name: /게시|^Post$/i }).last();
      await postButton.click({ timeout: 10000 });

      await page.waitForTimeout(3000);

      const postUrl = await this.resolvePostUrl(page);

      return { success: true, postUrl };
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      await browser?.close();
    }
  }

  // 게시 직후 새 글의 URL을 찾는다.
  private async resolvePostUrl(page: import('playwright').Page): Promise<string | undefined> {
    try {
      // 방법 1: 현재 페이지 URL이 이미 /post/인 경우
      const currentUrl = page.url();
      if (/\/post\//.test(currentUrl)) {
        console.log(`✅ postUrl: ${currentUrl}`);
        return currentUrl;
      }

      const username = process.env.THREADS_USERNAME;
      if (!username) {
        console.warn('⚠️ THREADS_USERNAME 없음');
        return undefined;
      }

      // 방법 2: 프로필 페이지 방문 + 새로고침
      console.log('🔍 프로필에서 게시물 URL 찾는 중...');
      await page.goto(`https://www.threads.com/@${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // 모든 링크를 가져온 후 /post/ 포함한 첫 번째 반환
      const allLinks = await page.locator('a').all();
      console.log(`📍 발견한 링크 개수: ${allLinks.length}`);

      for (const link of allLinks) {
        try {
          const href = await link.getAttribute('href').catch(() => null);
          if (href && href.includes('/post/')) {
            const fullUrl = href.startsWith('http') ? href : `https://www.threads.com${href}`;
            console.log(`✅ postUrl 찾음: ${fullUrl}`);
            return fullUrl;
          }
        } catch (e) {
          continue;
        }
      }

      console.warn('⚠️ /post/를 포함한 링크를 찾지 못했습니다.');
      return undefined;
    } catch (error) {
      console.error(`❌ postUrl 추출 오류: ${error}`);
      return undefined;
    }
  }
}
