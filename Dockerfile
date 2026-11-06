# ---- Derleme aşaması ----
FROM node:26-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Derleme sırasında gerçek sırlar gerekmez; şema doğrulaması için geçici değerler
ENV APP_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
RUN npx next typegen && npm run build

# ---- Çalışma aşaması ----
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
# standalone çıktı + statik dosyalar + migrasyonlar + betikler
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
COPY --from=builder --chown=app:app /app/scripts ./scripts
COPY --from=builder --chown=app:app /app/src/db ./src/db
COPY --from=builder --chown=app:app /app/src/lib ./src/lib
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./package.json
RUN mkdir -p /app/data && chown app:app /app/data
USER app
EXPOSE 3000
# Önce migrasyon, sonra sunucu
CMD ["sh", "-c", "node --import ./scripts/lib/register.mjs --import tsx scripts/migrate.ts && node server.js"]
