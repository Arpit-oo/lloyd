# Lloyd: brand-aware campaign agent. One Node process (Next.js) with SQLite on a volume.
#
#   docker compose up --build        then open http://localhost:3000
#
# The brand folder and the data directory are mounted at runtime (see docker-compose.yml),
# so the image holds no brand content, no API keys and no campaign data.

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Toolchain for better-sqlite3, in case no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BRAND_DIR=/brand \
    DATA_DIR=/app/data
# Dev dependencies stay in, so the CLI scripts work inside the container too:
#   docker compose run --rm lloyd npm run ingest
COPY --from=build /app /app
RUN mkdir -p /app/data /app/logs && chown -R node:node /app/data /app/logs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/models').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
