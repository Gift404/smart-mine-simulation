# Single-container production image: nginx (UI) + uvicorn (API/WS)
FROM node:20-slim AS frontend-build
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY config /app/config

COPY --from=frontend-build /fe/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
COPY deploy/start.sh /start.sh
RUN chmod +x /start.sh \
    && sed -i 's/\r$//' /start.sh

ENV AUTO_START=true
EXPOSE 80
CMD ["/start.sh"]
