FROM node:24.15-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    SLICKK_DATABASE_PATH=/data/slickk.db

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=node:node index.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

RUN mkdir -p /data && chown node:node /data

USER node

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
