FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build || true

ENV NODE_ENV=production

CMD ["npx", "ts-node", "--transpile-only", "packages/bot/src/index.ts"]