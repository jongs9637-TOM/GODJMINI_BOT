FROM node:22
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
ENV NODE_ENV=production
CMD ["node", "dist/bot/src/index.js"]