import { chromium } from 'playwright';
import * as path from 'path';

const SESSION_FILE = path.resolve(__dirname, '../../../../threads-session.json');

async function waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', () => resolve());
  });
}

async function main() {
  console.log('🌐 브라우저를 엽니다.');
  console.log('열리는 창에서 본인 계정으로 직접 로그인해주세요 (2단계 인증이 뜨면 직접 처리해주세요).');
  console.log('로그인이 끝나고 Threads 홈 피드가 보이면, 이 터미널로 돌아와서 Enter를 눌러주세요.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.threads.com/login');

  console.log('로그인 완료 후 Enter >');
  await waitForEnter();

  await context.storageState({ path: SESSION_FILE });
  console.log(`\n✅ 세션 저장 완료: ${SESSION_FILE}`);
  console.log('\n이 파일을 base64로 인코딩해서 Railway의 THREADS_SESSION_STATE 환경변수에 붙여넣어주세요.');
  console.log('PowerShell에서 클립보드로 바로 복사하려면:\n');
  console.log(
    '  [Convert]::ToBase64String([IO.File]::ReadAllBytes("threads-session.json")) | Set-Clipboard'
  );

  await browser.close();
  process.exit(0);
}

main();
