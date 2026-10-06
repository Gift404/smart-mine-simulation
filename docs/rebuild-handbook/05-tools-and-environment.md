# Chapter 05 — Tools and Environment

## 5.1 Required toolchain

| Tool | Version guidance | Role |
|------|------------------|------|
| Python | 3.9+ (repo verified on 3.9) | Backend |
| Node.js | 18+ LTS recommended | Frontend tooling |
| npm | Comes with Node | Install Vite/React |
| Docker Desktop / Compose | Optional but recommended | Full stack |
| Git | Any recent | Version control |
| Editor | Cursor / VS Code | Dev |

### Python packages (`backend/requirements.txt`)

- `fastapi`, `uvicorn[standard]`, `pydantic`
- `numpy` — multilateration LS
- `paho-mqtt` — broker client
- `influxdb-client` — optional time-series writes
- `pytest`, `httpx` — tests

### Frontend packages (`frontend/package.json`)

- `react`, `react-dom`, `react-router-dom`
- `vite`, `typescript`, `tailwindcss`
- `three`, `@react-three/fiber`, `@react-three/drei` — 3D map
- `vitest` — unit tests

## 5.2 Environment variables

Copy `.env.example` → `.env`. Typical keys:

| Variable | Purpose |
|----------|---------|
| `MQTT_HOST` / `MQTT_PORT` | Broker address |
| `INFLUX_URL` / `TOKEN` / `ORG` / `BUCKET` | Time-series |
| `VITE_API_URL` | Frontend → REST |
| `VITE_WS_URL` | Frontend → WS |

Backend also uses tick rate settings via config/env (see `app/config.py`).

## 5.3 Running without Docker

### Backend

```bash
cd backend
pip install -r requirements.txt
set PYTHONPATH=.          # Windows cmd
# or: $env:PYTHONPATH = "."  # PowerShell
py -3.9 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

If Mosquitto/Influx are absent, logs warn; REST + WS still work.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173/

### Start simulation

Live map often auto-starts. Or:

```bash
curl -X POST http://127.0.0.1:8000/api/simulation/start
```

## 5.4 Running with Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

Services: Mosquitto `:1883`, Influx `:8086`, backend `:8000`, frontend `:5173`.

Config is mounted read-only into the backend container (`./config:/app/config:ro`).

## 5.5 Regenerating the mine world

```bash
python config/generate_3d_mine.py
```

Rewrites `mine.json`, `gateways.json`, `workers.json`, `sensors.json`.  
**Restart backend** afterward so `GatewaySimulator` reloads.

## 5.6 API documentation

FastAPI Swagger UI: http://127.0.0.1:8000/docs

## 5.7 Recommended Windows notes

- Prefer `py -3.9` if multiple Pythons installed.  
- Kill stale `:8000` listeners before restart (`Get-NetTCPConnection -LocalPort 8000`).  
- PowerShell execution policy may block scripts; run `make_claude_zip.ps1` with bypass if needed.

## 5.8 IDE setup tips

- Open repo root as workspace.  
- Python interpreter → env with requirements installed.  
- ESLint optional; Tailwind via PostCSS already wired.  
- Keep handbook + architecture.md in the sidebar while coding.

## 5.9 Exercises

1. Start backend only; hit `/api/health` and `/api/gateways` count.  
2. Start frontend; confirm WS connects (browser Network tab).  
3. Run `pytest` and `npm test`; note any failures before you change code.

## 5.10 Checkpoint

Your machine can run the stack. Next: **config world model**.
