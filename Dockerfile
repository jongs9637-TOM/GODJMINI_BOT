FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production

CMD ["npx", "ts-node", "--transpile-only", "packages/bot/src/index.ts"]