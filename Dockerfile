FROM node:18
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build || echo "Build failed but continuing"
ENV NODE_ENV=production
CMD ["node", "-r", "ts-node/register", "-r", "tsconfig-paths/register", "packages/bot/src/index.ts"]