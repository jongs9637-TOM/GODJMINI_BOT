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

  // 게시 직후 새 글의 URL을 찾는다. 정확한 셀렉터가 검증되지 않은 상태라 여러 방법을 순서대로 시도한다.
  private async resolvePostUrl(page: import('playwright').Page): Promise<string | undefined> {
    const currentUrl = page.url();
    if (/\/post\//.test(currentUrl)) {
      return currentUrl;
    }

    const username = process.env.THREADS_USERNAME;
    if (!username) return undefined;

    try {
      await page.waitForTimeout(2000);
      await page.goto(`https://www.threads.com/@${username}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      const firstPostLink = page.locator('a[href*="/post/"]').first();
      const href = await firstPostLink.getAttribute('href', { timeout: 10000 }).catch(() => null);

      if (!href) {
        console.warn('⚠️ postUrl 추출 실패 - 프로필 페이지에서 게시물 링크를 찾을 수 없습니다.');
        return undefined;
      }

      const fullUrl = href.startsWith('http') ? href : `https://www.threads.com${href}`;
      console.log(`✅ postUrl 추출 완료: ${fullUrl}`);
      return fullUrl;
    } catch (error) {
      console.warn(`⚠️ postUrl 추출 중 오류: ${error}`);
      return undefined;
    }
  }
}
