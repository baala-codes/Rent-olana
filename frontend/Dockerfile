# Build from the repository root:
#   docker build -f frontend/Dockerfile --build-arg VITE_API_URL=http://localhost:8787 .
FROM node:24-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY clients ./clients
COPY shared ./shared
RUN cd frontend && npm ci --no-audit --no-fund

COPY frontend ./frontend
ARG VITE_API_URL=http://localhost:8787
ENV VITE_API_URL=${VITE_API_URL}
RUN cd frontend && npm run build

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
