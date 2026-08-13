import Anthropic from '@anthropic-ai/sdk';

export class ContentAgent {
  private client: Anthropic;
  private model: string = 'claude-sonnet-5';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('❌ Claude API 키가 필요합니다!');
    }
    this.client = new Anthropic({ apiKey });
  }

  async generateContent(topic: string): Promise<string> {
    console.log(`📝 콘텐츠 생성 중: ${topic}`);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `당신은 Threads에서 바이럴되는 한글 콘텐츠 작가입니다.
주제: ${topic}
요구사항:
1. 한글로 작성
2. 1-3개 단락 (짧고 임팩트 있게)
3. 이모지 활용
4. 콜투액션 포함
5. Threads 스타일
콘텐츠를 생성하세요.`,
          },
        ],
      });

      const textBlock = response.content.find(block => block.type === 'text');
      const content = textBlock?.type === 'text' ? textBlock.text : '';

      console.log('✅ 콘텐츠 생성 완료');
      return content;
    } catch (error) {
      console.error('❌ 콘텐츠 생성 실패:', error);
      throw error;
    }
  }

  async generateBatch(
    topics: string[],
    count: number = 3
  ): Promise<string[]> {
    const results: string[] = [];

    for (const topic of topics) {
      for (let i = 0; i < count; i++) {
        try {
          const content = await this.generateContent(topic);
          results.push(content);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`배치 생성 실패:`, error);
        }
      }
    }

    return results;
  }
}