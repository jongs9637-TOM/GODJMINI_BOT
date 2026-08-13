import TelegramBot from 'node-telegram-bot-api';

export class TelegramService {
  private bot: TelegramBot;
  private chatId: string;

  constructor(botToken: string, chatId: string) {
    if (!botToken || !chatId) {
      throw new Error('❌ Telegram 토큰이나 Chat ID가 없습니다!');
    }
    this.bot = new TelegramBot(botToken, { polling: false });
    this.chatId = chatId;
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