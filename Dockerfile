FROM node:18-alpine

WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci

# 코드 복사
COPY . .

# TypeScript 컴파일
RUN npm run build 2>/dev/null || true

# 환경변수 로드 및 실행
CMD ["node", "-r", "dotenv/config", "packages/bot/src/index.ts"]