FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install && npm run prisma:generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache tini
RUN addgroup --system --gid 1001 verix && adduser --system --uid 1001 verix
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma
ENV NODE_ENV=production
USER verix
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/src/server.js"]
