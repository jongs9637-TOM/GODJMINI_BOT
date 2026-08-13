FROM node:18-alpine

WORKDIR /app

# 의존성 먼저 설치
COPY package*.json ./
RUN npm ci

# 코드 복사
COPY . .

# 빌드
RUN npm run build 2>/dev/null || true

ENV NODE_ENV=production

# 실행
CMD ["npx", "ts-node", "--transpile-only", "packages/bot/src/index.ts"]