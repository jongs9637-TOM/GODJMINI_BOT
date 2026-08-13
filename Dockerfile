FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build 2>/dev/null || true

ENV NODE_ENV=production

CMD ["npx", "ts-node", "--transpile-only", "--skip-project", "packages/bot/src/index.ts"]