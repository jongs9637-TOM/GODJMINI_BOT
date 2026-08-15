FROM node:22
WORKDIR /app
COPY . .
RUN npm install
RUN npx playwright install --with-deps chromium
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/bot/src/index.js"]