FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -S pulsechat && adduser -S pulsechat -G pulsechat
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./
USER pulsechat
ENV NODE_ENV=production
ENV PORT=4002
EXPOSE 4002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4002/health || exit 1
CMD ["node", "src/server.js"]
