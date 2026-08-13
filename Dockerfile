FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install --production=false

COPY . .

RUN npm run build

ENV NODE_ENV=production

CMD ["node", "dist/packages/bot/src/index.js"]