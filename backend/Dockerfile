# Build from the repository root:
#   docker build -f backend/Dockerfile .
FROM node:24-alpine

WORKDIR /app

# Install only the backend's own dependencies first for layer caching.
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --no-audit --no-fund

# The backend imports the shared client contract and shared DTOs at runtime.
COPY clients ./clients
COPY shared ./shared
COPY backend ./backend

WORKDIR /app/backend
ENV HOST=0.0.0.0 \
    PORT=8787 \
    DB_PATH=/data/mirror.sqlite \
    MEDIA_DIR=/data/media \
    AUDIT_PATH=/data/audit.jsonl \
    CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8787

CMD ["npm", "start"]
