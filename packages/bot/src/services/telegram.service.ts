import TelegramBot from 'node-telegram-bot-api';

export class TelegramService {
  private bot: TelegramBot;
  private chatId: string;

  constructor(botToken: string, chatId: string, enablePolling = false) {
    if (!botToken || !chatId) {
      throw new Error('❌ Telegram 토큰이나 Chat ID가 없습니다!');
    }
    this.bot = enablePolling
      ? new TelegramBot(botToken, { polling: true })
      : new TelegramBot(botToken, { polling: false });
    this.chatId = chatId;

    if (enablePolling) {
      this.bot.on('polling_error', error => {
        console.error('❌ Telegram polling 오류:', error);
      });
    }
  }

  // 등록한 명령어를 처리. 보안을 위해 설정된 chatId에서 온 메시지만 반응한다.
  onCommand(command: string, handler: () => Promise<void> | void): void {
    this.bot.onText(new RegExp(`^/${command}(@\\S+)?\\s*$`), async msg => {
      if (String(msg.chat.id) !== this.chatId) {
        console.warn(`⚠️ 알 수 없는 chat(${msg.chat.id})에서 /${command} 시도 - 무시함`);
        return;
      }
      try {
        await handler();
      } catch (error) {
        console.error(`❌ /${command} 처리 중 오류:`, error);
        await this.sendMessage(`⚠️ /${command} 처리 중 오류가 발생했습니다: ${error}`);
      }
    });
  }

  async sendMessage(message: string): Promise<void> {
    try {
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'Markdown',
      });
      console.log('📱 Telegram 메시지 전송 완료');
    } catch (error) {
      console.error('❌ Telegram 메시지 전송 실패:', error);
    }
  }

  async notifyStart(): Promise<void> {
    await this.sendMessage('🤖 Bot이 시작되었습니다!');
  }

  async notifyError(error: string): Promise<void> {
    await this.sendMessage(`⚠️ 에러 발생:\n\`\`\`\n${error}\n\`\`\``);
  }

  async notifySuccess(message: string): Promise<void> {
    await this.sendMessage(`✅ ${message}`);
  }

  async sendDailyReport(stats: any): Promise<void> {
    const report = `📊 일일 리포트 (${new Date().toLocaleDateString('ko-KR')})
📝 생성된 콘텐츠: ${stats.contentCount || 0}
📤 포스팅된 게시물: ${stats.postCount || 0}
❤️ 좋아요: ${stats.likes || 0}
💬 댓글: ${stats.comments || 0}
👥 새 팔로워: ${stats.newFollowers || 0}
상태: ${stats.status || '정상'}`;
    await this.sendMessage(report);
  }
}